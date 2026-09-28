/* Team Nostromo — opening scene
   Thousands of "breath droplets" drift in from a cloud and settle into the
   word NOSTROMO. The word breathes; the cursor blows droplets away; scrolling
   exhales them upward. Plain 2D canvas, no libraries. */
(function () {
  const canvas = document.getElementById("breath");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const WORD = canvas.dataset.word || "NOSTROMO";
  const css = getComputedStyle(document.documentElement);
  const COLORS = [css.getPropertyValue("--text").trim() || "#eceefe", "#c9cfff", css.getPropertyValue("--signal").trim() || "#8e9bff", "#6f7dff", css.getPropertyValue("--cyan").trim() || "#4fb3e8"];
  const WEIGHTS = [0.42, 0.24, 0.2, 0.09, 0.05];

  let W = 0, H = 0, dpr = 1, parts = [], started = false, t0 = 0, visible = true;
  const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, speed: 0 };

  const pickColor = () => { let r = Math.random(), i = 0; while (r > WEIGHTS[i] && i < WEIGHTS.length - 1) { r -= WEIGHTS[i]; i++; } return COLORS[i]; };

  /* sample the word into target points */
  function targets() {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const g = off.getContext("2d");
    let size = Math.min(H * 0.42, 400);
    g.font = `800 ${size}px "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif`;
    const maxW = W * (W < 700 ? 0.92 : 0.86);
    const mw = g.measureText(WORD).width;
    size *= Math.min(1, maxW / mw);
    g.font = `800 ${size}px "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff";
    if ("letterSpacing" in g) g.letterSpacing = `${-size * 0.03}px`;
    g.fillText(WORD, W / 2, H * 0.47);
    const data = g.getImageData(0, 0, W, H).data;
    const step = Math.max(3, Math.round(Math.sqrt((W * H) / 24000)));
    const pts = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 140) pts.push([x + (Math.random() - 0.5) * step * 0.6, y + (Math.random() - 0.5) * step * 0.6]);
    }
    return { pts, step };
  }

  function build() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.round(r.width); H = Math.round(r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { pts, step } = targets();
    const old = parts;
    parts = pts.map(([tx, ty], i) => {
      const o = old[i];
      /* new droplets start as a loose cloud drifting in from the lower left, like an exhale */
      const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.6) * Math.max(W, H) * 0.35;
      return {
        tx, ty,
        x: o ? o.x : W * 0.18 + Math.cos(a) * rr, y: o ? o.y : H * 0.85 + Math.sin(a) * rr * 0.6,
        vx: 0, vy: 0,
        r: Math.max(0.8, step * (0.28 + Math.random() * 0.22)),
        c: pickColor(),
        delay: o ? 0 : (tx / W) * 0.9 + Math.random() * 0.5,
        seed: Math.random() * 1000,
        drift: [(Math.random() - 0.5) * 2, -0.4 - Math.random()],
      };
    });
    if (reduce) parts.forEach((p) => { p.x = p.tx; p.y = p.ty; });
  }

  function start() {
    if (started) return;
    started = true; t0 = performance.now();
    loop(t0);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (visible) draw(now, dt);
    if (!reduce) requestAnimationFrame(loop);
  }

  function draw(now, dt) {
    const t = (now - t0) / 1000;
    const exhale = Math.min(1, Math.max(0, scrollY / (H * 0.75)));   // scroll → droplets leave
    const breath = Math.sin(t * 1.25) * 0.5 + 0.5;                    // slow breathing, ~5 s cycle
    const scale = 1 + (breath - 0.5) * 0.012;
    const cx = W / 2, cy = H * 0.47;
    mouse.speed *= 0.9;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (t < p.delay && !reduce) { p.x += p.drift[0] * 0.3; p.y += p.drift[1] * 0.3; }
      else {
        let tx = cx + (p.tx - cx) * scale, ty = cy + (p.ty - cy) * scale;
        tx += Math.sin(t * 0.9 + p.seed) * 0.6; ty += Math.cos(t * 1.1 + p.seed) * 0.6;
        if (exhale > 0) {                                                // drift up and outward
          tx += p.drift[0] * exhale * 180 + (p.tx - cx) * exhale * 0.25;
          ty += (p.drift[1] * 260 - 60) * exhale;
        }
        const k = reduce ? 1 : 0.055;
        p.vx += (tx - p.x) * k; p.vy += (ty - p.y) * k;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy, R = 110 + mouse.speed * 0.25;
        if (d2 < R * R) {                                                // blow droplets away from the cursor
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) * (4 + mouse.speed * 0.02);
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }
        p.vx *= 0.82; p.vy *= 0.82;
        p.x += p.vx; p.y += p.vy;
      }
      const alpha = (1 - exhale * 0.95) * (0.55 + 0.45 * Math.sin(t * 2 + p.seed) ** 2);
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  /* pointer: track position and speed so fast swipes blow harder */
  addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (mouse.px > -9000) mouse.speed = Math.min(1500, mouse.speed + Math.hypot(x - mouse.px, y - mouse.py) * 4);
    mouse.px = mouse.x = x; mouse.py = mouse.y = y;
  }, { passive: true });
  canvas.addEventListener("pointerleave", () => { mouse.x = mouse.y = mouse.px = mouse.py = -9999; });
  document.addEventListener("pointerleave", () => { mouse.x = mouse.y = mouse.px = mouse.py = -9999; });

  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(canvas);
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); if (reduce) draw(performance.now(), 0); }, 150); });

  /* wait for the display font (max 1.5 s) so the droplets trace the real letterforms */
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('800 100px "Bricolage Grotesque"'), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  fontReady.then(() => {
    build();
    if (reduce) { started = true; t0 = performance.now(); draw(t0, 0); return; }
    if (window.__nostromoRevealed) start();
    else addEventListener("nostromo:reveal", start, { once: true });
    setTimeout(start, 4000); // failsafe
  });
})();
