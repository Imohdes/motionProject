"""Extract and upscale brand assets from the campaign banner.

Produces crisp, transparent PNGs in assets/img/:
  logo_event.png        full-colour "لقاءات القصيم 26" logo
  logo_event_dark.png   reversed version for dark backgrounds (navy -> white)
  logo_hrdf.png         HRDF logo (full colour)
  tagline.png           white "خطوات تبدأ بلقاء" lettering
  hero.png              campaign illustration (people + Qassim landmarks)
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/src/banner.webp"
OUT = ROOT / "assets/img"
OUT.mkdir(parents=True, exist_ok=True)
S = 4  # upscale factor


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def bleed(rgb, alpha):
    """Fill RGB of transparent pixels with nearest opaque colour (avoids dark fringes)."""
    solid = alpha > 0.5
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    return rgb[iy, ix]


def upscale_rgba(arr, sharpen=(0.32, 0.68)):
    rgb = arr[..., :3].astype(np.float32)
    a = arr[..., 3].astype(np.float32) / 255
    rgb = bleed(rgb, a)
    h, w = a.shape
    big = lambda ch: np.asarray(
        Image.fromarray(ch.astype(np.float32), mode="F").resize((w * S, h * S), Image.BICUBIC)
    )
    rgb_b = np.stack([big(rgb[..., i]) for i in range(3)], -1)
    a_b = smoothstep(*sharpen, big(a))
    return np.clip(rgb_b, 0, 255), a_b


def save(rgb, a, name):
    out = np.dstack([rgb, a * 255]).round().astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    bbox = im.getbbox()
    im.crop(bbox).save(OUT / name)
    print("wrote", name, im.crop(bbox).size)


src = np.array(Image.open(SRC).convert("RGBA"))

# ---- Event logo (rows 100..212, right panel) ----
ev = src[98:214, 1630:1890]
rgb, a = upscale_rgba(ev)
palette = np.array([[16, 84, 150], [24, 168, 98], [232, 128, 44]], np.float32)  # navy, green, orange
# measure real ink colours from opaque pixels
op = ev[..., 3] > 230
cols = ev[op][:, :3].astype(np.float32)
lab = np.argmin(((cols[:, None] - palette[None]) ** 2).sum(-1), 1)
palette = np.array([cols[lab == i].mean(0) for i in range(3)])
print("palette", palette.round())
idx = np.argmin(((rgb[..., None, :] - palette[None, None]) ** 2).sum(-1), -1)
snapped = palette[idx]
save(snapped, a, "logo_event.png")
rev = palette.copy(); rev[0] = [255, 255, 255]; rev[1] = [46, 214, 128]
save(rev[idx], a, "logo_event_dark.png")

# ---- HRDF logo ----
hr = src[254:372, 1630:1890]
rgb, a = upscale_rgba(hr, sharpen=(0.25, 0.75))
save(rgb, a, "logo_hrdf.png")

# ---- Tagline lettering (white on gradient) ----
tg = src[118:340, 860:1300, :3].astype(np.float32)
mn = tg.min(-1)
bg = ndimage.minimum_filter(mn, size=45)
bg = ndimage.gaussian_filter(ndimage.maximum_filter(bg, size=45), 12)
alpha = np.clip((mn - bg) / np.maximum(250 - bg, 1), 0, 1)
h, w = alpha.shape
ab = np.asarray(Image.fromarray(alpha.astype(np.float32), mode="F").resize((w * S, h * S), Image.BICUBIC))
ab = smoothstep(0.35, 0.65, ab)
save(np.full(ab.shape + (3,), 255, np.float32), ab, "tagline.png")

# ---- Hero illustration ----
hero = Image.open(SRC).convert("RGB").crop((0, 0, 720, 473))
hero = hero.resize((720 * 2, 473 * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2))
hero.save(OUT / "hero.png")
print("wrote hero.png", hero.size)
