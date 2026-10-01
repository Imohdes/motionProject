"""Portrait still -> 6 s "alive" portrait with small, visible body motion (1080x1920, 30 fps, locked camera).

A localized puppet warp of the source pixels: each body part gets its own small rigid motion (rotation
about an anatomical pivot) blended with feathered masks, so nothing is regenerated and nothing tears.
  torso      weight shift / sway, rotating about the hips
  head       small tilt + sideways shift about the neck; the shemagh drape follows with a slight lag
  forearm    the top forearm lifts about its elbow and settles back (2-4 s)
  badge      small pendulum swing about its clip, driven by the body motion, then settles
  breathing  chest and shoulders rise and fall
  trails     light travels along the background light trails (brightness only, figure protected)
Not possible with a warp (and therefore not faked): a true 3-D head turn and blinking.

    python3 scripts/portrait_motion.py [--stills]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'portrait3-source.webp'
OUTLINE = ROOT / 'assets' / 'portrait2-outline.txt'        # same photo as portrait 2
OUT = ROOT / 'output' / 'portrait3-motion-6s.mp4'
W, H, FPS, DUR = 1080, 1920, 30, 6.0
FFMPEG = str(ROOT / 'node_modules' / 'ffmpeg-static' / 'ffmpeg')

src8 = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
sh, sw = src8.shape[:2]
src = src8.astype(np.float32) / 255
ys, xs = np.mgrid[0:sh, 0:sw].astype(np.float32)


# ---------------------------------------------------------------- keyframed curves (monotone cubic)
def curve(keys):
    kx = np.array([k[0] for k in keys], float); ky = np.array([k[1] for k in keys], float)
    d = np.diff(ky) / np.diff(kx); m = np.zeros_like(ky)
    m[1:-1] = np.where(d[:-1] * d[1:] > 0, (d[:-1] + d[1:]) / 2, 0)
    def f(t):
        if t <= kx[0]: return ky[0]
        if t >= kx[-1]: return ky[-1]
        i = np.searchsorted(kx, t) - 1; h = kx[i + 1] - kx[i]; s = (t - kx[i]) / h
        return ((2 * s**3 - 3 * s**2 + 1) * ky[i] + (s**3 - 2 * s**2 + s) * h * m[i]
                + (-2 * s**3 + 3 * s**2) * ky[i + 1] + (s**3 - s**2) * h * m[i + 1])
    return f


TORSO = curve([(0, 0), (1.2, .85), (2.6, .3), (4.2, -.45), (5.4, 0), (6, 0)])            # deg, about hips
HEAD = curve([(0, 0), (1.0, 2.4), (2.0, 1.8), (3.2, -1.0), (4.6, 0), (6, 0)])            # deg, about neck
HEAD_DX = curve([(0, 0), (1.0, 8), (2.2, 5), (3.5, -3), (5.0, 0), (6, 0)])             # px
ARM = curve([(0, 0), (2.0, 0), (2.9, 1.9), (3.7, -.2), (4.4, 0), (6, 0)])              # deg, forearm about elbow
BADGE = curve([(0, 0), (1.3, -1.8), (2.3, 1.2), (3.0, 2.8), (3.6, -2.0), (4.2, 1.0), (4.8, -.45), (5.4, 0), (6, 0)])


def feather(mask, r):
    return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), r)


def poly(pts):
    m = np.zeros((sh, sw), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m


# ---------------------------------------------------------------- region masks (source px)
outline = [[int(v) for v in p.split(',')] for p in OUTLINE.read_text().strip().split(';')]
body = poly(outline + [[230, 1480], [990, 1480]])
body = cv2.dilate(body, np.ones((25, 25), np.uint8))
torso_w = feather(body, 22) * np.clip((1500 - ys) / 250, 0, 1)
head_w = np.zeros((sh, sw), np.uint8); cv2.ellipse(head_w, (515, 395), (245, 265), 0, 0, 360, 1, -1)
head_w = feather(head_w, 30) * np.clip((640 - ys) / 60, 0, 1)
drape_w = feather(poly([[700, 560], [865, 640], [885, 1005], [790, 1005], [700, 720]]), 25)
arm_w = feather(poly([[440, 1015], [985, 1065], [995, 1240], [560, 1255], [428, 1150]]), 22)
badge_w = feather(poly([[668, 762], [758, 762], [800, 845], [800, 1002], [668, 1002]]), 8)
chest_w = feather(body, 22) * np.clip((ys - 620) / 120, 0, 1) * np.clip((1150 - ys) / 200, 0, 1)
PIV = {'hip': (560, 1500), 'neck': (570, 600), 'elbow': (972, 1170), 'clip': (712, 788)}


def rot_disp(deg, pivot, dx=0.0, dy=0.0):
    """Backward displacement p - T^-1(p) for a rotation by `deg` about `pivot` plus a translation."""
    a = np.deg2rad(deg); c, s = np.cos(a), np.sin(a)
    px, py = xs - pivot[0] - dx, ys - pivot[1] - dy
    sx = c * px + s * py + pivot[0]; sy = -s * px + c * py + pivot[1]
    return xs - sx, ys - sy


# ---------------------------------------------------------------- light trails (protected figure)
hsv = cv2.cvtColor(src8, cv2.COLOR_BGR2HSV).astype(np.float32) / 255
lum = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
hp = lum - cv2.GaussianBlur(lum, (0, 0), 4)
trail = (np.clip((hp - .02) / .06, 0, 1) * np.clip((hsv[..., 1] - .2) / .3, 0, 1) * np.clip((hsv[..., 2] - .45) / .3, 0, 1))
trail = cv2.GaussianBlur(trail, (0, 0), 1.0) * (1 - feather(cv2.dilate(body, np.ones((41, 41), np.uint8)), 12))
s_coord = (xs / sw) * .55 + (ys / sh) * .45

k = max(W / sw, H / sh)
cs = np.array([(sw - 1) / 2, (sh - 1) / 2]); co = np.array([(W - 1) / 2, (H - 1) / 2])
M = np.array([[k, 0, co[0] - k * cs[0]], [0, k, co[1] - k * cs[1]]], np.float64)   # fixed framing, no zoom


def frame(i):
    t = i / FPS
    dx = np.zeros((sh, sw), np.float32); dy = np.zeros_like(dx)
    for w, (ddx, ddy) in (
        (torso_w, rot_disp(TORSO(t), PIV['hip'])),
        (head_w, rot_disp(HEAD(t), PIV['neck'], HEAD_DX(t), 0)),
        (drape_w * .55, rot_disp(HEAD(t - .3), PIV['neck'], HEAD_DX(t - .3) * .6, 0)),
        (arm_w, rot_disp(ARM(t), PIV['elbow'])),
        (badge_w, rot_disp(BADGE(t), PIV['clip'])),
    ):
        dx += w * ddx; dy += w * ddy
    breath = .5 - .5 * np.cos(2 * np.pi * t / 3.0)
    dy += chest_w * (-2.6 * breath)                        # chest/shoulders rise
    mx = (xs - dx).astype(np.float32); my = (ys - dy).astype(np.float32)
    img = cv2.remap(src, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    pulse = np.zeros_like(s_coord)
    for per, ph in ((3.0, 0.0), (3.0, 1.5)):
        d = s_coord - (((t + ph) % per) / per * 1.6 - .3)
        pulse += np.where(d < 0, np.exp(-(d / .12) ** 2), np.exp(-(d / .04) ** 2))
    img = img * (1 + 1.2 * trail * pulse)[..., None]
    img = np.clip(img * 255 + .5, 0, 255).astype(np.uint8)
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def main():
    if '--stills' in sys.argv:
        for t in (0, 1.1, 3.0, 3.6):
            cv2.imwrite(str(ROOT / 'frames' / f'p3m-{t}.png'), frame(int(round(t * FPS))))
        return
    ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}',
                           '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '13',
                           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                           '-colorspace', 'bt709', '-movflags', '+faststart', str(OUT)], stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        ff.stdin.write(frame(i).tobytes())
    ff.stdin.close()
    if ff.wait():
        raise SystemExit('ffmpeg failed')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
