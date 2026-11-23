# motionProject — لقاءات القصيم 26

فيديو موشن قصير (25 ثانية) يوضح خطوات التسجيل الإلكتروني قبل حضور لقاءات القصيم:
سجّل إلكترونياً ← ما يحتاج تقديم أوراق ← برامج الإرشاد ← المعارض المصاحبة ← الدورات ← «خطوات تبدأ بلقاء».

| الملف | المقاس |
|---|---|
| `out/qassim26_register_9x16.mp4` | 1080×1920 (ريلز / ستوري / تيك توك / سناب) |
| `out/qassim26_register_16x9.mp4` | 1920×1080 (شاشات / يوتيوب / X) |

## How it works
- `src/` — the composition (HTML/CSS/JS). Every frame is a pure function of time (`window.renderFrame(f)`).
- `scripts/render.mjs` — renders frames with headless Chromium (Playwright), encodes with ffmpeg, muxes audio.
- `scripts/audio.py` — synthesised music bed + SFX, synced to cues exported by the composition.
- `scripts/prep_assets.py` — extracts/upscales the logos, tagline and illustration from `assets/src/banner.webp`.
- `assets/fonts/` — SST Arabic (Roman + Bold), the brand font used for all text.
- Brand colours: blue `#005688`, orange `#DC7B2C`, green `#01AA6B`, white.

```bash
npm install
pip install numpy scipy
npm run render:v          # vertical
npm run render:h          # horizontal
node scripts/render.mjs v --url https://example.com/register   # shows the link on the end card
node scripts/render.mjs v --domain example.com                  # domain shown in the Safari address bar
node scripts/stills.mjs v out/stills 4 10 22                   # preview stills at given seconds
```
Preview in a browser: serve the repo root and open `/src/index.html?fmt=v&t=12`.
