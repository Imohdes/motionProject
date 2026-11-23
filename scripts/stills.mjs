// Render preview stills: node scripts/stills.mjs <fmt v|h> <outdir> t1 t2 ...
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
const [fmt = 'v', out = 'out/stills', ...ts] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { srv, url } = await serve();
const browser = await chromium.launch();
const W = fmt === 'v' ? 1080 : 1920, H = fmt === 'v' ? 1920 : 1080;
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/src/index.html?fmt=${fmt}`);
await page.evaluate(() => window.compReady);
for (const t of ts) {
  await page.evaluate(t => window.renderTime(t), +t);
  await page.screenshot({ path: `${out}/${fmt}_${String(t).padStart(5, '0')}.png` });
}
await browser.close(); srv.close();
console.log('done', ts.length);
