import sys, os, math
import numpy as np, cv2

SRC, BG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920
FPS, SECS = 20, 6
N = FPS * SECS

I8 = cv2.imread(SRC)[:, :, ::-1].copy()
I = I8.astype(np.float32)
h0, w0 = I.shape[:2]
bg = cv2.imread(BG)[:, :, ::-1].astype(np.float32)
bg = cv2.resize(bg, (W, H), interpolation=cv2.INTER_AREA)

# ---------------- extraction from the original design ----------------
mn = I.min(axis=2)
content = np.zeros((h0, w0), np.uint8)
content[:1480] = 1
content[:300, 1150:] = 0          # top logo stays in new bg
TB = [(255, 585, 1345, 765), (775, 795, 1335, 1190), (255, 825, 705, 1255), (245, 1305, 1350, 1475)]
tb = np.zeros((h0, w0), np.uint8)
for a_, b_, c_, d_ in TB: tb[b_:d_, a_:c_] = 1
tb[435:655, 935:1165] = 0
white = ((mn > 175) & (tb > 0) & (I.max(axis=2) - mn < 60)).astype(np.uint8)
white_d = cv2.dilate(white, np.ones((9, 9), np.uint8))

# background under text (inpaint), then text alpha
Binp = cv2.inpaint(I8, white_d, 9, cv2.INPAINT_TELEA).astype(np.float32)
mnB = Binp.min(axis=2)
alpha = np.clip((mn - mnB) / np.maximum(255 - mnB, 1), 0, 1) * white_d
alpha = np.where(alpha < 0.04, 0, alpha).astype(np.float32)

# smooth original background (no elements) -> light layer E = I - B0
med = cv2.medianBlur(Binp.astype(np.uint8), 51).astype(np.float32)
dev = np.abs(Binp - med).sum(axis=2)
elem = ((dev > 14) | (white_d > 0)).astype(np.uint8)
elem = cv2.dilate(elem, np.ones((25, 25), np.uint8))
small = cv2.resize(Binp.astype(np.uint8), (w0 // 4, h0 // 4), interpolation=cv2.INTER_AREA)
sm = cv2.resize(elem, (w0 // 4, h0 // 4), interpolation=cv2.INTER_NEAREST)
B0 = cv2.inpaint(small, sm, 15, cv2.INPAINT_TELEA)
B0 = cv2.resize(B0, (w0, h0), interpolation=cv2.INTER_CUBIC).astype(np.float32)
B0 = cv2.GaussianBlur(B0, (0, 0), 8)
E = Binp - B0
E = np.sign(E) * np.maximum(np.abs(E) - 3.0, 0)
E *= cv2.GaussianBlur(content.astype(np.float32), (0, 0), 10)[..., None]

def rect_mask(x0, y0, x1, y1, f=6):
    m = np.zeros((h0, w0), np.float32)
    m[y0:y1, x0:x1] = 1
    return cv2.GaussianBlur(m, (0, 0), f)

# ---- groups ----
TEXT = {
    'tabqa': (255, 585, 1345, 765),
    'num':   (775, 795, 1335, 1190),
    'ayam':  (255, 825, 705, 1255),
    'line':  (245, 1305, 1350, 1475),
}
LIGHT = {
    'puz':   (280, 685, 700, 1075),
    'big':   (905, 1075, 1225, 1400),
    'f1':    (185, 580, 275, 670),
    'f2':    (475, 575, 545, 645),
    'f3':    (725, 590, 785, 655),
}
TRI_BOX = (935, 435, 1165, 655)
TRI_C = [(1003, 492), (1097, 490), (1095, 592)]

layers = []  # dict(kind, img(HxWxC), x0,y0, cx,cy, name)
def add(kind, name, box, data, c=None):
    x0, y0, x1, y1 = box
    cx, cy = c if c else ((x0 + x1) / 2, (y0 + y1) / 2)
    layers.append(dict(kind=kind, name=name, img=np.ascontiguousarray(data[y0:y1, x0:x1]),
                       x0=x0, y0=y0, cx=cx, cy=cy))

for n_, b in TEXT.items():
    m = np.zeros((h0, w0), np.float32); m[b[1]:b[3], b[0]:b[2]] = 1
    add('text', n_, b, alpha * m)
used = np.zeros((h0, w0), np.float32)
for n_, b in LIGHT.items():
    m = rect_mask(*b); used = np.maximum(used, m)
    add('light', n_, b, E * m[..., None])
# triangles: voronoi split
x0, y0, x1, y1 = TRI_BOX
tm = rect_mask(*TRI_BOX, f=5); used = np.maximum(used, tm)
yy, xx = np.mgrid[0:h0, 0:w0].astype(np.float32)
d = np.stack([(xx - cx) ** 2 + (yy - cy) ** 2 for cx, cy in TRI_C])
own = d.argmin(0)
for i, c in enumerate(TRI_C):
    w = cv2.GaussianBlur((own == i).astype(np.float32), (0, 0), 3) * tm
    add('light', f'tri{i}', TRI_BOX, E * w[..., None], c)
rest = E * (1 - used)[..., None]
add('light', 'rest', (0, 0, w0, 1480), rest, (800, 700))

# streak mask for shimmer (on rest layer, source coords)
rl = [L for L in layers if L['name'] == 'rest'][0]
st = np.clip(rl['img'].mean(axis=2), 0, None)
rl['streak'] = np.clip((st - 1) / 8, 0, 1) * (np.arange(1480)[:, None] < 1000)

# ---------------- layout on 1080x1920 ----------------
K = 0.78
SC = (797.0, 945.0)   # content centre in source
CC = (540.0, 965.0)   # where it goes on canvas
OFF = {'tri0': (10, -110), 'tri1': (10, -110), 'tri2': (10, -110),
       'f1': (0, -70), 'f2': (0, -70), 'f3': (0, -60),
       'tabqa': (0, -45), 'puz': (0, -10), 'num': (0, 10), 'ayam': (0, 10),
       'big': (0, 50), 'line': (0, 85), 'rest': (0, -40)}

def ease_out(x):
    x = min(max(x, 0.0), 1.0); return 1 - (1 - x) ** 3
def ease_inout(x):
    x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)
def prog(t, a, b): return ease_out((t - a) / (b - a))

def matrix(L, dx=0, dy=0, ang=0, s=1.0):
    ox, oy = OFF.get(L['name'], (0, 0))
    # element centre on canvas
    ecx = (L['cx'] - SC[0]) * K + CC[0] + ox + dx
    ecy = (L['cy'] - SC[1]) * K + CC[1] + oy + dy
    a = math.radians(ang)
    ca, sa = math.cos(a) * K * s, math.sin(a) * K * s
    # local px -> source coords -> relative to element centre -> rotate/scale -> canvas
    lx0, ly0 = L['x0'] - L['cx'], L['y0'] - L['cy']
    M = np.array([[ca, sa, 0], [-sa, ca, 0]], np.float32)
    M[0, 2] = ca * lx0 + sa * ly0 + ecx
    M[1, 2] = -sa * lx0 + ca * ly0 + ecy
    return M

def warp(img, M):
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)

XX, YY = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
T = SECS
OUT_A, OUT_B = 5.35, 5.95  # outro

def state(name, t):
    """returns dx, dy, ang, scale, opacity, gain"""
    fade_out = 1 - ease_inout((t - OUT_A) / (OUT_B - OUT_A))
    up = -40 * ease_inout((t - OUT_A) / (OUT_B - OUT_A))
    w = 2 * math.pi * t / T
    if name.startswith('tri'):
        i = int(name[-1]); ph = i * 2.1
        p = prog(t, 0.05 + 0.12 * i, 1.0 + 0.12 * i)
        dx = (1 - p) * [-220, 200, 160][i] + 14 * math.cos(2 * w + ph)
        dy = (1 - p) * [-260, -300, 240][i] + 22 * math.sin(2 * w + ph) + up
        ang = (1 - p) * [-140, 160, 120][i] + 14 * math.sin(2 * w + ph + 1)
        s = 0.4 + 0.6 * p
        return dx, dy, ang, s, min(p * 1.4, 1) * fade_out, 1 + 0.25 * math.sin(4 * w + ph)
    if name.startswith('f'):
        i = int(name[-1]); ph = i * 1.7
        p = prog(t, 0.3 + 0.1 * i, 1.2 + 0.1 * i)
        return (14 * math.sin(2 * w + ph), (1 - p) * 60 + 16 * math.cos(2 * w + ph) + up,
                (1 - p) * 90 + 20 * math.sin(2 * w + ph), 1, p * fade_out, 1)
    if name == 'puz':
        p = prog(t, 0.25, 1.15)
        return (6 * math.sin(2 * w), 10 * math.sin(2 * w + 1) + up, 2.5 * math.sin(2 * w + 2),
                0.85 + 0.15 * p, p * fade_out, 1 + 0.5 * (0.5 + 0.5 * math.sin(4 * w)))
    if name == 'big':
        p = prog(t, 0.55, 1.5)
        return (12 * math.sin(2 * w + 2) + (1 - p) * 120, 14 * math.cos(2 * w) + up,
                (1 - p) * -35 + 8 * math.sin(2 * w), 1.25 - 0.25 * p, p * fade_out, 1.3)
    if name == 'rest':
        p = prog(t, 0.0, 0.9)
        return 18 * math.sin(w), 12 * math.sin(w + 1), 0, 1, p * fade_out, 1
    # text
    if name == 'tabqa':
        return 0, up, 0, 1, fade_out, ('wipe', prog(t, 0.35, 1.25))
    if name == 'num':
        p = prog(t, 0.75, 1.35)
        return 0, up, 0, 1.18 - 0.18 * p, min(1, p * 1.3) * fade_out, None
    if name == 'ayam':
        p = prog(t, 0.95, 1.55)
        return (1 - p) * -60, up, 0, 1, p * fade_out, None
    if name == 'line':
        p = prog(t, 1.45, 2.45)
        return 0, (1 - p) * 30 + up, 0, 1, fade_out, ('wipe', p)

for k in range(N):
    t = k / FPS
    fr = bg.copy()
    texts = []
    for L in layers:
        dx, dy, ang, s, op, extra = state(L['name'], t)
        if op <= 0.002 or L['name'] == 'f3': continue
        M = matrix(L, dx, dy, ang, s)
        if L['kind'] == 'light':
            img = L['img'] * op
            img = np.clip(img, 0, None) * extra + np.clip(img, None, 0)
            if L['name'] == 'rest':
                # shimmer bands travelling down the streaks
                h_, w_ = L['img'].shape[:2]
                yy_, xx_ = np.mgrid[0:h_, 0:w_].astype(np.float32)
                along = xx_ * 0.52 + yy_ * 0.854
                Lp = 2200.0; pos = (t / T) * Lp * 2
                band = sum(np.exp(-((((along - pos - o) % Lp) - Lp / 2) / 110.0) ** 2) for o in (0, Lp / 2))
                img = img + (L['streak'] * band * 90 * op)[..., None]
            fr += warp(img.astype(np.float32), M)
        else:
            texts.append((L, M, op, extra))
    for L, M, op, extra in texts:
        a = warp(L['img'], M) * op
        if isinstance(extra, tuple) and extra[0] == 'wipe':
            p = extra[1]
            if p <= 0: continue
            ys, xs = np.nonzero(a > 0.02)
            if len(xs) == 0: continue
            xr, xl = xs.max() + 40, xs.min() - 40
            edge = xr - p * (xr - xl)          # right-to-left reveal (Arabic)
            a = a * np.clip((XX - edge) / 60.0, 0, 1)
        fr = fr * (1 - a[..., None]) + 255.0 * a[..., None]
    cv2.imwrite(f'{OUT}/f{k:03d}.png', np.clip(fr, 0, 255).astype(np.uint8)[:, :, ::-1])
print('done', N)
