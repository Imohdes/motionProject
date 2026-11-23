/* لقاءات القصيم 26 — "جهّز نفسك قبل لا تجي"  (v2: realistic iPhone + brand colours + SST Arabic)
 * Deterministic motion-graphics composition: every frame is a pure function of time.
 * URL params: fmt=v (1080x1920, default) | fmt=h (1920x1080); t=<seconds> for a still; url=<link>; domain=<host>
 */
(() => {
'use strict';
const Q = new URLSearchParams(location.search);
const FMT = Q.get('fmt') === 'h' ? 'h' : 'v';
const V = FMT === 'v';
const FPS = 30;
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const CONFIG = { url: Q.get('url') || '', domain: Q.get('domain') || 'hrdf.org.sa' };
const IMG = '../assets/img/';

// ------------------------------------------------------------------ timeline (120 BPM grid, beat = 0.5 s)
const S = [3, 6.5, 9.5, 12.5, 15.5];        // step starts
const SUM = 18.5, END = 20.5, DUR = 25.5;
const STEP_END = [...S.slice(1), SUM];
const DONE = [6.5, 8.6, 11.5, 14.5, 17.5];  // tracker check moments

// ------------------------------------------------------------------ layout per format
const L = V ? {
  stage: { x: 540, y: 1062, s: 1.12 }, sideK: 1,
  head: { x: 540, y: 372, w: 1000, fs: 92 },
  steps: { x: 540, y: 182, gap: 100, d: 60, align: 'center' },
} : {
  stage: { x: 800, y: 560, s: 0.92 }, sideK: 0.94,
  head: { x: 1455, y: 480, w: 700, fs: 80 },
  steps: { x: 1805, y: 300, gap: 86, d: 52, align: 'right' },
};

// ------------------------------------------------------------------ utils
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  o2: x => 1 - (1 - x) * (1 - x),
  o3: x => 1 - Math.pow(1 - x, 3),
  o5: x => 1 - Math.pow(1 - x, 5),
  i2: x => x * x,
  i3: x => x * x * x,
  io3: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: x => { const c1 = 1.5, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
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
function T(e, o = {}) {
  const { x = 0, y = 0, s = 1, sx, sy, r = 0, o: op = 1, b = 0, ry = 0, rx = 0 } = o;
  const persp = ry || rx ? ` perspective(2200px) rotateY(${ry.toFixed(3)}deg) rotateX(${rx.toFixed(3)}deg)` : '';
  e.style.transform = `translate(-50%,-50%) translate(${x.toFixed(2)}px,${y.toFixed(2)}px)${persp} rotate(${r.toFixed(3)}deg) scale(${sx ?? s},${sy ?? s})`;
  e.style.opacity = op;
  e.style.filter = b > 0.15 ? `blur(${b.toFixed(2)}px)` : '';
  e.style.display = op <= 0.003 ? 'none' : '';
}
const place = (e, x, y) => { e.style.left = x + 'px'; e.style.top = y + 'px'; };
const vis = (e, o) => { e.style.opacity = o; e.style.display = o <= 0.003 ? 'none' : ''; };
function env(t, a, b, din = 0.45, dout = 0.3) {
  const i = P(t, a, a + din), u = P(t, b - dout, b);
  return { o: clamp(E.o2(Math.min(1, i * 1.6))) * (1 - E.io3(u)), s: lerp(0.5, 1, E.back(i)) * lerp(1, 0.9, u), k: E.o3(i), u, i };
}
const float = (t, ph, amp = 8, sp = 1.1) => Math.sin(t * sp + ph) * amp;

const CUES = [];
const cue = (t, type, v = 1) => CUES.push({ t: +t.toFixed(3), type, v });

// ================================================================== BUILD
document.body.classList.add('fmt-' + FMT);
const root = $('#root');
root.style.width = W + 'px'; root.style.height = H + 'px';

// ---------- background: Liqaa campaign gradient + soft light + brand shapes + film grain
const bg = add(root, `<div style="position:absolute;inset:0"></div>`);
const bgbase = add(bg, `<div id="bgbase"></div>`);
const BLOBS = [];
const STREAKS = (V ? [[180, 260, 760, 0], [860, 520, 520, 1], [300, 1380, 640, 2]] : [[300, 160, 900, 0], [1500, 260, 600, 1], [700, 900, 700, 2]])
  .map(([x, y, w, i]) => { const e = add(bg, `<div class="streak a"></div>`); e.style.width = w + 'px'; place(e, x, y); return { e, ph: i * 2.1, w }; });
const SHAPE_SVG = {
  cross: c => `<svg viewBox="0 0 100 100"><path d="M34 4H66V34H96V66H66V96H34V66H4V34H34Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/></svg>`,
  tri: c => `<svg viewBox="0 0 100 100"><path d="M50 10L92 84H8Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/></svg>`,
  trif: c => `<svg viewBox="0 0 100 100"><path d="M50 10L92 84H8Z" fill="${c}"/></svg>`,
};
const shapes = [];
{
  const spots = V ? [[100, 600, 72, 'cross', '#ffffff'], [980, 560, 54, 'tri', '#ffffff'], [70, 1200, 44, 'trif', '#DC7B2C'], [1010, 1330, 66, 'cross', '#7FE0B4'], [960, 870, 34, 'trif', '#ffffff'],
      [140, 1490, 40, 'tri', '#7FE0B4'], [70, 900, 36, 'cross', '#DC7B2C'], [1015, 1080, 30, 'tri', '#DC7B2C'], [130, 380, 34, 'trif', '#7FE0B4']]
    : [[520, 190, 62, 'cross', '#ffffff'], [1170, 860, 54, 'tri', '#ffffff'], [330, 800, 44, 'trif', '#DC7B2C'], [1700, 800, 62, 'cross', '#7FE0B4'], [1150, 200, 34, 'trif', '#ffffff'],
      [420, 520, 40, 'tri', '#7FE0B4'], [260, 330, 34, 'cross', '#DC7B2C'], [1120, 660, 30, 'tri', '#DC7B2C'], [1560, 200, 36, 'cross', '#7FE0B4']];
  const r = rng(23);
  spots.forEach(([x, y, sz, k, c], i) => {
    const e = add(bg, `<div class="shape a">${SHAPE_SVG[k](c)}</div>`);
    e.style.width = e.style.height = sz + 'px'; e.style.filter = `drop-shadow(0 0 6px ${c}) drop-shadow(0 0 14px ${c})`;
    place(e, x, y); shapes.push({ e, ph: r() * 6.28, rs: (r() - 0.5) * 18, r0: k === 'cross' ? 0 : r() * 360, op: 0.7 + r() * 0.25, d: i * 0.08 });
  });
}
const grain = add(root, `<canvas id="grain"></canvas>`);
{
  const gw = Math.round(W / 2) + 64, gh = Math.round(H / 2) + 64; grain.width = gw; grain.height = gh;
  grain.style.width = gw * 2 + 'px'; grain.style.height = gh * 2 + 'px';
  const g = grain.getContext('2d'), id = g.createImageData(gw, gh), r = rng(9);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
}

// ---------- stage
const stage = add(root, `<div id="stage" class="a" style="width:0;height:0"></div>`);
place(stage, L.stage.x, L.stage.y);
const phone = add(stage, `<div id="phone" class="a">
  <div class="sbtn l" style="top:160px;height:32px"></div><div class="sbtn l" style="top:226px;height:62px"></div><div class="sbtn l" style="top:302px;height:62px"></div><div class="sbtn r" style="top:258px;height:100px"></div>
  <div class="frame"></div><div class="bezel"></div>
  <div class="screen"><div class="island"></div><div class="reflect"></div><div class="homebar"></div></div>
</div>`);
const screen = $('.screen', phone), reflect = $('.reflect', phone), homebar = $('.homebar', phone);
const inScreen = html => { const e = mk(html); screen.insertBefore(e, $('.island', screen)); return e; };

// status bar
const sbar = inScreen(`<div class="sbar"><span>9:41</span><span class="ind"><span class="sig"><i style="height:4px"></i><i style="height:6.5px"></i><i style="height:9px"></i><i style="height:11.5px"></i></span>
  <svg class="wf" viewBox="0 0 17 13"><path d="M8.5 12.2 6.2 9.6a3.3 3.3 0 0 1 4.6 0z" fill="currentColor"/><path d="M3.9 7.3a6.6 6.6 0 0 1 9.2 0l-1.3 1.4a4.7 4.7 0 0 0-6.6 0z" fill="currentColor"/><path d="M1.6 5a9.9 9.9 0 0 1 13.8 0l-1.3 1.4a8 8 0 0 0-11.2 0z" fill="currentColor"/></svg>
  <span class="bat"><i></i></span></span></div>`);

// lock screen
const lock = inScreen(`<div class="lock">${ic('lock', 'ic lk')}<div class="day">لقاءات القصيم 26</div><div class="time">9:41</div>
  <img class="wlogo" src="${IMG}logo_event_dark.png">
  <div class="notif"><div class="appic">${ic('link')}</div><div class="nb"><div class="nt">لقاءات القصيم 26<span>الآن</span></div><div class="nx">رابط التسجيل جاهز، سجّل حضورك قبل اللقاء</div></div></div>
  <div class="fl" style="left:46px">${ic('smartphone')}</div><div class="fl" style="right:46px">${ic('search')}</div></div>`);
const notif = $('.notif', lock), lockTime = $('.time', lock), lockDay = $('.day', lock), wlogo = $('.wlogo', lock);

// safari + website
const PROGS = [['compass', 'الإرشاد المهني', 'اكتشف مسارك المهني', 't-blue'], ['briefcase', 'التوجيه الوظيفي', 'خطوتك الأولى لسوق العمل', 't-green'], ['trending-up', 'تطوير المسار المهني', 'طوّر مهاراتك وخططك', 't-orange'], ['users', 'لقاءات مع مختصين', 'استشارات وتوجيه', 't-blue']];
const EXPOS = [['معرض التوظيف', 't-green'], ['معرض التدريب والتأهيل', 't-orange'], ['معرض ريادة الأعمال', 't-blue']];
const COURSES = [['message-circle', 'مهارات التواصل', 't-blue'], ['presentation', 'التسويق الرقمي', 't-green'], ['clipboard-list', 'إدارة المشاريع', 't-orange']];
const FIELDS = [['الاسم الكامل', 'عبدالله محمد', 'rtl', 'alpha'], ['رقم الهوية الوطنية', '10••••••••', 'ltr', 'num'], ['رقم الجوال', '05••••••••', 'ltr', 'num']];
const BOOTHS = [[14, 14, 86, 56, 'c1'], [110, 14, 86, 56, ''], [206, 14, 70, 56, 'c3'], [286, 14, 58, 56, ''], [14, 84, 70, 86, ''], [94, 84, 110, 40, 'c2'], [94, 132, 110, 38, ''], [214, 84, 130, 86, 'c3']];
const PINS = [[57, 42, '#01AA6B'], [149, 104, '#DC7B2C'], [279, 127, '#005688']];
const safari = inScreen(`<div class="safari">
  <div class="page">
    <div class="site-hdr"><img src="${IMG}logo_event.png">${ic('menu')}</div>
    <img class="site-hero" src="${IMG}web_hero.jpg">
    <div class="sec" id="sec-form"><div class="sec-t">التسجيل في لقاءات القصيم 26</div><div class="sec-s">سجّل بياناتك إلكترونياً قبل الحضور</div>
      <div class="formbox"><div class="formin">
        ${FIELDS.map(([l, , d]) => `<div class="fld"><label>${l}</label><div class="in"><span class="v" dir="${d}"></span><span class="caret"></span></div></div>`).join('')}
        <div class="agree"><span class="cb">${ic('check')}</span>أوافق على الشروط والأحكام</div>
        <div class="wbtn"><span class="bt">تسجيل</span><span class="spin a" style="left:50%;top:50%"></span></div>
      </div>
      <div class="okbox"><svg class="ck" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#E3F6EE" stroke="#01AA6B" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" transform="rotate(-90 50 50)"/><path d="M31 52 L44 64 L70 38" fill="none" stroke="#01AA6B" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1"/></svg>
        <h4>تم تسجيلك بنجاح</h4><p>نشوفك في لقاءات القصيم 26</p>
        <div class="nopaper"><div class="pi">${ic('file-x-2')}</div><div><b>ما يحتاج تقديم أوراق</b><span>تسجيلك محفوظ إلكترونياً، احضر بجوالك فقط</span></div></div></div>
      </div></div>
    <div class="sec" id="sec-prog"><div class="sec-t">برامج الإرشاد</div><div class="sec-s">تعرّف على البرامج المتاحة لك</div>
      ${PROGS.map(([i, n, d, c]) => `<div class="wcard"><div class="wi ${c}">${ic(i)}</div><div class="wt">${n}<small>${d}</small></div>${ic('chevron-left', 'ic chev')}</div>`).join('')}</div>
    <div class="sec" id="sec-expo"><div class="sec-t">المعارض المصاحبة</div><div class="sec-s">زُر المعارض على هامش اللقاء</div>
      <div class="fmap">${BOOTHS.map(([x, y, w, h, c]) => `<div class="booth ${c}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`).join('')}
        <svg class="route" viewBox="0 0 357 190" style="position:absolute;inset:0;width:100%;height:100%"><path d="M178 176 L178 150 C178 128 60 140 57 100 L57 50" fill="none" stroke="#005688" stroke-width="3.5" stroke-dasharray="1 8" stroke-linecap="round"/></svg>
        ${PINS.map(([x, y, c]) => `<div class="pin a" style="left:${x}px;top:${y}px;transform:none"><svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" fill="${c}" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg></div>`).join('')}
        <div class="me a" style="left:178px;top:176px"></div></div>
      ${EXPOS.map(([n, c]) => `<div class="wcard"><div class="wi ${c}">${ic('map-pin')}</div><div class="wt">${n}<small>على هامش اللقاء</small></div>${ic('chevron-left', 'ic chev')}</div>`).join('')}</div>
    <div class="sec" id="sec-course"><div class="sec-t">الدورات</div><div class="sec-s">سجّل في الدورة المناسبة لك</div>
      <div class="chips"><span class="on">الكل</span><span>مهارات</span><span>تقنية</span><span>إدارة</span></div>
      ${COURSES.map(([i, n, c]) => `<div class="wcard"><div class="wi ${c}">${ic(i)}</div><div class="wt">${n}<small>دورة تدريبية</small></div><div class="rb"><span class="rbt">سجّل</span></div></div>`).join('')}</div>
    <div class="site-foot"><img src="${IMG}logo_hrdf.png"></div>
  </div>
  <div class="statusbg"></div>
  <div class="chrome"><div class="addr"><span class="aa">AA</span>${ic('lock', 'ic lk')}<span class="dom">${CONFIG.domain}</span>${ic('rotate-cw', 'ic rl')}<span class="prog"></span></div>
    <div class="tools">${ic('chevron-left')}${ic('chevron-right', 'ic off')}${ic('share')}${ic('book-open')}${ic('copy')}</div></div>
  <div class="kb"><div class="acc"><span class="arrows">${ic('chevron-up')}${ic('chevron-down')}</span><b>تم</b></div>
    <div class="rows alpha">
      <div class="row">${[...'ضصثقفغعهخحج'].map(c => `<div class="key" data-k="${c}">${c}</div>`).join('')}</div>
      <div class="row">${[...'شسيبلاتنمكط'].map(c => `<div class="key" data-k="${c}">${c}</div>`).join('')}</div>
      <div class="row">${[...'ذءؤرىةوزظد'].map(c => `<div class="key" data-k="${c}">${c}</div>`).join('')}<div class="key g" style="flex:1.4">${ic('delete')}</div></div>
      <div class="row ltr"><div class="key g" style="flex:1.3">123</div><div class="key" data-k=" " style="flex:5">مسافة</div><div class="key g" style="flex:2">التالي</div></div>
    </div>
    <div class="rows num np" style="display:none">
      ${[['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']].reduce((a, k, i) => { if (i % 3 === 0) a.push([]); a[a.length - 1].push(k); return a; }, [])
        .map(r => `<div class="row">${r.map(([d, l]) => `<div class="key" data-k="${d}">${d}<small>${l}</small></div>`).join('')}</div>`).join('')}
      <div class="row"><div class="key blank"></div><div class="key" data-k="0">0</div><div class="key blank">${ic('delete')}</div></div>
    </div>
    <div class="bot">${ic('globe')}${ic('mic')}</div></div>
  <div class="toast"><div class="ti">${ic('check')}</div><div>تم تسجيلك في الدورة<small>التسويق الرقمي</small></div></div>
  <div class="sheet"><div class="grab"></div><h4>جاهزيتك للقاء</h4><p>كل الخطوات مكتملة</p>
    ${['سجّلت إلكترونياً', 'بدون أوراق', 'تعرّفت على برامج الإرشاد', 'خطّطت لزيارة المعارض', 'سجّلت في الدورات'].map(s => `<div class="chk"><div class="ok">${ic('check')}</div>${s}</div>`).join('')}</div>
</div>`);
const page = $('.page', safari), chrome = $('.chrome', safari), addrProg = $('.prog', safari), kb = $('.kb', safari);
const kbAlpha = $('.alpha', kb), kbNum = $('.num', kb), toast = $('.toast', safari), sheet = $('.sheet', safari);
const fldIns = $$('.fld .in', safari), fldVals = $$('.fld .v', safari), fldCarets = $$('.fld .caret', safari);
const formin = $('.formin', safari), okbox = $('.okbox', safari), wbtn = $('.wbtn', safari), btText = $('.bt', wbtn), spin = $('.spin', wbtn);
const okCircle = $('.okbox circle', safari), okTick = $('.okbox path', safari), okCk = $('.okbox .ck', safari), nopaper = $('.nopaper', safari);
const progCards = $$('#sec-prog .wcard', safari), courseCards = $$('#sec-course .wcard', safari), courseBtns = $$('#sec-course .rb', safari);
const pins = $$('.pin', safari), meDot = $('.me', safari), route = $('.route', safari), sumChecks = $$('.chk', safari);
const keyOf = {}; $$('.key[data-k]', kb).forEach(k => { keyOf[k.dataset.k] = keyOf[k.dataset.k] || []; keyOf[k.dataset.k].push(k); });
const touch = inScreen(`<div class="touch a"></div>`);

// ---------- floating callouts around the phone (stage coords, phone = 437x893 centred)
const SX = x => x * L.sideK;
const bubble = (icon, color, check = false) => add(stage, `<div class="bubble a" style="color:${color}">${ic(icon)}${check ? `<div class="bc">${ic('check')}</div>` : ''}</div>`);
const SIDE = {
  b1: bubble('link', '#005688'),
  b3: bubble('users', '#01AA6B'),
  c3: add(stage, `<div class="callout card a"><div class="ci t-blue">${ic('compass')}</div><h4>الإرشاد المهني</h4><p>اكتشف مسارك المهني</p></div>`),
  b4a: bubble('store', '#DC7B2C'), b4b: bubble('map-pin', '#005688', true),
  b5a: bubble('graduation-cap', '#005688'), b5b: bubble('calendar-check', '#01AA6B'),
  ring: add(stage, `<div class="callout ringcard a"><div class="ring"><svg viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#005688"/><stop offset="1" stop-color="#01AA6B"/></linearGradient></defs>
      <circle cx="50" cy="50" r="42" fill="none" stroke="#E8EEF3" stroke-width="8"/><circle class="arc" cx="50" cy="50" r="42" fill="none" stroke="url(#rg)" stroke-width="8" stroke-linecap="round" pathLength="1" stroke-dasharray="1"/></svg>
      <div class="num">0%</div></div><div class="lbl">جاهزيتك</div></div>`),
  b6: bubble('award', '#DC7B2C'),
};
const ringArc = $('.arc', SIDE.ring), ringNum = $('.num', SIDE.ring);
$$('.bc', stage).forEach(b => { b.style.transform = 'scale(0)'; });
const PAPERS = [['صورة الهوية', -330, -300, -10, true], ['السيرة الذاتية', 330, -230, 9, false], ['نموذج الطلب', -335, 200, 7, false], ['الشهادات', 325, 260, -8, false]]
  .map(([n, x, y, r, photo]) => ({ e: add(stage, `<div class="paper a"><div class="ph"></div><h5>${n}</h5>${photo ? '<div class="photo"></div><div style="height:58px"></div>' : ''}<i></i><i style="width:80%"></i><i></i><i style="width:60%"></i>${photo ? '' : '<i></i><i style="width:70%"></i>'}<div class="stamp"></div>
    <svg class="x" viewBox="0 0 144 198"><path d="M16 18 L128 180" pathLength="1" stroke-dasharray="1"/><path d="M128 18 L16 180" pathLength="1" stroke-dasharray="1"/></svg></div>`), x: SX(x), y, r }));
PAPERS.forEach(p => { p.xs = [...p.e.querySelectorAll('svg.x path')]; });

// ---------- headlines
const HEADS = [
  { a: 0.7, b: S[0], chip: 0, html: '<small>ناوي تحضر</small><em>لقاءات القصيم؟</em>' },
  { a: S[0], b: S[1], chip: 1, html: 'سجّل <em>إلكترونياً</em><br>من الرابط' },
  { a: S[1], b: S[2], chip: 2, html: 'ما يحتاج<br><em>تقديم أوراق</em>' },
  { a: S[2], b: S[3], chip: 3, html: 'تعرّف على<br><em>برامج الإرشاد</em>' },
  { a: S[3], b: S[4], chip: 4, html: 'زُر <em>المعارض</em><br>المصاحبة' },
  { a: S[4], b: SUM, chip: 5, html: 'سجّل في <em>الدورات</em><br>المناسبة لك' },
  { a: SUM, b: END + 0.6, chip: 0, html: 'كل شي<br><em>جاهز!</em>' },
];
HEADS.forEach(h => {
  h.e = add(root, `<div class="head a" style="width:${L.head.w}px;text-align:${V ? 'center' : 'right'}">
    <div class="htxt" style="font-size:${L.head.fs}px">${h.html}</div></div>`);
  place(h.e, L.head.x, L.head.y); h.chipE = $('.chip', h.e); h.em = $$('em', h.e);
});

// ---------- numbered step timeline (numbers only)
const SL = L.steps;
const stl = add(root, `<div class="stl"></div>`);
const sdx = i => (SL.align === 'center' ? SL.x + (2 - i) * SL.gap : SL.x - SL.d / 2 - i * SL.gap);
const sline = add(stl, `<div class="sline" style="left:${sdx(4)}px;top:${SL.y - 1.5}px;width:${SL.gap * 4}px"><i></i></div>`);
const sfill = sline.firstElementChild;
const sdots = [1, 2, 3, 4, 5].map((n, i) => { const e = add(stl, `<div class="sdot a" style="--d:${SL.d}px"><span>${n}</span></div>`); place(e, sdx(i), SL.y); return e; });

// ---------- end card
const endcard = add(root, `<div id="endcard"><div id="endbg"></div></div>`);
const hero = add(endcard, `<img id="hero" class="a" src="${IMG}hero.png">`);
const tagline = add(endcard, `<img id="tagline" class="a" src="${IMG}tagline.png">`);
const cta = add(endcard, `<div id="cta" class="a">سجّل الآن</div>`);
const ctasub = add(endcard, `<div id="ctasub" class="a">${CONFIG.url || 'التسجيل إلكتروني • بدون أوراق'}</div>`);
if (CONFIG.url) ctasub.style.direction = 'ltr';
const endbg = $('#endbg', endcard);
if (V) {
  hero.style.width = '1180px'; place(hero, 540, 965); tagline.style.width = '560px'; place(tagline, 540, 395);
  place(cta, 540, 1430); place(ctasub, 540, 1535);
} else {
  hero.style.width = '1060px'; place(hero, 560, 590); tagline.style.width = '450px'; place(tagline, 1340, 420);
  place(cta, 1340, 740); place(ctasub, 1340, 835);
}
const vignette = add(root, `<div id="vignette"></div>`);

// ---------- measurements (screen-local, before any transforms)
const M = {};
function rel(el) { const a = el.getBoundingClientRect(), b = screen.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, top: a.top - b.top, h: a.height }; }
function measure() {
  M.fields = fldIns.map(rel); M.btn = rel(wbtn); M.ok = rel(okbox); M.nop = rel(nopaper);
  M.secProg = rel($('#sec-prog', safari)); M.secExpo = rel($('#sec-expo', safari)); M.secCourse = rel($('#sec-course', safari));
  M.prog0 = rel(progCards[0]); M.cbtn1 = rel(courseBtns[1]); M.pageH = page.getBoundingClientRect().height;
  M.accNext = rel($('.acc .arrows .ic:nth-child(2)', kb)); M.accDone = rel($('.acc b', kb)); M.notif = rel(notif);
  const kbTop = rel(kb).top;
  M.keyPos = {}; Object.entries(keyOf).forEach(([k, els]) => { M.keyPos[k] = els.map(rel); });
  M.kbTop = kbTop;
  kbNum.style.display = ''; kbAlpha.style.display = 'none';
  Object.entries(keyOf).forEach(([k, els]) => { if (/[0-9]/.test(k)) M.keyPos[k] = els.map(rel); });
  kbNum.style.display = 'none'; kbAlpha.style.display = '';
}

// ---------- scripted UI timeline (computed after measuring)
let SCROLLS = [], TYPE = [], TAPS = [];
function script() {
  const sMax = M.pageH - (852 - 116);
  const at = (y, off) => clamp(y - off, 0, sMax);
  SCROLLS = [ // [start, end, target]
    [3.5, 3.95, at(M.fields[0].top - 30, 134)],
    [6.6, 7.1, at(M.ok.top, 130)],
    [S[2] + 0.05, S[2] + 0.7, at(M.secProg.top, 64)],
    [S[3] + 0.05, S[3] + 0.7, at(M.secExpo.top, 64)],
    [S[4] + 0.05, S[4] + 0.7, at(M.secCourse.top, 64)],
  ];
  TYPE = [[3.9, 4.42], [4.62, 4.95], [5.12, 5.45]];   // per field typing windows
  TAPS = [
    { t: 2.55, p: () => M.notif },
    { t: 3.45, p: () => M.fields[0], page: true },
    { t: 4.52, p: () => M.accNext }, { t: 5.02, p: () => M.accNext }, { t: 5.55, p: () => M.accDone },
    { t: 6.0, p: () => M.btn, page: true },
    { t: S[2] + 1.1, p: () => M.prog0, page: true },
    { t: S[4] + 1.1, p: () => M.cbtn1, page: true },
  ];
}
function scrollAt(t) {
  let y = 0;
  for (const [a, b, target] of SCROLLS) { if (t >= a) y = lerp(y, target, E.io3(P(t, a, b))); }
  return y;
}

// ================================================================== RENDER
function render(t) {
  // ----- background motion
  bgbase.style.transform = `scale(${(1.04 + 0.025 * Math.sin(t * 0.22)).toFixed(4)}) translate(${(Math.sin(t * 0.17) * 8).toFixed(2)}px,${(Math.cos(t * 0.13) * 10).toFixed(2)}px)`;
  STREAKS.forEach((s, i) => { const k = ((t * 0.08 + s.ph * 0.1) % 1);
    T(s.e, { x: lerp(-260, 260, k) * 0.7, y: lerp(260, -260, k) * 0.7, r: -48, o: 0.35 * Math.sin(Math.PI * k) * E.o3(P(t, 0.4, 1.5)) }); });
  shapes.forEach(s => { const k = E.o3(P(t, 0.8 + s.d, 1.8 + s.d));
    T(s.e, { y: float(t, s.ph, 14, 0.7) + (1 - k) * 30, r: s.r0 + t * s.rs, o: s.op * k }); });

  // ----- phone
  const ent = P(t, 0.1, 1.4);
  const push = 1 + 0.015 * Math.sin(t * 0.5);
  const ex = E.io3(P(t, END - 0.4, END + 0.6));
  T(stage, { s: L.stage.s * push * (1 - 0.1 * ex), y: 150 * ex, o: 1 - E.i2(ex), b: 10 * ex });
  const ry = lerp(-28, 0, E.o3(ent)) + Math.sin(t * 0.45) * 5, rx = lerp(10, 0, E.o3(ent)) + Math.sin(t * 0.35 + 1) * 2.5;
  T(phone, { y: lerp(260, 0, E.o5(ent)) + float(t, 0, 7, 0.9), o: E.o3(P(t, 0.1, 0.5)), ry, rx, r: Math.sin(t * 0.3) * 0.6 });
  reflect.style.backgroundPosition = '0 0';
  reflect.style.transform = `translateX(${(-ry * 4).toFixed(1)}px)`;

  // ----- lock screen → safari
  const openK = E.io3(P(t, 2.65, 3.1));
  const lockOn = t < 3.15;
  lock.style.display = lockOn ? '' : 'none';
  lock.style.transform = `scale(${1 + 0.08 * openK})`; lock.style.filter = openK > 0 ? `blur(${openK * 8}px)` : '';
  { const nk = P(t, 1.45, 1.95); notif.style.opacity = E.o3(Math.min(1, nk * 2));
    notif.style.transform = `translateY(${(1 - E.back(nk)) * 120}px) scale(${lerp(0.9, 1, E.o3(nk)) * (t > 2.55 && t < 2.68 ? 0.97 : 1)})`;
    const wk = E.o3(P(t, 0.5, 1.2)); wlogo.style.opacity = 0.95 * wk; lockTime.style.opacity = wk; lockDay.style.opacity = wk; }
  safari.style.display = t >= 2.65 ? '' : 'none';
  { const ny = M.notif ? M.notif.y : 700;
    safari.style.transformOrigin = `50% ${ny}px`;
    safari.style.transform = `scale(${lerp(0.25, 1, openK)})`; safari.style.borderRadius = `${lerp(30, 55, openK)}px`; safari.style.opacity = E.o3(P(t, 2.65, 2.85)); }
  const dark = t >= 2.95;
  sbar.style.color = dark ? '#000' : '#fff'; homebar.style.background = dark ? '#111' : '#fff';
  addrProg.style.width = (E.o3(P(t, 3.0, 3.45)) * 100) + '%'; addrProg.style.opacity = 1 - P(t, 3.45, 3.6);

  // ----- page scroll + keyboard
  const scroll = scrollAt(t);
  page.style.transform = `translateY(${(-scroll).toFixed(2)}px)`;
  const kbUp = E.o3(P(t, 3.48, 3.78)) * (1 - E.io3(P(t, 5.6, 5.88)));
  kb.style.transform = `translateY(${((1 - kbUp) * 340).toFixed(1)}px)`; kb.style.display = kbUp > 0.001 ? '' : 'none';
  chrome.style.transform = `translateY(${(kbUp * 120).toFixed(1)}px)`;
  const numMode = t >= 4.55; kbAlpha.style.display = numMode ? 'none' : ''; kbNum.style.display = numMode ? '' : 'none';
  $$('.key.on', kb).forEach(k => k.classList.remove('on'));
  FIELDS.forEach(([, val], i) => {
    const [a, b] = TYPE[i]; const chars = [...val]; const n = Math.round(P(t, a, b) * chars.length);
    fldVals[i].textContent = chars.slice(0, n).join('');
    const focusA = i === 0 ? 3.45 : i === 1 ? 4.52 : 5.02, focusB = i === 0 ? 4.52 : i === 1 ? 5.02 : 5.55;
    const focus = t >= focusA && t < focusB;
    fldIns[i].classList.toggle('focus', focus);
    fldCarets[i].style.opacity = focus && (Math.floor(t * 3) % 2 === 0 || (t > a && t < b)) ? 1 : 0;
    if (t > a && t < b + 0.06) { // key highlight for the char just typed
      const idx = Math.min(chars.length - 1, Math.floor(P(t, a, b) * chars.length - 1e-6)); const ch = chars[idx] === '•' ? String((idx * 7) % 10) : chars[idx];
      (keyOf[ch] || []).forEach(k => k.classList.add('on'));
    }
  });
  // submit → spinner → success
  { const pr = P(t, 6.0, 6.1), rl = P(t, 6.1, 6.22); wbtn.style.transform = `scale(${1 - 0.04 * E.o3(pr) + 0.04 * E.o3(rl)})`;
    const sp = t >= 6.05 && t < 6.35; btText.style.opacity = sp ? 0 : 1; spin.style.display = sp ? '' : 'none';
    spin.style.transform = `translate(-50%,-50%) rotate(${t * 720}deg)`;
    const ok = E.o3(P(t, 6.3, 6.55)); formin.style.opacity = 1 - ok; okbox.style.opacity = ok; okbox.style.display = ok > 0 ? '' : 'none';
    okCircle.style.strokeDashoffset = 1 - E.io3(P(t, 6.35, 6.8)); okTick.style.strokeDashoffset = 1 - E.o3(P(t, 6.6, 6.9));
    okCk.style.transform = `scale(${lerp(0.6, 1, E.back(P(t, 6.3, 6.7)))})`;
    const glow = Math.sin(Math.PI * P(t, 8.15, 8.75));
    nopaper.style.transform = `scale(${1 + 0.05 * glow})`; nopaper.style.boxShadow = `0 0 0 ${6 * glow}px rgba(220,123,44,.22)`; }
  // programs
  progCards.forEach((c, j) => c.classList.toggle('hl', j === 0 && t >= S[2] + 1.12));
  // expo: pins drop + route
  pins.forEach((p, j) => { const a = S[3] + 0.75 + j * 0.2; const kk = P(t, a, a + 0.45); p.style.opacity = kk > 0 ? 1 : 0;
    p.style.transform = `translateY(${((1 - E.bounce(kk)) * -90).toFixed(1)}px)`; });
  { const pulse = (t * 1.1) % 1; meDot.style.boxShadow = `0 0 0 1px rgba(0,0,0,.1),0 0 0 ${4 + pulse * 14}px rgba(0,122,255,${0.3 * (1 - pulse)})`;
    route.style.clipPath = `inset(${((1 - E.io3(P(t, S[3] + 1.4, S[3] + 2.0))) * 100).toFixed(1)}% 0 0 0)`; }
  // courses
  courseBtns.forEach((b, j) => { const on = j === 1 && t >= S[4] + 1.12; b.classList.toggle('on', on);
    $('.rbt', b).innerHTML = on ? `${ic('check')}` : 'سجّل'; if (on) $('.rbt', b).insertAdjacentText('beforeend', 'تم التسجيل');
    b.style.transform = `scale(${j === 1 && t > S[4] + 1.1 && t < S[4] + 1.2 ? 0.94 : 1})`; });
  { const tk = E.back(P(t, S[4] + 1.25, S[4] + 1.6)), tu = E.io3(P(t, S[4] + 2.5, S[4] + 2.8));
    toast.style.transform = `translateY(${((1 - tk) * -130 - tu * 130).toFixed(1)}px)`; toast.style.display = t > S[4] + 1.25 && t < S[4] + 2.85 ? '' : 'none'; }
  // summary sheet
  { const sk = E.o3(P(t, SUM + 0.05, SUM + 0.5)); sheet.style.transform = `translateY(${((1 - sk) * 580).toFixed(1)}px)`; sheet.style.display = sk > 0 ? '' : 'none';
    sumChecks.forEach((c, j) => { const a = SUM + 0.55 + j * 0.125; c.classList.toggle('done', t >= a);
      $('.ok', c).style.transform = `scale(${t >= a ? lerp(0.6, 1, E.back(P(t, a, a + 0.25))) : 1})`; }); }

  // ----- touch indicator (iOS "show touches")
  let tp = null; for (const tap of TAPS) if (t > tap.t - 0.1 && t < tap.t + 0.32) tp = tap;
  if (tp) { const p = tp.p(); const y = tp.page ? p.y - scrollAt(tp.t) : p.y; const k = P(t, tp.t - 0.1, tp.t + 0.32);
    T(touch, { x: p.x, y, s: lerp(1.15, 0.9, E.o3(P(t, tp.t - 0.1, tp.t + 0.05))) * (1 + 0.3 * P(t, tp.t + 0.12, tp.t + 0.32)), o: Math.min(1, k * 5) * (1 - E.i2(P(t, tp.t + 0.12, tp.t + 0.32))) });
  } else T(touch, { o: 0 });

  // ----- side callouts
  const side = (e, a, b, x, y, ph, dx = 0) => { const v = env(t, a, b); T(e, { x: SX(x) + dx * (1 - v.k), y: y + float(t, ph, 8, 1.1), s: v.s, o: v.o }); return v; };
  side(SIDE.b1, S[0] + 0.3, S[1] + 0.05, -330, -300, 0.3, 120);
  side(SIDE.b3, S[2] + 0.5, S[3] + 0.05, 330, -290, 0.7, -120);
  side(SIDE.c3, S[2] + 1.25, S[3] + 0.05, -300, 170, 1.9, 220);
  side(SIDE.b4a, S[3] + 0.4, S[4] + 0.05, 330, -280, 0.2, -120);
  side(SIDE.b4b, S[3] + 0.7, S[4] + 0.05, -330, 230, 1.5, 120);
  $('.bc', SIDE.b4b).style.transform = `scale(${E.back(P(t, DONE[3] - 0.15, DONE[3] + 0.15))})`;
  side(SIDE.b5a, S[4] + 0.4, SUM + 0.05, -330, -290, 0.4, 120);
  side(SIDE.b5b, S[4] + 0.7, SUM + 0.05, 330, 230, 2.4, -120);
  side(SIDE.ring, SUM + 0.2, END + 0.6, -290, -110, 0.9, 180);
  side(SIDE.b6, SUM + 1.3, END + 0.6, 330, -260, 2.2, -120);
  { const rk = E.io3(P(t, SUM + 0.35, SUM + 1.25)); ringArc.style.strokeDashoffset = 1 - rk; ringNum.textContent = Math.round(rk * 100) + '%'; }
  // papers: float around, get crossed out (X), then fly away — no papers needed
  PAPERS.forEach((p, j) => {
    const v = env(t, S[1] + 0.15 + j * 0.1, 99, 0.5);
    const xa = S[1] + 0.8 + j * 0.09;
    p.xs.forEach((path, q) => { path.style.strokeDashoffset = 1 - E.o3(P(t, xa + q * 0.13, xa + q * 0.13 + 0.17)); });
    const hp = P(t, xa + 0.13, xa + 0.45), hit = Math.sin(Math.PI * hp) * Math.exp(-hp * 2);
    const fly = E.i3(P(t, S[1] + 1.45 + j * 0.06, S[1] + 2.05 + j * 0.06));
    const dir = Math.atan2(p.y, p.x), fd = fly * 950;
    T(p.e, { x: p.x + float(t, j, 6, 1.2) + Math.cos(dir) * fd, y: p.y + float(t, j + 2, 10, 1.0) + Math.sin(dir) * fd,
      r: p.r + (1 - v.k) * 16 + hit * 6 * (j % 2 ? 1 : -1) + fly * (j % 2 ? 55 : -55), s: v.s * (1 + 0.06 * hit) * lerp(1, 0.8, fly),
      o: (fly >= 1 ? 0 : v.o) * (1 - E.i3(P(fly, 0.55, 1))), b: fly * 5 });
  });

  // ----- headlines
  HEADS.forEach(h => {
    const i0 = P(t, h.a, h.a + 0.55), u = P(t, h.b - 0.3, h.b);
    T(h.e, { o: E.o3(i0) * (1 - E.io3(u)), y: lerp(44, 0, E.o3(i0)) - 36 * E.io3(u), b: (1 - E.o3(i0)) * 14 + u * 10 });
    h.em.forEach(em => em.style.setProperty('--m', E.io3(P(t, h.a + 0.35, h.a + 0.8)).toFixed(3)));
  });

  // ----- numbered step timeline
  { const k = E.o3(P(t, S[0] - 0.3, S[0] + 0.35)) * (1 - E.io3(P(t, END - 0.35, END + 0.35)));
    stl.style.opacity = k; stl.style.display = k > 0 ? '' : 'none'; stl.style.transform = `translateY(${((1 - k) * -24).toFixed(1)}px)`;
    let prog = 0; DONE.slice(0, 4).forEach(d => { prog += E.io3(P(t, d - 0.1, d + 0.4)); });
    sfill.style.transform = `scaleX(${(prog / 4).toFixed(4)})`;
    sdots.forEach((e, i) => {
      const act = E.o3(P(t, S[i] - 0.1, S[i] + 0.25)) * (1 - E.o3(P(t, STEP_END[i] - 0.1, STEP_END[i] + 0.2)));
      const done = P(t, DONE[i], DONE[i] + 0.3);
      T(e, { s: 1 + 0.22 * act + 0.1 * Math.sin(Math.PI * done) });
      const st = done > 0.5 ? 'done' : act > 0.5 ? 'act' : '';
      if (e.dataset.st !== st) { e.dataset.st = st; e.className = 'sdot a' + (st ? ' ' + st : ''); }
    });
  }

  // ----- end card (soft cross-fade, no hard wipe)
  { const k = E.io3(P(t, END - 0.2, END + 0.9));
    endcard.style.display = k > 0 ? '' : 'none';
    endcard.style.opacity = k;
    endbg.style.transform = `scale(${lerp(1.08, 1, k).toFixed(4)})`;
    vignette.style.opacity = 1 - 0.6 * k;
    const hk = E.o3(P(t, END + 0.1, END + 1.35));
    T(hero, { o: hk, s: lerp(1.06, 1, hk) * (1 + Math.max(0, t - END) * 0.005), y: (1 - hk) * 90 });
    const tk = E.o3(P(t, END + 0.45, END + 1.35));
    T(tagline, { o: tk, y: (1 - tk) * 34, s: lerp(1.06, 1, tk), b: (1 - tk) * 12 });
    const ck = P(t, END + 1.15, END + 1.7), pulse = t > END + 2.1 ? Math.max(0, Math.sin((t - END - 2.1) * 3.2)) : 0;
    T(cta, { o: E.o3(Math.min(1, ck * 2)), y: (1 - E.o3(ck)) * 40, s: lerp(0.9, 1, E.back(ck)) * (1 + 0.015 * pulse) });
    cta.style.boxShadow = `0 18px 40px rgba(0,50,40,.28),0 0 ${16 + 24 * pulse}px rgba(1,170,107,${0.3 + 0.25 * pulse})`;
    const sk = E.o3(P(t, END + 1.5, END + 2.0)); T(ctasub, { o: sk, y: (1 - sk) * 20 });
  }
}

// ---------- sound cues
function buildCues() {
  cue(0.12, 'rise');
  HEADS.forEach((h, i) => cue(h.a - 0.04, 'whoosh', i === 0 ? 0.7 : 1));
  cue(1.5, 'notif');
  cue(2.7, 'open');
  TAPS.forEach(tp => cue(tp.t, 'tap'));
  cue(3.5, 'kb', 0.6); cue(5.6, 'kb', 0.5);
  FIELDS.forEach(([, v], i) => { const [a, b] = TYPE[i], n = [...v].length; for (let c = 0; c < n; c++) cue(a + (c / n) * (b - a), 'key', 0.6); });
  cue(6.32, 'success');
  DONE.forEach(d => cue(d, 'check'));
  SCROLLS.slice(2).forEach(([a]) => cue(a, 'scroll', 0.5));
  [S[0] + 0.3, S[2] + 0.5, S[2] + 1.25, S[3] + 0.4, S[3] + 0.7, S[4] + 0.4, S[4] + 0.7, SUM + 0.2, SUM + 1.3].forEach(a => cue(a, 'pop', 0.7));
  PAPERS.forEach((_, j) => cue(S[1] + 0.15 + j * 0.1, 'paper', 0.7));
  PAPERS.forEach((_, j) => cue(S[1] + 0.8 + j * 0.09, 'scratch', 0.55));
  cue(S[1] + 1.45, 'swoosh'); cue(S[1] + 1.8, 'sparkle', 0.7);
  PINS.forEach((_, j) => cue(S[3] + 0.75 + j * 0.2 + 0.2, 'drop', 0.9));
  cue(S[4] + 1.25, 'toast', 0.8); cue(SUM + 0.05, 'swoosh', 0.5);
  [0, 1, 2, 3, 4].forEach(j => cue(SUM + 0.55 + j * 0.125, 'blip', 0.8 + j * 0.05));
  cue(SUM + 1.25, 'sparkle');
  cue(END - 1.0, 'riser', 0.55); cue(END, 'impact', 0.45);
  cue(END + 1.15, 'pop', 0.9); cue(END + 0.45, 'whoosh', 0.5);
}

// ---------- public API
window.COMP = { W, H, FPS, DUR, FMT, frames: Math.round(DUR * FPS), CUES, MARKS: { steps: S, sum: SUM, end: END, dur: DUR } };
window.renderFrame = f => render(f / FPS);
window.renderTime = t => render(t);
window.compReady = (async () => {
  await document.fonts.load('700 20px "SST Arabic"'); await document.fonts.load('400 20px "SST Arabic"');
  await document.fonts.ready;
  await Promise.all([...document.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
  measure(); script(); buildCues(); render(+Q.get('t') || 0);
  return true;
})();
})();
