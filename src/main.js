/* لقاءات القصيم 26 — "جهّز نفسك قبل لا تجي"
 * Deterministic motion-graphics composition. Every frame is a pure function of time:
 * window.renderFrame(frameIndex) sets all styles, so the renderer can screenshot it.
 * URL params: fmt=v (1080x1920, default) | fmt=h (1920x1080); t=<seconds> to preview a still.
 */
(() => {
'use strict';
const Q = new URLSearchParams(location.search);
const FMT = Q.get('fmt') === 'h' ? 'h' : 'v';
const V = FMT === 'v';
const FPS = 30, DUR = 25;
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const CONFIG = { url: Q.get('url') || '' };
const IMG = '../assets/img/';

// ------------------------------------------------------------------ timeline (120 BPM grid)
const S = [3, 6, 9, 12, 15];          // step starts
const STEP = 3;
const DONE = [5.5, 8.0, 11.0, 14.0, 17.0];
const SUM = 18, END = 20;

// ------------------------------------------------------------------ layout per format
const L = V ? {
  stage: { x: 540, y: 1084, s: 0.95 }, floorY: 1536, floorW: 1500, floorH: 560,
  head: { x: 540, y: 392, w: 1000, fs: 90 },
  tracker: { mode: 'row', y: 1712, gap: 200, d: 108 },
} : {
  stage: { x: 960, y: 556, s: 0.78 }, floorY: 924, floorW: 2100, floorH: 420,
  head: { x: 1520, y: 470, w: 680, fs: 74 },
  tracker: { mode: 'col', x: 470, y0: 232, gap: 138, d: 92 },
};

// ------------------------------------------------------------------ utils
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  o2: x => 1 - (1 - x) * (1 - x),
  o3: x => 1 - Math.pow(1 - x, 3),
  o5: x => 1 - Math.pow(1 - x, 5),
  i3: x => x * x * x,
  io3: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: x => { const c1 = 1.7, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  bounce: x => { const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; },
};
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ic = (n, cls = 'ic') => `<span class="${cls}">${ICONS[n]}</span>`;
const mk = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const add = (parent, html) => { const e = mk(html); parent.appendChild(e); return e; };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** centred transform */
function T(e, o = {}) {
  const { x = 0, y = 0, s = 1, sx, sy, r = 0, o: op = 1, b = 0, ry = 0, rx = 0 } = o;
  const persp = ry || rx ? ` perspective(1600px) rotateY(${ry}deg) rotateX(${rx}deg)` : '';
  e.style.transform = `translate(-50%,-50%) translate(${x.toFixed(2)}px,${y.toFixed(2)}px)${persp} rotate(${r}deg) scale(${sx ?? s},${sy ?? s})`;
  e.style.opacity = op;
  e.style.filter = b > 0.15 ? `blur(${b.toFixed(2)}px)` : '';
  e.style.display = op <= 0.003 ? 'none' : '';
}
/** plain (top-left anchored) transform */
function T0(e, o = {}) {
  const { x = 0, y = 0, s = 1, o: op = 1, b = 0 } = o;
  e.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s})`;
  e.style.opacity = op;
  e.style.filter = b > 0.15 ? `blur(${b.toFixed(2)}px)` : '';
  e.style.display = op <= 0.003 ? 'none' : '';
}
const place = (e, x, y) => { e.style.left = x + 'px'; e.style.top = y + 'px'; };

/** pop-in / fade-out envelope → {o, s, k(in-progress eased), u(out progress)} */
function env(t, a, b, din = 0.45, dout = 0.3) {
  const i = P(t, a, a + din), u = P(t, b - dout, b);
  return { o: clamp(E.o2(Math.min(1, i * 1.6))) * (1 - E.io3(u)), s: lerp(0.4, 1, E.back(i)) * lerp(1, 0.85, u), k: E.o3(i), u, i };
}
const float = (t, ph, amp = 8, sp = 1.1) => Math.sin(t * sp + ph) * amp;

// ------------------------------------------------------------------ sound cue list (read by the renderer)
const CUES = [];
const cue = (t, type, v = 1) => CUES.push({ t: +t.toFixed(3), type, v });

// ================================================================== BUILD
document.body.classList.add('fmt-' + FMT);
const root = $('#root');
root.style.width = W + 'px'; root.style.height = H + 'px';

// ---------- background
const bg = add(root, `<div style="position:absolute;inset:0"></div>`);
add(bg, `<div id="wall"></div>`);
const brandglow = add(bg, `<div id="brandglow" class="a"></div>`);
const gw = V ? 1100 : 1300; brandglow.style.width = gw + 'px'; brandglow.style.height = gw * 0.8 + 'px';
place(brandglow, L.stage.x, L.stage.y - (V ? 60 : 20));
const beam = add(bg, `<div id="beam"></div>`);
Object.assign(beam.style, { left: (W / 2 - L.floorW * 0.42) + 'px', width: L.floorW * 0.84 + 'px', top: '-40px', height: (L.floorY + 40) + 'px' });
const floor = add(bg, `<div id="floor" class="a"></div>`);
floor.style.width = L.floorW + 'px'; floor.style.height = L.floorH + 'px'; place(floor, W / 2, L.floorY);
const grain = add(bg, `<canvas id="floorgrain" class="a"></canvas>`);
{
  const gwid = Math.round(L.floorW / 2), ghei = Math.round(L.floorH / 2);
  grain.width = gwid; grain.height = ghei; grain.style.width = L.floorW + 'px'; grain.style.height = L.floorH + 'px';
  const g = grain.getContext('2d'), id = g.createImageData(gwid, ghei), r = rng(7);
  for (let i = 0; i < id.data.length; i += 4) { const v = 90 + r() * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0); place(grain, W / 2, L.floorY);
}
// dust in the light beam
const dust = [];
{ const r = rng(11);
  for (let i = 0; i < 46; i++) {
    const d = add(bg, `<div class="dust a"></div>`); const sz = 2 + r() * 4;
    d.style.width = d.style.height = sz + 'px';
    dust.push({ e: d, x: W / 2 + (r() - 0.5) * L.floorW * 0.55, y: r() * L.floorY, sp: 6 + r() * 16, ph: r() * 6.28, o: 0.15 + r() * 0.45, sw: 10 + r() * 20 });
  }
}
// neon brand shapes (from the campaign key visual)
const SHAPE_SVG = {
  cross: c => `<svg viewBox="0 0 100 100"><path d="M34 4H66V34H96V66H66V96H34V66H4V34H34Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/></svg>`,
  tri: c => `<svg viewBox="0 0 100 100"><path d="M50 10L92 84H8Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/></svg>`,
  trif: c => `<svg viewBox="0 0 100 100"><path d="M50 10L92 84H8Z" fill="${c}" opacity=".85"/></svg>`,
};
const shapes = [];
{
  const COLS = ['#46E3F0', '#2ED680', '#F08A3C', '#46E3F0', '#2ED680'];
  const spots = V ? [
    [110, 640, 70], [960, 560, 56], [70, 1180, 46], [1010, 1080, 74], [190, 1420, 34], [900, 1380, 40], [300, 560, 30], [800, 760, 28], [60, 860, 26], [1030, 860, 30],
  ] : [
    [640, 200, 64], [1250, 820, 56], [110, 950, 46], [1290, 180, 40], [700, 860, 36], [1830, 900, 60], [600, 520, 28], [1780, 140, 30], [60, 120, 34], [1200, 520, 26],
  ];
  const kinds = ['cross', 'tri', 'trif', 'cross', 'tri', 'cross', 'trif', 'tri', 'cross', 'trif'];
  const r = rng(23);
  spots.forEach(([x, y, sz], i) => {
    const c = COLS[i % COLS.length];
    const e = add(bg, `<div class="shape a">${SHAPE_SVG[kinds[i]](c)}</div>`);
    e.style.width = e.style.height = sz + 'px';
    const far = sz < 36;
    e.style.filter = `drop-shadow(0 0 6px ${c}) drop-shadow(0 0 16px ${c})` + (far ? ' blur(1.6px)' : '');
    place(e, x, y);
    shapes.push({ e, ph: r() * 6.28, rs: (r() - 0.5) * 16, r0: r() * 360 * (kinds[i] === 'cross' ? 0 : 1), op: far ? 0.45 : 0.85, d: i * 0.09 });
  });
}

// ---------- stage (phone + floating UI), centred on phone
const stage = add(root, `<div id="stage" class="a" style="width:0;height:0"></div>`);
place(stage, L.stage.x, L.stage.y);
const shadow = add(stage, `<div class="a" style="width:440px;height:70px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.85),transparent);"></div>`);
const phone = add(stage, `<div id="phone" class="a"><div class="scrwrap">
  <div class="island"></div>
  <div class="sbar"><span>9:41</span><span class="r"><span class="sig"><i style="height:5px"></i><i style="height:8px"></i><i style="height:11px"></i><i style="height:14px"></i></span><span class="bat"><i></i></span></span></div>
  <div class="glare"></div>
</div></div>`);
const scrwrap = $('.scrwrap', phone);
const glare = $('.glare', phone);
const addScr = html => { const e = mk(html); scrwrap.insertBefore(e, $('.island', scrwrap)); return e; };

// screen 0: splash
const scSplash = addScr(`<div class="splash"><img src="${IMG}logo_event_dark.png"><div class="bar"><i></i></div></div>`);
// screen 1: registration form
const FIELDS = [['الاسم الكامل', 'عبدالله محمد', 'rtl'], ['رقم الهوية', '10••••••••', 'ltr'], ['رقم الجوال', '05••••••••', 'ltr'], ['المدينة', 'بريدة', 'rtl']];
const scForm = addScr(`<div class="scr">
  <div class="url">${ic('lock')}<span>رابط التسجيل</span></div>
  <div style="display:flex;justify-content:center;margin:4px 0 18px"><img src="${IMG}logo_event_dark.png" style="height:78px"></div>
  <h3>سجّل حضورك</h3><div class="sub">عبّ بياناتك بخطوات بسيطة</div>
  ${FIELDS.map(([l]) => `<div class="field"><label>${l}</label><div class="box"><span class="v"></span><span class="caret"></span></div></div>`).join('')}
  <div class="btn" style="margin-top:22px">سجّل الآن</div>
  <div class="success"><svg class="ck" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="rgba(46,214,128,.14)" stroke="#2ED680" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" transform="rotate(-90 50 50)"/><path d="M30 52 L44 65 L71 37" fill="none" stroke="#2ED680" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1"/></svg>
    <h3>تم تسجيلك بنجاح</h3><p>نشوفك في لقاءات القصيم</p></div>
</div>`);
const formBoxes = $$('.box', scForm), formVals = $$('.v', scForm), formCarets = $$('.caret', scForm), formBtn = $('.btn', scForm);
const success = $('.success', scForm), succCircle = $('circle', success), succTick = $('path', success);
formVals.forEach((v, i) => { v.dir = FIELDS[i][2]; });
// screen 2: no papers
const scProfile = addScr(`<div class="scr">
  <h3>ملفك جاهز</h3><div class="sub">ما يحتاج تقديم أي أوراق</div>
  <div class="profile"><div class="row1"><div class="av">${ic('user')}</div><div><div class="nm">عبدالله محمد</div><span class="st">${ic('check')}مسجّل في اللقاءات</span></div></div>
    <div class="sk" style="width:82%;margin-top:22px"></div><div class="sk" style="width:56%"></div></div>
  ${[['file-x-2', 'بدون نماذج ورقية', 'كل شي إلكتروني'], ['files', 'بدون صور مستندات', 'ما تحتاج تطبع شي'], ['smartphone', 'كل شي من جوالك', 'سهل وسريع']].map(([i, a, b]) =>
    `<div class="docrow"><div class="ico">${ic(i)}</div><div class="t">${a}<small>${b}</small></div><div class="ok">${ic('check')}</div></div>`).join('')}
</div>`);
const profCard = $('.profile', scProfile), docrows = $$('.docrow', scProfile), docOks = $$('.docrow .ok', scProfile);
// screen 3: guidance programs
const PROGS = [['compass', 'الإرشاد المهني', 'linear-gradient(135deg,#46E3F0,#0a6fa3)'], ['briefcase', 'التوجيه الوظيفي', 'linear-gradient(135deg,#2ED680,#068a5a)'], ['trending-up', 'تطوير المسار المهني', 'linear-gradient(135deg,#F5A25C,#DD7B2D)'], ['users', 'لقاءات مع مختصين', 'linear-gradient(135deg,#3c8fd6,#01558A)']];
const scProg = addScr(`<div class="scr">
  <h3>برامج الإرشاد</h3><div class="sub">اختر البرنامج اللي يناسبك</div>
  ${PROGS.map(([i, n, g]) => `<div class="lrow"><div class="ico" style="background:${g}">${ic(i)}</div><div class="t">${n}<div class="sk" style="width:70%"></div></div>${ic('chevron-left', 'ic chev')}</div>`).join('')}
</div>`);
const progRows = $$('.lrow', scProg);
// screen 4: exhibitions map
const BOOTHS = [[24, 24, 110, 84], [150, 24, 110, 84], [276, 24, 110, 84], [24, 128, 110, 120], [276, 128, 110, 120], [150, 160, 110, 88], [24, 290, 172, 84], [214, 290, 172, 84]];
const PINS = [[79, 66, '#2ED680'], [331, 188, '#F08A3C'], [300, 332, '#46E3F0']];
const scExpo = addScr(`<div class="scr">
  <h3>المعارض المصاحبة</h3><div class="sub">اكتشف الجهات والفرص</div>
  <div class="map">
    ${BOOTHS.map(([x, y, w, h]) => `<div class="booth" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`).join('')}
    <svg class="path" viewBox="0 0 392 520" style="position:absolute;inset:0;width:100%;height:100%"><path d="M196 470 L196 280 C196 230 140 205 79 170 L79 92" fill="none" stroke="#2ED680" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/></svg>
    ${PINS.map(([x, y, c]) => `<div class="pin a" style="left:${x}px;top:${y}px;transform:none"><svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" fill="${c}" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="10" r="2.8" fill="#fff"/></svg></div>`).join('')}
    <div class="youare a" style="left:196px;top:470px"></div>
  </div>
  <div class="legend"><span><i style="background:#2ED680"></i>توظيف</span><span><i style="background:#F08A3C"></i>تدريب</span><span><i style="background:#46E3F0"></i>ريادة أعمال</span></div>
</div>`);
const pins = $$('.pin', scExpo), youare = $('.youare', scExpo), mapPath = $('.path path', scExpo), booths = $$('.booth', scExpo);
// screen 5: courses
const COURSES = [['message-circle', 'مهارات التواصل', 'linear-gradient(135deg,#46E3F0,#0a6fa3)'], ['presentation', 'التسويق الرقمي', 'linear-gradient(135deg,#2ED680,#068a5a)'], ['clipboard-list', 'إدارة المشاريع', 'linear-gradient(135deg,#F5A25C,#DD7B2D)']];
const scCourse = addScr(`<div class="scr">
  <h3>الدورات</h3><div class="sub">سجّل في الدورة المناسبة لك</div>
  <div class="chips"><span class="on">الكل</span><span>تقنية</span><span>إدارة</span><span>مهارات</span></div>
  ${COURSES.map(([i, n, g]) => `<div class="lrow"><div class="ico" style="background:${g}">${ic(i)}</div><div class="t">${n}<div class="sk" style="width:62%"></div></div><div class="sel">${ic('check')}</div></div>`).join('')}
  <div class="btn" style="margin-top:20px">تأكيد التسجيل</div>
</div>`);
const courseRows = $$('.lrow', scCourse), courseSel = $$('.sel', scCourse), courseBtn = $('.btn', scCourse);
// screen 6: summary checklist
const SUMS = ['سجّلت إلكترونياً', 'بدون أوراق', 'تعرّفت على برامج الإرشاد', 'زيارة المعارض المصاحبة', 'سجّلت في الدورات'];
const scSum = addScr(`<div class="scr">
  <h3>جاهزيتك للقاء</h3><div class="sub">كل الخطوات مكتملة</div>
  ${SUMS.map(s => `<div class="chk"><div class="ok">${ic('check')}</div>${s}</div>`).join('')}
</div>`);
const sumRows = $$('.chk', scSum);
const SCREENS = [[scSplash, -9, S[0]], [scForm, S[0], S[1]], [scProfile, S[1], S[2]], [scProg, S[2], S[3]], [scExpo, S[3], S[4]], [scCourse, S[4], SUM], [scSum, SUM, 99]];
// tap pointer
const tapDot = add(scrwrap, `<div class="tap a"></div>`), ripple = add(scrwrap, `<div class="ripple a"></div>`);

// ---------- floating side elements (stage coords)
const bubble = (icon, check = false) => add(stage, `<div class="bubble glass a">${ic(icon)}${check ? `<div class="badge-check">${ic('check')}</div>` : ''}</div>`);
const pill = (txt) => add(stage, `<div class="pill glass a"><span class="dot">${ic('check')}</span>${txt}</div>`);
const card = (icon, h, p) => add(stage, `<div class="card glass a"><div class="icwrap">${ic(icon)}</div><h4>${h}</h4><p>${p}</p></div>`);
const SIDE = {
  b1: bubble('link'), p1: pill('تم التسجيل'),
  b2: bubble('smartphone', true),
  b3: bubble('users'), c3: card('compass', 'الإرشاد المهني', 'اكتشف مسارك المهني'),
  b4a: bubble('store'), b4b: bubble('map-pin', true),
  b5a: bubble('graduation-cap'), b5b: bubble('calendar-check'), p5: pill('تم التسجيل في الدورة'),
  ring: add(stage, `<div class="ringcard glass a"><div class="ring"><svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="7"/>
      <circle class="arc" cx="50" cy="50" r="42" fill="none" stroke="#46E3F0" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="1" style="filter:drop-shadow(0 0 5px #46E3F0)"/></svg>
      <div class="num">0%</div></div><div class="lbl">جاهزيتك</div></div>`),
  b6: bubble('award'),
};
const papers = [[-300, -330, -14], [305, -250, 12], [-315, 170, 9], [300, 250, -11]].map(([x, y, r]) => ({
  e: add(stage, `<div class="paper a"><i></i><i></i><i></i><i></i><i></i><svg class="x" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M8 8 L92 92" stroke="#E5532D" stroke-width="9" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1"/><path d="M92 8 L8 92" stroke="#E5532D" stroke-width="9" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1"/></svg></div>`), x, y, r }));
papers.forEach(p => { p.x1 = $$('svg.x path', p.e); });
const ringArc = $('.arc', SIDE.ring), ringNum = $('.num', SIDE.ring);
// sparkles for summary
const sparks = [];
{ const r = rng(5); for (let i = 0; i < 14; i++) { const e = add(stage, `<div class="a" style="width:14px;height:14px;border-radius:50%;background:${['#46E3F0', '#2ED680', '#F08A3C', '#fff'][i % 4]};box-shadow:0 0 12px currentColor"></div>`); sparks.push({ e, a: r() * 6.28, d: 120 + r() * 140, s: 0.5 + r() * 0.8 }); } }

// ---------- headlines
const HEADS = [
  { a: 0.8, b: S[0], chip: 0, html: '<small>ناوي تحضر</small><em>لقاءات القصيم؟</em>' },
  { a: S[0], b: S[1], chip: 1, html: 'سجّل <em>إلكترونياً</em><br>من الرابط' },
  { a: S[1], b: S[2], chip: 2, html: 'ما يحتاج<br><em>تقديم أوراق</em>' },
  { a: S[2], b: S[3], chip: 3, html: 'تعرّف على<br><em>برامج الإرشاد</em>' },
  { a: S[3], b: S[4], chip: 4, html: 'زُر <em>المعارض</em><br>المصاحبة' },
  { a: S[4], b: SUM, chip: 5, html: 'سجّل في <em>الدورات</em><br>المناسبة لك' },
  { a: SUM, b: END + 0.6, chip: 0, html: 'كل شي<br><em>جاهز!</em>' },
];
HEADS.forEach(h => {
  h.e = add(root, `<div class="head a" style="width:${L.head.w}px;text-align:${V ? 'center' : 'right'}">
    ${h.chip ? `<div class="chip"><b>${h.chip}</b>الخطوة ${h.chip} من 5</div>` : ''}
    <div class="htxt" style="font-size:${L.head.fs}px">${h.html}</div></div>`);
  place(h.e, L.head.x, L.head.y);
  h.chipE = $('.chip', h.e); h.txt = $('.htxt', h.e); h.em = $$('em', h.e);
});

// ---------- step tracker
const TICONS = ['link', 'file-x-2', 'compass', 'store', 'graduation-cap'];
const TLABELS = ['التسجيل', 'بدون أوراق', 'الإرشاد', 'المعارض', 'الدورات'];
const tracker = add(root, `<div class="a" style="width:0;height:0"></div>`);
const TR = L.tracker;
let tline, tfill;
const tnodes = TICONS.map((n, i) => {
  const node = add(tracker, `<div class="tnode a" style="--d:${TR.d}px">${ic(n)}<div class="badge-check">${ic('check')}</div></div>`);
  const lab = add(tracker, `<div class="tlabel a">${TLABELS[i]}</div>`);
  return { node, lab, badge: $('.badge-check', node), icon: $('.ic', node) };
});
if (TR.mode === 'row') {
  place(tracker, 0, 0);
  const span = TR.gap * 4;
  tline = add(tracker, `<div class="tline" style="left:${W / 2 - span / 2}px;top:${TR.y - 3}px;width:${span}px;height:6px"><i></i></div>`);
  tnodes.forEach((t, i) => { t.x = W / 2 + (2 - i) * TR.gap; t.y = TR.y; place(t.node, t.x, t.y); place(t.lab, t.x, t.y + TR.d / 2 + 34); });
} else {
  place(tracker, 0, 0);
  const span = TR.gap * 4;
  tline = add(tracker, `<div class="tline" style="left:${TR.x - 3}px;top:${TR.y0}px;width:6px;height:${span}px"><i></i></div>`);
  tnodes.forEach((t, i) => { t.x = TR.x; t.y = TR.y0 + i * TR.gap; place(t.node, t.x, t.y); t.lab.style.transformOrigin = 'right center';
    t.lab.style.textAlign = 'right'; t.lab.style.fontSize = '30px'; place(t.lab, t.x - TR.d / 2 - 26, t.y); t.labRight = true; });
}
tline.firstElementChild.style.transformOrigin = TR.mode === 'row' ? 'right center' : 'center top';
tracker.insertBefore(tline, tracker.firstChild);

// ---------- end card
const endcard = add(root, `<div id="endcard"><div id="endbg"></div></div>`);
const hero = add(endcard, `<img id="hero" class="a" src="${IMG}hero.png">`);
const tagline = add(endcard, `<img id="tagline" class="a" src="${IMG}tagline.png">`);
const cta = add(endcard, `<div id="cta" class="a"><span>سجّل الحين</span><span class="arr">${ic('arrow-left')}</span></div>`);
const ctasub = add(endcard, `<div id="ctasub" class="a">${CONFIG.url ? CONFIG.url : 'التسجيل إلكتروني • بدون أوراق'}</div>`);
if (CONFIG.url) ctasub.style.direction = 'ltr';
const logopanel = add(endcard, `<div id="logopanel" class="a"><img src="${IMG}logo_event.png"><div class="div"></div><img src="${IMG}logo_hrdf.png"></div>`);
const [lgEvent, lgDiv, lgHrdf] = logopanel.children;
const endShapes = [];
if (V) {
  hero.style.width = '1180px'; place(hero, 540, 960);
  tagline.style.width = '700px'; place(tagline, 540, 372);
  place(cta, 540, 1412); place(ctasub, 540, 1512);
  lgEvent.style.height = '150px'; lgHrdf.style.height = '150px';
  place(logopanel, 540, 1730);
} else {
  hero.style.width = '1060px'; place(hero, 420, 640);
  tagline.style.width = '560px'; place(tagline, 1060, 380);
  place(cta, 1060, 720); place(ctasub, 1060, 815);
  logopanel.style.width = '440px'; logopanel.style.height = H + 'px';
  lgEvent.style.width = '330px'; lgHrdf.style.width = '330px';
  place(logopanel, W - 220, H / 2);
}
{ const r = rng(41); const spots = V ? [[120, 200, 60], [960, 640, 50], [90, 1300, 40], [990, 1280, 56], [930, 150, 34]] : [[960, 150, 50], [1360, 900, 46], [720, 120, 34], [1380, 300, 40]];
  spots.forEach(([x, y, sz], i) => { const c = ['#ffffff', '#46E3F0', '#ffffff', '#2ED680', '#F7B06A'][i % 5];
    const e = add(endcard, `<div class="shape a">${SHAPE_SVG[i % 2 ? 'tri' : 'cross'](c)}</div>`); e.style.width = e.style.height = sz + 'px';
    e.style.filter = `drop-shadow(0 0 8px ${c})`; place(e, x, y); endShapes.push({ e, ph: r() * 6.28, rs: (r() - 0.5) * 20, d: i * 0.1 }); }); }

const vignette = add(root, `<div id="vignette"></div>`);

// ---------- measure tap targets (screen-local coordinates, before any transforms)
function localCenter(elm) {
  const a = elm.getBoundingClientRect(), b = scrwrap.getBoundingClientRect();
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
}
let TAPS = [];
function measure() {
  TAPS = [
    { t: S[0] + 2.0, p: localCenter(formBtn), sc: scForm },
    { t: S[2] + 1.0, p: localCenter(progRows[0]), sc: scProg },
    { t: S[4] + 1.5, p: localCenter(courseSel[1]), sc: scCourse },
  ];
}

// ================================================================== RENDER
function render(t) {
  // ----- lights
  let lo = 0;
  if (t < 0.15) lo = 0; else if (t < 0.24) lo = 0.55; else if (t < 0.33) lo = 0.12; else lo = lerp(0.6, 1, E.o3(P(t, 0.33, 1.0)));
  floor.style.opacity = lo; grain.style.opacity = 0.55 * lo;
  T(floor, { o: lo }); T(grain, { o: 0.55 * lo });
  beam.style.opacity = lo * (0.85 + 0.15 * Math.sin(t * 2.1));
  T(brandglow, { o: 0.9 * E.o3(P(t, 0.6, 2.0)) * (0.9 + 0.1 * Math.sin(t * 1.3)), s: 1 + 0.04 * Math.sin(t * 0.7) });
  dust.forEach(d => {
    const y = ((d.y - t * d.sp) % L.floorY + L.floorY) % L.floorY;
    T(d.e, { x: d.x + Math.sin(t * 0.6 + d.ph) * d.sw, y, o: lo * d.o * (0.5 + 0.5 * Math.sin(t * 1.7 + d.ph)) });
  });
  shapes.forEach((s, i) => {
    const k = E.o3(P(t, 1.0 + s.d, 2.0 + s.d));
    T(s.e, { y: float(t, s.ph, 14, 0.8) - t * 4 + (1 - k) * 30, r: s.r0 + t * s.rs, o: s.op * k * (0.8 + 0.2 * Math.sin(t * 2 + s.ph)) });
  });

  // ----- stage + phone
  const ent = P(t, 0.45, 1.5);
  const stScale = L.stage.s * (1 + 0.06 * E.io3(P(t, END - 0.4, END + 0.6)));
  T(stage, { s: stScale });
  T(phone, { y: lerp(140, 0, E.o5(ent)) + float(t, 0, 6, 1.0), o: E.o3(P(t, 0.45, 0.9)), ry: lerp(24, 0, E.o3(ent)) + Math.sin(t * 0.55) * 4, rx: Math.sin(t * 0.4 + 1) * 1.5 });
  T(shadow, { y: 478, o: 0.9 * E.o3(ent) * lo, sx: 1 - float(t, 0, 0.03, 1.0) });
  // glare sweeps
  const gl = Math.max(P(t, 0.9, 2.0), 0) < 1 && t > 0.9 ? P(t, 0.9, 2.0) : (t > SUM + 1.2 && t < SUM + 2.2 ? P(t, SUM + 1.2, SUM + 2.2) : -1);
  glare.style.transform = `translateX(${gl < 0 ? -100 : lerp(-70, 70, E.io3(gl))}%)`;

  // ----- screens
  SCREENS.forEach(([e, a, b], i) => {
    if (t < a - 0.01 || t > b + 0.45) { e.style.display = 'none'; return; }
    const ki = i === 0 ? 1 : E.o3(P(t, a, a + 0.42));
    const u = E.io3(P(t, b, b + 0.42));
    e.style.display = '';
    e.style.zIndex = i + 1;
    e.style.transform = `translateX(${(lerp(-100, 0, ki) + u * 28).toFixed(2)}%)`;
    e.style.filter = u > 0.01 ? `brightness(${1 - 0.6 * u})` : '';
  });
  // splash
  { const k = E.back(P(t, 0.8, 1.5)); const logo = $('img', scSplash);
    logo.style.transform = `scale(${lerp(0.7, 1, k)})`; logo.style.opacity = E.o3(P(t, 0.8, 1.2));
    $('.bar i', scSplash).style.width = (E.io3(P(t, 1.2, 2.9)) * 100) + '%'; }
  // form typing
  FIELDS.forEach(([, val], i) => {
    const a = S[0] + 0.3 + i * 0.36, b = a + 0.3;
    const n = Math.round(P(t, a, b) * [...val].length);
    formVals[i].textContent = [...val].slice(0, n).join('');
    const focus = t >= a - 0.08 && t < b + 0.06 && t < S[0] + 1.95;
    formBoxes[i].classList.toggle('focus', focus);
    formCarets[i].style.opacity = focus && (Math.floor(t * 4) % 2 === 0 || (t > a && t < b)) ? 1 : 0;
  });
  { const pr = P(t, S[0] + 2.0, S[0] + 2.12), rl = P(t, S[0] + 2.12, S[0] + 2.3);
    formBtn.style.transform = `scale(${1 - 0.05 * E.o3(pr) + 0.05 * E.o3(rl)})`;
    const so = E.o3(P(t, S[0] + 2.1, S[0] + 2.35)); success.style.opacity = so; success.style.display = so > 0 ? '' : 'none';
    succCircle.style.strokeDashoffset = 1 - E.io3(P(t, S[0] + 2.15, S[0] + 2.6));
    succTick.style.strokeDashoffset = 1 - E.o3(P(t, S[0] + 2.4, S[0] + 2.7));
    const ck = $('.ck', success); ck.style.transform = `scale(${lerp(0.6, 1, E.back(P(t, S[0] + 2.12, S[0] + 2.55)))})`;
    $$('h3,p', success).forEach((x, j) => { const k = E.o3(P(t, S[0] + 2.4 + j * 0.1, S[0] + 2.75 + j * 0.1)); x.style.opacity = k; x.style.transform = `translateY(${(1 - k) * 20}px)`; });
  }
  // profile screen
  { const k = E.o3(P(t, S[1] + 0.2, S[1] + 0.6)); profCard.style.opacity = k; profCard.style.transform = `translateY(${(1 - k) * 40}px)`;
    docrows.forEach((d, j) => { const kk = E.o3(P(t, S[1] + 0.4 + j * 0.14, S[1] + 0.8 + j * 0.14)); d.style.opacity = kk; d.style.transform = `translateX(${(1 - kk) * -60}px)`; });
    docOks.forEach((d, j) => { const kk = E.back(P(t, S[1] + 1.6 + j * 0.12, S[1] + 1.9 + j * 0.12)); d.style.transform = `scale(${kk})`; }); }
  // programs screen
  progRows.forEach((r, j) => { const kk = E.o3(P(t, S[2] + 0.2 + j * 0.12, S[2] + 0.6 + j * 0.12)); r.style.opacity = kk; r.style.transform = `translateX(${(1 - kk) * -60}px) scale(${t > S[2] + 1.0 && t < S[2] + 1.15 && j === 0 ? 0.97 : 1})`;
    r.classList.toggle('hl', j === 0 && t >= S[2] + 1.02); });
  // expo screen
  booths.forEach((b, j) => { const kk = E.o3(P(t, S[3] + 0.15 + j * 0.04, S[3] + 0.5 + j * 0.04)); b.style.opacity = kk; b.style.transform = `scale(${lerp(0.7, 1, kk)})`; });
  pins.forEach((p, j) => { const a = S[3] + 0.5 + j * 0.25; const kk = P(t, a, a + 0.5); p.style.opacity = kk > 0 ? 1 : 0;
    p.style.transform = `translateY(${(1 - E.bounce(kk)) * -160}px) scale(${1 + 0.15 * Math.max(0, Math.sin((t - a - 0.5) * 3)) * (t > a + 0.5 && t < a + 1.55 ? 1 : 0)})`; });
  { const pulse = (t * 1.2) % 1; youare.style.boxShadow = `0 0 0 ${6 + pulse * 22}px rgba(70,227,240,${0.35 * (1 - pulse)})`;
    mapPath.style.strokeDasharray = '2 12'; const dk = E.io3(P(t, S[3] + 1.1, S[3] + 1.8));
    mapPath.parentNode.style.clipPath = `inset(${(1 - dk) * 100}% 0 0 0)`; }
  // courses screen
  courseRows.forEach((r, j) => { const kk = E.o3(P(t, S[4] + 0.2 + j * 0.12, S[4] + 0.6 + j * 0.12)); r.style.opacity = kk; r.style.transform = `translateX(${(1 - kk) * -60}px)`;
    const on = j === 1 && t >= S[4] + 1.52; r.classList.toggle('hl', on);
    const sel = courseSel[j]; sel.style.background = on ? 'var(--mint)' : ''; sel.style.borderColor = on ? 'var(--mint)' : '';
    $('.ic', sel).style.opacity = on ? 1 : 0; sel.style.transform = `scale(${on ? lerp(0.6, 1, E.back(P(t, S[4] + 1.52, S[4] + 1.8))) : 1})`; });
  courseBtn.style.opacity = E.o3(P(t, S[4] + 0.6, S[4] + 0.9));
  // summary screen
  sumRows.forEach((r, j) => { const a = SUM + 0.2 + j * 0.125; const kk = E.o3(P(t, SUM + 0.05 + j * 0.06, SUM + 0.4 + j * 0.06));
    r.style.opacity = kk; r.style.transform = `translateX(${(1 - kk) * -50}px)`;
    const on = t >= a + 0.25; r.classList.toggle('done', on); const okI = $('.ic', r); okI.style.opacity = on ? 1 : 0;
    $('.ok', r).style.transform = `scale(${on ? lerp(0.5, 1, E.back(P(t, a + 0.25, a + 0.5))) : 1})`; });

  // ----- tap pointer
  let tp = null; for (const tap of TAPS) if (t > tap.t - 0.6 && t < tap.t + 0.5) tp = tap;
  if (tp) {
    const mv = E.io3(P(t, tp.t - 0.6, tp.t - 0.05)), press = P(t, tp.t, tp.t + 0.12), rel = P(t, tp.t + 0.12, tp.t + 0.25), out = P(t, tp.t + 0.25, tp.t + 0.5);
    T(tapDot, { x: tp.p.x + lerp(90, 0, mv), y: tp.p.y + lerp(200, 0, mv), s: 1 - 0.25 * E.o3(press) + 0.25 * E.o3(rel), o: E.o3(P(t, tp.t - 0.6, tp.t - 0.4)) * (1 - out) * 0.95 });
    const rp = P(t, tp.t + 0.03, tp.t + 0.5);
    T(ripple, { x: tp.p.x, y: tp.p.y, s: lerp(0.6, 2.6, E.o3(rp)), o: rp > 0 ? (1 - rp) * 0.9 : 0 });
  } else { T(tapDot, { o: 0 }); T(ripple, { o: 0 }); }

  // ----- side elements
  const side = (e, a, b, x, y, ph, extra = {}) => { const v = env(t, a, b); T(e, { x: x + (extra.dx || 0) * (1 - v.k), y: y + float(t, ph, 9, 1.2) + (extra.dy || 0) * (1 - v.k), s: v.s, o: v.o, r: (extra.r || 0) * (1 - v.k) }); return v; };
  side(SIDE.b1, S[0] + 0.25, S[1] + 0.05, -305, -300, 0.3, { dx: 120 });
  side(SIDE.p1, S[0] + 2.3, S[1] + 0.05, 205, 310, 1.1, { dx: -80 });
  { const v = side(SIDE.b2, S[1] + 1.65, S[2] + 0.05, -305, 40, 2.1, { dx: 140 }); const bc = $('.badge-check', SIDE.b2); bc.style.transform = `scale(${E.back(P(t, S[1] + 1.95, S[1] + 2.25))})`; }
  side(SIDE.b3, S[2] + 0.3, S[3] + 0.05, 305, -300, 0.7, { dx: -120 });
  side(SIDE.c3, S[2] + 1.1, S[3] + 0.05, -265, 160, 1.9, { dx: 200, r: -6 });
  side(SIDE.b4a, S[3] + 0.3, S[4] + 0.05, 305, -290, 0.2, { dx: -120 });
  { side(SIDE.b4b, S[3] + 0.6, S[4] + 0.05, -305, 230, 1.5, { dx: 120 }); $('.badge-check', SIDE.b4b).style.transform = `scale(${E.back(P(t, DONE[3] - 0.2, DONE[3] + 0.1))})`; }
  side(SIDE.b5a, S[4] + 0.3, SUM + 0.05, -305, -300, 0.4, { dx: 120 });
  side(SIDE.b5b, S[4] + 0.6, SUM + 0.05, 305, 240, 2.4, { dx: -120 });
  side(SIDE.p5, S[4] + 1.75, SUM + 0.05, 130, 400, 1.2, { dy: 40 });
  side(SIDE.ring, SUM + 0.15, END + 0.6, -262, -110, 0.9, { dx: 180 });
  side(SIDE.b6, SUM + 1.25, END + 0.6, 305, -250, 2.2, { dx: -120 });
  { const rk = E.io3(P(t, SUM + 0.3, SUM + 1.25)); ringArc.style.strokeDashoffset = 1 - rk; ringNum.textContent = Math.round(rk * 100) + '%'; }
  sparks.forEach(s => { const k = P(t, SUM + 1.25, SUM + 2.1); const d = E.o3(k) * s.d;
    T(s.e, { x: -262 + Math.cos(s.a) * d, y: -150 + Math.sin(s.a) * d, s: s.s * (1 - k * 0.6), o: k > 0 && k < 1 ? 1 - E.i3(k) : 0 }); });
  // papers (step 2)
  papers.forEach((p, j) => {
    const a = S[1] + 0.1 + j * 0.09, fly = P(t, S[1] + 1.5 + j * 0.05, S[1] + 2.1 + j * 0.05);
    const v = env(t, a, 99, 0.5);
    const dir = Math.atan2(p.y, p.x);
    const fd = E.i3(fly) * 900;
    T(p.e, { x: p.x + Math.cos(dir) * fd + (1 - v.k) * -p.x * 0.6, y: p.y + Math.sin(dir) * fd + float(t, j, 8, 1.3) + (1 - v.k) * -p.y * 0.6,
      r: p.r + (1 - v.k) * 20 + fly * (j % 2 ? 70 : -70), s: v.s * (1 - 0.3 * fly), o: (t < S[2] + 0.2 ? v.o : 0) * (1 - E.i3(fly)), b: fly * 6 });
    p.x1.forEach((path, q) => { path.style.strokeDashoffset = 1 - E.o3(P(t, S[1] + 1.05 + q * 0.12 + j * 0.04, S[1] + 1.3 + q * 0.12 + j * 0.04)); });
  });

  // ----- headlines
  HEADS.forEach((h, i) => {
    const i0 = P(t, h.a, h.a + 0.55), u = P(t, h.b - 0.3, h.b);
    const o = E.o3(i0) * (1 - E.io3(u));
    T(h.e, { o, y: lerp(46, 0, E.o3(i0)) - 40 * E.io3(u), b: (1 - E.o3(i0)) * 16 + u * 12, s: lerp(1.04, 1, E.o3(i0)) });
    if (h.chipE) { const ck = E.back(P(t, h.a - 0.05, h.a + 0.4)); h.chipE.style.transform = `scale(${lerp(0.5, 1, ck)})`; }
    h.em.forEach(em => { em.style.backgroundPosition = `${(t * 40) % 200}% 0`; });
  });

  // ----- tracker
  { const k = E.o3(P(t, 2.2, 2.9)); tracker.style.opacity = k; tracker.style.display = k > 0 ? '' : 'none'; tracker.style.transform = `translate(0px,${((1 - k) * 50).toFixed(1)}px)`;
    let prog = 0; DONE.forEach((d, i) => { prog += E.io3(P(t, d - 0.1, d + 0.4)) * (i < 4 ? 1 : 0); });
    const f = tline.firstElementChild; f.style.transform = TR.mode === 'row' ? `scaleX(${prog / 4})` : `scaleY(${prog / 4})`;
    tnodes.forEach((n, i) => {
      const act = t >= S[i] - 0.1 && t < S[i] + STEP - 0.1;
      const actK = E.o3(P(t, S[i] - 0.1, S[i] + 0.25)) * (1 - E.o3(P(t, S[i] + STEP - 0.1, S[i] + STEP + 0.2)));
      const done = P(t, DONE[i], DONE[i] + 0.35);
      T(n.node, { x: 0, y: 0, s: 1 + 0.14 * actK + 0.1 * Math.sin(Math.PI * done) });
      n.node.style.left = n.x + 'px'; n.node.style.top = n.y + 'px';
      n.node.style.borderColor = actK > 0.05 ? `rgba(70,227,240,${0.3 + 0.6 * actK})` : (done > 0 ? 'rgba(46,214,128,.65)' : '');
      n.node.style.boxShadow = `inset 0 1.5px 0 rgba(255,255,255,.15),0 16px 30px rgba(0,0,0,.5),0 0 ${30 * actK}px rgba(70,227,240,${0.55 * actK})` + (done > 0 ? `,0 0 26px rgba(46,214,128,${0.35 * done})` : '');
      n.icon.style.opacity = 0.5 + 0.5 * Math.max(actK, done);
      n.badge.style.transform = `scale(${E.back(done)})`;
      n.lab.style.opacity = 0.55 + 0.45 * Math.max(actK, done);
      n.lab.style.color = done > 0.5 ? '#9ff0c4' : (actK > 0.5 ? '#ffffff' : '');
      n.lab.style.transform = n.labRight ? 'translate(-100%,-50%)' : 'translate(-50%,-50%)';
      void act;
    });
  }

  // ----- end card
  { const k = E.io3(P(t, END, END + 0.85));
    const cx = L.stage.x, cy = L.stage.y; const R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    endcard.style.display = k > 0 ? '' : 'none';
    endcard.style.clipPath = `circle(${(k * R).toFixed(1)}px at ${cx}px ${cy}px)`;
    vignette.style.opacity = 1 - 0.7 * k;
    const hk = E.o3(P(t, END + 0.3, END + 1.5));
    T(hero, { o: hk, s: lerp(1.12, 1, hk) * (1 + (t - END) * 0.006), y: (1 - hk) * 30 });
    const tk = E.o3(P(t, END + 0.6, END + 1.5));
    T(tagline, { o: Math.min(1, tk * 2), y: (1 - tk) * 24 });
    tagline.style.clipPath = `inset(0 0 0 ${((1 - tk) * 100).toFixed(1)}%)`;
    const ck = P(t, END + 1.3, END + 1.85), pulse = t > END + 2.2 ? Math.sin((t - END - 2.2) * 3.2) : 0;
    T(cta, { o: E.o3(Math.min(1, ck * 2)), s: lerp(0.5, 1, E.back(ck)) * (1 + 0.025 * Math.max(0, pulse)) });
    cta.style.boxShadow = `0 24px 50px rgba(0,40,70,.35),0 0 ${20 + 30 * Math.max(0, pulse)}px rgba(255,255,255,${0.25 + 0.25 * Math.max(0, pulse)})`;
    const arr = $('.arr .ic', cta); arr.style.transform = `translateX(${-6 * Math.max(0, Math.sin((t - END) * 6.4))}px)`;
    const sk = E.o3(P(t, END + 1.65, END + 2.15)); T(ctasub, { o: sk, y: (1 - sk) * 20 });
    const lk = E.o3(P(t, END + 1.8, END + 2.5));
    if (V) T(logopanel, { o: lk, y: (1 - lk) * 80 }); else T(logopanel, { o: 1, x: (1 - lk) * 460 });
    [lgEvent, lgDiv, lgHrdf].forEach((e, j) => { const q = E.o3(P(t, END + 2.1 + j * 0.15, END + 2.6 + j * 0.15)); e.style.opacity = q; e.style.transform = j === 1 ? `scale${V ? 'Y' : 'X'}(${q})` : `translateY(${(1 - q) * 16}px)`; });
    endShapes.forEach(s => { const q = E.o3(P(t, END + 0.8 + s.d, END + 1.8 + s.d)); T(s.e, { o: 0.75 * q, y: float(t, s.ph, 12, 0.9), r: t * s.rs }); });
  }
}

// ---------- cues for the soundtrack
function buildCues() {
  cue(0.15, 'lighton'); cue(0.45, 'rise');
  HEADS.forEach((h, i) => cue(h.a - 0.04, 'whoosh', i === 0 ? 0.8 : 1));
  FIELDS.forEach(([, v], i) => { const a = S[0] + 0.3 + i * 0.36, n = [...v].length; for (let c = 0; c < n; c++) cue(a + (c / n) * 0.3, 'key', 0.6); });
  TAPS.forEach(tp => cue(tp.t, 'tap'));
  cue(S[0] + 2.15, 'success');
  DONE.forEach(d => cue(d, 'check'));
  [[S[0] + 0.25], [S[0] + 2.3], [S[1] + 1.65], [S[2] + 0.3], [S[2] + 1.1], [S[3] + 0.3], [S[3] + 0.6], [S[4] + 0.3], [S[4] + 0.6], [S[4] + 1.75], [SUM + 0.15], [SUM + 1.25]].forEach(([a]) => cue(a, 'pop', 0.7));
  papers.forEach((_, j) => cue(S[1] + 0.1 + j * 0.09, 'paper', 0.7));
  cue(S[1] + 1.05, 'scratch', 0.8); cue(S[1] + 1.5, 'swoosh');
  PINS.forEach((_, j) => cue(S[3] + 0.5 + j * 0.25 + 0.22, 'drop', 0.9));
  SUMS.forEach((_, j) => cue(SUM + 0.45 + j * 0.125, 'blip', 0.8 + j * 0.05));
  cue(SUM + 1.25, 'sparkle');
  cue(END - 1.0, 'riser'); cue(END, 'impact');
  cue(END + 1.3, 'pop', 0.9); cue(END + 1.9, 'whoosh', 0.6);
}

// ---------- public API
window.COMP = { W, H, FPS, DUR, FMT, frames: Math.round(DUR * FPS), CUES };
window.renderFrame = f => render(f / FPS);
window.renderTime = t => render(t);
window.compReady = (async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
  measure(); buildCues(); render(+Q.get('t') || 0);
  return true;
})();
})();
