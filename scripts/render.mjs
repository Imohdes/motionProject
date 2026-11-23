// Render the composition to MP4.
//   node scripts/render.mjs [v|h] [--workers 3] [--url https://...]
// Each worker renders a contiguous chunk of frames into its own H.264 segment; the segments are
// then concatenated losslessly and muxed with the synthesised soundtrack (scripts/audio.py).
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const fmt = args.find(a => a === 'v' || a === 'h') || 'v';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const WORKERS = +opt('workers', 3);
const URLP = opt('url', '');
const DOMAIN = opt('domain', '');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}out`;
const TMP = `${OUT}/tmp_${fmt}`;
mkdirSync(TMP, { recursive: true });

const { srv, url } = await serve();
const pageUrl = `${url}/src/index.html?fmt=${fmt}${URLP ? '&url=' + encodeURIComponent(URLP) : ''}${DOMAIN ? '&domain=' + encodeURIComponent(DOMAIN) : ''}`;
const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });

async function openPage() {
  const W = fmt === 'v' ? 1080 : 1920, H = fmt === 'v' ? 1920 : 1080;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(pageUrl);
  await page.evaluate(() => window.compReady);
  return page;
}

const probe = await openPage();
const COMP = await probe.evaluate(() => ({ ...window.COMP }));
await probe.close();
console.log(`rendering ${fmt} ${COMP.W}x${COMP.H} ${COMP.frames} frames @${COMP.FPS}fps with ${WORKERS} workers`);
writeFileSync(`${TMP}/cues.json`, JSON.stringify({ cues: COMP.CUES, marks: COMP.MARKS }));

const t0 = Date.now();
const per = Math.ceil(COMP.frames / WORKERS);
let doneFrames = 0;
async function worker(k) {
  const a = k * per, b = Math.min(COMP.frames, a + per);
  if (a >= b) return null;
  const page = await openPage();
  const seg = `${TMP}/seg_${k}.mp4`;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(COMP.FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-threads', '1', seg],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const finished = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  for (let f = a; f < b; f++) {
    await page.evaluate(f => window.renderFrame(f), f);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (++doneFrames % 60 === 0) console.log(`  ${doneFrames}/${COMP.frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await finished;
  await page.close();
  return seg;
}
const segs = (await Promise.all([...Array(WORKERS).keys()].map(worker))).filter(Boolean);
await browser.close(); srv.close();

writeFileSync(`${TMP}/list.txt`, segs.map(s => `file '${s}'`).join('\n'));
execFileSync('python3', [`${ROOT}scripts/audio.py`, `${TMP}/cues.json`, `${TMP}/audio.wav`, String(COMP.DUR)], { stdio: 'inherit' });
const name = fmt === 'v' ? 'qassim26_register_9x16.mp4' : 'qassim26_register_16x9.mp4';
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${TMP}/list.txt`, '-i', `${TMP}/audio.wav`,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${OUT}/${name}`], { stdio: 'inherit' });
rmSync(TMP, { recursive: true, force: true });
console.log(`wrote out/${name} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
