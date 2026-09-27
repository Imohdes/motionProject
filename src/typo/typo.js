/* Graduate Development — 10 s Arabic kinetic-typography brand intro (9:16).
 * One continuous right-to-left journey: a blue-green light line travels leftward through dark
 * space, revealing each phrase as it passes; the camera tracks it; all paths converge on the hero line.
 * Arabic is shaped by the browser's text engine (canvas fillText, direction = 'rtl'): joined letters,
 * correct shadda, never reversed. Everything is a pure function of t: FILM.renderFrame(t). */
(() => {
'use strict';

const W = 1080, H = 1920, FPS = 30, DURATION = 10;
const CY = 860;              // screen y of the type's centre line
const F = 1100;              // focal length (perspective)
const FLOOR = 250;           // world y of the reflective floor (below type centre)
const BLUE = [0, 86, 136], GREEN = [0, 170, 94], ORANGE = [220, 123, 44];
const CYAN = [60, 190, 230], MINT = [70, 230, 170];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------- utils
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (t, a, b) => clamp((t - a) / (b - a));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const TAU = Math.PI * 2;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function spline(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return t => {
    if (t <= xs[0]) return ys[0]; if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}
function sprite(r, col, core = .9) {
  const c = mk(r * 2, r * 2), g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, rgba(col, core)); gr.addColorStop(.25, rgba(col, core * .45)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
}

// ---------------------------------------------------------------- journey: stations laid out right → left
const GAP = 1150;
const STAGES = [
  { lines: ['رحلتك تبدأ هنا'], size: 200, maxW: 860, x: 0 },
  { lines: ['تعلّم'], size: 300, maxW: 860, x: -GAP },
  { lines: ['طوّر مهاراتك'], size: 205, maxW: 860, x: -GAP * 2 },
  { lines: ['اكتسب الخبرة'], size: 205, maxW: 860, x: -GAP * 3 },
  { lines: ['وانطلق', 'لمستقبلك'], size: 250, maxW: 760, x: -GAP * 4, hero: true },
];
// the light line's head (world x) — slow across each phrase (revealing it), quicker between them
let headX = () => 0;
function buildTimeline() {
  const S = STAGES;
  headX = spline([[0, S[0].x + S[0].half + 330], [.5, S[0].x + S[0].half], [1.55, S[0].x - S[0].half],
    [2.05, S[1].x + S[1].half], [2.65, S[1].x - S[1].half], [3.95, S[2].x + S[2].half], [4.75, S[2].x - S[2].half],
    [5.95, S[3].x + S[3].half], [6.75, S[3].x - S[3].half], [8.15, S[4].x - 30], [10, S[4].x - 45]]);
}
// camera tracks the head with a lag, and settles on each phrase
const camX = spline([[0, 80], [1.6, -20], [2.55, -GAP + 10], [3.5, -GAP - 40], [4.65, -GAP * 2 + 10], [5.5, -GAP * 2 - 40],
  [6.65, -GAP * 3 + 10], [7.5, -GAP * 3 - 40], [8.45, -GAP * 4], [10, -GAP * 4]]);
const camZ = t => 120 * easeInOut(range(t, 8.2, 10));            // slow final push-in
const camY = t => 18 * Math.sin(t * .6);                           // gentle float
const exposure = t => smooth(range(t, 5.6, 7.9)) * .85 + smooth(range(t, 8.2, 9.2)) * .25;

// reveal = head crossing the phrase (right edge → left edge); exit = dissolve during the next leg
function revealP(i, t) {
  const s = STAGES[i];
  if (s.hero) return easeInOut(range(t, 8.4, 9.25));
  return clamp((s.x + s.half - headX(t)) / (2 * s.half));
}
// a phrase dissolves (right → left) while the light travels on to the next one; they overlap
function exitP(i, t) {
  const s = STAGES[i], n = STAGES[i + 1];
  if (s.hero) return 0;
  if (n.hero) return easeInOut(range(t, 7.6, 8.35));
  const a = s.x - s.half - 120, b = n.x + n.half * .2;
  return easeInOut((a - headX(t)) / (a - b));
}

function project(x, y, z, cam) {
  const k = F / (F + z - cam.z);
  return { x: W / 2 + (x - cam.x) * k, y: CY + (y - cam.y) * k, k };
}

// ---------------------------------------------------------------- type sprites: extruded face, glow
const FONT = 'Cairo';
function buildType(st) {
  const m = mk(10, 10).getContext('2d');
  m.font = `900 ${st.size}px ${FONT}`; m.direction = 'rtl';
  let widths = st.lines.map(l => m.measureText(l).width);
  const fit = Math.min(1, st.maxW / Math.max(...widths));   // fit the frame width
  st.size = Math.floor(st.size * fit); widths = widths.map(w => w * fit);
  const lh = st.size * (st.lines.length > 1 ? 1.2 : 1.18);
  const tw = Math.max(...widths), pad = 90, ext = 16;
  const w = tw + pad * 2 + ext, h = lh * st.lines.length + pad * 2 + ext;
  const draw = (c, fill, dx = 0, dy = 0) => {
    c.font = `900 ${st.size}px ${FONT}`; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = fill;
    st.lines.forEach((l, i) => c.fillText(l, w / 2 + dx, pad + lh * (i + .5) + dy));
  };
  // extrusion (depth) — deep blue body, darker further back
  const body = mk(w, h), b = body.getContext('2d');
  for (let k = ext; k >= 1; k--) draw(b, rgba(mixc([1, 22, 40], [0, 70, 112], 1 - k / ext), 1), k * .55, k * .85);
  // face — cool white with a blue-green falloff
  const face = mk(w, h), f = face.getContext('2d');
  const g = f.createLinearGradient(0, pad, 0, h - pad);
  g.addColorStop(0, '#ffffff'); g.addColorStop(.55, '#e4f3ff'); g.addColorStop(1, '#9fd8f0');
  draw(f, g);
  // top-edge bevel light
  const bev = mk(w, h), bv = bev.getContext('2d');
  draw(bv, '#fff'); bv.globalCompositeOperation = 'destination-out'; draw(bv, '#000', 0, 2.2);
  const glow = mk(w, h), gl = glow.getContext('2d');
  gl.filter = 'blur(22px)'; draw(gl, rgba(mixc(CYAN, MINT, .4), .9));
  const solid = mk(w, h), so = solid.getContext('2d');
  so.drawImage(body, 0, 0); so.drawImage(face, 0, 0);
  so.globalAlpha = .9; so.drawImage(bev, 0, 0);
  st.w = w; st.h = h; st.pad = pad; st.half = tw / 2;
  st.solid = solid; st.face = face; st.glow = glow;
  st.tmp = mk(w, h); st.tmp2 = mk(w, h);
}

// compose a phrase into st.tmp: reveal mask travelling right → left, exit continuing leftward, light sweep
function composeType(st, rv, ex, sweep) {
  const c = st.tmp.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
  c.clearRect(0, 0, st.w, st.h);
  c.drawImage(st.solid, 0, 0);
  // light sweep across the face
  if (sweep > 0 && sweep < 1) {
    const sx = lerp(st.w + 200, -200, sweep);
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(sx - 160, 0, sx + 160, 0);
    g.addColorStop(0, 'rgba(160,255,220,0)'); g.addColorStop(.5, 'rgba(235,255,250,.85)'); g.addColorStop(1, 'rgba(160,230,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, st.w, st.h);
  }
  // mask: visible between the exit edge and the reveal edge (both travel right → left)
  const soft = 110, span = st.w;
  const inE = lerp(span + soft, -soft, rv), outE = lerp(span + soft, -soft, ex);
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, span, 0), st_ = (x, a) => g.addColorStop(clamp(x / span), `rgba(0,0,0,${a})`);
  // build piecewise: 0 left of inE-soft? no — revealed part is RIGHT of inE; hidden part is RIGHT of outE
  const pts = [];
  const vis = x => clamp((x - (inE - soft / 2)) / soft) * clamp(((outE + soft / 2) - x) / soft);
  for (let i = 0; i <= 48; i++) { const x = span * i / 48; pts.push([x, vis(x)]); }
  pts.forEach(([x, a]) => st_(x, a));
  c.fillStyle = g; c.fillRect(0, 0, st.w, st.h);
  c.globalCompositeOperation = 'source-over';
  return { inE, outE };
}

// ---------------------------------------------------------------- environment
const R = rng(7);
const PANES = [];
for (let i = 0; i < 26; i++) {
  const z = i % 5 === 0 ? -380 + R() * 200 : 250 + R() * 1500;
  PANES.push({ x: 900 - i * 230 - R() * 120, y: -120 + R() * 240, z, w: 150 + R() * 280, h: 900 + R() * 900, skew: (R() - .5) * .5, tint: R() });
}
const PARTS = [];
for (let i = 0; i < 340; i++) {
  const r = R();
  PARTS.push({ x: 900 - R() * 6300, y: -900 + R() * 1500, z: -350 + R() * 2200, s: .6 + R() * 1.6, ph: R() * TAU, sp: .3 + R(),
    col: r < .06 ? ORANGE : r < .62 ? GREEN : CYAN });
}
const STREAKS = [];
for (let i = 0; i < 18; i++) STREAKS.push({ y: -700 + R() * 1250, z: 200 + R() * 1400, x: R() * 7000, v: 350 + R() * 700, len: 180 + R() * 520, col: R() < .5 ? GREEN : CYAN, a: .25 + R() * .35 });
const SPR = { g: sprite(32, [40, 220, 140]), c: sprite(32, [80, 200, 245]), o: sprite(32, [240, 150, 70]), w: sprite(64, [220, 245, 255]) };
const sprFor = col => col === ORANGE ? SPR.o : col === GREEN ? SPR.g : SPR.c;

function drawBackground(c, t, cam, e) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(mixc([1, 5, 12], [2, 16, 32], e), 1));
  g.addColorStop(.42, rgba(mixc([2, 18, 34], [4, 44, 78], e), 1));
  g.addColorStop(.62, rgba(mixc([3, 30, 54], [6, 70, 118], e), 1));
  g.addColorStop(1, rgba(mixc([1, 6, 12], [2, 16, 30], e), 1));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // horizon haze behind the type
  const hz = project(0, FLOOR, 2400, cam).y;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.globalAlpha = .55 + .45 * e; c.drawImage(SPR.c, -300, hz - 380, W + 600, 760);
  c.globalAlpha = .18 + .2 * e; c.drawImage(SPR.g, 100, hz - 200, W - 200, 400);
  // volumetric beams from above, slight parallax
  for (let i = 0; i < 5; i++) {
    const bx = (i * 300 - 150 + (-cam.x * .04)) % 1500 - 200;
    const a = (.05 + .035 * Math.sin(t * .7 + i * 1.9)) * (1 + 1.3 * e);
    const bg = c.createLinearGradient(bx, 0, bx + 260, H * .75);
    bg.addColorStop(0, rgba(i % 2 ? CYAN : BLUE, a * 1.6)); bg.addColorStop(1, rgba(BLUE, 0));
    c.fillStyle = bg; c.beginPath();
    c.moveTo(bx, -40); c.lineTo(bx + 90, -40); c.lineTo(bx + 460, H * .8); c.lineTo(bx + 120, H * .8); c.closePath(); c.fill();
  }
  c.restore();
}

function drawFloor(c, t, cam, e) {
  const hy = project(0, FLOOR, 4000, cam).y;
  c.save();
  const fg = c.createLinearGradient(0, hy, 0, H);
  fg.addColorStop(0, rgba([4, 40, 70], .0)); fg.addColorStop(.05, rgba([3, 30, 54], .55 + .2 * e)); fg.addColorStop(1, 'rgba(0,4,9,.96)');
  c.fillStyle = fg; c.fillRect(0, hy, W, H - hy);
  c.globalCompositeOperation = 'lighter';
  const lg = c.createLinearGradient(0, 0, W, 0);
  lg.addColorStop(0, rgba(CYAN, 0)); lg.addColorStop(.5, rgba(CYAN, .35 + .3 * e)); lg.addColorStop(1, rgba(CYAN, 0));
  c.fillStyle = lg; c.fillRect(0, hy - 1, W, 2);
  // receding floor lines (glass floor seams)
  c.strokeStyle = rgba(CYAN, .07 + .05 * e); c.lineWidth = 1;
  for (let i = -30; i <= 30; i++) {
    const wx = Math.round(cam.x / 260) * 260 + i * 260;
    const a = project(wx, FLOOR, -200, cam), b = project(wx, FLOOR, 4000, cam);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  c.restore();
}

function drawPanes(c, t, cam, e, near) {
  for (const p of PANES) {
    if ((p.z < 0) !== near) continue;
    if (near && Math.abs(p.x - camX(9)) < 500 && t > 7.8) continue;   // keep the hero line clear
    const pr = project(p.x, p.y, p.z, cam);
    if (pr.k <= 0) continue;
    const w = p.w * pr.k, h = p.h * pr.k;
    if (pr.x + w < -200 || pr.x - w > W + 200) continue;
    c.save();
    if (near) c.filter = 'blur(7px)';
    c.translate(pr.x, pr.y);
    const sk = p.skew * h * .12;
    c.beginPath();
    c.moveTo(-w / 2, -h / 2 + sk); c.lineTo(w / 2, -h / 2 - sk); c.lineTo(w / 2, h / 2 - sk * .4); c.lineTo(-w / 2, h / 2 + sk * .4); c.closePath();
    const col = mixc(CYAN, MINT, p.tint * .6);
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    const a = (near ? .09 : .05) * (1 + .6 * e);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(.5, rgba(col, a * .25)); g.addColorStop(1, rgba(BLUE, a * .8));
    c.fillStyle = g; c.fill();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = rgba(col, (near ? .35 : .22) * (1 + .5 * e)); c.lineWidth = near ? 3 : 1.4; c.stroke();
    // diagonal specular band that slides as the camera moves
    const off = ((p.x - cam.x) * .25) % (w * 2);
    c.clip();
    const sg = c.createLinearGradient(off - w, -h / 2, off, h / 2);
    sg.addColorStop(0, rgba(col, 0)); sg.addColorStop(.5, rgba([220, 245, 255], near ? .14 : .08)); sg.addColorStop(1, rgba(col, 0));
    c.fillStyle = sg; c.fillRect(-w, -h, w * 2, h * 2);
    c.restore();
  }
}

function drawParticles(c, t, cam, e, near) {
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const p of PARTS) {
    if ((p.z < 60) !== near) continue;
    const y = p.y + Math.sin(t * p.sp + p.ph) * 26 - t * 14 * p.sp;
    const x = p.x + Math.cos(t * p.sp * .7 + p.ph) * 18;
    const pr = project(x, y, p.z, cam);
    if (pr.k <= 0 || pr.x < -80 || pr.x > W + 80 || pr.y < -80 || pr.y > H + 80) continue;
    const dof = Math.min(4, Math.abs(p.z - 120) / 380);          // out-of-focus = larger, dimmer
    const r = (3 + dof * 7) * p.s * pr.k;
    c.globalAlpha = clamp((.9 - dof * .17) * (.55 + .45 * Math.sin(t * 2 * p.sp + p.ph)) * (p.col === ORANGE ? .8 : 1));
    c.drawImage(sprFor(p.col), pr.x - r, pr.y - r, r * 2, r * 2);
  }
  c.restore();
}

function drawStreaks(c, t, cam, e) {
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const s of STREAKS) {
    // streaks travel right → left in world, faster than the camera
    const wx = cam.x + 1800 - ((s.x + t * s.v) % 4200);
    const a = project(wx, s.y, s.z, cam), b = project(wx + s.len, s.y, s.z, cam);
    const g = c.createLinearGradient(a.x, 0, b.x, 0);
    g.addColorStop(0, rgba([230, 250, 255], s.a * (1 + .5 * e))); g.addColorStop(.15, rgba(s.col, s.a * .8)); g.addColorStop(1, rgba(s.col, 0));
    c.strokeStyle = g; c.lineWidth = Math.max(1, 2.2 * a.k);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- the light path (connects every stage)
const PATH_Y = 150;
const pathY = x => PATH_Y + Math.sin(x * .0042) * 34;
const pathZ = x => 40 + 120 * Math.pow(Math.sin(x / GAP * Math.PI), 2);
function drawPath(c, t, cam, e) {
  const hx = headX(t);
  if (t < .12) return;
  const x0 = Math.max(hx, cam.x - 1400), x1 = Math.min(1200, cam.x + 1600);
  if (x1 <= x0) return;
  const pts = [];
  for (let x = x1; x >= x0; x -= 12) pts.push(project(x, pathY(x), pathZ(x), cam));
  pts.push(project(hx, pathY(hx), pathZ(hx), cam));
  const head = pts[pts.length - 1];
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  const trail = c.createLinearGradient(head.x + 1100, 0, head.x, 0);
  trail.addColorStop(0, rgba(BLUE, .25)); trail.addColorStop(.7, rgba(CYAN, .55)); trail.addColorStop(1, rgba(MINT, .95));
  for (const [lw, a, blur] of [[14, .22, 8], [5, .5, 2], [1.8, 1, 0]]) {
    c.filter = blur ? `blur(${blur}px)` : 'none';
    c.globalAlpha = a; c.strokeStyle = trail; c.lineWidth = lw * head.k;
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  }
  c.filter = 'none'; c.globalAlpha = 1;
  // head: bright core, anamorphic flare, a hint of orange at the spark
  if (t < 8.6) {
    const k = 1 - smooth(range(t, 8.1, 8.6));
    c.globalAlpha = k; c.drawImage(SPR.w, head.x - 60, head.y - 60, 120, 120);
    c.globalAlpha = .8 * k; c.drawImage(SPR.g, head.x - 110, head.y - 110, 220, 220);
    c.globalAlpha = .35 * k; c.drawImage(SPR.o, head.x - 26, head.y - 26, 52, 52);
    const fl = c.createLinearGradient(head.x - 380, 0, head.x + 380, 0);
    fl.addColorStop(0, rgba(CYAN, 0)); fl.addColorStop(.5, rgba([220, 250, 255], .7 * k)); fl.addColorStop(1, rgba(CYAN, 0));
    c.globalAlpha = 1; c.fillStyle = fl; c.fillRect(head.x - 380, head.y - 1.5, 760, 3);
  }
  c.restore();
  return head;
}

// final convergence: light paths sweep in from the edges and meet at the centre
const CONV = [];
{ const r = rng(31); for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + r() * .3; CONV.push({ a, rad: 900 + r() * 500, bend: (r() - .5) * 1.4, col: i % 3 === 0 ? GREEN : i % 3 === 1 ? CYAN : BLUE, d: r() * .25 }); } }
function drawConvergence(c, t, cam) {
  const p0 = range(t, 7.55, 8.55);
  if (p0 <= 0) return;
  const cx = W / 2, cy = CY;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (const L of CONV) {
    const p = easeInOut(range(t, 7.55 + L.d, 8.45 + L.d));
    const fade = 1 - smooth(range(t, 8.45 + L.d, 9.2 + L.d));
    if (p <= 0 || fade <= 0) continue;
    const sx = cx + Math.cos(L.a) * L.rad, sy = cy + Math.sin(L.a) * L.rad * 1.3;
    const mx = lerp(sx, cx, .5) + Math.sin(L.a) * 260 * L.bend, my = lerp(sy, cy, .5) - Math.cos(L.a) * 260 * L.bend;
    const q = (u) => [(1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * cx, (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * cy];
    const tail = Math.max(0, p - .45), head = p;
    c.strokeStyle = rgba(L.col, .85 * fade); c.lineWidth = 2.2;
    c.beginPath();
    for (let u = tail; u <= head + 1e-6; u += .02) { const [x, y] = q(Math.min(u, head)); u === tail ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
    const [hx, hy] = q(head);
    c.globalAlpha = fade; c.drawImage(SPR.w, hx - 22, hy - 22, 44, 44); c.globalAlpha = 1;
  }
  // meeting flash
  const f = Math.exp(-Math.pow((t - 8.55) / .22, 2));
  c.globalAlpha = f * .9; c.drawImage(SPR.w, cx - 520, cy - 300, 1040, 600);
  c.globalAlpha = f * .6; c.drawImage(SPR.g, cx - 700, cy - 250, 1400, 500);
  c.restore();
}

// ---------------------------------------------------------------- type in the scene
function drawStage(c, i, t, cam, e) {
  const st = STAGES[i];
  const rv = revealP(i, t), ex = exitP(i, t);
  if (rv <= 0 || ex >= 1) return;
  // emerge from depth while revealing; ease back into depth while leaving
  const z = lerp(520, 0, easeOut(st.hero ? rv : clamp(rv * 1.25))) + ex * 380;
  const y = st.hero ? -10 : 0;
  const pr = project(st.x, y, z, cam);
  const sweep = st.hero ? range(t, 9.0, 9.9) : 0;
  const { inE } = composeType(st, rv, ex, sweep);
  const s = pr.k;
  const dw = st.w * s, dh = st.h * s, dx = pr.x - dw / 2, dy = pr.y - dh / 2;
  const dof = Math.min(10, Math.abs(z) / 60);                      // depth-of-field blur off the focus plane
  const alpha = smooth(rv * 3) * (1 - ex * .6);

  // reflection on the glass floor
  const floorY = project(st.x, FLOOR, z, cam).y;
  c.save();
  c.globalAlpha = (st.hero ? .05 : .075) * alpha * (1 + .4 * e);
  c.filter = `blur(${5 + dof}px)`;
  c.translate(0, floorY * 2); c.scale(1, -1);
  c.drawImage(st.tmp, dx, dy, dw, dh);
  c.restore();

  // glow halo
  c.save(); c.globalCompositeOperation = 'lighter';
  const gt = st.tmp2.getContext('2d');
  gt.globalCompositeOperation = 'source-over'; gt.clearRect(0, 0, st.w, st.h);
  gt.drawImage(st.glow, 0, 0); gt.globalCompositeOperation = 'destination-in'; gt.filter = 'blur(18px)'; gt.drawImage(st.tmp, 0, 0); gt.filter = 'none';
  c.globalAlpha = alpha * (.55 + .25 * e + (st.hero ? .3 * easeOut(range(t, 8.5, 9.4)) : 0));
  c.drawImage(st.tmp2, dx, dy, dw, dh);
  c.restore();

  // the type itself — directional motion blur from camera velocity
  const v = (camX(t + 1 / FPS) - camX(t - 1 / FPS)) * FPS / 2;
  const blurPx = Math.min(22, Math.abs(v) * s / FPS * .6);
  c.save();
  c.filter = dof > .6 ? `blur(${dof.toFixed(1)}px)` : 'none';
  const n = blurPx > 2 ? 9 : 1;
  for (let j = 0; j < n; j++) {
    const o = n === 1 ? 0 : (j / (n - 1) - .5) * blurPx * Math.sign(v);
    const wgt = n === 1 ? 1 : Math.exp(-Math.pow((j / (n - 1) - .5) * 3, 2));
    c.globalAlpha = clamp(alpha * wgt * (n === 1 ? 1 : 2.6 / n));
    c.drawImage(st.tmp, dx + o, dy, dw, dh);
  }
  c.restore();

  // the revealing light: a thin vertical blue-green blade at the reveal edge
  if (!st.hero && rv > 0 && rv < 1) {
    const bx = dx + inE * s, k = Math.sin(rv * Math.PI);
    c.save(); c.globalCompositeOperation = 'lighter';
    const bg = c.createLinearGradient(0, dy + dh * .15, 0, dy + dh * .85);
    bg.addColorStop(0, rgba(MINT, 0)); bg.addColorStop(.5, rgba([220, 255, 245], .9 * k)); bg.addColorStop(1, rgba(CYAN, 0));
    c.fillStyle = bg; c.fillRect(bx - 1.5, dy + dh * .15, 3, dh * .7);
    c.globalAlpha = .5 * k; c.drawImage(SPR.g, bx - 90, pr.y - 160 * s, 180, 320 * s);
    c.restore();
  }
}

// ---------------------------------------------------------------- grade
const bloomC = mk(W / 6, H / 6);
const grains = []; { const r = rng(99); for (let i = 0; i < 6; i++) { const g = mk(540, 960), gc = g.getContext('2d'), id = gc.createImageData(540, 960); for (let j = 0; j < id.data.length; j += 4) { const v = 128 + (r() - .5) * 80; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; } gc.putImageData(id, 0, 0); grains.push(g); } }
function grade(c, t) {
  const b = bloomC.getContext('2d');
  b.filter = 'none'; b.clearRect(0, 0, bloomC.width, bloomC.height);
  b.filter = 'brightness(.8) contrast(2.4) blur(4px)'; b.drawImage(canvas, 0, 0, bloomC.width, bloomC.height);
  c.save();
  c.globalCompositeOperation = 'screen'; c.globalAlpha = .5; c.drawImage(bloomC, 0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  const vg = c.createRadialGradient(W / 2, CY, H * .22, W / 2, CY, H * .8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,3,8,.78)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = .06;
  c.drawImage(grains[Math.floor(t * FPS) % grains.length], 0, 0, W, H);
  c.restore();
}

// ---------------------------------------------------------------- frame
function renderFrame(t) {
  t = clamp(t, 0, DURATION);
  const cam = { x: camX(t), y: camY(t), z: camZ(t) }, e = exposure(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
  drawBackground(ctx, t, cam, e);
  drawPanes(ctx, t, cam, e, false);
  drawFloor(ctx, t, cam, e);
  drawParticles(ctx, t, cam, e, false);
  drawStreaks(ctx, t, cam, e);
  drawPath(ctx, t, cam, e);
  for (let i = 0; i < STAGES.length; i++) drawStage(ctx, i, t, cam, e);
  drawConvergence(ctx, t, cam);
  drawParticles(ctx, t, cam, e, true);
  drawPanes(ctx, t, cam, e, true);
  grade(ctx, t);
  // open from darkness: the light arrives first, then the world fades up around it
  const dark = 1 - smooth(range(t, .15, 1.4));
  if (dark > 0) {
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${dark * .92})`; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter'; drawPath(ctx, t, cam, e); ctx.restore();
  }
}

async function ready() {
  const faces = [new FontFace(FONT, 'url(../fonts/cairo-arabic-900-normal.woff2)', { weight: '900' })];
  for (const f of faces) { await f.load(); document.fonts.add(f); }
  await document.fonts.ready;
  FILM.fontOK = document.fonts.check(`900 100px ${FONT}`, 'تعلّم');
  STAGES.forEach(buildType);
  buildTimeline();
  FILM.ready = true;
  renderFrame(0);
}
const FILM = window.FILM = { W, H, FPS, DURATION, renderFrame, ready: false };
ready();
})();
