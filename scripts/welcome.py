"""15s welcome animation of Faris built by warping the source photo.

Timeline: idle breathing -> gentle welcoming lean/head tilt with the folded
arms easing open slightly -> return to the original pose -> idle.
Pixels far from the figure are copied untouched from the source.
"""
import cv2, numpy as np, subprocess, math, sys

src = sys.argv[1] if len(sys.argv) > 1 else 'images/2.jpg'
out = sys.argv[2] if len(sys.argv) > 2 else 'output/faris_welcome_gesture_15s.mp4'
FPS, DUR = 30, 15
im = cv2.imread(src); h, w = im.shape[:2]
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

def g(cx, cy, sx, sy):
    return np.exp(-((xx - cx) / sx) ** 2 - ((yy - cy) / sy) ** 2).astype(np.float32)

def ease(t, a, b):  # smoothstep from 0 at a to 1 at b
    x = min(max((t - a) / (b - a), 0.0), 1.0)
    return x * x * x * (x * (x * 6 - 15) + 10)

torso = g(570, 950, 300, 380)
head = g(565, 380, 150, 210)
arms = g(560, 1080, 260, 150)          # folded forearms
fingers = g(470, 875, 45, 45)          # visible fingers on the upper arm

# welcoming-gesture envelope: rise 3-5.5s, hold to 7.5s, return by 10s
def gesture(t):
    return ease(t, 3.0, 5.5) * (1 - ease(t, 7.5, 10.0))

cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}',
       '-r', str(FPS), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p',
       '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
static = (torso + head + arms + fingers) < 1e-3
hx, hy = 565.0, 560.0                   # neck pivot for head tilt
for i in range(FPS * DUR):
    t = i / FPS
    b = 0.5 - 0.5 * math.cos(2 * math.pi * t / 4.2)
    gs = gesture(t)
    # head: tiny welcoming tilt (~2.5 deg) toward guests plus slight dip
    ang = math.radians(-2.5 * gs)
    rx = (xx - hx) * math.cos(ang) - (yy - hy) * math.sin(ang) + hx - xx
    ry = (xx - hx) * math.sin(ang) + (yy - hy) * math.cos(ang) + hy - yy
    dx = head * rx + torso * (3.0 * gs)
    dy = head * (ry + 4.0 * gs - 1.0 * b) + torso * (-1.8 * b + 3.0 * gs)
    # folded arms ease open: lift and widen slightly, fingers slide/lift
    dx += arms * (8.0 * gs) + fingers * (10.0 * gs)
    dy += arms * (-7.0 * gs) + fingers * (-13.0 * gs)
    f = cv2.remap(im, xx - dx, yy - dy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    f[static] = im[static]
    p.stdin.write(f.tobytes())
p.stdin.close(); p.wait()
