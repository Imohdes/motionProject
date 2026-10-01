"""Portrait still -> 6 s video where ONLY the background lights and light trails move (1080x1920, 30 fps).

The man is pixel-locked (no warp, no zoom, no camera move): the effects are added to the background
only, through a feathered mask of his traced outline.
  * clearly visible light pulses travel along the existing light trails, with a soft glow halo,
    in two directions so different lines light up at different times
  * the large orange light band gently "breathes" with a slow travelling wave
Every term repeats with the 6 s length, so the clip also loops seamlessly.

    python3 scripts/portrait_lights.py [source] [out.mp4] [--stills]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
POS = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = Path(POS[0]) if POS else ROOT / 'assets' / 'portrait3-source.webp'
OUT = Path(POS[1]) if len(POS) > 1 else ROOT / 'output' / 'portrait-lights-6s.mp4'
OUTLINE = ROOT / 'assets' / 'portrait2-outline.txt'
W, H, FPS, DUR = 1080, 1920, 30, 6.0
TAU = 2 * np.pi
FFMPEG = str(ROOT / 'node_modules' / 'ffmpeg-static' / 'ffmpeg')

# work directly at output resolution: one static resample of the source, then effects on top
src8 = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
sh, sw = src8.shape[:2]
k = max(W / sw, H / sh)
M = np.array([[k, 0, (W - 1) / 2 - k * (sw - 1) / 2], [0, k, (H - 1) / 2 - k * (sh - 1) / 2]])
base8 = cv2.warpAffine(src8, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
img = base8.astype(np.float32) / 255

# the man: traced outline (source px) -> output px, generous feathered margin
pts = np.array([[float(v) for v in p.split(',')] for p in OUTLINE.read_text().strip().split(';')])
pts = (pts * k + M[:, 2]).astype(np.int32)
man = np.zeros((H, W), np.uint8)
cv2.fillPoly(man, [pts], 1)
lower = np.array([[int(250 * k + M[0, 2]), int(1200 * k + M[1, 2])], [int(960 * k + M[0, 2]), int(1200 * k + M[1, 2])],
                  [int(930 * k + M[0, 2]), H], [int(250 * k + M[0, 2]), H]], np.int32)
cv2.fillPoly(man, [lower], 1)
man = cv2.dilate(man, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
bg = 1 - cv2.GaussianBlur(man.astype(np.float32), (0, 0), 10)

# light-trail mask: thin, bright, saturated strokes
hsv = cv2.cvtColor(base8, cv2.COLOR_BGR2HSV).astype(np.float32) / 255
lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
hp = lum - cv2.GaussianBlur(lum, (0, 0), 4)
trail = (np.clip((hp - .015) / .05, 0, 1) * np.clip((hsv[..., 1] - .18) / .3, 0, 1) * np.clip((hsv[..., 2] - .4) / .3, 0, 1))
trail = cv2.GaussianBlur(trail, (0, 0), 1.0) * bg
# large orange light band
hue = hsv[..., 0] * 180
band = (((hue >= 5) & (hue <= 25)) & (hsv[..., 1] > .5) & (hsv[..., 2] > .55)).astype(np.float32)
band = cv2.GaussianBlur(band, (0, 0), 25) * bg

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
s1 = (xx / W) * .5 + (yy / H) * .5            # top-left -> bottom-right
s2 = (xx / W) * .6 - (yy / H) * .4            # bottom-left -> top-right


def pulses(s, t, per, phases, head=.035, tail=.11):
    out = np.zeros_like(s)
    for ph in phases:
        pos = ((t / per + ph) % 1.0) * 1.5 - .25
        d = s - pos
        out += np.where(d < 0, np.exp(-(d / tail) ** 2), np.exp(-(d / head) ** 2))
    return out


def frame(i):
    t = i / FPS
    p = pulses(s1, t, 3.0, (0.0, .5)) + .8 * pulses(s2, t, 6.0, (.25,))
    lit = trail * p
    out = img * (1 + 1.6 * lit)[..., None]
    halo = cv2.GaussianBlur(img * lit[..., None], (0, 0), 6)            # soft glow around the travelling light
    out += 1.4 * halo * bg[..., None]
    wave = .5 + .5 * np.sin(TAU * (t / DUR) - TAU * (xx / W * .6 + yy / H * .4))
    out *= (1 + .09 * band * wave)[..., None]                           # orange light breathes
    out = np.clip(out * 255 + .5, 0, 255).astype(np.uint8)
    keep = man.astype(bool)
    out[keep] = base8[keep]                                             # the man: exact source pixels
    return out


def main():
    if '--stills' in sys.argv:
        for t in (0, 1.0, 2.0, 4.0):
            cv2.imwrite(str(ROOT / 'frames' / f'lights-{t}.png'), frame(int(t * FPS)))
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
