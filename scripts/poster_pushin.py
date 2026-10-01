"""Camera-only move on a flat still ("a printed poster filmed by a camera"), 1080x1920, 30 fps, 8 s.

Every frame is ONE affine resample (uniform scale + translation, no rotation) of the original pixels:
nothing inside the image is animated, warped or regenerated.
  * push-in: 1.0 -> 1.018 with smooth ease-in-out over 8 s
  * float: a drift of < 0.4 % that always stays inside the push-in margin (no edge is ever revealed)

    python3 scripts/poster_pushin.py [source] [out.mp4] [--stills]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
POS = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = Path(POS[0]) if POS else ROOT / 'assets' / 'poster-source.jpg'
OUT = Path(POS[1]) if len(POS) > 1 else ROOT / 'output' / 'poster-pushin-8s.mp4'
W, H, FPS, DUR = 1080, 1920, 30, 8.0
PUSH = .018
FFMPEG = str(ROOT / 'node_modules' / 'ffmpeg-static' / 'ffmpeg')

src = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
sh, sw = src.shape[:2]
k = max(W / sw, H / sh)                      # fit to cover 9:16 (source is 1119x2000: trims ~5 px top/bottom)
cs = np.array([(sw - 1) / 2, (sh - 1) / 2])
co = np.array([(W - 1) / 2, (H - 1) / 2])


def ease(x):                                  # smooth sine ease-in-out
    return .5 - .5 * np.cos(np.pi * min(1.0, max(0.0, x)))


def frame(i):
    t = i / FPS
    s = 1 + PUSH * ease(t / DUR)
    margin = (s - 1) / 2                      # fraction of the frame available for drift at this instant
    dx = .4 * margin * W * np.sin(np.pi * t / DUR)
    dy = -.3 * margin * H * np.sin(np.pi * t / DUR * .8)
    ks = k * s
    M = np.array([[ks, 0, co[0] + dx - ks * cs[0]], [0, ks, co[1] + dy - ks * cs[1]]], np.float64)
    return cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def main():
    if '--stills' in sys.argv:
        for t in (0, 4, 8):
            cv2.imwrite(str(ROOT / 'frames' / f'poster-{t}.png'), frame(min(int(t * FPS), int(DUR * FPS) - 1)))
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}',
                           '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12',
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
