"""Local face swap (inswapper_128 + GFPGAN 1.4, ONNX) of every frame of a video to the identity in a photo.

faceswap.py <identity.png> <identity_lm.npy> <video.mp4> <video_track.json> <out.mp4> [--frames a,b] [--enhance 0.7]
Landmarks are MediaPipe 478-point arrays (image coords).
"""
import sys, os, json, subprocess
import numpy as np, cv2, onnx, onnxruntime as ort
from onnx import numpy_helper

MD = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/fs/"
idp, idlm, vid, trk, out = sys.argv[1:6]
only = [int(v) for v in sys.argv[sys.argv.index("--frames") + 1].split(",")] if "--frames" in sys.argv else None
ENH = float(sys.argv[sys.argv.index("--enhance") + 1]) if "--enhance" in sys.argv else 0.7

opt = ort.SessionOptions(); opt.intra_op_num_threads = 4
ARC = ort.InferenceSession(MD + "arcface_w600k_r50.onnx", opt, providers=["CPUExecutionProvider"])
SWAP = ort.InferenceSession(MD + "inswapper_128.onnx", opt, providers=["CPUExecutionProvider"])
GFP = ort.InferenceSession(MD + "gfpgan_1.4.onnx", opt, providers=["CPUExecutionProvider"])
EMAP = numpy_helper.to_array(onnx.load(MD + "inswapper_128.onnx").graph.initializer[-1])

T_ARC112 = np.array([[0.34191607, 0.46157411], [0.65653393, 0.45983393], [0.50022500, 0.64050536], [0.37097589, 0.82469196], [0.63151696, 0.82325089]])
T_ARC128 = np.array([[0.36167656, 0.40387734], [0.63696719, 0.40235469], [0.50019687, 0.56044219], [0.38710391, 0.72160547], [0.61507734, 0.72034453]])
T_FFHQ = np.array([[0.37691676, 0.46864664], [0.62285697, 0.46912813], [0.50123859, 0.61331904], [0.39308822, 0.72541100], [0.61150205, 0.72490465]])

def five(lm):
    lm = np.asarray(lm, np.float32)
    return np.stack([lm[[33, 133, 159, 145]].mean(0), lm[[362, 263, 386, 374]].mean(0), lm[1], lm[61], lm[291]]).astype(np.float32)

def affine(p5, tmpl, size):
    M, _ = cv2.estimateAffinePartial2D(p5, (tmpl * size).astype(np.float32), method=cv2.LMEDS)
    return M

# ---- identity embedding ----
idimg = cv2.imread(idp)
M = affine(five(np.load(idlm)), T_ARC112, 112)
c = cv2.warpAffine(idimg, M, (112, 112), flags=cv2.INTER_AREA)
x = ((c[:, :, ::-1].astype(np.float32) - 127.5) / 127.5).transpose(2, 0, 1)[None]
emb = ARC.run(None, {"input": x})[0].reshape(-1)
emb = emb / np.linalg.norm(emb)
latent = emb.reshape(1, -1) @ EMAP
latent = (latent / np.linalg.norm(latent)).astype(np.float32)

def box_mask(size, pad=0.10, blur=0.12):
    m = np.zeros((size, size), np.float32); p = int(size * pad)
    m[p:size - p, p:size - p] = 1
    return cv2.GaussianBlur(m, (0, 0), size * blur)
MASK128, MASK512 = box_mask(128, 0.08, 0.07), box_mask(512, 0.10, 0.06)

def paste(frame, crop, M, mask):
    H, W = frame.shape[:2]
    Minv = cv2.invertAffineTransform(M)
    back = cv2.warpAffine(crop, Minv, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    m = cv2.warpAffine(mask, Minv, (W, H))[..., None]
    return np.clip(back, 0, 255) * m + frame * (1 - m)

def swap(frame, lm):
    p5 = five(lm)
    M = affine(p5, T_ARC128, 128)
    c = cv2.warpAffine(frame, M, (128, 128), flags=cv2.INTER_AREA)
    x = (c[:, :, ::-1].astype(np.float32) / 255).transpose(2, 0, 1)[None]
    y = SWAP.run(None, {"target": x, "source": latent})[0][0].transpose(1, 2, 0)[:, :, ::-1] * 255
    f = paste(frame.astype(np.float32), y.astype(np.float32), M, MASK128)
    if ENH > 0:   # GFPGAN restores detail lost at 128px, blended partially to stay photographic
        M5 = affine(p5, T_FFHQ, 512)
        c5 = cv2.warpAffine(np.clip(f, 0, 255).astype(np.uint8), M5, (512, 512), flags=cv2.INTER_CUBIC)
        x5 = ((c5[:, :, ::-1].astype(np.float32) / 255 - 0.5) / 0.5).transpose(2, 0, 1)[None]
        e = GFP.run(None, {"input": x5})[0][0].transpose(1, 2, 0)
        e = ((np.clip(e, -1, 1) + 1) / 2 * 255)[:, :, ::-1]
        e = c5.astype(np.float32) * (1 - ENH) + e * ENH
        f = paste(f, e.astype(np.float32), M5, MASK512)
    return np.clip(f, 0, 255).astype(np.uint8)

track = json.load(open(trk))["frames"]
cap = cv2.VideoCapture(vid); frames = []
while True:
    ok, fr = cap.read()
    if not ok: break
    frames.append(fr)
if only is not None:
    for k in only:
        cv2.imwrite(f"{out}_k{k}.png", swap(frames[k], track[k]))
    sys.exit()
H, W = frames[0].shape[:2]
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "25", "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
last = None
for k, fr in enumerate(frames):
    lm = track[k] if k < len(track) and track[k] is not None else last
    last = lm
    enc.stdin.write(swap(fr, lm).tobytes())
enc.stdin.close(); enc.wait()
print("frames", len(frames))
