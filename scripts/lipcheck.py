"""Per-frame mouth opening (MediaPipe face landmarks) vs audio loudness.
Usage: lipcheck.py video.mp4 audio_file [--json out.json]"""
import sys, json, subprocess
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

MODEL = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/face_landmarker.task"
video, audio = sys.argv[1], sys.argv[2]
crop = None
if "--crop" in sys.argv:  # x,y,w,h in source pixels; region is upscaled to 512 wide for detection
    crop = [int(v) for v in sys.argv[sys.argv.index("--crop") + 1].split(",")]
cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS)
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL), running_mode=vision.RunningMode.VIDEO, num_faces=1))
opens, centers, i = [], [], 0
while True:
    ok, fr = cap.read()
    if not ok: break
    ox = oy = 0; sc = 1.0
    if crop:
        x0, y0, cw, ch = crop; fr = fr[y0:y0 + ch, x0:x0 + cw]; sc = 512 / cw
        fr = cv2.resize(fr, (512, round(ch * sc)), interpolation=cv2.INTER_CUBIC); ox, oy = x0, y0
    h, w = fr.shape[:2]
    res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)), int(i * 1000 / fps))
    if res.face_landmarks:
        p = np.array([[q.x * w, q.y * h] for q in res.face_landmarks[0]]) / sc + np.array([ox, oy])
        face_h = np.linalg.norm(p[10] - p[152])
        opens.append(np.linalg.norm(p[13] - p[14]) / face_h)
        centers.append([p[:, 0].mean(), p[:, 1].mean(), p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()])
    else:
        opens.append(np.nan); centers.append([np.nan] * 6)
    i += 1
lm.close()
opens = np.array(opens); n = len(opens)
# audio RMS at video fps
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
a = np.frombuffer(raw, np.float32); hop = int(16000 / fps)
rms = np.array([np.sqrt(np.mean(a[k * hop:(k + 1) * hop] ** 2)) if k * hop < len(a) else 0 for k in range(n)])
valid = ~np.isnan(opens)
o = np.where(valid, opens, np.nanmean(opens))
best = None
for lag in range(-6, 7):  # positive lag = mouth moves after audio
    if lag >= 0: x, y = rms[:n - lag], o[lag:]
    else: x, y = rms[-lag:], o[:n + lag]
    c = np.corrcoef(x, y)[0, 1]
    if best is None or c > best[1]: best = (lag, c)
c0 = np.corrcoef(rms, o)[0, 1]
# mouth should be closed during the silent pause
fr_sil = [k for k in range(n) if rms[k] < 0.01]
fr_spk = [k for k in range(n) if rms[k] > 0.05]
print(f"{video.split('/')[-1]}: frames={n} detected={valid.mean():.0%} corr@0={c0:.3f} best_lag={best[0]:+d}f corr={best[1]:.3f} "
      f"open_speaking={np.nanmean(opens[fr_spk]):.3f} open_silent={np.nanmean(opens[fr_sil]):.3f} dyn_range={np.nanpercentile(opens,95)-np.nanpercentile(opens,5):.3f}")
if "--json" in sys.argv:
    json.dump({"fps": fps, "open": [None if np.isnan(v) else float(v) for v in opens], "centers": centers, "rms": rms.tolist()},
              open(sys.argv[sys.argv.index("--json") + 1], "w"))
