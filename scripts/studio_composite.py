"""Studio relight + composite of a matted presenter over a vertical backdrop, rendered as the final timeline.

studio_composite.py <person.mp4> <matte_dir> <bg.png> <out_video_noaudio.mp4> [--preview k1,k2,...]

person.mp4 : animated presenter (1088x1920, 25 fps), matte_dir holds RVM a_####.png / f_####.png for it.
Timeline   : 10-frame held lead-in, frames 0..107 real time, silent tail 108..144 at 1.5x, 12-frame hold,
             fade in/out, slow camera push-in with micro drift, bloom and film grain.
"""
import sys, os, subprocess
import numpy as np, cv2

src, mdir, bg_path, out = sys.argv[1:5]
preview = [int(v) for v in sys.argv[sys.argv.index("--preview") + 1].split(",")] if "--preview" in sys.argv else None
W, H, FPS = 1080, 1920, 25

# ---------------- source frames ----------------
cap = cv2.VideoCapture(src); SRC = []
while True:
    ok, f = cap.read()
    if not ok: break
    SRC.append(f)
N = len(SRC)

import json
FACE = []
for fr in json.load(open(os.environ.get("TRACK", "trackFE.json")))["frames"]:
    if fr is None: FACE.append(None); continue
    p = np.array(fr); FACE.append((p[:, 0].mean() * W / 1088, p[:, 1].mean() + 10))
LEAD, BODY_END, TAIL_SPEED, HOLD = 10, 108, 1.5, 12
tail = []
j = 0
while True:
    s = BODY_END + int(round(j * TAIL_SPEED))
    if s > N - 1: break
    tail.append(s); j += 1
timeline = [0] * LEAD + list(range(BODY_END)) + tail + [N - 1] * HOLD
T = len(timeline)

# ---------------- backdrop with a floor falloff ----------------
bg = cv2.imread(bg_path).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
floor = 1 - 0.55 * smoothstep(1580, 1920, yy)
bg = bg * floor[..., None] * 0.95
bg_blur = cv2.GaussianBlur(bg, (0, 0), 22)
BG_LUM = cv2.GaussianBlur(bg, (0, 0), 45).mean(2)

def to_rgbf(c):  # (R,G,B) -> BGR float
    return np.array(c[::-1], np.float32)
RIM_L, RIM_R, RIM_T = to_rgbf((90, 235, 215)), to_rgbf((255, 165, 70)), to_rgbf((255, 205, 135))
L2 = np.array([-0.93, -0.37], np.float32)          # key light comes from camera-left, slightly above

def load_person(s):
    a = cv2.imread(f"{mdir}/a_{s:04d}.png", 0)
    f = cv2.imread(f"{mdir}/f_{s:04d}.png")
    o = SRC[s]
    a = cv2.resize(a, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    f = cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
    o = cv2.resize(o, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
    # choke the matte ~1px to drop the old hall's fringe, use RVM's de-spilled colour at the edges
    a = np.clip((a - 0.12) / 0.86, 0, 1)
    a = cv2.erode(a, np.ones((3, 3), np.uint8))
    a = smoothstep(0.18, 0.82, cv2.GaussianBlur(a, (0, 0), 1.3))   # smooth small notches in the edge
    w = smoothstep(0.85, 0.99, a)[..., None]
    return a, o * w + f * (1 - w)

def render(k):
    s = timeline[k]
    A, P = load_person(s)
    A3 = A[..., None]

    # detail: gentle unsharp to bring texture back to the AI-smooth skin/cloth
    P = P + (P - cv2.GaussianBlur(P, (0, 0), 1.1)) * 0.45

    # ---- key / fill shading ----
    ys, xs = np.where(A > 0.5)
    cx = np.median(xs[(ys > 500) & (ys < 1300)]) if len(xs) else W / 2
    fill = smoothstep(cx - 110, cx + 240, xx)
    broad = 1.04 - 0.40 * fill                                           # camera-right side falls into fill
    broad *= 1.0 - 0.24 * smoothstep(850, 1880, yy)                      # spot on the upper body
    if FACE[s] is not None:                                              # model the face: key left, fill right
        fx, fy = FACE[s]
        head = np.clip(1 - (((xx - fx) / 130) ** 2 + ((yy - fy) / 175) ** 2), 0, 1)
        head = cv2.GaussianBlur(head, (0, 0), 12)
        broad *= 1 - 0.17 * head * smoothstep(fx - 35, fx + 85, xx)
    Ab = cv2.GaussianBlur(A, (0, 0), 9)
    gy, gx = np.gradient(Ab)
    gn = np.sqrt(gx ** 2 + gy ** 2) + 1e-6
    nx, ny = -gx / gn, -gy / gn                                          # outward normal
    edge_zone = np.clip(gn * 18, 0, 1)
    ndl = nx * L2[0] + ny * L2[1]
    local = 1 + edge_zone * np.where(ndl > 0, 0.03 * ndl, 0.14 * ndl)    # form falls off on the shadow side
    P = P * 0.9 * (broad * local)[..., None]
    P = P * (1 + fill[..., None] * np.array([0.035, 0.015, -0.04], np.float32))   # teal bounce in the fill side
    # gentle S-curve for depth in the folds
    Pn = np.clip(P / 255, 0, 1)
    P = 255 * (Pn + 0.10 * (Pn - 0.5) * (1 - np.abs(2 * Pn - 1)))
    # camera-like highlight roll-off so the white thobe keeps detail instead of glowing
    L = P.mean(2, keepdims=True)
    knee = 175.0
    Lc = np.where(L > knee, knee + (L - knee) * 0.62, L)
    P = P * (Lc / np.maximum(L, 1))

    # ---- rim lights (cool from camera-left, warm from camera-right, warm top from the orange glow) ----
    As = cv2.GaussianBlur(A, (0, 0), 2.5)
    gy2, gx2 = np.gradient(As)
    gn2 = np.sqrt(gx2 ** 2 + gy2 ** 2) + 1e-6
    nx2, ny2 = -gx2 / gn2, -gy2 / gn2
    er = cv2.erode(A, np.ones((9, 9), np.uint8))
    band = cv2.GaussianBlur(np.clip(A - er, 0, 1), (0, 0), 2.2) ** 1.5   # soft falloff into the body
    band = band * smoothstep(40, 190, BG_LUM)                            # rim only where the backdrop is bright
    wl = band * np.clip(-nx2, 0, 1) ** 0.9
    wr = band * np.clip(nx2, 0, 1) ** 0.9
    wt = band * np.clip(-ny2, 0, 1) ** 1.2 * smoothstep(1100, 300, yy)
    rim = wl[..., None] * RIM_L * 0.85 + wr[..., None] * RIM_R * 0.85 + wt[..., None] * RIM_T * 0.5
    lumP = P.mean(2, keepdims=True)
    P = P + rim * (1 - 0.75 * smoothstep(160, 215, lumP))

    # ---- light wrap from the backdrop ----
    er2 = cv2.erode(A, np.ones((15, 15), np.uint8))
    wrap = cv2.GaussianBlur(np.clip(A - er2, 0, 1), (0, 0), 4)[..., None] * 0.16
    P = P * (1 - wrap) + bg_blur * wrap

    # ---- backdrop: contact shadow + rim spill glow ----
    B = bg.copy()
    col = A > 0.5
    has = col.any(0)
    bottom = np.where(has, H - 1 - np.argmax(col[::-1], 0), -1)
    line = np.zeros((H, W), np.float32)
    for x in np.where(has)[0]:
        yb = bottom[x]
        if yb > 1700: line[max(yb - 3, 0):min(yb + 6, H), x] = 1
    tight = np.clip(cv2.GaussianBlur(line, (0, 0), 5) * 1.7, 0, 1)
    soft = np.clip(cv2.GaussianBlur(cv2.dilate(line, np.ones((15, 15), np.uint8)), (0, 0), 20) * 1.5, 0, 1)
    if has.any():
        fb = bottom[has].max(); pxs = np.where(has)[0]; pcx = (pxs.min() + pxs.max()) / 2; pw = pxs.max() - pxs.min()
        wide = np.clip(1 - (((xx - pcx) / (pw * 0.62)) ** 2 + ((yy - (fb - 25)) / 55) ** 2), 0, 1) ** 1.2
        wide = cv2.GaussianBlur(wide, (0, 0), 22)
    else:
        wide = 0
    sh = 0.75 * tight + 0.5 * soft + 0.4 * wide
    B = B * np.clip(1 - sh, 0.1, 1)[..., None]
    glow = cv2.GaussianBlur(wl[..., None] * RIM_L + wr[..., None] * RIM_R, (0, 0), 4) * 0.10
    B = B + glow * (1 - A3)

    # ---- composite ----
    C = P * A3 + B * (1 - A3)

    # ---- bloom (mostly from the backdrop glow) ----
    lum = C.mean(2, keepdims=True)
    keep_off = cv2.GaussianBlur(cv2.dilate(A, np.ones((31, 31), np.uint8)), (0, 0), 10)[..., None]
    bright = C * smoothstep(175, 255, lum) * (1 - keep_off)
    C = C + cv2.GaussianBlur(bright, (0, 0), 24) * 0.22

    # ---- camera: slow push-in with micro drift ----
    t = k / FPS
    u = k / (T - 1)
    z = 1.012 + 0.032 * (u * u * (3 - 2 * u))
    dx = 1.3 * np.sin(2 * np.pi * t / 3.7) + 0.7 * np.sin(2 * np.pi * t / 1.9 + 1.0)
    dy = 1.0 * np.sin(2 * np.pi * t / 4.1 + 0.5) + 0.6 * np.sin(2 * np.pi * t / 2.3 + 2.0)
    ang = 0.07 * np.sin(2 * np.pi * t / 4.7)
    M = cv2.getRotationMatrix2D((540, 820), ang, z)
    M[0, 2] += dx; M[1, 2] += dy
    C = cv2.warpAffine(C, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

    # ---- grain ----
    rng = np.random.default_rng(1000 + k)
    g = cv2.GaussianBlur(rng.normal(0, 4.2, (H, W)).astype(np.float32), (0, 0), 0.55)
    ch = rng.normal(0, 1.4, (H, W, 3)).astype(np.float32)
    C = C + g[..., None] + ch

    # ---- fades ----
    fin = min(1.0, k / 10)
    fout = min(1.0, (T - 1 - k) / 14)
    C = C * min(fin, fout)
    return np.clip(C, 0, 255).astype(np.uint8)

if preview:
    for k in preview:
        cv2.imwrite(f"{out}_k{k}.png", render(k))
    print("preview", preview, "of", T)
    sys.exit()

enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
for k in range(T):
    enc.stdin.write(render(k).tobytes())
enc.stdin.close(); enc.wait()
print("frames", T, "duration", T / FPS)
