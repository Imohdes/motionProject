"""Drive a still portrait with the face motion of a driving video (LivePortrait relative motion + stitching).

lp_animate.py <source.png> <source_lm.npy> <driving.mp4> <driving_track.json> <out_dir> [--frames a,b,c]
Writes full-size frames out_dir/f_####.png and motion.json (driving index used as neutral reference etc.).
"""
import sys, os, json
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_core as L

src_path, src_lm, drv_path, drv_track, out = sys.argv[1:6]
only = [int(v) for v in sys.argv[sys.argv.index("--frames") + 1].split(",")] if "--frames" in sys.argv else None
os.makedirs(out, exist_ok=True)
ZOOM = 0.8
ROT_GAIN, T_GAIN, SCALE_GAIN = 0.65, 0.45, 0.5
LIP_IDX = [6, 12, 14, 17, 19, 20]
EXP_GAIN = np.ones((21, 1), np.float32)
EXP_GAIN[LIP_IDX] = float(os.environ.get("LIP_GAIN", "1.15"))

# ---------------- source ----------------
img = cv2.imread(src_path).astype(np.float32)
H, W = img.shape[:2]
Ms = L.align(L.five_points(np.load(src_lm)), 512, ZOOM)
crop_s = np.clip(cv2.warpAffine(img, Ms, (512, 512), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE), 0, 255).astype(np.uint8)
feat = L.features(crop_s)
ms = L.motion(crop_s)
Rs = L.rot(ms["pitch"], ms["yaw"], ms["roll"])
x_s = L.keypoints(ms["kp"], Rs, ms["exp"], ms["scale"], ms["t"])
Minv = cv2.invertAffineTransform(Ms)

# paste-back mask in crop space: soft-edged box (borders are kept by the stitcher)
m = np.zeros((512, 512), np.float32); m[34:478, 34:478] = 1
m = cv2.GaussianBlur(m, (0, 0), 16)
mask_full = cv2.warpAffine(m, Minv, (W, H), flags=cv2.INTER_LINEAR)[..., None]

# ---------------- driving motion ----------------
track = json.load(open(drv_track))["frames"]
cap = cv2.VideoCapture(drv_path); D = []
i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    lm = track[i] if i < len(track) else None
    if lm is None: lm = track[i - 1]
    Md = L.align(L.five_points(np.array(lm)), 512, ZOOM)
    cd = cv2.warpAffine(f, Md, (512, 512), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    D.append(L.motion(cd)); i += 1
N = len(D)
lm_all = [np.array(t) for t in track[:N]]
mouth_open = np.array([np.linalg.norm(p[13] - p[14]) / np.linalg.norm(p[10] - p[152]) for p in lm_all])

pose = np.array([[d["pitch"], d["yaw"], d["roll"]] for d in D])
tt = np.array([d["t"][0] for d in D]); ss = np.array([d["scale"][0, 0] for d in D])
def smooth(a, sigma):
    if sigma <= 0: return a
    k = np.exp(-0.5 * (np.arange(-3, 4) / sigma) ** 2); k /= k.sum()
    pad = np.pad(a, [(3, 3)] + [(0, 0)] * (a.ndim - 1), mode="edge")
    return np.stack([np.tensordot(k, pad[j:j + 7], axes=(0, 0)) for j in range(len(a))])
pose_s, tt_s, ss_s = smooth(pose, 1.2), smooth(tt, 1.5), smooth(ss, 1.5)
exps = np.stack([d["exp"][0] for d in D])
exps_s = smooth(exps, 0.6)

# neutral reference: closed-mouth frame in the pause, near the median head pose
cand = [k for k in range(N) if 50 <= k <= 64] or list(range(N))
med = np.median(pose_s, 0)
ref = min(cand, key=lambda k: mouth_open[k] * 40 + np.abs(pose_s[k] - med).sum() * 0.05)
print("neutral reference driving frame", ref, "mouth", round(float(mouth_open[ref]), 4), "pose", pose_s[ref].round(2))

def frame(k):
    dp = (pose_s[k] - pose_s[ref]) * ROT_GAIN
    R = L.rot(ms["pitch"] + dp[0], ms["yaw"] + dp[1], ms["roll"] + dp[2])
    dexp = ((exps_s[k] - exps_s[ref]) * EXP_GAIN)[None]
    scale = ms["scale"] * (ss_s[k] / ss_s[ref]) ** SCALE_GAIN
    t = ms["t"] + (tt_s[k] - tt_s[ref])[None] * T_GAIN
    # stitch only the head motion (keeps neck/collar fixed), then add the expression on top:
    # this export's stitcher cancels expression changes if they are passed through it
    x_pose = L.keypoints(ms["kp"], R, ms["exp"], scale, t)
    x_d = L.stitch(x_s, x_pose) + scale[..., None] * dexp
    g = L.generate(feat, x_s, x_d)
    back = np.clip(cv2.warpAffine(g, Minv, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE), 0, 255)
    return np.clip(back * mask_full + img * (1 - mask_full), 0, 255).astype(np.uint8)

ks = only if only is not None else range(N)
for k in ks:
    cv2.imwrite(f"{out}/f_{k:04d}.png", frame(k))
json.dump({"ref": int(ref), "N": N, "mouth_open": mouth_open.tolist()}, open(f"{out}/motion.json", "w"))
print("wrote", len(list(ks)), "frames")
