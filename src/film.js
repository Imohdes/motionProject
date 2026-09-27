/* Graduate Development — 9:16 cinematic motion film.
 * Everything is a pure function of time t (seconds): FILM.renderFrame(t) draws one frame.
 * One continuous sequence: the two graduates never leave frame while the world
 * morphs around them through foreground wipes, glass edges and a light bloom. */
(() => {
'use strict';

const W = 1080, H = 1920, FPS = 30, DURATION = 16.5;
const HZ = 1250;                 // horizon (world y, character plane)
const GROUND = 1700;             // feet line (world y)
const P = { x: 540, y: 1150 };   // camera pivot (chest height)
const UNIT = 8.8;                // px per figure unit at zoom 1 (male = 100 units tall)

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------- utils
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (t, a, b) => clamp((t - a) / (b - a));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = t => Math.pow(clamp(t), 3);
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const TAU = Math.PI * 2;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// monotone cubic spline over [[t, v], ...] — smooth, no overshoot
function spline(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return t => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] +
      (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function glow(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(.35, rgba(col, a * .35)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------------------------------------------------------------- camera
const camZ = spline([[0, 1.0], [3.0, 1.085], [3.9, 1.07], [6.3, 1.135], [7.2, 1.1], [9.6, 1.155],
  [10.5, 1.115], [12.8, 1.165], [13.45, 1.21], [16.5, 0.955]]);
const camX = spline([[0, 0], [3.0, 10], [3.9, 70], [6.3, 110], [7.2, 330], [9.6, 380], [10.5, 470],
  [12.8, 510], [13.8, 540], [16.5, 560]]);
const ANCHOR = [0, 90, 355, 490, 540];

function layer(c, k, cam, fn) {
  const s = 1 + (cam.z - 1) * k;
  c.save();
  c.translate(P.x, P.y); c.scale(s, s); c.translate(-P.x - cam.x * k, -P.y);
  fn(); c.restore();
}

// ---------------------------------------------------------------- transitions
// every wipe travels right → left, matching the Arabic reading direction
const TR = [
  { from: 0, to: 1, t0: 3.0, t1: 3.9, type: 'column', soft: 40 },
  { from: 1, to: 2, t0: 6.3, t1: 7.2, type: 'glass', soft: 150 },
  { from: 2, to: 3, t0: 9.6, t1: 10.5, type: 'frame', soft: 40 },
  { from: 3, to: 4, t0: 12.8, t1: 13.8, type: 'bloom', soft: 0 },
];
function edgeX(tr, t) { return lerp(W + 300, -300, easeInOut(range(t, tr.t0, tr.t1))); }
function bloomMid(tr) { return (tr.t0 + tr.t1) / 2 - 0.05; }
function activeTR(t) { return TR.find(tr => t >= tr.t0 && t <= tr.t1) || null; }
function sceneAt(t) { let s = 0; for (const tr of TR) if (t > tr.t1) s = tr.to; else if (t >= tr.t0) return tr.from; return s; }
// which pair of scenes a screen-x column is between, and the mix weight
function stateAt(t, x) {
  const tr = activeTR(t);
  if (!tr) { const s = sceneAt(t); return { a: s, b: s, w: 0 }; }
  let w;
  if (tr.type === 'bloom') { const m = bloomMid(tr); w = smooth(range(t, m - .12, m + .12)); }
  else w = smooth((x - edgeX(tr, t)) / Math.max(tr.soft, 60) + .5);
  return { a: tr.from, b: tr.to, w };
}

// ---------------------------------------------------------------- characters
const CHARS = [
  { id: 'm', baseX: 540 - 195, scale: 1.0, phase: 0 },
  { id: 'f', baseX: 540 + 195, scale: 0.93, phase: 1.9 },
];
const arm = (a1, f1, a2, f2) => ({ a1, f1, a2, f2 });
const REST_L = arm(.1, 1, .05, 1), REST_R = arm(.1, 1, .05, 1);
const BASE_POSE = {
  walk: 0, dx: 0, tilt: 0, nod: 0, wind: 0,
  armL: REST_L, armR: REST_R, swingL: 1, swingR: 1,
  bisht: 0, sash: 0, diploma: 0, dipX: 0, dipAng: .4,
  tablet: 0, tabX: 1, tabAng: 0, tabFace: 0,
};
const P_ = o => Object.assign({}, BASE_POSE, o);

function mixPose(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const o = {};
  for (const k in a) {
    if (typeof a[k] === 'object') { o[k] = {}; for (const j in a[k]) o[k][j] = lerp(a[k][j], b[k][j], w); }
    else o[k] = lerp(a[k], b[k], w);
  }
  return o;
}

// per-scene poses (t = global time)
const POSES = [
  // 1 — graduation walk
  (ci, t) => ci === 0
    ? P_({ walk: 1, bisht: 1, diploma: 1, dipX: 0, dipAng: .5, armL: arm(.12, 1, .06, 1), swingL: .7 })
    : P_({ walk: 1, sash: 1, diploma: 1, dipX: 0, dipAng: 1.15, armL: arm(.06, 1, -2.45, .55), swingL: .1 }),
  // 2 — learning: slow to a stop, tablet / touch a floating panel
  (ci, t) => {
    const walk = 1 - smooth(range(t, 3.6, 5.0));
    if (ci === 0) return P_({ walk, dx: -7, tablet: 1, tabX: .5, tabAng: -.05,
      armL: arm(.2, .92, -1.72, .62), armR: arm(.2, .92, -1.72, .62), swingL: .15, swingR: .15, nod: .8 });
    const r = easeInOut(range(t, 4.35, 5.25));
    return P_({ walk, dx: 3, tilt: -.04 * r,
      armL: arm(lerp(.1, .9, r), lerp(1, .9, r), lerp(.05, 2.3, r), lerp(1, .75, r)), swingL: 1 - r });
  },
  // 3 — skills: interactive table, collaborating
  (ci, t) => {
    if (ci === 0) {
      const p = easeInOut(range(t, 7.55, 8.3)) * (1 - easeInOut(range(t, 9.25, 9.9)));
      return P_({ dx: -3, nod: 1.2 - p, armL: arm(.3, .88, -.35, .55),
        armR: arm(lerp(.3, .78, p), lerp(.88, .95, p), lerp(-.35, 2.5 + .06 * Math.sin(t * 3), p), lerp(.55, .88, p)) });
    }
    const s = Math.sin(t * 2.4);
    return P_({ dx: 3, nod: 1.2, armL: arm(.28, .88, -.35 + .18 * s, .55), armR: arm(.3, .88, -.3 - .12 * s, .56) });
  },
  // 4 — experience: presenting, confident
  (ci, t) => {
    const g = easeInOut(range(t, 10.3, 11.0));
    if (ci === 0) return P_({ dx: -2, tilt: .05,
      armR: arm(lerp(.1, .3, g), lerp(1, .92, g), lerp(.05, 2.05 + .14 * Math.sin(t * 2.2), g), lerp(1, .62, g)) });
    return P_({ dx: 2, tilt: -.045, tablet: 1, tabX: 1, tabAng: 1.45, armR: arm(.13, 1, .12, 1),
      armL: arm(lerp(.1, .22, g), 1, lerp(.05, -.5, g), lerp(1, .7, g)) });
  },
  // 5 — future: hero stance, wind
  (ci, t) => ci === 0
    ? P_({ dx: 0, wind: 1, armL: arm(.08, .97, .02, 1), armR: arm(.1, 1, .04, 1) })
    : P_({ dx: 0, wind: 1, tablet: 1, tabX: 1, tabAng: 1.45, armR: arm(.13, 1, .12, 1), armL: arm(.08, 1, .03, 1) }),
];

// lighting presets per scene
const LIGHTS = [
  { rim: [255, 206, 140], rimI: 1.0, rim2: [255, 168, 105], rim2I: .55, dir: [-.75, -.66], halo: [255, 190, 120], haloI: .6, fill: [255, 196, 150], fillI: .10, fillY: -70, refl: .12 },
  { rim: [190, 228, 255], rimI: .95, rim2: [120, 200, 255], rim2I: .5, dir: [.7, -.7], halo: [150, 210, 255], haloI: .38, fill: [120, 215, 255], fillI: .26, fillY: -62, refl: .30 },
  { rim: [150, 255, 226], rimI: .85, rim2: [255, 210, 140], rim2I: .45, dir: [-.7, -.7], halo: [100, 230, 210], haloI: .32, fill: [110, 235, 205], fillI: .16, fillY: -52, refl: .22 },
  { rim: [255, 241, 215], rimI: 1.0, rim2: [255, 212, 165], rim2I: .5, dir: [.75, -.66], halo: [255, 226, 190], haloI: .42, fill: [255, 222, 188], fillI: .30, fillY: -72, refl: .26 },
  { rim: [255, 182, 112], rimI: 1.1, rim2: [140, 170, 255], rim2I: .6, dir: [-.6, -.8], halo: [255, 172, 110], haloI: .5, fill: [255, 180, 125], fillI: .18, fillY: -72, refl: .32 },
];
function mixLight(a, b, w) {
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? mixc(a[k], b[k], w) : lerp(a[k], b[k], w);
  return o;
}

// figure geometry (local units: feet at 0, head top at -100, y down)
const GEO = [
  { sh: 12.3, shY: -75.5, l1: 17.5, l2: 15, handR: 1.9 },
  { sh: 10.8, shY: -75.8, l1: 16.5, l2: 14.2, handR: 1.7 },
];
function armPts(g, side, a, bob) {
  const s = [side * g.sh, g.shY + bob];
  const e = [s[0] + side * Math.sin(a.a1) * g.l1 * a.f1, s[1] + Math.cos(a.a1) * g.l1 * a.f1];
  const w = [e[0] + side * Math.sin(a.a2) * g.l2 * a.f2, e[1] + Math.cos(a.a2) * g.l2 * a.f2];
  return [s, e, w];
}
function withSwing(a, side, amt, walk, phi) {
  const sw = walk * amt * Math.sin(phi + (side > 0 ? Math.PI : 0));
  return { a1: a.a1 + .05 * sw, f1: a.f1 * (1 - .1 * Math.abs(sw)), a2: a.a2 + .08 * sw, f2: a.f2 * (1 - .14 * Math.max(0, sw)) };
}

const FC = { w: 780, h: 1800, ox: 390, oy: 1260 };
const fMask = mk(FC.w, FC.h), fCol = mk(FC.w, FC.h), fTmp = mk(FC.w, FC.h), fRefl = mk(FC.w, FC.h);
const handsScreen = [{}, {}];

function charScreen(ci, pose, t) {
  const c = CHARS[ci], Z = camZ(t);
  const phi = TAU * 1.7 * t + c.phase;
  const u = UNIT * c.scale * Z;
  const sway = pose.walk * .45 * Math.sin(phi);
  const wx = c.baseX + pose.dx * UNIT;
  return { x: P.x + (wx - P.x) * Z + sway * u, y: P.y + (GROUND - P.y) * Z, u, phi };
}

function buildParts(ci, pose, t, phi) {
  const g = GEO[ci], walk = pose.walk, parts = [];
  const bob = walk * (.5 * Math.cos(2 * phi) - .3);
  const sinp = Math.sin(phi);
  const hL = -walk * .8 * Math.max(0, sinp), hR = -walk * .8 * Math.max(0, -sinp);
  const wind = pose.wind * (Math.sin(t * 2.3) * .6 + Math.sin(t * 5.1) * .25);
  const hs = walk * .7 * Math.sin(phi + .6) + wind * .9;
  const F = (path, style, alpha = 1) => parts.push({ k: 'f', path, style, alpha });
  const S = (path, width, style, alpha = 1) => parts.push({ k: 's', path, width, style, alpha });

  // feet
  for (const side of [-1, 1]) {
    const fwd = walk * (side < 0 ? sinp : -sinp);
    const lift = Math.max(0, fwd) * 1.2;
    const p = new Path2D();
    if (ci === 0) p.ellipse(side * 3.4, -.9 - lift * .4 + Math.max(0, fwd) * .6, 2.6 * (1 + .12 * fwd), 1.1, 0, 0, TAU);
    else p.ellipse(side * 3.1, -.5 + Math.max(0, fwd) * .4, 2.1 * (1 + .1 * fwd), .8, 0, 0, TAU);
    parts.push({ k: 'f', path: p, style: '#0e0b0a', alpha: 1, late: true });
  }

  const up = new DOMMatrix().translate(0, bob);
  const body = new Path2D();
  if (ci === 0) {
    // thobe
    body.moveTo(-11.8, -79.5);
    body.bezierCurveTo(-13.6, -78.7, -14.2, -76, -13.9, -72);
    body.bezierCurveTo(-13.3, -64, -12.2, -56, -11.6, -48);
    body.bezierCurveTo(-11.9, -36, -12.4, -20, -12.7 + hs, -3.4 + hL - bob);
    body.quadraticCurveTo(hs, -2.2 + (hL + hR) / 2 - bob, 12.7 + hs, -3.4 + hR - bob);
    body.bezierCurveTo(12.4, -20, 11.9, -36, 11.6, -48);
    body.bezierCurveTo(12.2, -56, 13.3, -64, 13.9, -72);
    body.bezierCurveTo(14.2, -76, 13.6, -78.7, 11.8, -79.5);
    body.quadraticCurveTo(0, -81.5, -11.8, -79.5); body.closePath();
    const bp = new Path2D(); bp.addPath(body, up);
    F(bp, 'thobe');
    // thobe front placket + folds
    const fold = new Path2D();
    fold.moveTo(0, -79); fold.lineTo(0, -58);
    fold.moveTo(-5, -46); fold.quadraticCurveTo(-6 + hs * .5, -25, -6.5 + hs, -4);
    fold.moveTo(4.5, -44); fold.quadraticCurveTo(5.5 + hs * .5, -24, 6 + hs, -4);
    const fp = new Path2D(); fp.addPath(fold, up);
    S(fp, .35, 'rgba(120,118,116,.55)');
    // bisht (graduation cloak) with gold trim
    if (pose.bisht > .01) {
      for (const side of [-1, 1]) {
        const b = new Path2D();
        b.moveTo(side * 12.3, -80);
        b.bezierCurveTo(side * 15.4, -79, side * 16.6, -75, side * 16.3, -70);
        b.lineTo(side * 15.8 + hs * .8, -13 + (side < 0 ? hL : hR) * .5 - bob);
        b.lineTo(side * 6.4 + hs * .8, -12.4 - bob);
        b.bezierCurveTo(side * 6, -35, side * 5.3, -60, side * 4.3, -78);
        b.closePath();
        const bb = new Path2D(); bb.addPath(b, up);
        F(bb, '#0b0b0e', pose.bisht);
        const tr = new Path2D();
        tr.moveTo(side * 6.4 + hs * .8, -12.4 - bob);
        tr.bezierCurveTo(side * 6, -35, side * 5.3, -60, side * 4.3, -78);
        tr.quadraticCurveTo(side * 2.5, -80.6, 0, -80.8);
        const tt = new Path2D(); tt.addPath(tr, up);
        S(tt, .75, '#d9b061', pose.bisht);
      }
    }
  } else {
    // abaya
    const w1 = walk * .8 * Math.sin(phi * 2) + wind * 1.2, w2 = -walk * .8 * Math.sin(phi * 2 + 1) - wind * .8;
    body.moveTo(-10.4, -80.2);
    body.bezierCurveTo(-12.2, -79.4, -12.9, -76.6, -12.6, -72.5);
    body.bezierCurveTo(-12.1, -64, -11.3, -56, -11.1, -49);
    body.bezierCurveTo(-12.3, -34, -14.8 + hs * .5, -16, -16.4 + hs, -1.0 + hL - bob);
    body.bezierCurveTo(-8 + hs, -.2 + w1 * .3 - bob, 8 + hs, -.2 + w2 * .3 - bob, 16.4 + hs, -1.0 + hR - bob);
    body.bezierCurveTo(14.8 + hs * .5, -16, 12.3, -34, 11.1, -49);
    body.bezierCurveTo(11.3, -56, 12.1, -64, 12.6, -72.5);
    body.bezierCurveTo(12.9, -76.6, 12.2, -79.4, 10.4, -80.2);
    body.quadraticCurveTo(0, -82, -10.4, -80.2); body.closePath();
    const bp = new Path2D(); bp.addPath(body, up);
    F(bp, 'abaya');
    const fold = new Path2D();
    fold.moveTo(-4, -50); fold.quadraticCurveTo(-5.5 + hs * .5, -25, -7.5 + hs, -1.5);
    fold.moveTo(3, -48); fold.quadraticCurveTo(4.5 + hs * .5, -24, 6 + hs, -1.2);
    fold.moveTo(-.5, -46); fold.quadraticCurveTo(-.5 + hs * .5, -22, -.8 + hs, -.8);
    const fp = new Path2D(); fp.addPath(fold, up);
    S(fp, .35, 'rgba(70,70,80,.55)');
    // graduation stole (Saudi green, gold edge)
    if (pose.sash > .01) {
      for (const side of [-1, 1]) {
        const s = new Path2D();
        s.moveTo(side * 6.8, -78.6); s.lineTo(side * 4.0, -78.2); s.lineTo(side * 3.7, -46); s.lineTo(side * 6.5, -45.4); s.closePath();
        const sp = new Path2D(); sp.addPath(s, up);
        F(sp, '#0e5e42', pose.sash);
        const e = new Path2D(); e.moveTo(side * 3.7, -48.5); e.lineTo(side * 6.5, -48);
        const ep = new Path2D(); ep.addPath(e, up);
        S(ep, .7, '#d6ad5c', pose.sash);
      }
    }
  }

  // arms (screen-left = side -1)
  const pts = {};
  for (const [key, side] of [['armL', -1], ['armR', 1]]) {
    const a = withSwing(pose[key], side, key === 'armL' ? pose.swingL : pose.swingR, walk, phi);
    const [s, e, w] = armPts(g, side, a, bob);
    pts[key] = { s, e, w };
    const pl = new Path2D(); pl.moveTo(s[0], s[1]); pl.lineTo(e[0], e[1]);
    if (ci === 0) {
      pl.lineTo(w[0], w[1]);
      S(pl, 7.1, 'edgeM', .9);
      S(pl, 6.3, 'sleeveM');
      if (pose.bisht > .01) {
        const b = new Path2D(); b.moveTo(s[0], s[1]); b.lineTo(e[0], e[1]);
        b.lineTo(lerp(e[0], w[0], .72), lerp(e[1], w[1], .72));
        S(b, 8.4, '#0b0b0e', pose.bisht);
      }
    } else {
      S(pl, 6.4, 'edgeF', .9);
      S(pl, 5.7, 'sleeveF');
      // widening abaya sleeve
      const dx = w[0] - e[0], dy = w[1] - e[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const ew = 2.9, ww = 4.2;
      const sl = new Path2D();
      const wx2 = e[0] + dx * .9, wy2 = e[1] + dy * .9;
      sl.moveTo(e[0] + nx * ew, e[1] + ny * ew); sl.lineTo(wx2 + nx * ww, wy2 + ny * ww);
      sl.lineTo(wx2 - nx * ww, wy2 - ny * ww); sl.lineTo(e[0] - nx * ew, e[1] - ny * ew); sl.closePath();
      F(sl, 'sleeveF');
    }
  }

  // items (behind hands)
  if (pose.diploma > .01) {
    const hand = pose.dipX < .5 ? pts.armL.w : pts.armR.w;
    const a = pose.dipAng, L = 13, c = Math.cos(a), s = Math.sin(a);
    const x0 = hand[0] - c * L * .45, y0 = hand[1] + 1 - s * L * .45;
    const d = new Path2D(); d.moveTo(x0, y0); d.lineTo(x0 + c * L, y0 + s * L);
    S(d, 2.5, '#b9ab8e', pose.diploma);
    const rb = new Path2D(); rb.moveTo(x0 + c * L * .62 - s * 1.3, y0 + s * L * .62 + c * 1.3); rb.lineTo(x0 + c * L * .62 + s * 1.3, y0 + s * L * .62 - c * 1.3);
    S(rb, 1.0, '#c99a38', pose.diploma);
  }
  if (pose.tablet > .01) {
    const hx = lerp(pts.armL.w[0], pts.armR.w[0], pose.tabX), hy = lerp(pts.armL.w[1], pts.armR.w[1], pose.tabX);
    const m = new DOMMatrix().translate(hx, hy - (pose.tabX > .9 ? -2 : 2.5)).rotate(pose.tabAng * 180 / Math.PI);
    const tp = new Path2D(); const tw = 14, th = 9.4;
    tp.roundRect ? tp.roundRect(-tw / 2, -th / 2, tw, th, 1) : tp.rect(-tw / 2, -th / 2, tw, th);
    const tt = new Path2D(); tt.addPath(tp, m);
    F(tt, '#15181c', pose.tablet);
    S(tt, .4, '#7d97a6', pose.tablet);
  }
  // hands
  for (const key of ['armL', 'armR']) {
    const { e, w } = pts[key];
    const dx = w[0] - e[0], dy = w[1] - e[1], len = Math.hypot(dx, dy) || 1;
    const h = new Path2D(); h.ellipse(w[0] + dx / len * 1.1, w[1] + dy / len * 1.1, g.handR * .66, g.handR * 1.02, Math.atan2(dy, dx) - Math.PI / 2, 0, TAU);
    parts.push({ k: 'f', path: h, style: 'hand', alpha: 1, late: true });
  }

  // head group
  const head = new DOMMatrix().translate(0, -82 + bob).rotate(pose.tilt * 57.3).translate(0, 82);
  if (ci === 0) {
    const neck = new Path2D(); neck.rect(-2.3, -87, 4.6, 8.5);
    const np = new Path2D(); np.addPath(neck, head); F(np, 'thobe');
    const gh = new Path2D();
    const fl = wind * .8;
    gh.moveTo(0, -100.6);
    gh.bezierCurveTo(-4.6, -100.6, -6.9, -97.4, -7.1, -93.5);
    gh.lineTo(-7.7, -86.5);
    gh.bezierCurveTo(-8.4, -81.5, -9.6 - fl * .3, -76, -10.4 - fl, -69.5);
    gh.lineTo(-6.6 - fl * .6, -69);
    gh.bezierCurveTo(-6.1, -74, -5.3, -80, -4.3, -84.5);
    gh.bezierCurveTo(-4.0, -88, -4.2, -92, -3.8, -95.6);
    gh.quadraticCurveTo(0, -97.3, 3.8, -95.6);
    gh.bezierCurveTo(4.2, -92, 4.0, -88, 4.3, -84.5);
    gh.bezierCurveTo(5.3, -80, 6.1, -74, 6.6 - fl * .4, -69);
    gh.lineTo(10.4 - fl * .7, -69.5);
    gh.bezierCurveTo(9.6, -76, 8.4, -81.5, 7.7, -86.5);
    gh.lineTo(7.1, -93.5);
    gh.bezierCurveTo(6.9, -97.4, 4.6, -100.6, 0, -100.6); gh.closePath();
    const face = new Path2D(); face.ellipse(0, -90.2 + pose.nod * .6, 3.85, 5.25, 0, 0, TAU);
    const gp = new Path2D(); gp.addPath(face, head); F(gp, 'skin');
    parts.push({ k: 'face', path: gp, m: head, cy: -90.2 + pose.nod * .6, rx: 3.85, ry: 5.25, beard: true, late: true });
    const hp = new Path2D(); hp.addPath(gh, head); F(hp, 'ghutra');
    // agal (two black cords)
    const ag = new Path2D();
    ag.ellipse(0, -96.4, 6.6, 1.25, 0, Math.PI * .02, Math.PI * .98);
    ag.moveTo(6.4, -95.2); ag.ellipse(0, -95.0, 6.7, 1.3, 0, Math.PI * .02, Math.PI * .98);
    const ap = new Path2D(); ap.addPath(ag, head); S(ap, .9, '#060607');
    const gf = new Path2D(); gf.moveTo(-5.5, -97); gf.quadraticCurveTo(-7.4, -86, -8.8, -72); gf.moveTo(5.5, -97); gf.quadraticCurveTo(7.4, -86, 8.8, -72);
    const gfp = new Path2D(); gfp.addPath(gf, head); S(gfp, .3, 'rgba(160,158,156,.5)');
  } else {
    const hj = new Path2D();
    hj.moveTo(0, -100.9);
    hj.bezierCurveTo(-5.4, -100.9, -7.7, -97, -7.6, -92);
    hj.bezierCurveTo(-7.5, -87.5, -8.6, -83.8, -10.8, -81);
    hj.bezierCurveTo(-12.1, -79.3, -12.3, -77.2, -11.6, -75.5);
    hj.bezierCurveTo(-8, -72.2, -3.5, -71, 0, -71);
    hj.bezierCurveTo(3.5, -71, 8, -72.2, 11.6, -75.5);
    hj.bezierCurveTo(12.3, -77.2, 12.1, -79.3, 10.8, -81);
    hj.bezierCurveTo(8.6, -83.8, 7.5, -87.5, 7.6, -92);
    hj.bezierCurveTo(7.7, -97, 5.4, -100.9, 0, -100.9); hj.closePath();
    const hp = new Path2D(); hp.addPath(hj, head); F(hp, 'hijab');
    // shayla tail over the shoulder
    const tl = new Path2D(), tw = wind * 1.4 + walk * .4 * Math.sin(phi);
    tl.moveTo(7.5, -82); tl.bezierCurveTo(10.5, -78, 11.8 + tw * .5, -70, 11.2 + tw, -61);
    tl.lineTo(8.2 + tw, -62.5); tl.bezierCurveTo(8.6, -70, 7.8, -76, 5.5, -79); tl.closePath();
    const tp = new Path2D(); tp.addPath(tl, head); F(tp, 'hijab');
    const face = new Path2D(); face.ellipse(0, -90.6 + pose.nod * .6, 3.65, 4.95, 0, 0, TAU);
    const fp = new Path2D(); fp.addPath(face, head); F(fp, 'skin');
    parts.push({ k: 'face', path: fp, m: head, cy: -90.6 + pose.nod * .6, rx: 3.65, ry: 4.95, beard: false, late: true });
    const hf = new Path2D(); hf.moveTo(-4.5, -98.5); hf.quadraticCurveTo(-4.9, -88, -3.2, -84.2); hf.quadraticCurveTo(0, -82.6, 3.2, -84.2); hf.quadraticCurveTo(4.9, -88, 4.5, -98.5);
    const hfp = new Path2D(); hfp.addPath(hf, head); S(hfp, .55, '#1c1c22');
  }
  return { parts, pts, bob };
}

function styleFor(c, key, ci) {
  switch (key) {
    case 'thobe': { const g = c.createLinearGradient(0, -80, 0, 0); g.addColorStop(0, '#4c4a48'); g.addColorStop(1, '#2a292a'); return g; }
    case 'sleeveM': return '#434140';
    case 'edgeM': return '#5a5856';
    case 'ghutra': { const g = c.createLinearGradient(0, -101, 0, -69); g.addColorStop(0, '#5c5a58'); g.addColorStop(1, '#474543'); return g; }
    case 'abaya': { const g = c.createLinearGradient(0, -80, 0, 0); g.addColorStop(0, '#16161b'); g.addColorStop(1, '#0c0c0f'); return g; }
    case 'sleeveF': return '#15151a';
    case 'edgeF': return '#2a2a31';
    case 'hijab': return '#1a1a20';
    case 'skin': return ci === 0 ? '#3a2519' : '#3d261b';
    case 'hand': return ci === 0 ? '#4a2f21' : '#4d3123';
    default: return key;
  }
}

function drawParts(c, parts, mask, ci) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const p of parts) {
    if (p.late) continue;   // faces, hands, feet are painted after the rim pass
    c.globalAlpha = p.alpha;
    const st = mask ? '#fff' : styleFor(c, p.style, ci);
    if (p.k === 'f') { c.fillStyle = st; c.fill(p.path); }
    else { c.strokeStyle = st; c.lineWidth = p.width; c.stroke(p.path); }
  }
  c.globalAlpha = 1;
}

function drawLate(c, parts, L, u, ci) {
  c.setTransform(u, 0, 0, u, FC.ox, FC.oy);
  const lx = L.dir[0] < 0 ? -1 : 1;
  for (const p of parts) {
    if (!p.late) continue;
    if (p.k === 'f') {
      c.globalAlpha = p.alpha;
      if (p.style === 'hand') {
        c.fillStyle = styleFor(c, 'hand', ci); c.fill(p.path);
        c.strokeStyle = rgba(L.rim, .55); c.lineWidth = .3; c.stroke(p.path);
      } else { c.fillStyle = p.style; c.fill(p.path); }
      continue;
    }
    // face: base skin, key from the rim side, soft fill from the front
    c.save(); c.transform(p.m.a, p.m.b, p.m.c, p.m.d, p.m.e, p.m.f);
    const { cy, rx, ry } = p;
    c.beginPath(); c.ellipse(0, cy, rx, ry, 0, 0, TAU); c.clip();
    const g = c.createLinearGradient(-lx * rx, 0, lx * rx, 0);
    g.addColorStop(0, '#26170f'); g.addColorStop(.55, ci === 0 ? '#4b3022' : '#4f3325'); g.addColorStop(1, ci === 0 ? '#7a5038' : '#7f543b');
    c.fillStyle = g; c.fillRect(-rx, cy - ry, rx * 2, ry * 2);
    c.globalCompositeOperation = 'lighter';
    const fg = c.createRadialGradient(0, cy + ry * .15, 0, 0, cy, ry * 1.1);
    fg.addColorStop(0, rgba(L.fill, L.fillI * .5)); fg.addColorStop(1, rgba(L.fill, 0));
    c.fillStyle = fg; c.fillRect(-rx, cy - ry, rx * 2, ry * 2);
    c.globalCompositeOperation = 'source-over';
    // brow shadow under the headwear, eye-line and nose shading
    const bs = c.createLinearGradient(0, cy - ry, 0, cy - ry * .3);
    bs.addColorStop(0, 'rgba(10,6,4,.75)'); bs.addColorStop(1, 'rgba(10,6,4,0)');
    c.fillStyle = bs; c.fillRect(-rx, cy - ry, rx * 2, ry * .8);
    c.fillStyle = 'rgba(15,9,6,.38)';
    for (const e of [-1, 1]) { c.beginPath(); c.ellipse(e * rx * .4, cy - ry * .12, rx * .2, ry * .07, 0, 0, TAU); c.fill(); }
    c.strokeStyle = rgba(L.rim, .22); c.lineWidth = .28;
    c.beginPath(); c.moveTo(lx * .35, cy - ry * .1); c.lineTo(lx * .5, cy + ry * .28); c.stroke();
    c.strokeStyle = 'rgba(15,9,6,.22)'; c.lineWidth = .3;
    c.beginPath(); c.moveTo(-rx * .25, cy + ry * .52); c.quadraticCurveTo(0, cy + ry * .58, rx * .25, cy + ry * .52); c.stroke();
    if (p.beard) {
      // short, neatly trimmed beard and moustache
      c.fillStyle = 'rgba(14,9,7,.9)';
      c.beginPath();
      c.moveTo(-rx, cy + ry * .05);
      c.quadraticCurveTo(-rx * .95, cy + ry * 1.05, 0, cy + ry * 1.05);
      c.quadraticCurveTo(rx * .95, cy + ry * 1.05, rx, cy + ry * .05);
      c.lineTo(rx * .78, cy + ry * .1);
      c.quadraticCurveTo(rx * .55, cy + ry * .75, 0, cy + ry * .78);
      c.quadraticCurveTo(-rx * .55, cy + ry * .75, -rx * .78, cy + ry * .1);
      c.closePath(); c.fill();
      c.beginPath(); c.ellipse(0, cy + ry * .4, rx * .52, ry * .1, 0, 0, TAU); c.fill();
    }
    c.restore();
  }
  c.globalAlpha = 1;
  c.setTransform(1, 0, 0, 1, 0, 0);
}

function drawFigure(ci, pose, L, t, dst) {
  const sc = charScreen(ci, pose, t);
  const { parts, pts } = buildParts(ci, pose, t, sc.phi);
  const u = sc.u;
  for (const k of ['armL', 'armR']) {
    const w = pts[k].w;
    handsScreen[ci][k] = [sc.x + w[0] * u, sc.y + w[1] * u];
  }
  handsScreen[ci].shoulder = [sc.x, sc.y - 76 * u];
  const m = fMask.getContext('2d'), col = fCol.getContext('2d'), tmp = fTmp.getContext('2d');
  for (const c of [m, col, tmp]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.clearRect(0, 0, FC.w, FC.h); }
  m.setTransform(u, 0, 0, u, FC.ox, FC.oy); drawParts(m, parts, true, ci);
  col.setTransform(u, 0, 0, u, FC.ox, FC.oy); drawParts(col, parts, false, ci);

  // fill light + ground darkening
  col.globalCompositeOperation = 'source-atop';
  const fg = col.createRadialGradient(0, L.fillY, 0, 0, L.fillY, 48);
  fg.addColorStop(0, rgba(L.fill, L.fillI)); fg.addColorStop(1, rgba(L.fill, 0));
  col.fillStyle = fg; col.fillRect(-60, -110, 120, 115);
  const dg = col.createLinearGradient(0, -45, 0, 0);
  dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(0,0,0,.4)');
  col.fillStyle = dg; col.fillRect(-60, -45, 120, 50);
  col.setTransform(1, 0, 0, 1, 0, 0);

  // rim lights: edge = mask minus mask shifted toward the light
  const rim = (dir, d, color, alpha, blur) => {
    tmp.globalCompositeOperation = 'source-over'; tmp.filter = 'none';
    tmp.clearRect(0, 0, FC.w, FC.h);
    tmp.drawImage(fMask, 0, 0);
    tmp.globalCompositeOperation = 'destination-out';
    tmp.drawImage(fMask, -dir[0] * d, -dir[1] * d);
    tmp.globalCompositeOperation = 'source-in';
    tmp.fillStyle = rgba(color, 1); tmp.fillRect(0, 0, FC.w, FC.h);
    col.globalCompositeOperation = 'lighter';
    col.globalAlpha = alpha; col.filter = `blur(${blur}px)`;
    col.drawImage(fTmp, 0, 0);
    col.filter = 'none'; col.globalAlpha = 1;
  };
  const z = u / UNIT;
  rim(L.dir, 3.4 * z, L.rim, L.rimI, .8);
  rim(L.dir, 9 * z, L.rim, L.rimI * .28, 4);
  rim([-L.dir[0], L.dir[1]], 2.6 * z, L.rim2, L.rim2I, .8);
  col.globalCompositeOperation = 'destination-in'; col.drawImage(fMask, 0, 0);
  col.globalCompositeOperation = 'source-over';
  drawLate(col, parts, L, u, ci);

  const X = sc.x - FC.ox, Y = sc.y - FC.oy;
  // atmospheric halo behind the figure
  tmp.globalCompositeOperation = 'source-over'; tmp.clearRect(0, 0, FC.w, FC.h);
  tmp.drawImage(fMask, 0, 0); tmp.globalCompositeOperation = 'source-in';
  tmp.fillStyle = rgba(L.halo, 1); tmp.fillRect(0, 0, FC.w, FC.h);
  dst.save();
  dst.globalCompositeOperation = 'lighter'; dst.globalAlpha = L.haloI * .45; dst.filter = `blur(${26 * z}px)`;
  dst.drawImage(fTmp, X, Y);
  dst.restore();

  // contact shadow
  dst.save();
  const sg = dst.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, 18 * u);
  sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  dst.setTransform(1, 0, 0, .14, 0, sc.y * .86); dst.fillStyle = sg;
  dst.fillRect(sc.x - 18 * u, sc.y - 18 * u, 36 * u, 36 * u);
  dst.restore();

  // floor reflection
  if (L.refl > .01) {
    const r = fRefl.getContext('2d');
    r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, FC.w, FC.h);
    r.setTransform(1, 0, 0, -1, 0, FC.oy * 2 + 2); r.filter = 'blur(2px)'; r.drawImage(fCol, 0, 0); r.filter = 'none';
    r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'destination-in';
    const rg = r.createLinearGradient(0, FC.oy, 0, FC.oy + 360 * z);
    rg.addColorStop(0, `rgba(0,0,0,${L.refl})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    r.fillStyle = rg; r.fillRect(0, FC.oy, FC.w, FC.h - FC.oy);
    dst.drawImage(fRefl, X, Y);
  }
  dst.drawImage(fCol, X, Y);
  // rim bloom spill
  dst.save(); dst.globalCompositeOperation = 'lighter'; dst.globalAlpha = .35; dst.filter = `blur(${6 * z}px)`;
  tmp.globalCompositeOperation = 'source-over'; tmp.clearRect(0, 0, FC.w, FC.h);
  tmp.drawImage(fMask, 0, 0); tmp.globalCompositeOperation = 'destination-out';
  tmp.drawImage(fMask, -L.dir[0] * 4 * z, -L.dir[1] * 4 * z);
  tmp.globalCompositeOperation = 'source-in'; tmp.fillStyle = rgba(L.rim, 1); tmp.fillRect(0, 0, FC.w, FC.h);
  dst.drawImage(fTmp, X, Y);
  dst.restore();
  return sc;
}

// ---------------------------------------------------------------- shared scene helpers
function perspectiveFloor(c, t, o) {
  const g = c.createLinearGradient(0, HZ - 10, 0, 2500);
  o.stops.forEach(([p, col]) => g.addColorStop(p, col));
  c.fillStyle = g; c.fillRect(-900, HZ - 12, 2900, 1500);
  c.save();
  c.strokeStyle = o.line; c.lineWidth = 1.5;
  for (let i = -14; i <= 14; i++) {
    c.globalAlpha = o.lineA * (1 - Math.abs(i) / 16);
    c.beginPath(); c.moveTo(540, HZ); c.lineTo(540 + i * o.spacing, 2600); c.stroke();
  }
  const f = (t * o.speed) % 1;
  for (let j = 0; j < 22; j++) {
    const zz = j + 1 - f, y = HZ + 900 / zz;
    if (y > 2600) continue;
    c.globalAlpha = o.lineA * clamp((y - HZ) / 420);
    c.beginPath(); c.moveTo(-900, y); c.lineTo(2000, y); c.stroke();
  }
  c.restore();
}

function drawCard(c, x, y, w, h, a, icon, rot, col = [190, 232, 255]) {
  if (a <= 0) return;
  c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
  rrect(c, -w / 2, -h / 2, w, h, 14);
  const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, rgba(col, .28)); g.addColorStop(1, rgba(col, .10));
  c.fillStyle = g; c.fill();
  c.strokeStyle = rgba(col, .65); c.lineWidth = 1.6; c.stroke();
  c.fillStyle = rgba(col, .55);
  rrect(c, -w / 2 + 16, -h / 2 + 16, w * .42, 7, 3.5); c.fill();
  c.fillStyle = rgba(col, .28);
  for (let i = 0; i < 3; i++) { rrect(c, -w / 2 + 16, -h / 2 + 36 + i * 15, w * (.72 - i * .14), 5, 2.5); c.fill(); }
  c.strokeStyle = rgba(col, .9); c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
  const ix = w / 2 - 34, iy = -h / 2 + 30;
  c.beginPath();
  if (icon === 'book') { c.moveTo(ix - 14, iy - 8); c.quadraticCurveTo(ix - 6, iy - 11, ix, iy - 6); c.quadraticCurveTo(ix + 6, iy - 11, ix + 14, iy - 8); c.lineTo(ix + 14, iy + 9); c.quadraticCurveTo(ix + 6, iy + 6, ix, iy + 10); c.quadraticCurveTo(ix - 6, iy + 6, ix - 14, iy + 9); c.closePath(); c.moveTo(ix, iy - 6); c.lineTo(ix, iy + 10); }
  else if (icon === 'bulb') { c.arc(ix, iy - 3, 9, Math.PI * .8, Math.PI * 2.2); c.lineTo(ix + 4, iy + 10); c.lineTo(ix - 4, iy + 10); c.closePath(); c.moveTo(ix - 4, iy + 14); c.lineTo(ix + 4, iy + 14); }
  else if (icon === 'play') { c.arc(ix, iy, 12, 0, TAU); c.moveTo(ix - 4, iy - 6); c.lineTo(ix + 7, iy); c.lineTo(ix - 4, iy + 6); c.closePath(); }
  else if (icon === 'chart') { c.moveTo(ix - 13, iy + 10); c.lineTo(ix - 4, iy); c.lineTo(ix + 2, iy + 5); c.lineTo(ix + 13, iy - 9); c.moveTo(ix + 6, iy - 9); c.lineTo(ix + 13, iy - 9); c.lineTo(ix + 13, iy - 2); }
  else if (icon === 'code') { c.moveTo(ix - 6, iy - 8); c.lineTo(ix - 13, iy); c.lineTo(ix - 6, iy + 8); c.moveTo(ix + 6, iy - 8); c.lineTo(ix + 13, iy); c.lineTo(ix + 6, iy + 8); }
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- scene 1 — graduation, golden hour
const S1 = (() => {
  const r = rng(11);
  const sky = []; for (let x = -800; x < 1900; x += 26 + r() * 50) sky.push([x, 22 + r() * 70 + (r() < .12 ? 90 : 0), 20 + r() * 50]);
  const conf = []; for (let i = 0; i < 90; i++) conf.push({ x: r() * 1500 - 200, y: r() * 2000, v: 50 + r() * 110, s: 5 + r() * 8, k: [.55, .8, 1.0][i % 3], ph: r() * 10, col: [[250, 214, 140], [236, 178, 92], [255, 240, 205]][i % 3] });
  const bokeh = []; for (let i = 0; i < 12; i++) bokeh.push({ x: r() * 1300 - 100, y: r() * 2000, r: 26 + r() * 50, v: 25 + r() * 40, ph: r() * 6 });
  const caps = [[.1, 330, -1], [.75, 760, 1], [1.4, 470, 1], [2.1, 640, -1], [2.7, 390, 1]];
  return { sky, conf, bokeh, caps };
})();

function arch(c, cx, w, top, bottom) {
  const shoulder = top + w * .62;
  c.moveTo(cx - w / 2, bottom); c.lineTo(cx - w / 2, shoulder);
  c.quadraticCurveTo(cx - w / 2, top + w * .12, cx, top);
  c.quadraticCurveTo(cx + w / 2, top + w * .12, cx + w / 2, shoulder);
  c.lineTo(cx + w / 2, bottom); c.closePath();
}

function s1bg(c, t, cam) {
  layer(c, .03, cam, () => {
    const g = c.createLinearGradient(0, -500, 0, HZ + 40);
    g.addColorStop(0, '#0c1424'); g.addColorStop(.33, '#253049'); g.addColorStop(.6, '#7d4a40');
    g.addColorStop(.83, '#e0924f'); g.addColorStop(1, '#ffd79a');
    c.fillStyle = g; c.fillRect(-900, -500, 2900, HZ + 600);
    // sun + rays
    glow(c, 540, 1175, 900, [255, 200, 130], .55);
    glow(c, 540, 1190, 260, [255, 240, 205], .95);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i - 7.5) * .16 + Math.sin(t * .3 + i) * .02;
      c.fillStyle = `rgba(255,214,150,${.035 + .02 * Math.sin(i * 3.1)})`;
      c.beginPath(); c.moveTo(540, 1190);
      c.lineTo(540 + Math.cos(a - .03) * 1600, 1190 + Math.sin(a - .03) * 1600);
      c.lineTo(540 + Math.cos(a + .03) * 1600, 1190 + Math.sin(a + .03) * 1600); c.fill();
    }
    c.restore();
  });
  layer(c, .12, cam, () => {
    c.fillStyle = 'rgba(128,74,52,.55)';
    for (const [x, h, w] of S1.sky) c.fillRect(x, HZ - h, w, h + 20);
    c.beginPath(); c.arc(170, HZ - 70, 44, Math.PI, 0); c.fill();   // campus dome
    c.fillRect(126, HZ - 70, 88, 70);
    c.fillRect(905, HZ - 190, 10, 190); c.beginPath(); c.arc(910, HZ - 190, 9, 0, TAU); c.fill(); // minaret
  });
  // caps thrown in the air, far behind
  layer(c, .4, cam, () => {
    for (const [t0, x0, dir] of S1.caps) {
      const tau = t - t0; if (tau < 0 || tau > 3.2) continue;
      const x = x0 + dir * tau * 55, y = HZ - 60 - tau * 620 + tau * tau * 150;
      c.save(); c.translate(x, y); c.rotate(tau * dir * 2.2); c.scale(1, .55 + .35 * Math.cos(tau * 3));
      c.fillStyle = '#1c130f';
      c.beginPath(); c.moveTo(-24, 0); c.lineTo(0, -9); c.lineTo(24, 0); c.lineTo(0, 9); c.closePath(); c.fill();
      c.fillRect(-10, 2, 20, 11);
      c.strokeStyle = 'rgba(255,205,130,.8)'; c.lineWidth = 1.5; c.stroke();
      c.strokeStyle = '#c9982f'; c.beginPath(); c.moveTo(0, 0); c.lineTo(15, 8); c.lineTo(15, 18); c.stroke();
      c.restore();
    }
  });
  // university arcade with a grand central arch
  layer(c, .45, cam, () => {
    c.save();
    const top = 420, base = HZ + 30;
    c.beginPath(); c.rect(-900, top, 2900, base - top);
    arch(c, 540, 470, 560, base + 5);
    for (const x of [-450, -180, 1260, 1530]) arch(c, x, 170, 820, base + 5);
    for (const x of [140, 940]) arch(c, x, 170, 800, base + 5);
    const fg = c.createLinearGradient(0, top, 0, base);
    fg.addColorStop(0, '#2c1a14'); fg.addColorStop(.6, '#4a2c1e'); fg.addColorStop(1, '#6a3f27');
    c.fillStyle = fg; c.fill('evenodd');
    // warm light wrapping the arch edges
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(255,196,120,.45)'; c.lineWidth = 4; c.filter = 'blur(3px)';
    c.beginPath(); arch(c, 540, 470, 560, base + 5); c.stroke();
    c.filter = 'none'; c.globalCompositeOperation = 'source-over';
    // cornice + geometric frieze
    c.fillStyle = '#1e120d'; c.fillRect(-900, top - 26, 2900, 30);
    c.strokeStyle = 'rgba(214,160,96,.35)'; c.lineWidth = 2;
    for (let x = -900; x < 2000; x += 44) { c.beginPath(); c.moveTo(x, top + 22); c.lineTo(x + 22, top + 44); c.lineTo(x + 44, top + 22); c.stroke(); }
    // haze
    const hz = c.createLinearGradient(0, 900, 0, base);
    hz.addColorStop(0, 'rgba(255,170,100,0)'); hz.addColorStop(1, 'rgba(255,170,100,.28)');
    c.fillStyle = hz; c.fillRect(-900, 900, 2900, base - 900);
    c.restore();
  });
  // palms
  layer(c, .62, cam, () => {
    for (const [x, h, s] of [[-40, 760, 1], [1120, 700, -1], [60, 560, -1]]) {
      c.save(); c.translate(x, HZ + 60); c.fillStyle = '#1d110c'; c.strokeStyle = '#1d110c';
      c.lineWidth = 16; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * 40, -h * .5, s * 20, -h); c.stroke();
      c.translate(s * 20, -h);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * .38 + Math.sin(t * 1.2 + i) * .03;
        c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(Math.cos(a) * 120, Math.sin(a) * 120 - 30, Math.cos(a) * 210, Math.sin(a) * 210 + 60); c.stroke();
      }
      c.restore();
    }
  });
  layer(c, 1, cam, () => {
    perspectiveFloor(c, t, { stops: [[0, '#d69258'], [.08, '#8a5234'], [.4, '#3a2217'], [1, '#140c08']], line: '#ffd9a8', lineA: .16, spacing: 230, speed: 1.35 });
    c.save(); c.globalCompositeOperation = 'lighter';
    const rg = c.createLinearGradient(0, HZ, 0, 2100);
    rg.addColorStop(0, 'rgba(255,200,130,.55)'); rg.addColorStop(1, 'rgba(255,200,130,0)');
    c.fillStyle = rg; c.beginPath(); c.moveTo(430, HZ); c.lineTo(650, HZ); c.lineTo(900, 2100); c.lineTo(180, 2100); c.fill();
    c.restore();
  });
  // confetti (behind characters)
  layer(c, .75, cam, () => {
    c.save();
    for (const p of S1.conf) {
      if (p.k > .9) continue;
      const y = ((p.y + t * p.v) % 2200) - 200, x = p.x + Math.sin(t * 1.3 + p.ph) * 30;
      const f = Math.cos(t * 4 + p.ph);
      c.globalAlpha = .45 + .45 * Math.abs(f);
      c.fillStyle = rgba(p.col, 1);
      c.save(); c.translate(x, y); c.rotate(t * 2 + p.ph); c.fillRect(-p.s / 2, -p.s * .3 * Math.abs(f), p.s, p.s * .6 * Math.abs(f) + .5); c.restore();
    }
    c.restore();
  });
}
function s1fg(c, t, cam) {
  layer(c, 1.25, cam, () => {
    c.save();
    for (const p of S1.conf) {
      if (p.k < .9) continue;
      const y = ((p.y + t * p.v * 1.3) % 2200) - 200, x = p.x + Math.sin(t * 1.1 + p.ph) * 40;
      const f = Math.cos(t * 3.5 + p.ph);
      c.globalAlpha = .55 + .4 * Math.abs(f); c.fillStyle = rgba(p.col, 1);
      c.save(); c.translate(x, y); c.rotate(t * 1.7 + p.ph); c.fillRect(-p.s * .7, -p.s * .4 * Math.abs(f), p.s * 1.4, p.s * .8 * Math.abs(f) + .6); c.restore();
    }
    c.globalCompositeOperation = 'lighter';
    for (const b of S1.bokeh) {
      const y = ((b.y + t * b.v) % 2300) - 200;
      glow(c, b.x + Math.sin(t * .7 + b.ph) * 25, y, b.r, [255, 205, 140], .16);
    }
    c.restore();
  });
}

// ---------------------------------------------------------------- scene 2 — learning space
const S2 = (() => {
  const r = rng(22);
  const towers = []; for (let x = -700; x < 1900; x += 60 + r() * 90) towers.push([x, 120 + r() * 380, 40 + r() * 70]);
  const dots = []; for (let i = 0; i < 70; i++) dots.push({ x: r() * 1500 - 200, y: r() * 2000, v: 20 + r() * 50, s: 1.5 + r() * 3, ph: r() * 6 });
  const cards = [
    { x: 150, y: 640, w: 230, h: 150, icon: 'book', k: .72, d: 0 },
    { x: 905, y: 560, w: 210, h: 140, icon: 'bulb', k: .78, d: .25 },
    { x: 860, y: 900, w: 190, h: 124, icon: 'play', k: .85, d: .5 },
    { x: 215, y: 1000, w: 180, h: 118, icon: 'code', k: .9, d: .7 },
  ];
  return { towers, dots, cards };
})();

function s2bg(c, t, cam) {
  const lt = t - 3.2;
  layer(c, .15, cam, () => {
    const g = c.createLinearGradient(0, 380, 0, HZ);
    g.addColorStop(0, '#dcecf8'); g.addColorStop(1, '#8fbad8');
    c.fillStyle = g; c.fillRect(-900, 300, 2900, HZ - 280);
    c.fillStyle = 'rgba(150,188,214,.75)';
    for (const [x, h, w] of S2.towers) c.fillRect(x, HZ - h, w, h);
    glow(c, 560, 900, 700, [240, 250, 255], .6);
  });
  layer(c, .28, cam, () => {
    c.save();
    c.beginPath(); c.rect(-900, -500, 2900, 2600); c.rect(-700, 400, 2500, HZ - 400);
    const wg = c.createLinearGradient(0, -500, 0, HZ);
    wg.addColorStop(0, '#05090f'); wg.addColorStop(1, '#0d1824');
    c.fillStyle = wg; c.fill('evenodd');
    c.fillStyle = '#09121c';
    for (let x = -700; x < 1800; x += 170) c.fillRect(x - 7, 400, 14, HZ - 400);
    c.fillRect(-700, 760, 2500, 10);
    c.restore();
  });
  // ceiling light lines converging
  layer(c, .5, cam, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = -4; i <= 4; i++) {
      const xt = 540 + i * 420, xb = 540 + i * 95;
      c.strokeStyle = 'rgba(210,236,255,.55)'; c.lineWidth = 5; c.filter = 'blur(2px)';
      c.beginPath(); c.moveTo(xt, -300); c.lineTo(xb, 360); c.stroke();
      c.filter = 'none'; c.strokeStyle = 'rgba(235,248,255,.9)'; c.lineWidth = 1.6; c.stroke();
    }
    c.restore();
    // wall display (left)
    c.save();
    rrect(c, -300, 480, 430, 300, 10); c.fillStyle = '#0b2438'; c.fill();
    c.strokeStyle = 'rgba(120,200,255,.5)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(120,200,255,.5)';
    for (let i = 0; i < 6; i++) { const h = 40 + 90 * (.5 + .5 * Math.sin(i * 1.7 + lt * .8)); c.fillRect(-250 + i * 58, 740 - h, 32, h); }
    c.restore();
  });
  layer(c, 1, cam, () => {
    perspectiveFloor(c, t, { stops: [[0, '#1c3346'], [.1, '#0d1823'], [1, '#04070b']], line: '#9fd4ff', lineA: .1, spacing: 200, speed: 1.35 * (1 - smooth(range(t, 3.6, 5))) });
    c.save(); c.globalCompositeOperation = 'lighter';
    const rg = c.createLinearGradient(0, HZ, 0, 1950);
    rg.addColorStop(0, 'rgba(190,224,248,.35)'); rg.addColorStop(1, 'rgba(190,224,248,0)');
    c.fillStyle = rg; c.fillRect(-700, HZ, 2500, 700);
    c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(5,10,16,.55)';
    for (let x = -700; x < 1800; x += 170) { c.beginPath(); c.moveTo(x - 7, HZ); c.lineTo(x + 7, HZ); c.lineTo(540 + (x + 7 - 540) * 1.7, 1950); c.lineTo(540 + (x - 7 - 540) * 1.7, 1950); c.fill(); }
    c.restore();
  });
  // floating learning cards
  for (const cd of S2.cards) {
    layer(c, cd.k, cam, () => {
      const a = easeOut(range(t, 3.6 + cd.d, 4.4 + cd.d)) * .95;
      drawCard(c, cd.x, cd.y - lt * 14 + Math.sin(t * 1.1 + cd.d * 5) * 8, cd.w, cd.h, a, cd.icon, Math.sin(t * .6 + cd.d * 3) * .03);
    });
  }
  layer(c, .9, cam, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const d of S2.dots) {
      const y = ((d.y - lt * d.v) % 2000 + 2000) % 2000;
      c.fillStyle = `rgba(160,220,255,${.25 + .25 * Math.sin(t * 2 + d.ph)})`;
      c.beginPath(); c.arc(d.x, y, d.s, 0, TAU); c.fill();
    }
    c.restore();
  });
}
function s2fg(c, t, cam) {
  // central panel touched by the female graduate — pinned to her fingertip at full reach
  const target = POSES[1](1, 5.4), sc = charScreen(1, target, t);
  const g = GEO[1], [, , w] = armPts(g, -1, target.armL, 0);
  const hx = sc.x + w[0] * sc.u, hy = sc.y + w[1] * sc.u;
  const a = easeOut(range(t, 4.0, 4.8));
  drawCard(c, hx + 10, hy - 52, 300, 196, a, 'chart', -.02);
  const tc = range(t, 5.2, 6.2);
  if (tc > 0 && tc < 1) {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(190,235,255,${.8 * (1 - tc)})`; c.lineWidth = 2.5;
    c.beginPath(); c.arc(hx, hy, 8 + tc * 70, 0, TAU); c.stroke();
    glow(c, hx, hy, 60, [170, 225, 255], .5 * (1 - tc));
    c.restore();
  }
  // tablet glow on the male graduate
  const tp = handsScreen[0];
  if (tp.armL && tp.armR) {
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, (tp.armL[0] + tp.armR[0]) / 2, (tp.armL[1] + tp.armR[1]) / 2 - 20, 150, [120, 205, 255], .22);
    c.restore();
  }
}

// ---------------------------------------------------------------- scene 3 — skills, collaborative workplace
const S3 = (() => {
  const r = rng(33);
  const city = []; for (let i = 0; i < 160; i++) city.push([r() * 2600 - 800, 700 + r() * 470, 1 + r() * 2.5, r() * 6]);
  const nodes = [[540, 560], [390, 660], [690, 650], [300, 820], [540, 780], [780, 830], [470, 930], [650, 950]];
  const edges = [[0, 1], [0, 2], [1, 4], [2, 4], [1, 3], [2, 5], [4, 6], [4, 7], [3, 6], [5, 7], [0, 4]];
  return { city, nodes, edges };
})();

function s3bg(c, t, cam) {
  const lt = t - 6.5;
  layer(c, .12, cam, () => {
    const g = c.createLinearGradient(0, 420, 0, HZ);
    g.addColorStop(0, '#2d6f78'); g.addColorStop(1, '#0f343c');
    c.fillStyle = g; c.fillRect(-900, 400, 2900, HZ - 380);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, s, ph] of S3.city) { c.fillStyle = `rgba(255,${200 + ph * 8 | 0},150,${.35 + .2 * Math.sin(t + ph)})`; c.fillRect(x, y, s, s); }
    c.restore();
  });
  layer(c, .25, cam, () => {
    c.beginPath(); c.rect(-900, -500, 2900, 2600); c.rect(-700, 440, 2500, HZ - 440);
    c.fillStyle = '#041012'; c.fill('evenodd');
    c.fillStyle = '#061618';
    for (let x = -700; x < 1800; x += 200) c.fillRect(x - 8, 440, 16, HZ - 440);
  });
  // pendant lamps
  layer(c, .45, cam, () => {
    for (let i = -3; i <= 9; i++) {
      const x = i * 150 - 60, y = 330 + (i % 2) * 40;
      c.strokeStyle = 'rgba(40,60,60,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, -200); c.lineTo(x, y); c.stroke();
      c.fillStyle = '#0c1b1c'; c.beginPath(); c.ellipse(x, y + 8, 34, 14, 0, Math.PI, 0); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      glow(c, x, y + 14, 120, [255, 212, 150], .5);
      c.fillStyle = 'rgba(255,236,200,.95)'; c.beginPath(); c.ellipse(x, y + 10, 26, 5, 0, 0, TAU); c.fill();
      c.restore();
    }
  });
  // desks, monitors and colleagues (soft focus)
  layer(c, .5, cam, () => {
    c.save(); c.filter = 'blur(2.5px)';
    c.fillStyle = '#0a1a1c'; c.fillRect(-800, 1165, 2600, 30);
    for (let i = -4; i <= 10; i++) {
      const x = i * 170 - 40;
      c.fillStyle = '#081415'; c.fillRect(x - 40, 1100, 80, 55);
      c.fillStyle = `rgba(150,240,225,${.55 + .15 * Math.sin(t * 1.5 + i)})`; c.fillRect(x - 35, 1104, 70, 46);
      if (i % 3 === 0) { c.fillStyle = '#071112'; c.beginPath(); c.arc(x + 70, 1105, 18, 0, TAU); c.fill(); c.beginPath(); c.ellipse(x + 70, 1160, 34, 40, 0, Math.PI, 0); c.fill(); }
    }
    c.restore();
  });
  // ascending growth line
  layer(c, .6, cam, () => {
    const p = easeInOut(range(t, 7.0, 9.4));
    if (p <= 0) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    const pts = []; for (let i = 0; i <= 40; i++) { const s = i / 40; pts.push([-120 + s * 1320, 1080 - s * 420 - Math.sin(s * 9) * 25 * (1 - s)]); }
    const n = Math.max(2, Math.floor(pts.length * p));
    for (const [lw, a] of [[10, .12], [3, .7]]) {
      c.strokeStyle = `rgba(255,214,140,${a})`; c.lineWidth = lw; c.filter = lw > 5 ? 'blur(4px)' : 'none';
      c.beginPath(); pts.slice(0, n).forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    }
    c.filter = 'none';
    const [ex, ey] = pts[n - 1]; glow(c, ex, ey, 40, [255, 220, 150], .9);
    c.restore();
  });
  // plants
  layer(c, .8, cam, () => {
    c.fillStyle = '#031011';
    for (const [x, s] of [[-30, 1], [1110, -1]]) {
      for (let i = 0; i < 7; i++) {
        c.save(); c.translate(x, HZ + 120); c.rotate(s * (-.9 + i * .22) + Math.sin(t + i) * .02);
        c.beginPath(); c.ellipse(0, -130, 22, 130, 0, 0, TAU); c.fill(); c.restore();
      }
    }
  });
  layer(c, 1, cam, () => {
    perspectiveFloor(c, t, { stops: [[0, '#16383b'], [.1, '#0a1c1e'], [1, '#020708']], line: '#8ff5e0', lineA: .08, spacing: 210, speed: 0 });
  });
  // skills network
  layer(c, .88, cam, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    const float = Math.sin(t * .9) * 8;
    S3.edges.forEach(([a, b], i) => {
      const p = easeInOut(range(lt, .6 + i * .12, 1.1 + i * .12));
      if (p <= 0) return;
      const [x1, y1] = S3.nodes[a], [x2, y2] = S3.nodes[b];
      c.strokeStyle = 'rgba(150,255,225,.5)'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(x1, y1 + float); c.lineTo(lerp(x1, x2, p), lerp(y1, y2, p) + float); c.stroke();
    });
    S3.nodes.forEach(([x, y], i) => {
      const p = easeOut(range(lt, .45 + i * .14, .95 + i * .14));
      if (p <= 0) return;
      const pulse = 1 + .08 * Math.sin(t * 3 + i);
      const col = i % 3 === 0 ? [255, 214, 140] : [150, 255, 225];
      glow(c, x, y + float, 46 * p * pulse, col, .55);
      c.strokeStyle = rgba(col, .9 * p); c.lineWidth = 2;
      c.beginPath(); c.arc(x, y + float, 15 * p * pulse, 0, TAU); c.stroke();
      c.fillStyle = rgba(col, .9 * p); c.beginPath(); c.arc(x, y + float, 4.5 * p, 0, TAU); c.fill();
    });
    c.restore();
  });
}
function s3fg(c, t, cam) {
  // interactive glass table at hand height
  const sc = charScreen(0, POSES[2](0, t), t);
  const ytop = sc.y - 51 * sc.u;
  const x0 = P.x + (130 - P.x) * cam.z, x1 = P.x + (950 - P.x) * cam.z;
  c.save();
  const g = c.createLinearGradient(0, ytop, 0, sc.y);
  g.addColorStop(0, 'rgba(40,110,105,.55)'); g.addColorStop(.3, 'rgba(8,34,36,.72)'); g.addColorStop(1, 'rgba(3,12,13,.9)');
  c.fillStyle = g; c.beginPath(); c.moveTo(x0, ytop); c.lineTo(x1, ytop); c.lineTo(x1 + 30, ytop + 26); c.lineTo(x1 + 30, sc.y + 400); c.lineTo(x0 - 30, sc.y + 400); c.lineTo(x0 - 30, ytop + 26); c.closePath(); c.fill();
  c.globalCompositeOperation = 'lighter';
  // top surface light + projected fan of light
  const lg = c.createLinearGradient(0, ytop - 160, 0, ytop);
  lg.addColorStop(0, 'rgba(120,255,220,0)'); lg.addColorStop(1, 'rgba(120,255,220,.16)');
  c.fillStyle = lg; c.fillRect(x0 + 40, ytop - 160, x1 - x0 - 80, 160);
  c.strokeStyle = 'rgba(170,255,232,.95)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x0, ytop); c.lineTo(x1, ytop); c.stroke();
  c.strokeStyle = 'rgba(170,255,232,.35)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x0 - 30, ytop + 26); c.lineTo(x1 + 30, ytop + 26); c.stroke();
  // UI traces on the table face
  for (let i = 0; i < 9; i++) {
    const x = lerp(x0 + 60, x1 - 60, i / 8), a = .25 + .2 * Math.sin(t * 2 + i);
    c.fillStyle = `rgba(150,255,225,${a})`; c.fillRect(x - 30, ytop + 44 + (i % 3) * 16, 60 - (i % 2) * 20, 4);
  }
  // touch points under the hands
  for (const ci of [0, 1]) for (const k of ['armL', 'armR']) {
    const h = handsScreen[ci][k]; if (!h || Math.abs(h[1] - ytop) > 40) continue;
    glow(c, h[0], ytop, 70, [150, 255, 225], .5 + .2 * Math.sin(t * 5 + ci));
  }
  c.restore();
}

// ---------------------------------------------------------------- scene 4 — experience, real office
const S4 = (() => {
  const r = rng(44);
  const city = []; for (let x = -800; x < 2000; x += 40 + r() * 70) city.push([x, 90 + r() * (r() < .15 ? 520 : 260), 30 + r() * 60]);
  const motes = []; for (let i = 0; i < 60; i++) motes.push([r() * 1400 - 150, r() * 1500 + 300, r() * 6, 1 + r() * 2.5]);
  return { city, motes };
})();

function s4bg(c, t, cam) {
  const lt = t - 9.8;
  layer(c, .08, cam, () => {
    const g = c.createLinearGradient(0, 250, 0, HZ);
    g.addColorStop(0, '#f6e6cd'); g.addColorStop(1, '#dcb389');
    c.fillStyle = g; c.fillRect(-900, 200, 2900, HZ - 180);
    glow(c, 360, 760, 700, [255, 244, 222], .85);
  });
  layer(c, .14, cam, () => {
    for (const [x, h, w] of S4.city) {
      c.fillStyle = `rgba(186,150,118,${.55 + h / 1600})`; c.fillRect(x, HZ - h, w, h);
    }
    c.fillStyle = 'rgba(170,134,104,.75)';
    c.beginPath(); c.moveTo(760, HZ); c.lineTo(790, 600); c.lineTo(812, 560); c.lineTo(834, 600); c.lineTo(864, HZ); c.fill();
  });
  layer(c, .3, cam, () => {
    c.beginPath(); c.rect(-900, -500, 2900, 2600); c.rect(-700, 330, 2500, HZ - 300);
    c.fillStyle = '#1a1411'; c.fill('evenodd');
    c.fillStyle = '#231b16';
    for (let x = -700; x < 1800; x += 230) c.fillRect(x - 9, 330, 18, HZ - 300);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = -2; i <= 8; i++) glow(c, i * 180, 300, 60, [255, 230, 190], .45);
    c.restore();
  });
  // sunlight shafts
  layer(c, .45, cam, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = -100 + i * 260;
      const gg = c.createLinearGradient(x, 400, x + 500, 1700);
      gg.addColorStop(0, 'rgba(255,226,180,.10)'); gg.addColorStop(1, 'rgba(255,226,180,0)');
      c.fillStyle = gg; c.beginPath(); c.moveTo(x, 330); c.lineTo(x + 120, 330); c.lineTo(x + 620, 1800); c.lineTo(x + 380, 1800); c.fill();
    }
    for (const [x, y, ph, s] of S4.motes) {
      c.fillStyle = `rgba(255,236,200,${.3 + .3 * Math.sin(t * 1.5 + ph)})`;
      c.beginPath(); c.arc(x + Math.sin(t * .5 + ph) * 20, y - lt * 12, s, 0, TAU); c.fill();
    }
    c.restore();
  });
  // meeting room: colleagues at a table (soft focus) + dashboard screen
  layer(c, .55, cam, () => {
    c.save(); c.filter = 'blur(3px)';
    c.fillStyle = '#20180f'; c.fillRect(-420, 1150, 560, 26);
    for (const [x, s] of [[-330, 1], [-170, .95], [-10, 1.05]]) {
      c.fillStyle = '#17110d';
      c.beginPath(); c.arc(x, 1070 - 8 * s, 20 * s, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(x, 1150, 42 * s, 64 * s, 0, Math.PI, 0); c.fill();
    }
    c.restore();
    rrect(c, 940, 660, 360, 230, 8); c.fillStyle = '#16202a'; c.fill();
    c.strokeStyle = 'rgba(255,220,170,.4)'; c.lineWidth = 2; c.stroke();
    const p = easeOut(range(t, 10.4, 12));
    c.fillStyle = 'rgba(255,205,130,.75)';
    for (let i = 0; i < 5; i++) { const h = (40 + i * 26) * p; c.fillRect(972 + i * 34, 860 - h, 20, h); }
    c.strokeStyle = 'rgba(140,220,255,.85)'; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i <= 10; i++) { const x = 972 + i * 18 * p, y = 780 - i * 8 * p - Math.sin(i) * 8; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  });
  layer(c, 1, cam, () => {
    perspectiveFloor(c, t, { stops: [[0, '#a07a58'], [.08, '#5a4230'], [.45, '#2a1e15'], [1, '#0e0906']], line: '#ffe6c4', lineA: .08, spacing: 260, speed: 0 });
    c.save(); c.globalCompositeOperation = 'lighter';
    const rg = c.createLinearGradient(0, HZ, 0, 1900);
    rg.addColorStop(0, 'rgba(255,232,196,.4)'); rg.addColorStop(1, 'rgba(255,232,196,0)');
    c.fillStyle = rg; c.fillRect(-700, HZ, 2500, 650);
    c.restore();
  });
}
function s4fg(c, t, cam) {
  // growing warm key light — confidence
  const k = smooth(range(t, 10.4, 12.6));
  c.save(); c.globalCompositeOperation = 'lighter';
  glow(c, 540, 1200, 700, [255, 214, 170], .08 + .1 * k);
  c.restore();
}

// ---------------------------------------------------------------- scene 5 — the future, Riyadh at dusk
const S5 = (() => {
  const r = rng(55);
  const towers = [];
  for (let x = -800; x < 2000; x += 34 + r() * 60) {
    if (x > 250 && x < 420) continue; if (x > 650 && x < 830) continue;
    towers.push({ x, h: 60 + Math.pow(r(), 2) * 360, w: 26 + r() * 50, seed: r() * 1000 | 0 });
  }
  const lights = []; for (let i = 0; i < 420; i++) lights.push([r() * 2800 - 900, HZ - 20 + Math.pow(r(), .7) * 140, r() * 6, r()]);
  const sparks = []; for (let i = 0; i < 40; i++) sparks.push([r() * 1400 - 150, r() * 2000, 18 + r() * 40, r() * 6, 1 + r() * 2.2]);
  const stars = []; for (let i = 0; i < 80; i++) stars.push([r() * 2600 - 700, r() * 700 - 200, r() * .6 + .2, r() * 6]);
  return { towers, lights, sparks, stars };
})();

function kingdomCentre(c, x, base, h) {
  const top = base - h, w = h * .17;
  c.beginPath();
  c.moveTo(x - w / 2, base);
  c.quadraticCurveTo(x - w * .52, base - h * .5, x - w * .3, top + h * .02);
  c.lineTo(x - w * .1, top + h * .1);
  c.quadraticCurveTo(x, top + h * .23, x + w * .1, top + h * .1);
  c.lineTo(x + w * .3, top + h * .02);
  c.quadraticCurveTo(x + w * .52, base - h * .5, x + w / 2, base);
  c.closePath();
}
function faisaliah(c, x, base, h) {
  const w = h * .2;
  c.beginPath(); c.moveTo(x - w / 2, base); c.lineTo(x - w * .07, base - h * .86); c.lineTo(x, base - h);
  c.lineTo(x + w * .07, base - h * .86); c.lineTo(x + w / 2, base); c.closePath();
}

function s5bg(c, t, cam) {
  const lt = t - 13.1;
  layer(c, .02, cam, () => {
    const g = c.createLinearGradient(0, -400, 0, HZ + 40);
    g.addColorStop(0, '#060b1d'); g.addColorStop(.35, '#16224a'); g.addColorStop(.62, '#43406c');
    g.addColorStop(.82, '#c46a4a'); g.addColorStop(.93, '#ffae6a'); g.addColorStop(1, '#ffd49b');
    c.fillStyle = g; c.fillRect(-900, -500, 2900, HZ + 600);
    for (const [x, y, a, ph] of S5.stars) { c.fillStyle = `rgba(255,255,255,${a * (.6 + .4 * Math.sin(t * 2 + ph))})`; c.fillRect(x, y, 2, 2); }
    glow(c, 560, HZ, 900, [255, 170, 100], .55);
    glow(c, 560, HZ + 10, 280, [255, 226, 180], .8);
  });
  layer(c, .1, cam, () => {
    const base = HZ + 30;
    for (const tw of S5.towers) {
      c.fillStyle = '#1a1830'; c.fillRect(tw.x, base - tw.h, tw.w, tw.h);
      const r = rng(tw.seed);
      for (let y = base - tw.h + 10; y < base - 6; y += 12) for (let x = tw.x + 5; x < tw.x + tw.w - 4; x += 9)
        if (r() < .35) { c.fillStyle = `rgba(255,${190 + r() * 50 | 0},${120 + r() * 60 | 0},${.35 + r() * .5})`; c.fillRect(x, y, 3, 4); }
      if (tw.h > 300 && Math.sin(t * 4 + tw.seed) > .3) { c.fillStyle = 'rgba(255,60,50,.9)'; c.fillRect(tw.x + tw.w / 2 - 2, base - tw.h - 4, 4, 4); }
    }
    // Al Faisaliah (sphere) and Kingdom Centre (arched crown)
    c.fillStyle = '#141228'; faisaliah(c, 335, base, 520); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, 335, base - 520 * .72, 36, [255, 200, 120], .9);
    c.restore();
    c.fillStyle = '#e8b86a'; c.beginPath(); c.arc(335, base - 520 * .72, 12, 0, TAU); c.fill();
    c.fillStyle = '#131126'; kingdomCentre(c, 745, base, 700); c.fill();
    c.strokeStyle = 'rgba(150,190,255,.85)'; c.lineWidth = 2.2; c.stroke();
    c.strokeStyle = 'rgba(150,190,255,.9)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(745 - 700 * .17 * .22, base - 700 + 700 * .055); c.lineTo(745 + 700 * .17 * .22, base - 700 + 700 * .055); c.stroke();
  });
  // city lights + light trails below the horizon
  layer(c, .2, cam, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, ph, k] of S5.lights) { c.fillStyle = k < .5 ? `rgba(255,200,130,${.5 + .3 * Math.sin(t * 3 + ph)})` : `rgba(200,220,255,${.4 + .3 * Math.sin(t * 2 + ph)})`; c.fillRect(x, y, 2.5, 2.5); }
    for (const [yy, col, dir, sp] of [[HZ + 70, [255, 90, 70], 1, 520], [HZ + 88, [255, 240, 220], -1, 640], [HZ + 118, [255, 170, 90], 1, 460]]) {
      for (let i = 0; i < 16; i++) {
        const x = ((i * 190 + dir * t * sp) % 2900 + 2900) % 2900 - 900;
        const gg = c.createLinearGradient(x, 0, x - dir * 150, 0);
        gg.addColorStop(0, rgba(col, .9)); gg.addColorStop(1, rgba(col, 0));
        c.fillStyle = gg; c.fillRect(Math.min(x, x - dir * 150), yy, 150, 3);
      }
    }
    c.restore();
  });
  // terrace: glass balustrade + stone floor
  layer(c, .8, cam, () => {
    c.save();
    const top = HZ + 150;
    const g = c.createLinearGradient(0, top, 0, top + 180);
    g.addColorStop(0, 'rgba(150,170,210,.16)'); g.addColorStop(1, 'rgba(40,40,70,.35)');
    c.fillStyle = g; c.fillRect(-900, top, 2900, 180);
    c.strokeStyle = 'rgba(255,196,140,.85)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-900, top); c.lineTo(2000, top); c.stroke();
    c.fillStyle = 'rgba(20,20,36,.8)';
    for (let x = -900; x < 2000; x += 300) c.fillRect(x, top, 10, 180);
    c.restore();
  });
  layer(c, 1, cam, () => {
    const g = c.createLinearGradient(0, HZ + 320, 0, 2500);
    g.addColorStop(0, '#3a2a3a'); g.addColorStop(.25, '#1a1426'); g.addColorStop(1, '#07060c');
    c.fillStyle = g; c.fillRect(-900, HZ + 330, 2900, 1500);
    c.save(); c.globalCompositeOperation = 'lighter';
    const rg = c.createLinearGradient(0, HZ + 330, 0, 2000);
    rg.addColorStop(0, 'rgba(255,170,110,.35)'); rg.addColorStop(1, 'rgba(255,170,110,0)');
    c.fillStyle = rg; c.fillRect(-900, HZ + 330, 2900, 700);
    c.restore();
  });
  // rising light motes
  layer(c, .9, cam, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, v, ph, s] of S5.sparks) {
      const yy = ((y - lt * v) % 2000 + 2000) % 2000;
      c.fillStyle = `rgba(255,210,150,${.3 + .3 * Math.sin(t * 2 + ph)})`;
      c.beginPath(); c.arc(x + Math.sin(t * .8 + ph) * 15, yy, s, 0, TAU); c.fill();
    }
    c.restore();
  });
}
function s5fg(c, t, cam) {
  // anamorphic streak through the horizon glow
  c.save(); c.globalCompositeOperation = 'lighter';
  const y = P.y + (HZ - P.y) * (1 + (cam.z - 1) * .02);
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(120,150,255,0)'); g.addColorStop(.5, 'rgba(255,200,150,.35)'); g.addColorStop(1, 'rgba(120,150,255,0)');
  c.fillStyle = g; c.filter = 'blur(3px)'; c.fillRect(0, y - 3, W, 6); c.filter = 'none';
  c.restore();
}

const SCENES = [
  { bg: s1bg, fg: s1fg }, { bg: s2bg, fg: s2fg }, { bg: s3bg, fg: s3fg }, { bg: s4bg, fg: s4fg }, { bg: s5bg, fg: s5fg },
];

// ---------------------------------------------------------------- transition foreground objects
function drawColumn(c, x) {           // sandstone pillar passing close to camera
  c.save(); c.filter = 'blur(5px)';
  const w = 400, g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#0d0806'); g.addColorStop(.55, '#24160f'); g.addColorStop(.9, '#4a2e1c'); g.addColorStop(1, '#c98b52');
  c.fillStyle = g; c.fillRect(x - w / 2, -50, w, H + 100);
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255,200,130,.5)'; c.fillRect(x + w / 2 - 6, -50, 8, H + 100);
  c.restore();
}
function drawGlassEdge(c, x) {        // edge of a glass partition sliding past
  c.save();
  const sx = clamp(x - 90, 0, W - 90);
  c.globalAlpha = .45; c.drawImage(c.canvas, sx, 0, 90, H, sx - 30, 0, 90, H);   // refraction offset
  c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(x - 70, 0, x + 70, 0);
  g.addColorStop(0, 'rgba(180,240,255,0)'); g.addColorStop(.5, 'rgba(200,245,255,.35)'); g.addColorStop(1, 'rgba(180,240,255,0)');
  c.fillStyle = g; c.fillRect(x - 70, 0, 140, H);
  c.fillStyle = 'rgba(235,252,255,.9)'; c.fillRect(x - 1.5, 0, 3, H);
  c.restore();
}
function drawFrame(c, x) {            // architectural mullion / door frame
  c.save(); c.filter = 'blur(4px)';
  const w = 250, g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#fff2d8'); g.addColorStop(.04, '#15181b'); g.addColorStop(.5, '#262a2e'); g.addColorStop(.96, '#0d0f11'); g.addColorStop(1, '#bff5e8');
  c.fillStyle = g; c.fillRect(x - w / 2, -50, w, H + 100);
  c.restore();
}

// ---------------------------------------------------------------- grading
const bloomC = mk(W / 8, H / 8), sceneB = mk(W, H), maskC = mk(W, H);
const grains = []; { const r = rng(99); for (let i = 0; i < 6; i++) { const g = mk(540, 960), gc = g.getContext('2d'), id = gc.createImageData(540, 960); for (let j = 0; j < id.data.length; j += 4) { const v = 128 + (r() - .5) * 90; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; } gc.putImageData(id, 0, 0); grains.push(g); } }

function grade(c, t) {
  const b = bloomC.getContext('2d');
  b.filter = 'none'; b.clearRect(0, 0, bloomC.width, bloomC.height);
  b.filter = 'brightness(.85) contrast(2.2) blur(3px)';
  b.drawImage(canvas, 0, 0, bloomC.width, bloomC.height);
  c.save();
  c.globalCompositeOperation = 'screen'; c.globalAlpha = .38; c.imageSmoothingQuality = 'high';
  c.drawImage(bloomC, 0, 0, W, H);
  c.globalAlpha = 1;
  // top gradient for title legibility, vignette
  c.globalCompositeOperation = 'source-over';
  const tg = c.createLinearGradient(0, 0, 0, 760);
  tg.addColorStop(0, 'rgba(0,0,0,.42)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = tg; c.fillRect(0, 0, W, 760);
  const vg = c.createRadialGradient(W / 2, H * .55, H * .28, W / 2, H * .55, H * .78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.62)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  // film grain
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = .07;
  c.drawImage(grains[Math.floor(t * FPS) % grains.length], 0, 0, W, H);
  c.restore();
}

// ---------------------------------------------------------------- titles (DOM: real Arabic shaping, RTL)
const TITLES = [
  { s: 'من هنا تبدأ رحلتك', size: 104, tin: .55, tout: 3.0 },
  { s: 'تعلّم', size: 172, tin: 4.05, tout: 6.25 },
  { s: 'طوّر مهاراتك', size: 128, tin: 7.3, tout: 9.55 },
  { s: 'اكتسب الخبرة', size: 128, tin: 10.55, tout: 12.75 },
  { s: 'وانطلق لمستقبلك', size: 112, tin: 13.95, tout: 99 },
];
const titleEls = TITLES.map(T => {
  const d = document.createElement('div'); d.className = 'title';
  const s = document.createElement('div'); s.className = 'txt'; s.lang = 'ar'; s.dir = 'rtl'; s.textContent = T.s; s.style.fontSize = T.size + 'px';
  const bar = document.createElement('div'); bar.className = 'bar';
  d.append(s, bar); document.getElementById('titles').append(d);
  return { d, s, bar };
});
function updateTitles(t) {
  TITLES.forEach((T, i) => {
    const { d, s, bar } = titleEls[i];
    const a = easeOut(range(t, T.tin, T.tin + .85));
    const b = easeIn(range(t, T.tout, T.tout + .55));
    if (a <= 0 || b >= 1) { d.style.display = 'none'; return; }
    d.style.display = 'flex';
    // reveal travels right → left (soft-edged mask); exit continues leftward
    const iw = lerp(-12, 100, a), ow = lerp(-12, 100, b);
    const m = `linear-gradient(to left, transparent ${ow}%, #000 ${ow + 12}%, #000 ${iw}%, transparent ${iw + 12}%)`;
    s.style.webkitMaskImage = m; s.style.maskImage = m;
    s.style.transform = `translateX(${(1 - a) * 70 - b * 70}px)`;
    s.style.filter = `blur(${(1 - a) * 6 + b * 4}px)`;
    const hold = Math.max(0, t - T.tin) * 4;   // slow drift while on screen
    d.style.transform = `translateX(${-hold}px)`;
    bar.style.transform = `scaleX(${easeOut(range(t, T.tin + .25, T.tin + 1.05)) * (1 - b)})`;
    bar.style.opacity = 1 - b;
  });
}

// ---------------------------------------------------------------- frame
function renderScene(i, c, t, which) {
  const cam = { z: camZ(t), x: camX(t) - ANCHOR[i] };
  SCENES[i][which](c, t, cam);
}
function maskedDraw(c, t, tr, which) {
  const b = sceneB.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, W, H);
  renderScene(tr.to, b, t, which);
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'destination-in';
  if (tr.type === 'bloom') {
    const m = bloomMid(tr), w = smooth(range(t, m - .12, m + .12));
    b.fillStyle = `rgba(0,0,0,${w})`; b.fillRect(0, 0, W, H);
  } else {
    const ex = edgeX(tr, t), s = tr.soft;
    const g = b.createLinearGradient(ex - s / 2, 0, ex + s / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
  }
  b.globalCompositeOperation = 'source-over';
  c.drawImage(sceneB, 0, 0);
}

function renderFrame(t) {
  t = clamp(t, 0, DURATION);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const tr = activeTR(t), cur = sceneAt(t);

  // 1. environment
  if (tr) {
    const mid = tr.type === 'bloom' ? bloomMid(tr) : 0;
    if (tr.type !== 'bloom' || t < mid + .12) renderScene(tr.from, ctx, t, 'bg');
    maskedDraw(ctx, t, tr, 'bg');
  } else renderScene(cur, ctx, t, 'bg');

  // 2. the two graduates — always on screen, pose + light follow the wipe edge
  CHARS.forEach((ch, ci) => {
    const probe = charScreen(ci, POSES[sceneAt(t)](ci, t), t);
    const st = stateAt(t, probe.x);
    const pose = mixPose(POSES[st.a](ci, t), POSES[st.b](ci, t), st.w);
    const light = mixLight(LIGHTS[st.a], LIGHTS[st.b], st.w);
    drawFigure(ci, pose, light, t, ctx);
  });

  // 3. scene foreground
  if (tr) {
    if (tr.type !== 'bloom' || t < bloomMid(tr) + .12) renderScene(tr.from, ctx, t, 'fg');
    maskedDraw(ctx, t, tr, 'fg');
  } else renderScene(cur, ctx, t, 'fg');

  // 4. transition carriers
  if (tr) {
    const ex = edgeX(tr, t);
    if (tr.type === 'column') drawColumn(ctx, ex);
    if (tr.type === 'glass') drawGlassEdge(ctx, ex);
    if (tr.type === 'frame') drawFrame(ctx, ex);
    if (tr.type === 'bloom') {
      const m = bloomMid(tr), k = Math.exp(-Math.pow((t - m) / .2, 2));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 540, 1100, 1500, [255, 236, 205], .9 * k);
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(255,244,228,${.72 * k})`; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  grade(ctx, t);
  updateTitles(t);
  const fade = Math.max(1 - range(t, 0, .45), range(t, 16.1, 16.5));
  document.getElementById('fade').style.opacity = fade.toFixed(3);
}

async function ready() {
  await document.fonts.load('900 100px Cairo', 'من هنا تبدأ رحلتك تعلّم طوّر مهاراتك اكتسب الخبرة وانطلق لمستقبلك');
  await document.fonts.ready;
  FILM.fontOK = document.fonts.check('900 100px Cairo', 'تعلّم');
  FILM.ready = true;
}

const FILM = window.FILM = { W, H, FPS, DURATION, renderFrame, ready: false };
ready();
renderFrame(0);
})();
