"""Place the badge on the portrait (same size/position/tilt as the approved version).
place_badge.py <portrait> <badge_rgb.npy> <badge_alpha.npy> <out_full.png> <out_1080x1920.png> [<zoom.jpg>]"""
import sys, numpy as np, cv2
from PIL import Image
src, brgb, balpha, out_full, out_screen = sys.argv[1:6]
new = np.array(Image.open(src).convert("RGB")).astype(np.float32)
H, W = new.shape[:2]
badge = np.load(brgb).astype(np.float32); al = np.load(balpha).astype(np.float32)
pad = 20
b = cv2.copyMakeBorder(badge, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
a = cv2.copyMakeBorder(al, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
M = cv2.getRotationMatrix2D((pad + 52, pad + 12), -2.5, 1.0)
b = cv2.warpAffine(b, M, (b.shape[1], b.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
a = cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_CUBIC)
hh, ww = a.shape
gy, gx = np.mgrid[0:hh, 0:ww]
b = b * (1.02 - 0.07 * (gx / ww) - 0.05 * (gy / hh))[..., None] * 0.98
POS = [int(v) for v in sys.argv[sys.argv.index("--pos") + 1].split(",")] if "--pos" in sys.argv else [565, 581]
ox, oy = POS[0] - pad, POS[1] - pad
out = new.copy()
for off, blur, op in (((4, 7), 5, 0.30), ((1, 2), 1.5, 0.22)):
    sh = np.zeros((H, W), np.float32)
    sh[oy + off[1]:oy + off[1] + hh, ox + off[0]:ox + off[0] + ww] = a
    out = out * (1 - op * cv2.GaussianBlur(sh, (0, 0), blur))[..., None]
reg = out[oy:oy + hh, ox:ox + ww]; A = a[..., None]
reg[:] = b * A + reg * (1 - A)
reg[:] = reg + np.random.default_rng(7).normal(0, 1.6, reg.shape) * A
out = np.clip(out, 0, 255).astype(np.uint8)
Image.fromarray(out).save(out_full)
r = cv2.resize(out, (1080, round(H * 1080 / W)), interpolation=cv2.INTER_AREA); t = (r.shape[0] - 1920) // 2
Image.fromarray(r[t:t + 1920]).save(out_screen)
if len(sys.argv) > 6 and not sys.argv[6].startswith("--"):
    Image.fromarray(cv2.resize(out[POS[1] - 40:POS[1] + 180, POS[0] - 45:POS[0] + 135], None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)).save(sys.argv[6], quality=92)
print("saved", out.shape)
