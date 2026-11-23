// Bundles the Lucide icons used by the composition into src/icons.js
import { readFileSync, writeFileSync } from 'node:fs';
const names = ['link','link-2','file-x-2','files','compass','store','map-pin','graduation-cap','calendar-check',
  'check','lock','menu','chevron-left','briefcase','trending-up','user','users','sparkles','smartphone',
  'tent','book-open','presentation','file-check-2','clipboard-list','navigation','award','user-check','message-circle','arrow-left'];
const out = {};
for (const n of names) {
  out[n] = readFileSync(new URL(`../node_modules/lucide-static/icons/${n}.svg`, import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/\s*class="[^"]*"/, '').replace(/width="24"/, 'width="100%"').replace(/height="24"/, 'height="100%"').trim();
}
writeFileSync(new URL('../src/icons.js', import.meta.url), `window.ICONS=${JSON.stringify(out)};\n`);
console.log('icons:', Object.keys(out).length);
