"""Place a transparent cut-out person on the hall background (1080x1920) with grade, rim light and
automatic contact shadows. composite2.py bg.png person.webp out.png target_height [gain]"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

bg_path, fg_path, out_path, target_h = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
gain = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
W, H = 1080, 1920
bg = Image.open(bg_path).convert("RGB")
s = max(W / bg.width, H / bg.height)
bg = bg.resize((round(bg.width * s), round(bg.height * s)), Image.LANCZOS)
l = (bg.width - W) // 2; t = (bg.height - H) // 2
bg = bg.crop((l, t, l + W, t + H)).filter(ImageFilter.GaussianBlur(2.2))
bg = ImageEnhance.Brightness(bg).enhance(0.92)
b = np.asarray(bg).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.5) / (H * 0.62)) ** 2)
b *= np.clip(1.0 - 0.35 * np.clip(d - 0.45, 0, 1) ** 1.4, 0.6, 1)[..., None]

fg = Image.open(fg_path).convert("RGBA")
a = np.asarray(fg)[..., 3]; ys, xs = np.where(a > 128)
fg = fg.crop((xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7))
sc = target_h / fg.height
fg = fg.resize((round(fg.width * sc), round(fg.height * sc)), Image.LANCZOS)
fx = (W - fg.width) // 2 + 8
fy = H - 70 - fg.height
f = np.asarray(fg).astype(np.float32)
rgb, al = f[..., :3], f[..., 3:] / 255.0
rgb = rgb * gain * np.array([1.03, 1.0, 0.95]) + np.array([2, 1, 0])
alpha_img = Image.fromarray((al[..., 0] * 255).astype(np.uint8))
inner = np.asarray(alpha_img.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
edge = np.clip(al[..., 0] - inner, 0, 1)[..., None]
rgb = np.clip(rgb + edge * np.array([40, 55, 85]) * 0.55, 0, 255)

# automatic contact shadow: follow the lowest opaque pixel of every column (shoes + hem)
A = np.zeros((H, W), np.float32); A[fy:fy + fg.height, fx:fx + fg.width] = al[..., 0]
line = np.zeros((H, W), np.float32)
cols = np.where(A.max(0) > 0.5)[0]
bottom = 0
for x in cols:
    yb = np.where(A[:, x] > 0.5)[0].max(); bottom = max(bottom, yb)
    line[yb - 3: yb + 5, x] = 1.0
tight = np.asarray(Image.fromarray((line * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255
tight = np.clip(tight * 1.6, 0, 1)
soft = np.asarray(Image.fromarray((line * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(18))).astype(np.float32) / 255
cx = fx + fg.width / 2
wide = np.clip(1 - (((xx - cx) / (fg.width * 0.62)) ** 2 + ((yy - (bottom - 30)) / 60) ** 2), 0, 1) ** 1.2
wide = np.asarray(Image.fromarray((wide * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))).astype(np.float32) / 255
sh = 0.7 * tight + 0.45 * np.clip(soft * 1.5, 0, 1) + 0.35 * wide
b *= np.clip(1 - sh, 0.12, 1)[..., None]
out = b.copy(); region = out[fy:fy + fg.height, fx:fx + fg.width]
region[:] = rgb * al + region * (1 - al)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_path)
print("person box", fx, fy, fg.width, fg.height)
