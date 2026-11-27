"""Minimal LivePortrait (ONNX, facefusion export) helpers: alignment, motion extraction, keypoint maths, generation."""
import numpy as np, cv2, onnxruntime as ort

MD = "/tmp/claude-0/-home-user-motionProject/ff284f81-2330-5d38-88f8-cb870b539525/models/lp/"
_opt = ort.SessionOptions(); _opt.intra_op_num_threads = 4
def _s(n): return ort.InferenceSession(MD + n + ".onnx", _opt, providers=["CPUExecutionProvider"])
FEAT, MOTION, STITCH, GEN = _s("live_portrait_feature_extractor"), _s("live_portrait_motion_extractor"), _s("live_portrait_stitcher"), _s("live_portrait_generator")

# facefusion 'ffhq_512' 5-point template (image-left eye, image-right eye, nose, mouth-left, mouth-right)
FFHQ = np.array([[0.37691676, 0.46864664], [0.62285697, 0.46912813], [0.50123859, 0.61331904],
                 [0.39308822, 0.72541100], [0.61150205, 0.72490465]], np.float32)

def five_points(lm):
    """lm: (478,2) MediaPipe face-mesh points in image coords -> 5 points in template order."""
    lm = np.asarray(lm, np.float32)
    eye_l = lm[[33, 133, 159, 145]].mean(0)     # image-left eye (person's right)
    eye_r = lm[[362, 263, 386, 374]].mean(0)
    return np.stack([eye_l, eye_r, lm[1], lm[61], lm[291]]).astype(np.float32)

def align(pts5, size=512, zoom=1.0):
    """Similarity transform image -> crop of `size`, optional zoom-out (zoom<1 shows more context)."""
    dst = (FFHQ - 0.5) * zoom + 0.5
    M, _ = cv2.estimateAffinePartial2D(pts5, dst * size, method=cv2.LMEDS)
    return M

def to_input(crop_bgr):
    x = cv2.resize(crop_bgr, (256, 256), interpolation=cv2.INTER_AREA)
    return (x[:, :, ::-1].astype(np.float32) / 255.0).transpose(2, 0, 1)[None]

def features(crop_bgr):
    return FEAT.run(None, {"input": to_input(crop_bgr)})[0]

def motion(crop_bgr):
    p, y, r, s, t, e, k = MOTION.run(None, {"input": to_input(crop_bgr)})
    return {"pitch": float(p), "yaw": float(y), "roll": float(r), "scale": s.astype(np.float32),
            "t": t.astype(np.float32), "exp": e.astype(np.float32), "kp": k.astype(np.float32)}

def rot(p, y, r):
    """Row-vector rotation used as  kp @ R  (official LivePortrait convention: R = (Rz Ry Rx)^T)."""
    x, y, z = np.radians([p, y, r])
    rx = np.array([[1, 0, 0], [0, np.cos(x), -np.sin(x)], [0, np.sin(x), np.cos(x)]])
    ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    rz = np.array([[np.cos(z), -np.sin(z), 0], [np.sin(z), np.cos(z), 0], [0, 0, 1]])
    return (rz @ ry @ rx).T.astype(np.float32)

def keypoints(kp_c, R, exp, scale, t):
    t = t.copy(); t[..., 2] = 0
    return scale[..., None] * (kp_c @ R + exp) + t[:, None, :]

def stitch(x_s, x_d):
    return STITCH.run(None, {"source": x_s.astype(np.float32), "target": x_d.astype(np.float32)})[0]

def generate(feat, x_s, x_d):
    """feat/x_s: the image the features came from; x_d: desired keypoints.
    NB: this export's generator takes the DESIRED keypoints as 'source' and the feature image's as 'target'
    (verified empirically: the other order inverts the expression)."""
    out = GEN.run(None, {"feature_volume": feat, "source": x_d.astype(np.float32), "target": x_s.astype(np.float32)})[0]
    img = np.clip(out[0].transpose(1, 2, 0), 0, 1)[:, :, ::-1] * 255
    return img.astype(np.float32)
