// Renders src/index.html frame-by-frame in headless Chromium and encodes an H.264 MP4.
//   node scripts/render.mjs                -> output/graduate-development.mp4
//   node scripts/render.mjs --stills 1,4.5 -> frames/still-*.png (quick previews)
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? (args[args.indexOf('--stills') + 1] || '1.5,4.8,8.2,11.5,15.5') : null;
const out = join(root, 'output', 'graduate-development.mp4');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, 'src', decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const exe = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--force-color-profile=srgb', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('page error:', e); process.exit(1); });
await page.goto(url);
await page.waitForFunction(() => window.FILM && window.FILM.ready);
const { FPS, DURATION, fontOK } = await page.evaluate(() => window.FILM);
if (!fontOK) throw new Error('Arabic font (Cairo) failed to load');
const stage = await page.$('#stage');
const shot = async t => { await page.evaluate(t => window.FILM.renderFrame(t), t); return stage.screenshot({ type: 'png' }); };

if (stillsArg) {
  await mkdir(join(root, 'frames'), { recursive: true });
  for (const t of stillsArg.split(',').map(Number)) {
    await writeFile(join(root, 'frames', `still-${t.toFixed(2)}.png`), await shot(t));
    console.log('still', t);
  }
} else {
  await mkdir(dirname(out), { recursive: true });
  const total = Math.round(DURATION * FPS);
  const ff = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', c => c ? fail(new Error('ffmpeg ' + c)) : ok()));
  for (let f = 0; f < total; f++) {
    const buf = await shot(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 30 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end(); await done;
  console.log('wrote', out);
}
await browser.close(); server.close();
