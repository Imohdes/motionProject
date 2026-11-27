"""MediaPipe face landmarks on a still image (via an upscaled crop). face_lm_image.py img x,y,w,h out.npy"""
import sys, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
MODEL = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/face_landmarker.task"
img = cv2.imread(sys.argv[1]); x0, y0, cw, ch = [int(v) for v in sys.argv[2].split(",")]
c = img[y0:y0 + ch, x0:x0 + cw]; sc = 640 / cw
c = cv2.resize(c, (640, round(ch * sc)), interpolation=cv2.INTER_CUBIC)
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=MODEL), num_faces=1))
r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(c, cv2.COLOR_BGR2RGB)))
p = np.array([[q.x * c.shape[1], q.y * c.shape[0]] for q in r.face_landmarks[0]]) / sc + np.array([x0, y0])
np.save(sys.argv[3], p); lm.close()
print("face bbox", p[:, 0].min().round(), p[:, 1].min().round(), p[:, 0].max().round(), p[:, 1].max().round())
