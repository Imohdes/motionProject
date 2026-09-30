/* Flowing ribbons — the supplied abstract background rebuilt as a live, evolving scene (1920×1080, 20 s).
 * Same palette and layering as the source (orange field dominant ~60 %, deep blue dome, green wedge,
 * thin glowing lines), but every curve is a function of time: the ribbons sweep and reshape, their
 * crossing point travels, a ribbon enters from the left and another leaves, light runs along the lines,
 * and a slow camera push-in with lateral drift adds parallax between the colour layers.
 * Colour fields are drawn at quarter resolution with blur (silky, cheap); lines at full resolution. */
(() => {
'use strict';

const W = 1920, H = 1080, FPS = 30, DURATION = 20;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (t, a, b) => clamp((t - a) / (b - a));
const ease = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, a)})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// slow organic motion: sum of low-frequency sines (periods ~12–35 s)
const osc = (t, base, ...terms) => terms.reduce((v, [a, f, p]) => v + a * Math.sin(TAU * f * t + p), base);

// palette sampled from the source image
const C = {
  oBright: hex('#ff8c18'), oMid: hex('#f36e17'), oLow: hex('#c85516'), oDeep: hex('#7a3418'),
  dark: hex('#372227'), navy: hex('#0b2a63'), navyDeep: hex('#012456'), blue: hex('#003175'), blueHi: hex('#0a4aa6'),
  band: hex('#463a67'), green: hex('#2f8f52'), teal: hex('#0c6a58'), tealDeep: hex('#02374e'),
};

// ---------------------------------------------------------------- geometry (normalised units)
function cubic(p0, p1, p2, p3, s) {
  const u = 1 - s;
  return [u * u * u * p0[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s * s * s * p3[0],
          u * u * u * p0[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s * s * s * p3[1]];
}
// a curve = list of cubic segments; sample to polyline
function sample(segs, n) {
  const pts = [];
  segs.forEach((sg, k) => { for (let i = k ? 1 : 0; i <= n; i++) pts.push(cubic(sg[0], sg[1], sg[2], sg[3], i / n)); });
  return pts;
}

function scene(t) {
  // crossing point of the main lines travels across the composition
  const P = [osc(t, .57, [.085, .045, 1.2], [.03, .09, .3]), osc(t, .48, [.03, .05, 2.0], [.012, .11, 1])];
  // main line A: left edge → P → top-right (upper edge of the green wedge)
  const a0 = [-.06, osc(t, .71, [.07, .04, .5])];
  const a2 = [1.06, osc(t, .3, [.07, .055, 2.6])];
  const tan = [1, (a2[1] - a0[1]) * .55];
  const tl = Math.hypot(...tan); tan[0] /= tl; tan[1] /= tl;
  const bendA = osc(t, 0, [.05, .06, 4]);
  const A = [
    [a0, [a0[0] + .28, a0[1] - .06 + bendA], [P[0] - tan[0] * .2, P[1] - tan[1] * .2], P],
    [P, [P[0] + tan[0] * .2, P[1] + tan[1] * .2], [a2[0] - .22, a2[1] + .06 - bendA], a2],
  ];
  // line B: from the lower left, through P, bending down to the right (lower edge of the green wedge)
  const b0 = [-.06, osc(t, .79, [.05, .05, 3.3])];
  const b2 = [1.06, osc(t, .62, [.07, .05, 4.0], [.02, .1, 1])];
  const B = [
    [b0, [b0[0] + .3, b0[1] - .02], [P[0] - .18, P[1] + .005], P],
    [P, [P[0] + .2, P[1] - .005], [b2[0] - .22, b2[1] - .09], b2],
  ];
  // blue dome D: rises from the lower left to a peak, descends off the bottom-right
  const dp = [osc(t, .44, [.1, .04, 3.0]), osc(t, .6, [.04, .06, .8])];
  const d0 = [-.06, osc(t, .9, [.07, .045, 1.9])];
  const d2 = [osc(t, .99, [.09, .045, 1.0]), 1.06];
  const D = [
    [d0, [d0[0] + .18, d0[1] - .2], [dp[0] - .2, dp[1]], dp],
    [dp, [dp[0] + .22, dp[1]], [d2[0] - .15, d2[1] - .28], d2],
  ];
  // upper-right arc E: leaves the crossing and sweeps up out of the top edge
  const e0 = [P[0] + .02, P[1] - .004];
  const e2 = [osc(t, .99, [.06, .05, .7]), -.06];
  const E = [[e0, [e0[0] + .22, e0[1] - .03], [e2[0] - .06, e2[1] + osc(t, .3, [.08, .06, 2])], e2]];
  // a ribbon that slowly enters from the left edge (foreground, runs through the warm band)
  const inX = lerp(-1.15, .02, ease(range(t, 2.5, 13.5)));
  const inY = osc(t, .08, [.03, .07, 1]);
  const R = A.map(sg => sg.map(([x, y]) => [x + inX, y + inY + .06 * x]));
  // faint lines in the lower-left that gradually drift out of frame
  const out = ease(range(t, 8.5, 19.5));
  const F = [[[.06 - .5 * out, 1.06 + .25 * out], [.2 - .5 * out, .86 + .25 * out], [.34 - .5 * out, .74 + .25 * out], [.55 - .5 * out, .7 + .25 * out]]];
  // secondary translucent ribbon edge above A (the "glass" fold)
  const Ag = A.map(sg => sg.map(([x, y]) => [x, y - .07 + .05 * Math.sin(TAU * (.05 * t) + x * 3)]));
  return { P, A, B, D, E, R, F, Ag, dp, a2, b2, e2 };
}

// ---------------------------------------------------------------- camera: slow push-in + lateral drift, per-layer parallax
function camera(t) {
  return { s: 1 + .075 * ease(t / DURATION), x: lerp(.028, -.03, ease(t / DURATION)) * W, y: lerp(-.01, .012, ease(t / DURATION)) * H };
}
function mapper(cam, k, scale) {         // k = parallax depth (1 = foreground)
  const s = 1 + (cam.s - 1) * k, ox = cam.x * k, oy = cam.y * k;
  return ([x, y]) => [((x * W - W / 2) * s + W / 2 + ox) * scale, ((y * H - H / 2) * s + H / 2 + oy) * scale];
}
function tracePath(c, segs, m, move = true) {
  segs.forEach((sg, i) => {
    const [p0, p1, p2, p3] = sg.map(m);
    if (i === 0 && move) c.moveTo(p0[0], p0[1]); else if (i === 0) c.lineTo(p0[0], p0[1]);
    c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
  });
}
const rev = segs => segs.slice().reverse().map(sg => sg.slice().reverse());

// ---------------------------------------------------------------- colour fields (quarter resolution)
const LS = .25, LW = W * LS, LH = H * LS;
const fields = mk(LW, LH), fc = fields.getContext('2d');
const tmp = mk(LW, LH), tc = tmp.getContext('2d');
const K = { base: .3, blue: .6, green: .8, orange: 1, fg: 1.25 };

function drawFields(t, S, cam) {
  const c = fc;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
  const mB = mapper(cam, K.base, LS), mBl = mapper(cam, K.blue, LS), mG = mapper(cam, K.green, LS), mO = mapper(cam, K.orange, LS);
  // base: deep navy, darker at the bottom, warm-dark in the top-right corner
  let g = c.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, rgba(C.navy, 1)); g.addColorStop(1, rgba(C.navyDeep, 1));
  c.fillStyle = g; c.fillRect(0, 0, LW, LH);

  // blue dome
  c.save(); c.filter = 'blur(2px)';
  c.beginPath(); tracePath(c, S.D, mBl);
  const br = mBl([1.2, 1.2]), bl = mBl([-.2, 1.2]); c.lineTo(br[0], br[1]); c.lineTo(bl[0], bl[1]); c.closePath();
  const pk = mBl(S.dp);
  g = c.createRadialGradient(pk[0], pk[1] + LH * .1, 0, pk[0], pk[1] + LH * .1, LW * .55);
  g.addColorStop(0, rgba(C.blueHi, 1)); g.addColorStop(.45, rgba(C.blue, 1)); g.addColorStop(1, rgba(C.navyDeep, 1));
  c.fillStyle = g; c.fill(); c.restore();

  // orange field: above A (left of the crossing) and left of the arc E
  const orangePath = (cc, m) => {
    cc.beginPath();
    const tl = m([-.2, -.2]); cc.moveTo(tl[0], tl[1]);
    const te = m([S.e2[0], -.2]); cc.lineTo(te[0], te[1]);
    tracePath(cc, rev(S.E), m, false);
    tracePath(cc, rev([S.A[0]]), m, false);
    const bl = m([-.2, S.A[0][0][1]]); cc.lineTo(bl[0], bl[1]); cc.closePath();
  };
  const oc = mO([.14, .18]);
  const orangeFill = cc => {
    const gg = cc.createRadialGradient(oc[0], oc[1], 0, oc[0], oc[1], LW * .95);
    gg.addColorStop(0, rgba(C.oBright, 1)); gg.addColorStop(.4, rgba(C.oMid, 1)); gg.addColorStop(.72, rgba(C.oLow, 1)); gg.addColorStop(1, rgba(C.oDeep, 1));
    return gg;
  };
  // warm haze spilling below A → the orange-to-violet band over the blue
  c.save(); c.filter = 'blur(26px)'; c.globalAlpha = .95;
  orangePath(c, mO); c.fillStyle = orangeFill(c); c.fill(); c.restore();
  c.save(); c.filter = 'blur(12px)'; c.globalAlpha = .6; c.translate(0, LH * .03);
  orangePath(c, mO); c.fillStyle = orangeFill(c); c.fill(); c.restore();
  c.save(); c.filter = 'blur(2.5px)';
  orangePath(c, mO); c.fillStyle = orangeFill(c); c.fill(); c.restore();
  // top-right darkening inside the orange (as in the source)
  c.save(); orangePath(c, mO); c.clip();
  g = c.createLinearGradient(mO([.55, 0])[0], 0, mO([.98, 0])[0], 0);
  g.addColorStop(0, rgba(C.dark, 0)); g.addColorStop(1, rgba(C.dark, .92));
  c.fillStyle = g; c.fillRect(0, 0, LW, LH * .6); c.restore();

  // green wedge between A (right) and B (right), fading to deep teal at the edge
  const wedge = cc => {
    cc.beginPath(); tracePath(cc, [S.A[1]], mG);
    const r1 = mG([1.2, S.a2[1]]), r2 = mG([1.2, S.b2[1]]); cc.lineTo(r1[0], r1[1]); cc.lineTo(r2[0], r2[1]);
    tracePath(cc, rev([S.B[1]]), mG, false); cc.closePath();
  };
  const p = mG(S.P), re = mG([1.05, (S.a2[1] + S.b2[1]) / 2]);
  const wg = cc => { const gg = cc.createLinearGradient(p[0], p[1], re[0], re[1]);
    gg.addColorStop(0, rgba(mixc(C.oMid, C.green, .5), 1)); gg.addColorStop(.25, rgba(C.green, 1)); gg.addColorStop(.6, rgba(C.teal, 1)); gg.addColorStop(1, rgba(C.tealDeep, 1)); return gg; };
  c.save(); c.filter = 'blur(10px)'; c.globalAlpha = .45; wedge(c); c.fillStyle = wg(c); c.fill(); c.restore();
  c.save(); c.filter = 'blur(2px)'; wedge(c); c.fillStyle = wg(c); c.fill(); c.restore();

  // translucent silk sheen along the ribbons
  c.save(); c.globalCompositeOperation = 'screen'; c.lineCap = 'round'; c.filter = 'blur(6px)';
  for (const [segs, m, col, w, a] of [[S.Ag, mO, C.oBright, 26, .16], [S.D, mBl, [60, 120, 220], 30, .12], [S.R, mapper(cam, K.fg, LS), C.oBright, 22, .13 * ease(range(t, 3, 9))]]) {
    c.strokeStyle = rgba(col, a); c.lineWidth = w; c.beginPath(); tracePath(c, segs, m); c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- glowing lines (full resolution)
// colour stops along each line (s = 0 left … 1 right), alpha, depth, pulse timing
const LINES = [
  { key: 'A', k: K.orange, w: 2.2, a: 1, stops: [[0, '#ff9a3a'], [.42, '#ffd27a'], [.52, '#fff1c0'], [.66, '#56f0a0'], [.85, '#40c8ff'], [1, '#2f7dff']], pulse: [6.5, 0] },
  { key: 'B', k: K.green, w: 2.0, a: .9, stops: [[0, '#ff8a3a'], [.45, '#ffb55a'], [.55, '#fff0b0'], [.8, '#ffc048'], [1, '#ff9a30']], pulse: [7.5, 2.4] },
  { key: 'D', k: K.blue, w: 2.2, a: 1, stops: [[0, '#3a6fe0'], [.35, '#9cc4ff'], [.5, '#e4efff'], [.7, '#7aa0ff'], [.82, '#ff8a4a'], [1, '#ff6a2a']], pulse: [7, 4.1] },
  { key: 'E', k: K.orange, w: 1.4, a: .55, stops: [[0, '#ffb060'], [.5, '#ff9a4a'], [1, '#3a8cff']], pulse: [8, 1.3] },
  { key: 'Ag', k: K.orange, w: 1.0, a: .25, stops: [[0, '#ffb060'], [1, '#ffd08a']], pulse: [9, 5] },
  { key: 'R', k: K.fg, w: 1.6, a: .7, stops: [[0, '#ff9a40'], [.5, '#ffd89a'], [1, '#ffb050']], pulse: [6, 3] },
  { key: 'F', k: K.blue, w: 1.2, a: .35, stops: [[0, '#6a8cff'], [1, '#ff9a60']], pulse: [8, 6] },
];
LINES.forEach(L => { L.cs = L.stops.map(([s, h]) => [s, hex(h)]); });
function colAt(cs, s) {
  for (let i = 1; i < cs.length; i++) if (s <= cs[i][0]) return mixc(cs[i - 1][1], cs[i][1], (s - cs[i - 1][0]) / (cs[i][0] - cs[i - 1][0]));
  return cs[cs.length - 1][1];
}

function drawLines(c, t, S, cam) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'butt';
  for (const L of LINES) {
    const m = mapper(cam, L.k, 1);
    const pts = sample(S[L.key], 90).map(m);
    const n = pts.length - 1;
    // light travelling left → right along the line
    const [per, ph] = L.pulse;
    const pos = (((t + ph) % per) / per) * 1.5 - .25;
    const vis = L.key === 'R' ? ease(range(t, 3, 8)) : L.key === 'F' ? 1 - ease(range(t, 15, 19.5)) : 1;
    const al = [], cl = [];
    for (let i = 0; i < n; i++) {
      const s = (i + .5) / n, d = s - pos;
      const pulse = d < 0 ? Math.exp(-Math.pow(d / .16, 2)) : Math.exp(-Math.pow(d / .05, 2));
      al.push(L.a * vis * (.62 + .9 * pulse) * Math.min(1, Math.min(s, 1 - s) * 12));
      cl.push(colAt(L.cs, s));
    }
    for (const [wm, am, whiten] of [[14, .05, 0], [5, .18, 0], [1, .9, .35]]) {
      c.lineWidth = L.w * wm;
      for (let i = 0; i < n; i++) {
        if (al[i] < .003) continue;
        c.strokeStyle = rgba(mixc(cl[i], [255, 255, 255], whiten), al[i] * am);
        c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke();
      }
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- finishing
const bloomC = mk(W / 8, H / 8);
const grain = mk(960, 540); { const g = grain.getContext('2d'), id = g.createImageData(960, 540); let s = 12345;
  for (let j = 0; j < id.data.length; j += 4) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const v = 128 + ((s / 4294967296) - .5) * 40; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; }
  g.putImageData(id, 0, 0); }

function renderFrame(t) {
  t = clamp(t, 0, DURATION);
  const S = scene(t), cam = camera(t);
  drawFields(t, S, cam);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fields, 0, 0, W, H);
  drawLines(ctx, t, S, cam);
  const b = bloomC.getContext('2d');
  b.filter = 'none'; b.clearRect(0, 0, bloomC.width, bloomC.height);
  b.filter = 'brightness(.9) contrast(1.7) blur(5px)'; b.drawImage(canvas, 0, 0, bloomC.width, bloomC.height);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .22; ctx.drawImage(bloomC, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, W * .65);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .035; ctx.drawImage(grain, 0, 0, W, H);   // static: breaks banding, no flicker
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

const FILM = window.FILM = { W, H, FPS, DURATION, renderFrame, ready: true };
renderFrame(0);
})();
