"""Portrait still -> 6 s living portrait (1080x1920, 30 fps), built only from the source pixels.

  * light travels along the existing light trails (brightness only; shapes/colours/positions unchanged)
  * very subtle breathing: a smooth ~1 px rise of the chest/arms region; the head, face and everything
    above the shoulders are mathematically untouched (zero displacement)
  * ~0.75 % eased push-in
The woman's upper figure (face, hijab, hands, badge, outline) is excluded from the light effect by a
protection mask. Arm motion (uncrossing / crossing) is NOT synthesised: that needs a generative model.

    python3 scripts/portrait_alive.py [--stills]                                   # woman portrait (defaults)
    python3 scripts/portrait_alive.py --src assets/portrait2-source.jpg --out output/portrait2-alive-6s.mp4 \
        --mask light --breath 640,1330 --poly "$(cat assets/portrait2-outline.txt)"   # man portrait
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
def opt(k, d):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d


SRC = ROOT / opt('--src', 'assets/portrait-source.jpg')
OUT = ROOT / opt('--out', 'output/portrait-alive-6s.mp4')
MASK = opt('--mask', 'dark')                         # dark clothing (abaya) or light clothing (thobe)
POLY = opt('--poly', '')                             # explicit figure outline "x,y;x,y;..." (source px), replaces the auto mask
BREATH = [int(v) for v in opt('--breath', '560,1250').split(',')]      # chest band top,bottom (source px)
W, H, FPS, DUR = 1080, 1920, 30, 6.0
PUSH = .0075
FFMPEG = str(ROOT / 'node_modules' / 'ffmpeg-static' / 'ffmpeg')

src8 = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
sh, sw = src8.shape[:2]
src = src8.astype(np.float32) / 255

# ---------------------------------------------------------------- light-trail mask (bright, saturated, thin)
hsv = cv2.cvtColor(src8, cv2.COLOR_BGR2HSV).astype(np.float32) / 255
lum = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
hp = lum - cv2.GaussianBlur(lum, (0, 0), 4)
trail = (np.clip((hp - .02) / .06, 0, 1) * np.clip((hsv[..., 1] - .2) / .3, 0, 1)
         * np.clip((hsv[..., 2] - .45) / .3, 0, 1))
trail = cv2.GaussianBlur(trail, (0, 0), 1.0)

# ---------------------------------------------------------------- protection: the woman's upper figure
if MASK == 'dark':
    fig = (hsv[..., 2] < 70 / 255)
else:                                              # white thobe + red shemagh
    hue = hsv[..., 0] * 180
    fig = ((hsv[..., 1] < .12) & (hsv[..., 2] > .78)) | (((hue < 8) | (hue > 165)) & (hsv[..., 1] > .45) & (hsv[..., 2] > .45))
fig = fig.astype(np.uint8) * 255
fig = cv2.morphologyEx(fig, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
fig = cv2.morphologyEx(fig, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (45, 45)))
n, lab, st, _ = cv2.connectedComponentsWithStats(fig)
person = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
hull = cv2.convexHull(cv2.findNonZero(person))
protect = np.zeros((sh, sw), np.uint8)
cv2.fillConvexPoly(protect, hull, 255)
if POLY:
    protect[:] = 0
    cv2.fillPoly(protect, [np.array([[int(v) for v in p.split(',')] for p in POLY.split(';')], np.int32)], 255)
protect = cv2.dilate(protect, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41) if POLY else (71, 71)))
protect = cv2.GaussianBlur(protect.astype(np.float32) / 255, (0, 0), 12)
trail *= (1 - protect)

# ---------------------------------------------------------------- breathing field (source px)
ys, xs = np.mgrid[0:sh, 0:sw].astype(np.float32)
x0, x1 = hull[:, 0, 0].min(), hull[:, 0, 0].max()
# chest band: 0 above the shoulders (face untouched), peaks over the chest/arms, fades out by the waist
band = np.clip((ys - BREATH[0]) / 220, 0, 1) * np.clip((BREATH[1] - ys) / 300, 0, 1)
across = np.exp(-(((xs - (x0 + x1) / 2) / ((x1 - x0) * .6)) ** 2))
breath_w = (band * across).astype(np.float32)

k = max(W / sw, H / sh)
cs = np.array([(sw - 1) / 2, (sh - 1) / 2]); co = np.array([(W - 1) / 2, (H - 1) / 2])
oy, ox = np.mgrid[0:H, 0:W].astype(np.float32)
s_coord = (ox / W) * .55 + (oy / H) * .45          # direction the light travels along the trails


def ease(x):
    return .5 - .5 * np.cos(np.pi * min(1.0, max(0.0, x)))


def frame(i):
    t = i / FPS
    s = k * (1 + PUSH * ease(t / DUR))
    # output -> source (inverse of the camera), then the breathing offset (in source px)
    sx = ((ox - co[0]) / s + cs[0]).astype(np.float32)
    sy = ((oy - co[1]) / s + cs[1]).astype(np.float32)
    breath = 1.1 * np.sin(2 * np.pi * t / 4.2 - np.pi / 2) + 1.1          # 0 -> 2.2 px -> 0, one slow breath + start
    by = cv2.remap(breath_w, sx, sy, cv2.INTER_LINEAR) * breath
    mx, my = sx, (sy + by).astype(np.float32)
    img = cv2.remap(src, mx, my, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    tr = cv2.remap(trail, mx, my, cv2.INTER_LINEAR)
    pulse = np.zeros_like(s_coord)
    for per, ph in ((3.0, 0.0), (3.0, 1.5)):
        pos = ((t + ph) % per) / per * 1.6 - .3
        d = s_coord - pos
        pulse += np.where(d < 0, np.exp(-(d / .12) ** 2), np.exp(-(d / .04) ** 2))
    img = img * (1 + 1.2 * tr * pulse)[..., None]
    return np.clip(img * 255 + .5, 0, 255).astype(np.uint8)


def main():
    if '--stills' in sys.argv:
        for t in (0.7, 2.2):
            cv2.imwrite(str(ROOT / 'frames' / f'{OUT.stem}-{t}.png'), frame(int(t * FPS)))
        vis = src8.copy(); pm = protect > .5
        vis[pm] = (vis[pm] * .5 + np.array([0, 255, 0]) * .5).astype(np.uint8)
        vis = np.maximum(vis, (trail[..., None] * 255).astype(np.uint8))
        cv2.imwrite(str(ROOT / 'frames' / f'{OUT.stem}-mask.png'), cv2.resize(vis, (sw // 2, sh // 2)))
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
