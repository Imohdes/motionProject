"""Split the supplied end-card key visual into animatable layers.

The key visual (assets/src/end_v.webp) sits on the same background as assets/img/bg_v.webp,
so each layer is pulled out with a difference matte against that clean plate:
    alpha = clamp((|art - bg| - noise) / k),   colour = (art - (1 - alpha) * bg) / alpha
Composited back over the same background the layer reproduces the original exactly, and it can
then be moved / scaled / faded independently.

Writes assets/img/end_tagline.png, assets/img/end_hero.png and assets/img/end_layers.json
(crop boxes in source pixels, used to place the layers).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
art = np.asarray(Image.open(ROOT / 'assets/src/end_v.webp').convert('RGB')).astype(np.float32)
bg = np.asarray(Image.open(ROOT / 'assets/img/bg_v.webp').convert('RGB').resize((art.shape[1], art.shape[0]), Image.LANCZOS)).astype(np.float32)

diff = np.abs(art - bg).max(-1)
NOISE, K = 5.0, 70.0
alpha = np.clip((diff - NOISE) / K, 0, 1)
a3 = np.maximum(alpha[..., None], 1e-4)
fg = np.clip((art - (1 - alpha[..., None]) * bg) / a3, 0, 255)

layers = {}
for name, (y0, y1) in {'end_tagline': (330, 770), 'end_hero': (770, 1760)}.items():
    a = alpha[y0:y1]
    cols = np.where(a.max(0) > 0.02)[0]
    rows = np.where(a.max(1) > 0.02)[0]
    x0, x1 = int(cols.min()), int(cols.max()) + 1
    yy0, yy1 = y0 + int(rows.min()), y0 + int(rows.max()) + 1
    rgba = np.dstack([fg[yy0:yy1, x0:x1], alpha[yy0:yy1, x0:x1] * 255]).round().astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(ROOT / f'assets/img/{name}.png', optimize=True)
    layers[name] = {'x0': x0, 'y0': yy0, 'w': x1 - x0, 'h': yy1 - yy0}
    print(name, layers[name])

layers['src'] = {'w': art.shape[1], 'h': art.shape[0]}
(ROOT / 'assets/img/end_layers.json').write_text(json.dumps(layers, indent=2))
