# Graduate Development — Saudi Arabia (9:16 motion film)

A 16.5-second vertical (1080×1920, 30 fps) cinematic motion video about the journey of Saudi graduates.
It plays as one continuous sequence: from graduation, to learning, to skills, to experience, to the future.

**Output:** [`output/graduate-development.mp4`](output/graduate-development.mp4) (H.264, yuv420p, faststart, no audio track)

## The sequence

| Time | Scene | Arabic title | Transition out |
|---|---|---|---|
| 0.0–3.4 s | **Graduation.** Golden-hour campus arcade. The two graduates walk toward camera; he wears a bisht, she wears a green stole; diplomas, flying caps, gold confetti. Slow push-in. | من هنا تبدأ رحلتك | A foreground sandstone pillar wipes right→left. As it passes each graduate, the diploma becomes a tablet. |
| 3.4–6.9 s | **Learning.** A training space with a window wall. They slow to a stop. He studies a tablet; she touches a floating glass panel (touch ripple). Learning cards drift upward. | تعلّم | A glass-partition edge slides right→left as the camera trucks right. |
| 6.9–10.0 s | **Skills.** A teal open-plan workplace with an interactive glass table. A skills network builds node by node while an ascending growth line draws across. | طوّر مهاراتك | A dark architectural mullion passes in the foreground. |
| 10.0–13.3 s | **Experience.** A high-rise office in warm daylight, with colleagues at a meeting table and a dashboard screen. The key light on the graduates grows warmer and brighter as their confidence grows. | اكتسب الخبرة | Window light blooms to warm white. |
| 13.3–16.5 s | **Future.** A rooftop terrace at dusk over the Riyadh skyline (Kingdom Centre, Al Faisaliah), with moving light trails. Hero stance, wind in the ghutra and abaya, slow pull-back. | وانطلق لمستقبلك | Fade out. |

The same two characters stay on screen the whole time, with identical silhouettes, proportions and wardrobe. Every change of environment happens behind a foreground wipe, a glass edge or a light bloom. The characters' pose and lighting switch exactly where that wipe crosses them, so there are no hard cuts.

## Arabic typography

- The titles are real DOM text in **Cairo Black** (SIL OFL, bundled in `src/fonts`), shaped by Chromium's text engine. Letters are properly joined, diacritics (shadda in تعلّم / طوّر) are correct, and the text is `dir="rtl"`.
- `letter-spacing` is zero, so the joins never break.
- Each reveal is a soft-edged mask that travels **right → left** while the text slides leftward. The exit continues in the same direction, and a gold accent bar grows from the right.

## Typography film (10 s, no people)

**Output:** [`output/graduate-development-typography.mp4`](output/graduate-development-typography.mp4). It's 1080×1920, 30 fps and exactly 10.00 s, and the source is in `src/typo/typo.js`.

This film is Arabic typography only, set in a dark deep-blue space using the HRDF-inspired palette: #005688 blue, #00AA5E green and very subtle #DC7B2C orange accents. The phrases are extruded type with a bevel highlight, glow and reflections on a glass floor. The space around them has floating glass panes, volumetric beams, depth-of-field particles and light streaks.

A single blue-green light line runs **right → left** through the whole film. As it passes each phrase it reveals it with a thin vertical light blade, and each phrase rises out of depth as it appears. The line then carries on to the next phrase, and the camera follows it, so the film has no cuts.

| Time | Phrase |
|---|---|
| 0–2 s | The light travels through darkness and reveals **رحلتك تبدأ هنا** |
| 2–4 s | The first phrase dissolves right → left and **تعلّم** appears; the line continues |
| 4–6 s | The camera tracks the line to **طوّر مهاراتك**, past glass panes and green particles |
| 6–8 s | The same motion continues to **اكتسب الخبرة**; the environment brightens |
| 8–10 s | Light paths converge to the centre, a flash reveals the hero line **وانطلق لمستقبلك**, a light sweep crosses it, the camera slowly pushes in, and the phrase stays on screen at the end |

Every phrase is drawn with canvas `fillText` and `direction = 'rtl'`, so Chromium's text engine shapes it: the letters are joined, the shadda is correct and the words are never reversed.

```bash
node scripts/render.mjs --page typo/index.html --out output/graduate-development-typography.mp4
```

## Brand background loop (4K, 16:9)

**Output:** [`output/brand-background-loop-4k.mp4`](output/brand-background-loop-4k.mp4). It's 3840×2160, 30 fps and a 20 s **seamless loop**, and the source is in `src/bg/bg.js`.

This is an abstract, supporting background with no text, logos, icons, people or objects.

- **Deep blue #005688 dominates.** It's a rich radial field that is slightly lifted in the centre and falls off to near-black blue at the edges, and it breathes once per loop.
- **Warm orange #DC7B2C is the secondary glow.** A soft warm field blends into the bottom-right, with a faint echo in the top-left. A few thin orange light lines add to it.
- **Green #03A76A is only a hint.** One thin line and a small glow in the lower-left surface briefly once per loop.
- **Thin light lines enter from the sides.** They curve gently along the top and bottom bands and around the edges, and slow light pulses travel along them. Each line sways slightly, with a parallax depth.
- **Depth:** two very wide translucent glass bands with faint specular edges, and a handful of soft out-of-focus motes.
- **The centre is left clear** as negative space for typography, people or products.

**Seamless loop:** every motion is a whole number of cycles per 20 s loop. The frame at 20 s is pixel-identical to frame 0, so the clip loops endlessly with no seam.

```bash
node scripts/render.mjs --page bg/index.html --out output/brand-background-loop-4k.mp4 --crf 16
```

## Animated abstract background (from a still, 1080p)

**Output:** [`output/abstract-background-loop-1080p.mp4`](output/abstract-background-loop-1080p.mp4). It's 1920×1080, 30 fps and exactly 20.00 s, and it loops seamlessly. The source image is `assets/abstract-source.webp` and the script is `scripts/animate_still.py`.

The supplied image is the only picture used. Its composition, shapes and colours are preserved, and nothing is added. The animation consists of:

- **Wave-like flow:** a smooth displacement field of a few pixels, with waves travelling left → right through the orange and blue surfaces.
- **Parallax:** the orange foreground moves most, while the blue layers and the green accent move less and slightly out of phase. Soft, heavily blurred colour masks drive this, so nothing tears or deforms.
- **Soft light along the lines:** two slow pulses travel along the existing thin glowing lines. They come from a mask of the image's own lines and only add brightness.
- **Breathing glow** of about 1.5 %, and a **push-in** of at most 0.9 %.

Every term completes whole cycles per loop, so frame 600 equals frame 0. The encode uses a static dither and equal I/P quantisers, so the loop point is no more visible than any keyframe inside the clip.

```bash
pip install opencv-python-headless numpy
python3 scripts/animate_still.py                    # -> output/abstract-background-loop-1080p.mp4
python3 scripts/animate_still.py --stills           # preview PNGs in frames/
```

## Flowing ribbons (evolving version, 1080p)

**Output:** [`output/flowing-ribbons-1080p.mp4`](output/flowing-ribbons-1080p.mp4). It's 1920×1080, 30 fps and exactly 20.00 s, and the script is `scripts/ribbons_warp.py`.

The **colours are exactly the reference's.** The reference image (`assets/abstract-source-2.webp`) is the only colour source, and frame 0 *is* the reference. The clear, medium-intensity motion comes from a smooth warp that follows evolving ribbon curves:

- **Anchors** sampled along the ribbon curves move with the motion design (the same curves as `src/ribbons/ribbons.js`). A Gaussian-weighted field interpolates their displacement, which is then integrated as a velocity field by scaling and squaring. This makes the warp a diffeomorphism, so ribbons bend, slide and reshape without ever folding.
- **What visibly changes:** the orange field sweeps, the blue dome slides and changes curvature, the green wedge opens, narrows and travels, and the crossing point of the lines moves across the frame.
- **Camera:** each ribbon has its own parallax depth, and the background follows a slow push-in (+7.5 %) with lateral drift.
- **Light pulses** travel left → right along the image's own glowing lines, adding brightness only.
- **Frame edges** use a monotonic soft clamp instead of mirroring, so lines never kink.

`src/ribbons/ribbons.js` is the earlier fully procedural version. It's kept for reference, but its colours are approximate.

```bash
pip install opencv-python-headless numpy
python3 scripts/ribbons_warp.py             # -> output/flowing-ribbons-1080p.mp4
python3 scripts/ribbons_warp.py --stills    # preview PNGs at 0/5/10/15/20 s in frames/
```

## Poster push-in (camera-only, 8 s)

**Output:** [`output/poster-pushin-8s.mp4`](output/poster-pushin-8s.mp4). It's 1080×1920, 30 fps and exactly 8.00 s. The source is `assets/poster-source.jpg` and the script is `scripts/poster_pushin.py`.

The still is treated as one flat layer, like a printed poster filmed by a camera. Each frame is a single affine resample (uniform scale + translation, no rotation) of the original pixels. Nothing in the image is animated, warped or regenerated.

- **Push-in:** 1.000 → 1.018 (1.8 %) with a smooth sine ease-in-out.
- **Float:** a drift of at most 0.36 % that always stays inside the push-in margin. The frame's footprint never leaves the source image, so no edge is ever revealed.
- **Fit:** the 1119×2000 source is scaled to cover 1080×1920, which trims about 5 px at the top and bottom.

```bash
python3 scripts/poster_pushin.py [source.jpg] [out.mp4]
```

## Living portrait (6 s, 1080×1920)

**Output:** [`output/portrait-alive-6s.mp4`](output/portrait-alive-6s.mp4). The script is `scripts/portrait_alive.py`, and the source image is `assets/portrait-source.jpg`, the same image as the poster push-in.

It is built only from the source pixels:

- **Light trails:** light travels along the existing trails, as a brightness-only effect, so their shapes, colours and positions are unchanged.
- **Protected figure:** her face, hijab, hands, badge and outline are excluded from the effect by a protection mask built from her silhouette.
- **Breathing:** a very subtle breath, a smooth rise of at most 2 px in the chest and arms. The head and face have exactly zero displacement.
- **Push-in:** about 0.75 %, eased.

**Second portrait:** [`output/portrait2-alive-6s.mp4`](output/portrait2-alive-6s.mp4) gets the same treatment. He wears a white thobe and a red shemagh, so his protected area comes from a traced outline (`assets/portrait2-outline.txt`) rather than the dark-clothing mask:

```bash
python3 scripts/portrait_alive.py --src assets/portrait2-source.jpg --out output/portrait2-alive-6s.mp4 \
  --mask light --breath 640,1330 --poly "$(cat assets/portrait2-outline.txt)"
```

**Not included:** real arm motion (uncrossing and re-crossing the arms). That requires a generative image-to-video model and cannot be faked by warping the still.

## Portrait with body motion (6 s, 1080×1920)

**Output:** [`output/portrait3-motion-6s.mp4`](output/portrait3-motion-6s.mp4). The script is `scripts/portrait_motion.py`, the source is `assets/portrait3-source.webp`, and the camera is locked with no zoom.

This is a localized puppet warp of the source pixels. Each body part gets its own small rigid motion about an anatomical pivot, blended with feathered masks, so nothing is regenerated and nothing tears:

- **Torso:** a weight shift and sway, rotating up to 0.85° about the hips.
- **Head:** a tilt of up to 2.4° plus a sideways shift of up to 8 px about the neck. The shemagh drape follows with a 0.3 s lag.
- **Top forearm:** lifts up to 1.9° about its elbow at 2–4 s, then settles.
- **Badge:** a small pendulum swing of up to 2.8° about its clip, settling by 5.4 s.
- **Breathing** in the chest and shoulders.
- **Light** travels along the background trails, with the figure protected.

**Not faked:** a true 3-D head turn and blinking. Both need a generative model.

## Rendering

```bash
npm install
npm run render                                  # -> output/graduate-development.mp4
node scripts/render.mjs --stills 1.5,4.9,8.4    # preview PNGs in frames/
```

`src/film.js` is fully deterministic: `FILM.renderFrame(t)` draws any moment. The renderer serves `src/` locally, steps through every frame in headless Chromium and pipes PNGs into ffmpeg (`ffmpeg-static`). To preview interactively, serve `src/` with any static server and call `FILM.renderFrame(t)` from the console.

## Photorealistic version (AI video generation)

This film is rendered with code, so the characters are stylized, cinematically lit figures rather than photoreal people. For a photorealistic cut, generate the five shots below with an image-to-video model (Veo, Sora, Kling or Runway Gen-4). Then overlay the Arabic titles from this project, because video models misspell and disconnect Arabic text.

**How to keep the characters consistent:** first generate one reference still of both characters together. Use that still as the image or character reference for every shot, and chain the shots by using the last frame of each as the first frame of the next.

**Character sheet (prepend to every prompt):**
> Two recent Saudi university graduates in their early 20s, photorealistic. MAN: short neat black beard, white thobe, white ghutra with black agal, confident calm expression. WOMAN: modest black abaya, black hijab framing her face, natural makeup, confident warm expression. Same faces, same outfits in every shot. Premium Saudi corporate commercial, anamorphic 35mm look, soft dramatic lighting, realistic skin, shallow depth of field, vertical 9:16.

1. **Graduation (4 s):** *Golden-hour university arcade with Islamic pointed arches. Both graduates walk confidently toward camera; he wears a black bisht with gold trim over his thobe and holds a diploma; she wears a green graduation stole and holds a diploma. Graduation caps toss in the far background, gold confetti in the backlight. Slow dolly push-in, subtle slow motion. No text.*
2. **Learning (3.5 s):** *Continuous with the previous shot: the arcade dissolves into a modern bright training room with a floor-to-ceiling window wall. They slow to a stop; he studies a glowing tablet, she touches a softly glowing floating glass panel. Subtle translucent learning cards drift upward. Slow push-in. No text.*
3. **Skills (3.5 s):** *Camera trucks right past a glass partition into a modern teal-lit open-plan office. The graduates collaborate at an interactive glass table, and he points to a softly glowing network of connected nodes above. Colleagues in soft focus behind. No text.*
4. **Experience (3.5 s):** *A foreground column passes and reveals a high-rise Riyadh office in warm daylight. He explains with an open-hand gesture; she holds a tablet and nods; colleagues at a meeting table in soft focus; dashboard screen. Their posture grows more confident; the warm key light slowly brightens. No text.*
5. **Future (3.5 s):** *The window light blooms, then reveals a rooftop terrace at dusk overlooking the Riyadh skyline with Kingdom Centre and Al Faisaliah, with city light trails. Hero shot: both stand tall and confident, a light wind moves the ghutra and abaya. Camera slowly pulls back. No text.*

**Negative prompt:** *text, letters, captions, logos, watermark, cartoon, CGI, plastic skin, extra fingers, distorted faces, face change, outfit change, aggressive zoom, fast cuts, HUD overload.*
