"""Crop the 9:16 content out of a pillarboxed video and upscale it to 1080x1920:
Real-ESRGAN x4 on the person region, Lanczos for the smooth backdrop, feathered join.
sr_video.py <in.mp4> <out_dir> <crop x,y,w,h> <person rect x0,y0,x1,y1 in crop coords>"""
import sys, os, time
import numpy as np, cv2, onnxruntime as ort
src, out = sys.argv[1], sys.argv[2]
cx, cy, cw, ch = [int(v) for v in sys.argv[3].split(",")]
px0, py0, px1, py1 = [int(v) for v in sys.argv[4].split(",")]
os.makedirs(out, exist_ok=True)
MD = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/sr/"
opt = ort.SessionOptions(); opt.intra_op_num_threads = 4
SR = ort.InferenceSession(MD + "real_esrgan_x4.onnx", opt, providers=["CPUExecutionProvider"])
W, H = 1080, 1920
sx, sy = W / cw, H / ch
# feathered mask for the person rect in output space
m = np.zeros((H, W), np.float32)
ox0, oy0, ox1, oy1 = int(px0 * sx), int(py0 * sy), int(px1 * sx), int(py1 * sy)
m[oy0 + 24:oy1 - (24 if py1 < ch else 0), ox0 + 24:ox1 - 24] = 1
m = cv2.GaussianBlur(m, (0, 0), 14)[..., None]
cap = cv2.VideoCapture(src); i = 0; t0 = time.time()
while True:
    ok, f = cap.read()
    if not ok: break
    c = f[cy:cy + ch, cx:cx + cw]
    base = cv2.resize(c, (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    p = c[py0:py1, px0:px1]
    x = (p[:, :, ::-1].astype(np.float32) / 255).transpose(2, 0, 1)[None]
    y = SR.run(None, {"input": x})[0][0]
    y = (np.clip(y.transpose(1, 2, 0), 0, 1)[:, :, ::-1] * 255)
    y = cv2.resize(y, (ox1 - ox0, oy1 - oy0), interpolation=cv2.INTER_AREA)
    up = base.copy(); up[oy0:oy1, ox0:ox1] = y
    o = np.clip(up * m + base * (1 - m), 0, 255).astype(np.uint8)
    cv2.imwrite(f"{out}/f_{i:04d}.png", o)
    if i % 10 == 0: print("frame", i, round(time.time() - t0, 1), "s", flush=True)
    i += 1
print("done", i, "frames", round(time.time() - t0, 1), "s")
