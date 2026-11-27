"""Finish an animated still: subtle breathing + standing sway, 1080x1920 framing, slow push-in with micro drift,
film grain, fades. still_finish.py <frames_dir> <person_alpha.png> <out_noaudio.mp4> [last_frame] [--preview k,k]"""
import sys, glob, subprocess
import numpy as np, cv2

fdir, alpha_path, out = sys.argv[1:4]
last = int(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith("--") else None
preview = [int(v) for v in sys.argv[sys.argv.index("--preview") + 1].split(",")] if "--preview" in sys.argv else None
files = sorted(glob.glob(f"{fdir}/f_*.png"))
if last is not None: files = files[:last + 1]
LEAD, HOLD, FPS = 10, 8, 25
timeline = [0] * LEAD + list(range(len(files))) + [len(files) - 1] * HOLD
T = len(timeline)

f0 = cv2.imread(files[0]); H, W = f0.shape[:2]
A = cv2.imread(alpha_path, 0).astype(np.float32) / 255
A = cv2.resize(A, (W, H))
ys = np.where(A.max(1) > 0.5)[0]; top, bottom = ys.min(), ys.max()
Ab = cv2.GaussianBlur(A, (0, 0), 14)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
height = np.clip((bottom - yy) / (bottom - top), 0, 1)
sway_prof = (height ** 1.3) * Ab                              # 0 at the feet, most at the head
sh_y = top + 0.17 * (bottom - top)                            # shoulder line
breath_prof = np.clip(1 - np.clip((yy - sh_y) / (0.35 * (bottom - top)), 0, 1), 0, 1) * Ab   # shoulders + head rise

S = 1080 / W                                                  # cover-fit to 1080x1920
OH = round(H * S); OT = (OH - 1920) // 2

def render(k):
    img = cv2.imread(files[timeline[k]]).astype(np.float32)
    t = k / FPS
    dx = 1.8 * np.sin(2 * np.pi * t / 4.6) + 0.5 * np.sin(2 * np.pi * t / 2.1 + 0.7)
    br = 1.6 * (0.5 - 0.5 * np.cos(2 * np.pi * t / 3.6))
    mapx = (xx - dx * sway_prof).astype(np.float32)
    mapy = (yy + br * breath_prof).astype(np.float32)
    img = cv2.remap(img, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    img = cv2.resize(img, (1080, OH), interpolation=cv2.INTER_AREA)[OT:OT + 1920]
    u = k / (T - 1)
    z = 1.012 + 0.03 * (u * u * (3 - 2 * u))
    cdx = 1.2 * np.sin(2 * np.pi * t / 3.7) + 0.6 * np.sin(2 * np.pi * t / 1.9 + 1.0)
    cdy = 0.9 * np.sin(2 * np.pi * t / 4.1 + 0.5) + 0.5 * np.sin(2 * np.pi * t / 2.3 + 2.0)
    M = cv2.getRotationMatrix2D((540, 760), 0.06 * np.sin(2 * np.pi * t / 4.7), z)
    M[0, 2] += cdx; M[1, 2] += cdy
    img = cv2.warpAffine(img, M, (1080, 1920), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    rng = np.random.default_rng(500 + k)
    g = cv2.GaussianBlur(rng.normal(0, 3.2, (1920, 1080)).astype(np.float32), (0, 0), 0.55)
    img = img + g[..., None] + rng.normal(0, 1.1, img.shape).astype(np.float32)
    img *= min(1.0, k / 10, (T - 1 - k) / 14)
    return np.clip(img, 0, 255).astype(np.uint8)

if preview:
    for k in preview: cv2.imwrite(f"{out}_k{k}.png", render(k))
    sys.exit()
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "1080x1920", "-r", str(FPS), "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
for k in range(T): enc.stdin.write(render(k).tobytes())
enc.stdin.close(); enc.wait()
print("frames", T, "duration", T / FPS)
