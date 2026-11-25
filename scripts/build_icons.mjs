// Bundles the Lucide icons used by the composition into src/icons.js
import { readFileSync, writeFileSync } from 'node:fs';
const names = ['wifi', 'battery-full', 'signal', 'chevron-right', 'share', 'book-open', 'copy', 'rotate-cw', 'globe', 'mic',
  'delete', 'chevron-up', 'chevron-down', 'clock', 'map', 'calendar', 'circle-check', 'bell', 'arrow-left', 'lock', 'menu',
  'chevron-left', 'briefcase', 'trending-up', 'users', 'compass', 'store', 'map-pin', 'graduation-cap', 'calendar-check',
  'check', 'link', 'file-text', 'id-card', 'award', 'user', 'message-circle', 'presentation', 'clipboard-list', 'smartphone',
  'files', 'file-x-2', 'sparkles', 'navigation', 'user-check', 'tent', 'link-2', 'search', 'x', 'upload', 'bell-ring', 'paperclip'];
const out = {};
for (const n of names) {
  out[n] = readFileSync(new URL(`../node_modules/lucide-static/icons/${n}.svg`, import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/\s*class="[^"]*"/, '').replace(/width="24"/, 'width="100%"').replace(/height="24"/, 'height="100%"').trim();
}
writeFileSync(new URL('../src/icons.js', import.meta.url), `window.ICONS=${JSON.stringify(out)};\n`);
console.log('icons:', Object.keys(out).length);
