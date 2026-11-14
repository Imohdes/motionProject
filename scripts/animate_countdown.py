import sys, os, math
import numpy as np, cv2

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920
FPS, SECS = 20, 4
N = FPS * SECS

img = cv2.imread(SRC)[:, :, ::-1].astype(np.float32)  # RGB
img = cv2.resize(img, (1080, 1350), interpolation=cv2.INTER_AREA)
S = 1080 / 1600.0
h0, w0 = img.shape[:2]

def sc(*v): return [int(round(x * S)) for x in v]

# ---------- white text / logo mask (never touched) ----------
mn = img.min(axis=2)
white = (mn > 175).astype(np.uint8)
white = cv2.dilate(white, np.ones((7, 7), np.uint8))
keep_out = cv2.GaussianBlur(white.astype(np.float32), (0, 0), 2)
free = 1.0 - np.clip(keep_out * 1.5, 0, 1)  # 1 where background

# ---------- neon triangles: separate into layers over a fitted background ----------
x0, y0, x1, y1 = sc(935, 435, 1165, 655)
reg = img[y0:y1, x0:x1].copy()
med = cv2.medianBlur(reg.astype(np.uint8), 41).astype(np.float32)
dev = np.abs(reg - med).sum(axis=2)
em = (dev > 18).astype(np.uint8)
em = cv2.morphologyEx(em, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
em_d = cv2.dilate(em, np.ones((23, 23), np.uint8))
yy, xx = np.mgrid[0:reg.shape[0], 0:reg.shape[1]].astype(np.float32)
xn, yn = xx / reg.shape[1], yy / reg.shape[0]
A = np.stack([np.ones_like(xn), xn, yn, xn * xn, yn * yn, xn * yn, xn**3, yn**3, xn*xn*yn, xn*yn*yn], -1).reshape(-1, 10)
sel = em_d.reshape(-1) == 0
bg = np.zeros_like(reg)
for c in range(3):
    coef, *_ = np.linalg.lstsq(A[sel], reg.reshape(-1, 3)[sel, c], rcond=None)
    bg[..., c] = (A @ coef).reshape(reg.shape[:2])
D = reg - bg  # signed light layer
# soft region weight so layer fades at bbox borders
wreg = cv2.GaussianBlur(em_d.astype(np.float32), (0, 0), 5)
D *= wreg[..., None]

tris = [dict(cx=(cx-935)*S, cy=(cy-435)*S) for cx, cy in [(1003, 492), (1097, 490), (1095, 592)]]
# assign each pixel of D to nearest triangle (Voronoi on centers) so glows split cleanly
centers = np.array([[t['cx'], t['cy']] for t in tris])
dist = np.stack([(xx - c[0])**2 + (yy - c[1])**2 for c in centers], 0)
owner = dist.argmin(0)
layers = []
for i, t in enumerate(tris):
    w = cv2.GaussianBlur((owner == i).astype(np.float32), (0, 0), 3)
    layers.append(D * w[..., None])
print('triangles found:', len(tris))

# ---------- neon puzzle outline + big thin triangle (glow pulse) ----------
r, g, b = img[..., 0], img[..., 1], img[..., 2]
hp = img - cv2.GaussianBlur(img, (0, 0), 6)
lum_hp = hp.mean(axis=2)
cyan = ((b > r + 60) & (g > r + 60) & (b > 150) & (mn < 175)).astype(np.float32)
puz = np.zeros((h0, w0), np.float32)
px0, py0, px1, py1 = sc(285, 690, 690, 1070)
puz[py0:py1, px0:px1] = 1
tx0, ty0, tx1, ty1 = sc(915, 1085, 1215, 1390)
tri2 = np.zeros((h0, w0), np.float32)
tri2[ty0:ty1, tx0:tx1] = 1
neon = cv2.GaussianBlur(cv2.dilate(cyan, np.ones((3, 3))), (0, 0), 1.2) * free
neon_puz = neon * puz
glow_puz = cv2.GaussianBlur(neon_puz, (0, 0), 6)
line2 = np.clip(lum_hp, 0, None) * tri2 * free
line2 = (line2 > 4).astype(np.float32)
line2 = cv2.GaussianBlur(line2, (0, 0), 1.2)

# ---------- light streaks (traveling shimmer along their direction) ----------
hp2 = img - cv2.GaussianBlur(img, (0, 0), 10)
streak = np.clip(hp2.mean(axis=2), 0, None)
streak = np.clip((streak - 1.0) / 8.0, 0, 1)
excl = np.ones((h0, w0), np.float32)
excl[y0:y1, x0:x1] = 0
excl = np.minimum(excl, 1 - puz)
excl = np.minimum(excl, 1 - tri2)
excl = cv2.GaussianBlur(excl, (0, 0), 8)
free_s = cv2.GaussianBlur(free, (0, 0), 3)
streak *= excl * free_s
streak[int(h0 * 0.62):] *= 0  # streaks live in upper part
streak = cv2.GaussianBlur(streak, (0, 0), 1.0)
YY, XX = np.mgrid[0:h0, 0:w0].astype(np.float32)
# streaks run from upper-left to lower-right (steep); coordinate along them:
dirv = np.array([0.52, 0.854])
along = XX * dirv[0] + YY * dirv[1]
across = -XX * dirv[1] + YY * dirv[0]

# ---------- vertical extension to 1080x1920 ----------
pad = (H - h0) // 2
def extend(fr):
    out = np.zeros((H, W, 3), np.float32)
    out[pad:pad + h0] = fr
    top = fr[0:40].mean(axis=0, keepdims=True)
    bot = fr[h0 - 40:h0].mean(axis=0, keepdims=True)
    out[:pad] = top
    out[pad + h0:] = bot
    return out
base_ext_static = None

def smooth_pads(out):
    # soften the extended areas and blend into image edge
    blurred = cv2.GaussianBlur(out, (0, 0), 25)
    ramp = np.ones(H, np.float32)
    f = 60
    ramp[pad + f: pad + h0 - f] = 0
    ramp[pad:pad + f] = np.linspace(1, 0, f)
    ramp[pad + h0 - f:pad + h0] = np.linspace(0, 1, f)
    return out * (1 - ramp[:, None, None]) + blurred * ramp[:, None, None]

# pads are static: compute once from original
pad_img = smooth_pads(extend(img))
pad_mask = np.ones(H, np.float32)
pad_mask[pad + 60: pad + h0 - 60] = 0
pad_mask[pad:pad + 60] = np.linspace(1, 0, 60)
pad_mask[pad + h0 - 60:pad + h0] = np.linspace(0, 1, 60)

# base without triangles
base = img.copy()
base[y0:y1, x0:x1] = reg - D

def place(layer, dx, dy, ang, cx, cy, gain):
    M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
    M[0, 2] += dx; M[1, 2] += dy
    out = cv2.warpAffine(layer, M, (layer.shape[1], layer.shape[0]), flags=cv2.INTER_CUBIC, borderValue=0)
    pos = np.clip(out, 0, None) * gain
    return pos + np.clip(out, None, 0)

phases = [0.0, 0.33, 0.66]
for k in range(N):
    t = k / N
    ph = 2 * math.pi * t
    fr = base.copy()
    acc = np.zeros_like(reg)
    for i, (L, tr) in enumerate(zip(layers, tris)):
        p = ph + 2 * math.pi * phases[i % 3]
        dy = 6.0 * math.sin(p)
        dx = 2.5 * math.cos(p)
        ang = 5.0 * math.sin(p + 0.8)
        gain = 1.0 + 0.18 * math.sin(2 * p)
        acc += place(L, dx, dy, ang, tr['cx'], tr['cy'], gain)
    fr[y0:y1, x0:x1] += acc

    # puzzle neon breathing
    a = 0.5 + 0.5 * math.sin(ph * 2 - 1.0)
    fr += (neon_puz * 70 * a - neon_puz * 25 * (1 - a))[..., None] * np.array([0.6, 1.0, 1.0])
    fr += (glow_puz * 45 * a)[..., None] * np.array([0.3, 0.9, 1.0])
    # big thin triangle: light travelling around (pulse with spatial phase)
    wave2 = 0.5 + 0.5 * np.sin(ph * 2 + (XX + YY) * 0.02)
    fr += (line2 * 80 * wave2)[..., None] * np.array([0.5, 1.0, 0.85])

    # streak shimmer: bright bands sliding down along the streaks
    L = (h0 + w0)
    pos = (t * L * 1.0)
    band = np.zeros((h0, w0), np.float32)
    for off in (0, L / 2):
        d = ((along - pos - off) % L) - L / 2
        band += np.exp(-(d / 70.0) ** 2)
    fr += (streak * band * 140)[..., None]

    fr = np.clip(fr, 0, 255)
    out = extend(fr)
    out = out * (1 - pad_mask[:, None, None]) + pad_img * pad_mask[:, None, None]
    cv2.imwrite(f'{OUT}/f{k:03d}.png', np.clip(out, 0, 255).astype(np.uint8)[:, :, ::-1])
print('done', N)
