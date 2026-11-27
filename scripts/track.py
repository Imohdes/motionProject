"""Per-frame face landmarks (full-frame coords) for a video. track.py video.mp4 x,y,w,h out.json"""
import sys, json
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
MODEL = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/face_landmarker.task"
video, crop, out = sys.argv[1], [int(v) for v in sys.argv[2].split(",")], sys.argv[3]
x0, y0, cw, ch = crop
cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS)
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL), running_mode=vision.RunningMode.VIDEO, num_faces=1))
frames, i = [], 0
while True:
    ok, fr = cap.read()
    if not ok: break
    c = fr[y0:y0 + ch, x0:x0 + cw]; sc = 512 / cw
    c = cv2.resize(c, (512, round(ch * sc)), interpolation=cv2.INTER_CUBIC)
    r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(c, cv2.COLOR_BGR2RGB)), int(i * 1000 / fps))
    if r.face_landmarks:
        p = np.array([[q.x * c.shape[1], q.y * c.shape[0]] for q in r.face_landmarks[0]]) / sc + np.array([x0, y0])
        frames.append(p.round(2).tolist())
    else:
        frames.append(None)
    i += 1
lm.close()
json.dump({"fps": fps, "frames": frames}, open(out, "w"))
pts = np.array([f for f in frames if f is not None])
print("frames", len(frames), "detected", len(pts), "face bbox union", pts[..., 0].min().round(), pts[..., 1].min().round(), pts[..., 0].max().round(), pts[..., 1].max().round())
print("mouth center range", pts[:, 13, 0].min().round(), pts[:, 13, 0].max().round(), pts[:, 13, 1].min().round(), pts[:, 14, 1].max().round())
