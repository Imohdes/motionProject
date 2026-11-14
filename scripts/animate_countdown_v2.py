import sys, os, math
import numpy as np, cv2

SRC, BG, OUT, LOGO = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920
FPS, SECS = 20, 6
N = FPS * SECS

I8 = cv2.imread(SRC)[:, :, ::-1].copy()
I = I8.astype(np.float32)
h0, w0 = I.shape[:2]
bg = cv2.imread(BG)[:, :, ::-1].astype(np.float32)
bg = cv2.resize(bg, (W, H), interpolation=cv2.INTER_AREA)
# remove old bottom-right logo from the background
_m = (bg.min(axis=2) > 120).astype(np.uint8); _m[:1740] = 0; _m[:, :780] = 0; _m[1890:] = 0
_m = cv2.dilate(_m, np.ones((11, 11), np.uint8))
_b8 = np.clip(bg, 0, 255).astype(np.uint8)
_sm = cv2.inpaint(cv2.resize(_b8, (W // 2, H // 2)), cv2.resize(_m, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST), 12, cv2.INPAINT_TELEA)
_sm = cv2.GaussianBlur(cv2.resize(_sm, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32), (0, 0), 6)
_mf = cv2.GaussianBlur(_m.astype(np.float32), (0, 0), 4)[..., None]
bg = bg * (1 - _mf) + _sm * _mf
# new logo strip, bottom-right (HRDF part keeps the old size/position)
from PIL import Image as _PI
_lg = np.array(_PI.open(LOGO).convert('RGBA')).astype(np.float32)
_al = _lg[..., 3] > 10
_ys, _xs = np.nonzero(_al)
_lg = _lg[_ys.min():_ys.max() + 1, _xs.min():_xs.max() + 1]
_s = 222 / 247.0                      # HRDF part keeps the old logo's size
_lw, _lh = int(round(_lg.shape[1] * _s)), int(round(_lg.shape[0] * _s))
_pa = _lg[..., 3:] / 255
_pm = np.concatenate([_lg[..., :3] * _pa, _pa], -1)       # premultiplied
_pm = cv2.resize(_pm, (_lw, _lh), interpolation=cv2.INTER_AREA)
LOGO_A = np.zeros((H, W), np.float32); LOGO_P = np.zeros((H, W, 3), np.float32)
_x1, _y1 = 1041, 1871
LOGO_A[_y1 - _lh:_y1, _x1 - _lw:_x1] = np.clip(_pm[..., 3], 0, 1)
LOGO_P[_y1 - _lh:_y1, _x1 - _lw:_x1] = _pm[..., :3]

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
E_raw = E.copy()
# nothing of the light layer survives where text sat (removes the ghost under text)
E *= (1 - np.clip(cv2.GaussianBlur(cv2.dilate(white_d, np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 2) * 1.3, 0, 1))[..., None]

def shape_mask(box, thr, dil, src):
    x0, y0, x1, y1 = box
    m = np.zeros((h0, w0), np.uint8)
    sub = np.abs(src[y0:y1, x0:x1]).sum(axis=2) > thr
    m[y0:y1, x0:x1] = sub
    m = cv2.dilate(m, np.ones((dil, dil), np.uint8))
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)

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
    'puz':   (280, 650, 700, 1075),
}
BIG_BOX = (905, 1075, 1225, 1400)
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
tm = shape_mask(TRI_BOX, 20, 27, E) * rect_mask(*TRI_BOX, f=3); used = np.maximum(used, tm)
bm = shape_mask(BIG_BOX, 12, 9, np.clip(E_raw, 0, None)) * rect_mask(*BIG_BOX, f=3)
used = np.maximum(used, bm)
add('light', 'big', BIG_BOX, np.clip(E_raw, 0, None) * bm[..., None])
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
       'tabqa': (0, -15), 'puz': (0, -15), 'num': (0, -15), 'ayam': (0, -15),
       'big': (0, 50), 'line': (0, 85), 'rest': (0, -15)}

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
        return (0, up, 0, 1, p * fade_out, 1 + 0.5 * (0.5 + 0.5 * math.sin(4 * w)))
    if name == 'big':
        p = prog(t, 0.55, 1.5)
        return (12 * math.sin(2 * w + 2) + (1 - p) * 120, 14 * math.cos(2 * w) + up,
                (1 - p) * -35 + 8 * math.sin(2 * w), 1.25 - 0.25 * p, p * fade_out, 1.3)
    if name == 'rest':
        p = prog(t, 0.0, 0.9)
        return 0, up, 0, 1, p * fade_out, 1
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
    fr = fr * (1 - LOGO_A[..., None]) + LOGO_P
    cv2.imwrite(f'{OUT}/f{k:03d}.png', np.clip(fr, 0, 255).astype(np.uint8)[:, :, ::-1])
print('done', N)
