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
