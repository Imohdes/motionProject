/* Static "night city lights" texture for the cinematic background (drawn once). */
(function () {
  const canvas = document.getElementById("bgLights");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // deterministic PRNG so the screen looks identical on every load
  let seed = 20240917;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  function cluster(cx, cy, spread, count, warm) {
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 1.8) * spread;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.6;
      const s = rnd() * 1.3 + 0.3;
      const alpha = 0.25 + rnd() * 0.65;
      ctx.fillStyle = warm
        ? `rgba(255, ${170 + (rnd() * 60) | 0}, ${90 + (rnd() * 50) | 0}, ${alpha})`
        : `rgba(${150 + (rnd() * 60) | 0}, ${200 + (rnd() * 40) | 0}, 255, ${alpha * 0.8})`;
      ctx.fillRect(x, y, s, s);
    }
  }

  // faint blue "data" dust on the left side of the screen
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * 1080;
    const y = 120 + rnd() * 860;
    ctx.fillStyle = `rgba(90, 170, 255, ${rnd() * 0.18})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // distant towns (neighbouring land, bottom-left coast, horizon)
  cluster(60, 880, 70, 140, true);
  cluster(150, 930, 90, 160, true);
  cluster(40, 600, 60, 90, true);
  cluster(980, 210, 120, 120, true);
  cluster(1150, 225, 160, 140, true);
  cluster(1500, 215, 180, 160, true);
  cluster(1820, 230, 120, 120, true);
  cluster(120, 220, 120, 80, false);
  cluster(860, 960, 140, 120, false);

  // glow halo for the bottom-left coast
  const g = ctx.createRadialGradient(120, 860, 10, 120, 860, 260);
  g.addColorStop(0, "rgba(255,150,60,.10)");
  g.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 600, 500, 480);
})();
