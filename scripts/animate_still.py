"""Animate a still abstract background into a seamless, ultra-subtle 20 s loop (1920x1080, 30 fps).

The source image itself is the only picture used; nothing is added or recoloured.
  * wave-like flow: a smooth displacement field (a few px) whose waves travel left -> right
  * parallax: the field's amplitude/phase differs for the orange, blue and green layers
    (soft colour masks, heavily blurred so the field never tears)
  * light travelling along the existing thin glowing lines (brightness only, from a line mask)
  * breathing glow ~1.5 %, and an almost unnoticeable push-in (<= 1 %)
Every term is periodic in the loop length, so frame(20 s) == frame(0).

    python3 scripts/animate_still.py [source] [out.mp4] [--stills]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
POS = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = Path(POS[0]) if len(POS) > 0 else ROOT / 'assets' / 'abstract-source.webp'
OUT = Path(POS[1]) if len(POS) > 1 else ROOT / 'output' / 'abstract-background-loop-1080p.mp4'
W, H, FPS, L = 1920, 1080, 30, 20.0
FRAMES = int(FPS * L)
TAU = 2 * np.pi
FFMPEG = str(ROOT / 'node_modules' / 'ffmpeg-static' / 'ffmpeg')

# ---------------------------------------------------------------- source
bgr = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
img = cv2.resize(bgr, (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32) / 255.0

# ---------------------------------------------------------------- layer masks (soft, very smooth)
hsv = cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
hue, sat = hsv[..., 0], hsv[..., 1] / 255.0


def band(h0, h1):
    m = ((hue >= h0) & (hue <= h1)).astype(np.float32) * np.clip(sat * 1.5, 0, 1)
    return cv2.GaussianBlur(m, (0, 0), 45)


m_orange, m_blue, m_green = band(3, 28), band(95, 130), band(40, 90)
tot = m_orange + m_blue + m_green + 1e-3
m_orange, m_blue, m_green = m_orange / tot, m_blue / tot, m_green / tot

# ---------------------------------------------------------------- thin glowing lines
lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
hp = lum - cv2.GaussianBlur(lum, (0, 0), 5)
line = np.clip((hp - .015) / .06, 0, 1)
line = cv2.GaussianBlur(line, (0, 0), 1.2)
glow = cv2.GaussianBlur(line, (0, 0), 18)
glow = glow / (glow.max() + 1e-6)

# ---------------------------------------------------------------- coordinate grids
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
LR = (W // 4, H // 4)                                  # fields are smooth: compute small, upsample
ys, xs = np.mgrid[0:LR[1], 0:LR[0]].astype(np.float32)
u, v = xs / LR[0], ys / LR[1]
mo, mb, mg = (cv2.resize(m, LR, interpolation=cv2.INTER_AREA) for m in (m_orange, m_blue, m_green))
# along-line coordinate for the travelling light (lines run left -> right, gently rising)
s_line = (xx / W) * .92 - (yy / H) * .18


def layer_field(th, amp, ph):
    """Waves travelling left -> right (integer cycles per loop => seamless)."""
    dx = amp * (.55 * np.sin(TAU * (1.0 * u + .35 * v) - th + ph)
                + .30 * np.sin(TAU * (2.0 * u - .25 * v) - 2 * th + ph * 1.7)
                + .45 * np.sin(th + ph))                     # parallax sway of the whole layer
    dy = amp * .6 * (.6 * np.sin(TAU * (1.0 * u - .20 * v) - th + ph + 1.1)
                     + .4 * np.sin(TAU * (1.5 * u + .50 * v) - 2 * th + ph * .6))
    return dx, dy


DITHER = np.random.default_rng(7).uniform(-.5, .5, (H, W, 1)).astype(np.float32)


def frame(i):
    t = i / FPS
    th = TAU * t / L
    # layered flow (orange = foreground: largest; blue / green = supporting layers)
    dx = np.zeros(LR[::-1], np.float32); dy = np.zeros_like(dx)
    for m, amp, ph in ((mo, 5.0, 0.0), (mb, 3.2, 2.2), (mg, 2.6, 4.1)):
        fx, fy = layer_field(th, amp, ph)
        dx += m * fx; dy += m * fy
    dx = cv2.resize(dx, (W, H), interpolation=cv2.INTER_CUBIC)
    dy = cv2.resize(dy, (W, H), interpolation=cv2.INTER_CUBIC)
    # almost unnoticeable push-in (0 -> 0.9 % -> 0 across the loop)
    z = 1 + .009 * (1 - np.cos(th)) / 2
    mx = (W / 2 + (xx - W / 2) / z - dx).astype(np.float32)
    my = (H / 2 + (yy - H / 2) / z - dy).astype(np.float32)
    out = cv2.remap(img, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)
    ln = cv2.remap(line, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    gl = cv2.remap(glow, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    # soft light travelling along the thin lines (two slow pulses, 1 lap per loop each)
    pulse = np.zeros_like(s_line)
    for ph in (0.0, .5):
        d = (s_line - (t / L + ph)) % 1.0                    # wrap to [0,1)
        d = np.where(d > .5, d - 1, d)                       # signed distance, wraps seamlessly
        pulse += np.where(d < 0, np.exp(-(d / .11) ** 2), np.exp(-(d / .05) ** 2))
    boost = 1 + .55 * ln * pulse
    # breathing glow, ~1.5 % around the lines
    boost *= 1 + .015 * np.sin(th) * gl
    out = out * boost[..., None]
    # sub-LSB dither against gradient banding in the 8-bit encode
    out = out * 255 + DITHER          # static pattern: no temporal noise, identical at the loop seam
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    if '--stills' in sys.argv:
        for t in (0, 5, 10, 15, 20):
            cv2.imwrite(str(ROOT / 'frames' / f'abs-{t:02d}.png'), frame(int(t * FPS)))
        cv2.imwrite(str(ROOT / 'frames' / 'abs-linemask.png'), (line * 255).astype(np.uint8))
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                           '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
                           # equal I/P/B quantisers: no keyframe "pop", so the loop seam is invisible
                           '-x264-params', 'keyint=150:min-keyint=150:scenecut=0:ipratio=1.0:pbratio=1.0:aq-mode=3',
                           '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                           '-colorspace', 'bt709', '-movflags', '+faststart', str(OUT)], stdin=subprocess.PIPE)
    for i in range(FRAMES):
        ff.stdin.write(frame(i).tobytes())
        if i % 60 == 0:
            print(f'frame {i}/{FRAMES}', flush=True)
    ff.stdin.close()
    if ff.wait():
        raise SystemExit('ffmpeg failed')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
