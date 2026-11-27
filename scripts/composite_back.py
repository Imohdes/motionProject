"""Blend a lip-synced face close-up back into the full-body video, lower face only.
composite_back.py base.mp4 synced_crop.mp4 x,y,size track.json out_frames.mp4 [--debug dir]"""
import sys, json, subprocess
import numpy as np, cv2

base, synced, box, track, out = sys.argv[1:6]
bx, by, bs = [int(v) for v in box.split(",")]
T = json.load(open(track))["frames"]
cb, cs = cv2.VideoCapture(base), cv2.VideoCapture(synced)
W, H = int(cb.get(3)), int(cb.get(4))
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "25", "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
yy, xx = np.mgrid[0:bs, 0:bs].astype(np.float32)
last_p, i = None, 0
while True:
    ok1, B = cb.read(); ok2, L = cs.read()
    if not ok1: break
    if not ok2:  # synced clip shorter: keep base frame
        enc.stdin.write(B.tobytes()); i += 1; continue
    L = cv2.resize(L, (bs, bs), interpolation=cv2.INTER_AREA)
    p = np.array(T[i]) if T[i] is not None else last_p
    last_p = p
    p = p - np.array([bx, by])
    nose, chin = p[1], p[152]
    fw = np.linalg.norm(p[234] - p[454])
    cx = (nose[0] + chin[0]) / 2 * 0.5 + p[13][0] * 0.5
    cy = (nose[1] + chin[1]) / 2 + 6
    rx = fw * 0.40
    ry = (chin[1] - nose[1]) * 0.5 + 16
    m = ((((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1).astype(np.float32)
    m = cv2.GaussianBlur(m, (0, 0), 6)[..., None]
    Bc = B[by:by + bs, bx:bx + bs].astype(np.float32)
    Lf = L.astype(np.float32)
    # match colour of the synced crop to the base around the mouth (ring outside the lips)
    ring = (m[..., 0] > 0.2) & (m[..., 0] < 0.8)
    if ring.sum() > 50:
        Lf += (Bc[ring].mean(0) - Lf[ring].mean(0))
    blend = Lf * m + Bc * (1 - m)
    B[by:by + bs, bx:bx + bs] = np.clip(blend, 0, 255).astype(np.uint8)
    if "--debug" in sys.argv and i in (30, 70, 100):
        d = sys.argv[sys.argv.index("--debug") + 1]
        dbg = B[by:by + bs, bx:bx + bs].copy()
        cv2.ellipse(dbg, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, (0, 255, 0), 1)
        cv2.imwrite(f"{d}/dbg_{i}.png", dbg)
    enc.stdin.write(B.tobytes()); i += 1
enc.stdin.close(); enc.wait()
print("frames", i)
