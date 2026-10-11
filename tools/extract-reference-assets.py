# Usage: python3 -I tools/extract-reference-assets.py reference.png assets/img
import sys
from PIL import Image, ImageFilter
import numpy as np
ref = Image.open(sys.argv[1]).convert('RGB')
out = sys.argv[2]
def crop(box, name, scale=2, q=90):
    im = ref.crop(box)
    im = im.resize((im.width*scale, im.height*scale), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    im.save(f'{out}/{name}.jpg', quality=q)
crop((1458, 699, 1618, 780), 'venue-kafd')
crop((1305, 699, 1445, 780), 'venue-roshn')
crop((1136, 699, 1293, 780), 'venue-ksu')
crop((941, 699, 1124, 780), 'venue-ricec')
crop((1166, 227, 1637, 338), 'skyline-riyadh-header')
crop((560, 105, 1295, 221), 'skyline-riyadh-top')
# logo -> transparent PNG (white + coloured strokes over dark navy)
box = (62, 22, 334, 142)
a = np.asarray(ref.crop(box)).astype(float)
bg = np.median(np.concatenate([a[:4].reshape(-1,3), a[-4:].reshape(-1,3)]), axis=0)
diff = np.clip(a - bg, 0, None)
alpha = np.clip((diff.max(axis=2) - 18) / 150.0, 0, 1)
col = np.where(alpha[...,None] > 0.02, bg + diff / np.maximum(alpha[...,None], 0.02), 255)
col = np.clip(col, 0, 255)
rgba = np.dstack([col, alpha*255]).astype(np.uint8)
lg = Image.fromarray(rgba, 'RGBA')
lg = lg.resize((lg.width*3, lg.height*3), Image.LANCZOS)
lg.save(f'{out}/logo-liqaat.png')
print('bg', bg)
