/* Brand background — seamless 4K (3840×2160) loop.
 * Deep blue #005688 dominant, warm orange #DC7B2C secondary glow, green #03A76A as a rare hint.
 * Every motion is periodic in the loop length L (integer multiples of θ = 2πt/L),
 * so frame(L) === frame(0) and the clip loops without a seam. The centre stays clear. */
(() => {
'use strict';

const W = 3840, H = 2160, FPS = 30, DURATION = 20;      // DURATION = loop length
const BLUE = [0, 86, 136], ORANGE = [220, 123, 44], GREEN = [3, 167, 106];
// luminous cores derived from the brand hues (same hue, lifted)
const BLUE_CORE = [120, 200, 242], ORANGE_CORE = [255, 160, 90], GREEN_CORE = [110, 230, 175];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const TAU = Math.PI * 2;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, a)})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------------------------------------------------------------- soft colour fields (atmosphere)
// each field orbits on a closed periodic path and breathes; k = integer cycles per loop
const FIELDS = [
  { col: [24, 128, 190], x: .30, y: .30, r: .60, a: .22, ox: .05, oy: .04, k: 1, ph: 0, op: 'screen' },    // cool key light, top-left
  { col: [10, 104, 160], x: .72, y: .62, r: .55, a: .16, ox: .04, oy: .05, k: 1, ph: 2.1, op: 'screen' },
  { col: ORANGE, x: .95, y: .98, r: .55, a: .62, ox: .035, oy: .03, k: 1, ph: 1.2, op: 'source-over' },      // warm glow, bottom-right
  { col: [255, 150, 70], x: .93, y: .96, r: .30, a: .16, ox: .035, oy: .03, k: 1, ph: 1.2, op: 'lighter' },    // its hot core
  { col: ORANGE, x: .03, y: .04, r: .34, a: .30, ox: .03, oy: .02, k: 1, ph: 3.6, op: 'source-over' },        // faint warm echo, top-left
  { col: GREEN, x: .06, y: .90, r: .26, a: .30, ox: .02, oy: .02, k: 1, ph: 4.4, op: 'source-over', rare: true }, // green hint that comes and goes
];

// ---------------------------------------------------------------- light lines
// cubic curves entering from the sides and bending away from the centre.
// points in normalised units; d = depth (parallax, softness); pulses travel along each line.
const LINES = [
  // upper band — sweep over the top of the frame
  { p: [[-.08, .40], [.25, .06], [.70, .02], [1.08, .30]], col: 'b', d: .9, w: 2.2, a: .55, pul: [[1, .1]] },
  { p: [[-.08, .30], [.30, .10], [.62, .16], [1.08, .06]], col: 'o', d: 1.1, w: 2.0, a: .55, pul: [[1, .55]] },
  { p: [[-.08, .18], [.35, -.02], [.72, .20], [1.08, .12]], col: 'b', d: .55, w: 1.4, a: .35, pul: [[2, .3]] },
  // lower band — sweep under the bottom
  { p: [[-.08, .70], [.30, .98], [.66, .96], [1.08, .64]], col: 'b', d: 1.2, w: 2.4, a: .6, pul: [[1, .7]] },
  { p: [[-.08, .86], [.28, .82], [.60, 1.02], [1.08, .80]], col: 'o', d: .8, w: 1.9, a: .5, pul: [[1, .25]] },
  { p: [[-.08, .96], [.40, .84], [.75, .80], [1.08, .94]], col: 'g', d: .6, w: 1.3, a: .32, pul: [[1, .85]] },
  // side sweeps — enter from one side, curve out through top / bottom edge
  { p: [[1.08, .52], [.86, .52], [.80, .22], [.66, -.08]], col: 'b', d: .7, w: 1.5, a: .4, pul: [[1, .45]] },
  { p: [[-.08, .56], [.14, .58], [.20, .86], [.36, 1.08]], col: 'b', d: .75, w: 1.5, a: .38, pul: [[1, .95]] },
  { p: [[1.08, .44], [.90, .60], [.88, .84], [.74, 1.08]], col: 'o', d: .5, w: 1.2, a: .3, pul: [[1, .65]] },
];
const COLS = { b: [BLUE_CORE, [40, 150, 215]], o: [ORANGE_CORE, ORANGE], g: [GREEN_CORE, GREEN] };

function bez(p, s) {
  const u = 1 - s;
  return [u * u * u * p[0][0] + 3 * u * u * s * p[1][0] + 3 * u * s * s * p[2][0] + s * s * s * p[3][0],
          u * u * u * p[0][1] + 3 * u * u * s * p[1][1] + 3 * u * s * s * p[2][1] + s * s * s * p[3][1]];
}

// ---------------------------------------------------------------- sparse bokeh (very few)
const DOTS = []; { const r = rng(5); for (let i = 0; i < 22; i++) {
  let x, y; do { x = r(); y = r(); } while (Math.abs(x - .5) < .3 && Math.abs(y - .5) < .26);   // keep centre clear
  DOTS.push({ x, y, s: 4 + r() * 10, a: .12 + r() * .18, ph: r() * TAU, ax: .006 + r() * .01, ay: .01 + r() * .015, col: r() < .7 ? BLUE_CORE : r() < .85 ? ORANGE_CORE : GREEN_CORE });
} }

// ---------------------------------------------------------------- pre-rendered helpers
function radial(r, col) {
  const c = mk(r * 2, r * 2), g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(.4, rgba(col, .45)); gr.addColorStop(.7, rgba(col, .14)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
}
const FIELD_SPR = FIELDS.map(f => radial(512, f.col));
const DOT_SPR = { };
for (const [k, c] of [['b', BLUE_CORE], ['o', ORANGE_CORE], ['g', GREEN_CORE]]) DOT_SPR[k] = radial(64, c);
const dotKey = c => c === BLUE_CORE ? 'b' : c === ORANGE_CORE ? 'o' : 'g';

// film grain breaks up gradient banding in the 8-bit encode
const GRAIN = []; { const r = rng(77); for (let i = 0; i < 8; i++) { const g = mk(960, 540), gc = g.getContext('2d'), id = gc.createImageData(960, 540); for (let j = 0; j < id.data.length; j += 4) { const v = 128 + (r() - .5) * 60; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; } gc.putImageData(id, 0, 0); GRAIN.push(g); } }
const bloomC = mk(W / 8, H / 8);

// ---------------------------------------------------------------- frame
function renderFrame(t) {
  const th = TAU * (t % DURATION) / DURATION;
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';

  // 1. base: deep blue, darker toward the edges, slightly lifted in the clear centre
  const breathe = .5 + .5 * Math.sin(th);                          // one slow breath per loop
  const base = c.createRadialGradient(W * .5, H * .47, 0, W * .5, H * .5, W * .62);
  base.addColorStop(0, rgba(mix(BLUE, [14, 104, 156], .3 + .25 * breathe), 1));
  base.addColorStop(.38, rgba(mix(BLUE, [0, 30, 52], .22), 1));
  base.addColorStop(.72, rgba(mix(BLUE, [0, 18, 34], .62), 1));
  base.addColorStop(1, rgba(mix(BLUE, [0, 8, 18], .86), 1));
  c.fillStyle = base; c.fillRect(0, 0, W, H);

  // 2. atmosphere: slow orbiting colour fields
  FIELDS.forEach((f, i) => {
    const x = (f.x + f.ox * Math.cos(th * f.k + f.ph)) * W, y = (f.y + f.oy * Math.sin(th * f.k + f.ph)) * H;
    let a = f.a * (.82 + .18 * Math.sin(th * 2 + f.ph));
    if (f.rare) a *= Math.pow(.5 + .5 * Math.sin(th + f.ph), 3);   // green only surfaces briefly
    const r = f.r * W;
    c.globalCompositeOperation = f.op; c.globalAlpha = a;
    c.drawImage(FIELD_SPR[i], x - r, y - r, r * 2, r * 2);
  });
  c.globalAlpha = 1;

  // 3. glass depth: two very wide translucent bands with a faint specular edge
  c.globalCompositeOperation = 'screen';
  for (const [pts, a, ph] of [[[[-.1, .18], [.3, -.05], [.6, .05], [1.1, -.02]], .05, 0], [[[-.1, 1.02], [.35, .80], [.7, .92], [1.1, .78]], .045, 2.4]]) {
    const q = pts.map(([x, y], j) => [x * W, (y + .012 * Math.sin(th + ph + j)) * H]);
    c.lineCap = 'round';
    c.strokeStyle = rgba([60, 150, 205], a); c.lineWidth = H * .16;
    c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.bezierCurveTo(q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]); c.stroke();
    c.strokeStyle = rgba([170, 225, 250], a * 1.1); c.lineWidth = 2;
    c.beginPath(); c.moveTo(q[0][0], q[0][1] + H * .08); c.bezierCurveTo(q[1][0], q[1][1] + H * .08, q[2][0], q[2][1] + H * .08, q[3][0], q[3][1] + H * .08); c.stroke();
  }

  // 4. light lines — additive, three passes (halo, glow, core), with travelling pulses
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'butt';   // butt: no bead where segments overlap
  const N = 150;
  for (let li = 0; li < LINES.length; li++) {
    const L = LINES[li], [core, glowC] = COLS[L.col];
    // gentle organic sway of the control points + depth parallax
    const p = L.p.map(([x, y], j) => [
      (x + L.d * .012 * Math.sin(th + li)) * W,
      (y + .018 * L.d * Math.sin(th + li * 1.7 + j * 1.3) + (j === 1 || j === 2 ? .012 * Math.cos(th * 2 + li + j) : 0)) * H]);
    const breatheL = .78 + .22 * Math.sin(th * 2 + li * 2.3);
    const pts = []; for (let i = 0; i <= N; i++) pts.push(bez(p, i / N));
    const alpha = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = (i + .5) / N;
      let a = Math.pow(Math.sin(Math.PI * s), .7) * .45;              // fade in/out at the ends
      for (const [k, ph] of L.pul) {                                   // pulses: k laps per loop → seamless
        const pos = ((k * (t % DURATION) / DURATION + ph) % 1) * 1.3 - .15;
        const dsp = s - pos;
        a += dsp < 0 ? Math.exp(-Math.pow(dsp / .10, 2)) * .9 : Math.exp(-Math.pow(dsp / .035, 2)) * .9;   // long tail behind the head
      }
      alpha[i] = a * L.a * breatheL;
    }
    const soft = 1.4 - L.d * .5;                                       // far lines: more halo, less core
    const warm = L.col !== 'b';
    for (const [wm, am, col, op] of [[16 * soft, warm ? .1 : .06, glowC, warm ? 'source-over' : 'lighter'],
                                      [5 * soft, warm ? .3 : .22, glowC, warm ? 'source-over' : 'lighter'],
                                      [1, (warm ? .75 : 1) / soft, core, 'lighter']]) {
      c.globalCompositeOperation = op;
      c.lineWidth = L.w * wm * 2.1;
      for (let i = 0; i < N; i++) {
        if (alpha[i] < .004) continue;
        c.strokeStyle = rgba(col, alpha[i] * am);
        c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke();
      }
    }
  }

  c.globalCompositeOperation = 'lighter';
  // 5. a few soft out-of-focus motes, well away from the centre
  for (const d of DOTS) {
    const x = (d.x + d.ax * Math.sin(th + d.ph)) * W, y = (d.y + d.ay * Math.sin(th + d.ph * 1.3) - .004) * H;
    const r = d.s * 3;
    c.globalAlpha = d.a * (.6 + .4 * Math.sin(th * 2 + d.ph));
    c.drawImage(DOT_SPR[dotKey(d.col)], x - r, y - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;

  // 6. finishing: soft bloom, vignette, grain
  const b = bloomC.getContext('2d');
  b.filter = 'none'; b.clearRect(0, 0, bloomC.width, bloomC.height);
  b.filter = 'brightness(.9) contrast(1.8) blur(6px)'; b.drawImage(canvas, 0, 0, bloomC.width, bloomC.height);
  c.globalCompositeOperation = 'screen'; c.globalAlpha = .3; c.drawImage(bloomC, 0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  const vg = c.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, W * .62);
  vg.addColorStop(0, 'rgba(0,8,16,0)'); vg.addColorStop(1, 'rgba(0,8,16,.5)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = .05;
  c.drawImage(GRAIN[Math.round(t * FPS) % GRAIN.length], 0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

const FILM = window.FILM = { W, H, FPS, DURATION, renderFrame, ready: true };
renderFrame(0);
})();
