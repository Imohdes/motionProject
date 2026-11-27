"""Face detail pass (GFPGAN, partial blend, per-frame landmarks) + gentle polish for upscaled frames.
hg_finish.py <frames_dir> <out_noaudio.mp4> [--blend 0.5] [--preview k,k]"""
import sys, glob, subprocess
import numpy as np, cv2, onnxruntime as ort, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

fdir, out = sys.argv[1], sys.argv[2]
BLEND = float(sys.argv[sys.argv.index("--blend") + 1]) if "--blend" in sys.argv else 0.5
preview = [int(v) for v in sys.argv[sys.argv.index("--preview") + 1].split(",")] if "--preview" in sys.argv else None
BASE = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/"
opt = ort.SessionOptions(); opt.intra_op_num_threads = 4
GFP = ort.InferenceSession(BASE + "fs/gfpgan_1.4.onnx", opt, providers=["CPUExecutionProvider"])
LM = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=BASE + "face_landmarker.task"), running_mode=vision.RunningMode.VIDEO, num_faces=1))
T = np.array([[0.37691676, 0.46864664], [0.62285697, 0.46912813], [0.50123859, 0.61331904], [0.39308822, 0.72541100], [0.61150205, 0.72490465]])
MASK = np.zeros((512, 512), np.float32); MASK[50:462, 50:462] = 1; MASK = cv2.GaussianBlur(MASK, (0, 0), 28)
files = sorted(glob.glob(f"{fdir}/f_*.png"))
FX, FY, FW = 360, 140, 360          # face search window (output coords)
prev5 = None

def landmarks(img, k):
    global prev5
    c = img[FY:FY + FW + 60, FX:FX + FW]; sc = 640 / FW
    c = cv2.resize(c, (640, round(c.shape[0] * sc)), interpolation=cv2.INTER_CUBIC)
    r = LM.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(c, cv2.COLOR_BGR2RGB)), int(k * 40))
    if not r.face_landmarks: return prev5
    p = np.array([[q.x * c.shape[1], q.y * c.shape[0]] for q in r.face_landmarks[0]]) / sc + np.array([FX, FY])
    p5 = np.stack([p[[33, 133, 159, 145]].mean(0), p[[362, 263, 386, 374]].mean(0), p[1], p[61], p[291]]).astype(np.float32)
    if prev5 is not None: p5 = 0.6 * p5 + 0.4 * prev5      # damp landmark jitter -> steadier restoration
    prev5 = p5
    return p5

def process(k):
    img = cv2.imread(files[k])
    f = img.astype(np.float32)
    p5 = landmarks(img, k)
    if p5 is not None and BLEND > 0:
        M, _ = cv2.estimateAffinePartial2D(p5, (T * 512).astype(np.float32), method=cv2.LMEDS)
        c = cv2.warpAffine(img, M, (512, 512), flags=cv2.INTER_CUBIC)
        x = ((c[:, :, ::-1].astype(np.float32) / 255 - 0.5) / 0.5).transpose(2, 0, 1)[None]
        e = GFP.run(None, {"input": x})[0][0].transpose(1, 2, 0)
        e = ((np.clip(e, -1, 1) + 1) / 2 * 255)[:, :, ::-1]
        blend = c.astype(np.float32) * (1 - BLEND) + e * BLEND
        Minv = cv2.invertAffineTransform(M)
        back = cv2.warpAffine(blend, Minv, (img.shape[1], img.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        mm = cv2.warpAffine(MASK, Minv, (img.shape[1], img.shape[0]))[..., None]
        f = back * mm + f * (1 - mm)
    # gentle polish: a touch of local contrast ("clarity") and a very fine grain so it reads as camera footage
    blur = cv2.GaussianBlur(f, (0, 0), 18)
    f = f + (f - blur) * 0.12
    rng = np.random.default_rng(900 + k)
    f = f + cv2.GaussianBlur(rng.normal(0, 1.6, f.shape[:2]).astype(np.float32), (0, 0), 0.5)[..., None]
    return np.clip(f, 0, 255).astype(np.uint8)

if preview:
    for k in range(max(preview) + 1):
        o = process(k)
        if k in preview: cv2.imwrite(f"{out}_k{k}.png", o)
    sys.exit()
h, w = cv2.imread(files[0]).shape[:2]
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", "25", "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
for k in range(len(files)): enc.stdin.write(process(k).tobytes())
enc.stdin.close(); enc.wait(); LM.close()
print("frames", len(files))
