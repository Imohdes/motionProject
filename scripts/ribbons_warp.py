"""Flowing ribbons with the reference's exact colours (1920x1080, 30 fps, 20 s).

The reference image is the only colour source: every frame is the reference, re-shaped by a smooth
warp that follows the evolving ribbon curves (same motion design as src/ribbons/ribbons.js):
  * anchor points sampled along each ribbon curve move with the curve; a Gaussian-weighted field
    interpolates their displacement, so ribbons sweep, reshape and their crossing point travels,
    while colours, gradients and the glowing lines stay exactly the reference's
  * each ribbon has its own parallax depth; the background follows a slow push-in with lateral drift
  * light pulses travel left -> right along the image's own glowing lines (brightness only)
Frame 0 equals the reference.

    python3 scripts/ribbons_warp.py [--stills]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'abstract-source-2.webp'
OUT = ROOT / 'output' / 'flowing-ribbons-1080p.mp4'
W, H, FPS, DUR = 1920, 1080, 30, 20.0
TAU = 2 * np.pi
FFMPEG = str(ROOT / 'node_modules' / 'ffmpeg-static' / 'ffmpeg')

ref = cv2.resize(cv2.imread(str(SRC)), (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32) / 255
lum = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
line = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 5) - .015) / .06, 0, 1)
line = cv2.GaussianBlur(line, (0, 0), 1.2)


# ---------------------------------------------------------------- motion (mirrors ribbons.js)
def osc0(t, r, *terms):
    return r + sum(a * (np.sin(TAU * f * t + p) - np.sin(p)) for a, f, p in terms)


def ease(x):
    x = min(1, max(0, x))
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def cubic(p, s):
    s = s[:, None]; u = 1 - s
    return u ** 3 * p[0] + 3 * u * u * s * p[1] + 3 * u * s * s * p[2] + s ** 3 * p[3]


def curves(t):
    A_ = np.array
    P = A_([osc0(t, .56, (.085, .045, 1.2), (.03, .09, .3)), osc0(t, .40, (.04, .05, 2.0), (.012, .11, 1))])
    a0 = A_([-.06, osc0(t, .68, (.07, .04, .5))]); a2 = A_([1.06, osc0(t, .23, (.07, .055, 2.6))])
    tan = A_([1, (a2[1] - a0[1]) * .55]); tan /= np.hypot(*tan)
    bend = .05 * np.sin(TAU * .06 * t + 4) - .05 * np.sin(4)
    A = [[a0, a0 + [.28, -.06 + bend], P - tan * .2, P], [P, P + tan * .2, a2 - [.22, -.06 + bend], a2]]
    b0 = A_([-.06, osc0(t, .74, (.05, .05, 3.3))]); b2 = A_([1.06, osc0(t, .61, (.07, .05, 4.0), (.02, .1, 1))])
    B = [[b0, b0 + [.3, -.02], P - [.18, -.005], P], [P, P + [.2, -.005], b2 - [.22, .09], b2]]
    dp = A_([osc0(t, .43, (.1, .04, 3.0)), osc0(t, .555, (.04, .06, .8))])
    d0 = A_([-.06, osc0(t, .91, (.07, .045, 1.9))]); d2 = A_([osc0(t, .99, (.09, .045, 1.0)), 1.06])
    D = [[d0, d0 + [.18, -.2], dp - [.2, 0], dp], [dp, dp + [.22, 0], d2 - [.15, .28], d2]]
    e0 = P + [.02, -.004]; e2 = A_([osc0(t, .99, (.06, .05, .7)), -.06])
    E = [[e0, e0 + [.22, -.03], e2 + [-.06, osc0(t, .3, (.08, .06, 2))], e2]]
    return {'A': A, 'B': B, 'D': D, 'E': E}


DEPTH = {'A': 1.0, 'B': .85, 'D': .65, 'E': 1.0}
S = np.linspace(0, 1, 28)


def anchors(t, cam):
    pts, disp = [], []
    c0, ct = curves(0), curves(t)
    for k in c0:
        for s0, s1 in zip(c0[k], ct[k]):
            p0 = cubic([np.array(q) for q in s0], S)
            p1 = cubic([np.array(q) for q in s1], S)
            p1 = cam_map(p1, cam, DEPTH[k])
            pts.append(p1); disp.append(p1 - p0)
    return np.concatenate(pts), np.concatenate(disp)


def camera(t):
    e = ease(t / DUR)
    return {'s': 1 + .075 * e, 'x': -.03 * e, 'y': .015 * e}


def cam_map(p, cam, k):
    s = 1 + (cam['s'] - 1) * k
    return np.stack([(p[:, 0] - .5) * s + .5 + cam['x'] * k, (p[:, 1] - .5) * s + .5 + cam['y'] * k], 1)


# ---------------------------------------------------------------- warp field
GW, GH = 240, 135
gy, gx = np.mgrid[0:GH, 0:GW].astype(np.float32)
G = np.stack([(gx + .5) / GW, (gy + .5) / GH], -1).reshape(-1, 2)
ASP = np.array([W / H, 1.0])
SIG = .14
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def soft_clamp(m, n, margin):
    """Keep source coordinates inside the image with a smooth, monotonic squeeze near the border
    (instead of mirroring, which would fold lines into a V at the frame edge)."""
    if margin < 1:
        return np.clip(m, 0, n - 1).astype(np.float32)
    lo, hi = margin, n - 1 - margin
    m = np.where(m > hi, hi + margin * np.tanh((m - hi) / margin), m)
    m = np.where(m < lo, lo - margin * np.tanh((lo - m) / margin), m)
    return m.astype(np.float32)


def warp_maps(t):
    cam = camera(t)
    P, Dp = anchors(t, cam)
    d2 = (((G[:, None, :] - P[None]) * ASP) ** 2).sum(-1)
    w = np.exp(-d2 / (2 * SIG ** 2))
    bg = cam_map(G, cam, .5) - G                         # background: slow push-in / drift
    w0 = .12
    D = (w @ Dp + w0 * bg) / (w.sum(1, keepdims=True) + w0)
    D = np.stack([cv2.GaussianBlur(D[:, j].reshape(GH, GW).astype(np.float32), (0, 0), 5, borderType=cv2.BORDER_REPLICATE).ravel()
                  for j in (0, 1)], 1)                   # regularise: keeps the warp fold-free
    # integrate the (backward) displacement as a stationary velocity field by scaling & squaring:
    # the result is a diffeomorphism, so ribbons can bend and slide past each other without folding
    ux = (-D[:, 0] * GW).reshape(GH, GW).astype(np.float32) / 2 ** 6
    uy = (-D[:, 1] * GH).reshape(GH, GW).astype(np.float32) / 2 ** 6
    for _ in range(6):
        ux, uy = (ux + cv2.remap(ux, gx + ux, gy + uy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE),
                  uy + cv2.remap(uy, gx + ux, gy + uy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE))
    dx = cv2.resize(ux, (W, H), interpolation=cv2.INTER_CUBIC) * (W / GW)
    dy = cv2.resize(uy, (W, H), interpolation=cv2.INTER_CUBIC) * (H / GH)
    margin = 90 * min(1.0, t / 3)                        # 0 at frame 0 (exact reference), full by 3 s
    return soft_clamp(xx + dx, W, margin), soft_clamp(yy + dy, H, margin)


def frame(i):
    t = i / FPS
    mx, my = warp_maps(t)
    out = cv2.remap(ref, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)
    ln = cv2.remap(line, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    # light travelling left -> right along the glowing lines
    s = xx / W * .92 - yy / H * .18
    pulse = np.zeros_like(s)
    for per, ph in ((6.5, 0.0), (7.5, 3.4)):
        pos = ((t + ph) % per) / per * 1.5 - .25
        d = s - pos
        pulse += np.where(d < 0, np.exp(-(d / .14) ** 2), np.exp(-(d / .045) ** 2))
    out = out * (1 + .75 * ln * pulse)[..., None]
    out = out * 255 + DITHER
    return np.clip(out, 0, 255).astype(np.uint8)


DITHER = np.random.default_rng(7).uniform(-.5, .5, (H, W, 1)).astype(np.float32)


def main():
    if '--stills' in sys.argv:
        for t in (0, 5, 10, 15, 20):
            cv2.imwrite(str(ROOT / 'frames' / f'rw-{t:02d}.png'), frame(min(int(t * FPS), int(DUR * FPS) - 1)))
        return
    ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}',
                           '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
                           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                           '-colorspace', 'bt709', '-x264-params', 'aq-mode=3', '-movflags', '+faststart', str(OUT)],
                          stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        ff.stdin.write(frame(i).tobytes())
        if i % 60 == 0:
            print(f'frame {i}/{n}', flush=True)
    ff.stdin.close()
    if ff.wait():
        raise SystemExit('ffmpeg failed')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
