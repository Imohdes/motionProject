import sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

bg_path, fg_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 1080, 1920

# --- background: cover-fit to 1080x1920, slight depth-of-field + grade
bg = Image.open(bg_path).convert("RGB")
s = max(W / bg.width, H / bg.height)
bg = bg.resize((round(bg.width * s), round(bg.height * s)), Image.LANCZOS)
l = (bg.width - W) // 2; t = (bg.height - H) // 2
bg = bg.crop((l, t, l + W, t + H))
bg = bg.filter(ImageFilter.GaussianBlur(2.2))
bg = ImageEnhance.Brightness(bg).enhance(0.92)
b = np.asarray(bg).astype(np.float32)
# vignette
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.5) / (H * 0.62)) ** 2)
vig = np.clip(1.0 - 0.35 * np.clip(d - 0.45, 0, 1) ** 1.4, 0.6, 1)
b *= vig[..., None]

# --- foreground person
fg = Image.open(fg_path).convert("RGBA")
a = np.asarray(fg)[..., 3]
ys, xs = np.where(a > 128)
fg = fg.crop((xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7))
target_h = 1600
sc = target_h / fg.height
fg = fg.resize((round(fg.width * sc), round(fg.height * sc)), Image.LANCZOS)
fx = (W - fg.width) // 2 + 8
fy = H - 70 - fg.height  # feet ~70px from bottom
f = np.asarray(fg).astype(np.float32)
rgb, al = f[..., :3], f[..., 3:] / 255.0

# subtle warm grade to sit in the warm hall light
rgb = rgb * np.array([1.03, 1.0, 0.96]) + np.array([2, 1, 0])
# subtle cool rim light from the LED screens on the silhouette edges
alpha_img = Image.fromarray((al[..., 0] * 255).astype(np.uint8))
inner = np.asarray(alpha_img.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
edge = np.clip(al[..., 0] - inner, 0, 1)[..., None]
rgb = rgb + edge * np.array([40, 55, 85]) * 0.55
rgb = np.clip(rgb, 0, 255)

# --- contact shadow on the floor
sh = np.zeros((H, W), np.float32)
cx = fx + fg.width / 2; cy = fy + fg.height - 8
def blob(rx, ry, blur, strength, dy=0):
    e = (((xx - cx) / rx) ** 2 + ((yy - (cy + dy)) / ry) ** 2)
    m = np.clip(1 - e, 0, 1) ** 1.2
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255
    return m * strength
sh = blob(fg.width * 0.60, 55, 28, 0.5, -14) + blob(fg.width * 0.36, 20, 7, 0.7, -12)
def spot(px, py, rx, ry, blur, strength):
    e = (((xx - px) / rx) ** 2 + ((yy - py) / ry) ** 2)
    m = np.clip(1 - e, 0, 1)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255
    return m * strength
# per-shoe contact shadows (positions measured on the 1080x1920 layout)
sh = sh + spot(370, 1818, 75, 10, 5, 0.75) + spot(655, 1840, 55, 10, 5, 0.75)
sh = sh + spot(530, 1808, 230, 18, 10, 0.55)
b *= np.clip(1 - sh, 0.12, 1)[..., None]

# --- composite
out = b.copy()
region = out[fy:fy + fg.height, fx:fx + fg.width]
region[:] = rgb * al + region * (1 - al)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_path, quality=95)
print("person box", fx, fy, fg.width, fg.height)
