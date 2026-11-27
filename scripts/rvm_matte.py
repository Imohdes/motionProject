"""RobustVideoMatting (ONNX) -> per-frame alpha + foreground. rvm_matte.py model.onnx in.mp4 out_dir [downsample]"""
import sys, os, time
import numpy as np, cv2, onnxruntime as ort
model, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
ds = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
os.makedirs(out, exist_ok=True)
sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
cap = cv2.VideoCapture(src); frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
dsr = np.array([ds], np.float32)
def run(f, rec):
    x = cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    fgr, pha, *rec = sess.run(None, {"src": x, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": dsr})
    return fgr, pha, rec
t = time.time()
for f in frames[:12]:            # warm up the recurrent state
    _, _, rec = run(f, rec)
for i, f in enumerate(frames):
    fgr, pha, rec = run(f, rec)
    a = (pha[0, 0] * 255).round().astype(np.uint8)
    fg = (fgr[0].transpose(1, 2, 0) * 255).round().clip(0, 255).astype(np.uint8)
    cv2.imwrite(f"{out}/a_{i:04d}.png", a)
    cv2.imwrite(f"{out}/f_{i:04d}.png", cv2.cvtColor(fg, cv2.COLOR_RGB2BGR))
    if i == 0: print("first frame", round(time.time() - t, 1), "s", flush=True)
print("frames", len(frames), "total", round(time.time() - t, 1), "s")
