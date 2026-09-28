/* Team Nostromo — 2D interactions (no dependencies)
   - entrance motion for content below the fold
   - lightbox for photos
   - inertial impactor simulator (Stokes-number physics) */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- entrance motion: only for things not on screen at load ---------- */
  if ("IntersectionObserver" in window && !reduce) {
    const vh = window.innerHeight;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); e.target.classList.remove("pre"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll(".reveal").forEach((el) => {
      if (el.getBoundingClientRect().top > vh) { el.classList.add("pre"); io.observe(el); }
    });
  }

  /* ---------- lightbox ---------- */
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = '<img alt="">';
  document.body.appendChild(lb);
  lb.addEventListener("click", () => lb.classList.remove("open"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.classList.remove("open"); });
  document.querySelectorAll("a.zoom").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const img = lb.querySelector("img");
      img.src = a.getAttribute("href"); img.alt = a.querySelector("img")?.alt || "";
      lb.classList.add("open");
    });
  });

  /* ---------- impactor simulator ----------
     Dimensionless: lengths in nozzle widths W, speeds in jet speed V.
     Droplet relaxation: Stk = rho * d^2 * Cc * V / (18 * mu * W). */
  const cv = document.getElementById("sim");
  if (!cv) return;
  const g = cv.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const sV = $("sim-speed"), sW = $("sim-width");
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const C = { line: col("--line"), line2: col("--line-2"), text: col("--text"), muted: col("--muted"), dim: col("--dim"), teal: col("--signal"), tealInk: col("--signal-ink"), blue: col("--cyan"), bg2: col("--bg-2") };

  const RHO = 1000, MU = 1.81e-5, LAMBDA = 0.066; // kg/m3, Pa·s, µm
  const H = 1.5, PLATE = 2.3, TOP = -4.2;          // jet-to-plate spacing, plate half-width, nozzle top (in W)
  let V = +sV.value, Wmm = +sW.value;
  let scale = 50, ox = 0, oy = 0, w = 0, h = 0;
  const drops = [], tracers = [], deposits = [];
  const outcomes = [];                              // {d, hit}
  const bins = [[0.5, 1], [1, 2.5], [2.5, 5]];

  function stk(dUm) {
    const d = dUm * 1e-6, cc = 1 + (2.52 * LAMBDA) / dUm;
    return (RHO * d * d * cc * V) / (18 * MU * (Wmm * 1e-3));
  }
  function flow(x, y) {
    if (y < 0) return Math.abs(x) < 0.5 ? [0, 1] : [0, 0];
    const eta = Math.max(0, H - y), a = 1 / H;
    const u = Math.max(-1.7, Math.min(1.7, a * x * 1.25));
    const vv = a * eta * Math.exp(-(x * x) / 1.6);
    return [u, vv];
  }
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(w / 12.5, h / 6.9); ox = w / 2;
    const span = (H + 1.1) - (TOP - 0.5); oy = (h - span * scale) / 2 - (TOP - 0.5) * scale;
    deposits.length = 0;
  }
  const X = (x) => ox + x * scale, Y = (y) => oy + y * scale;

  function spawn() {
    const d = Math.exp(Math.log(0.5) + Math.random() * (Math.log(5) - Math.log(0.5)));
    drops.push({ x: (Math.random() - 0.5) * 0.8, y: TOP, u: 0, v: 1, d, s: stk(d) });
  }
  function step(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i];
      const [fu, fv] = flow(p.x, p.y), k = Math.exp(-dt / Math.max(p.s, 1e-4));
      p.u = fu + (p.u - fu) * k; p.v = fv + (p.v - fv) * k;
      p.x += p.u * dt; p.y += p.v * dt;
      if (p.y >= H - 0.04 && Math.abs(p.x) <= PLATE) { deposits.push({ x: p.x, d: p.d }); if (deposits.length > 260) deposits.shift(); record(p.d, true); drops.splice(i, 1); continue; }
      if (Math.abs(p.x) > 6.2 || p.y > H + 2) { record(p.d, false); drops.splice(i, 1); }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i], [fu, fv] = flow(t.x, t.y);
      t.x += fu * dt; t.y += fv * dt;
      if (Math.abs(t.x) > 6.2 || t.y > H) tracers.splice(i, 1);
    }
  }
  function record(d, hit) { outcomes.push({ d, hit }); if (outcomes.length > 400) outcomes.shift(); }

  function sizeColor(d) {
    const t = (Math.log(d) - Math.log(0.5)) / (Math.log(5) - Math.log(0.5));
    return `hsl(${Math.round(226 + 14 * t)} ${Math.round(85 + 10 * t)}% ${Math.round(84 - 22 * t)}%)`;
  }

  function draw() {
    g.clearRect(0, 0, w, h);
    // walls of the nozzle
    g.fillStyle = C.bg2;
    g.fillRect(X(-6.2), Y(TOP) - 18, X(-0.5) - X(-6.2), Y(0) - Y(TOP) + 18);
    g.fillRect(X(0.5), Y(TOP) - 18, X(6.2) - X(0.5), Y(0) - Y(TOP) + 18);
    g.strokeStyle = C.line2; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(-6.2), Y(0)); g.lineTo(X(-0.5), Y(0)); g.lineTo(X(-0.5), Y(TOP) - 18); g.stroke();
    g.beginPath(); g.moveTo(X(6.2), Y(0)); g.lineTo(X(0.5), Y(0)); g.lineTo(X(0.5), Y(TOP) - 18); g.stroke();
    // electrode strip
    g.fillStyle = C.teal; g.globalAlpha = 0.18; g.fillRect(X(-PLATE), Y(H), X(PLATE) - X(-PLATE), 10); g.globalAlpha = 1;
    g.fillStyle = C.teal; g.fillRect(X(-PLATE), Y(H), X(PLATE) - X(-PLATE), 3);
    // gas tracers
    g.fillStyle = C.blue; g.globalAlpha = 0.35;
    tracers.forEach((t) => { g.beginPath(); g.arc(X(t.x), Y(t.y), 1.4, 0, 6.283); g.fill(); });
    g.globalAlpha = 1;
    // droplets
    drops.forEach((p) => { g.fillStyle = sizeColor(p.d); g.beginPath(); g.arc(X(p.x), Y(p.y), 1.2 + p.d * 0.75, 0, 6.283); g.fill(); });
    // deposits on the strip
    deposits.forEach((q) => { g.fillStyle = sizeColor(q.d); g.beginPath(); g.arc(X(q.x), Y(H) - 1 - q.d * 0.5, 1 + q.d * 0.55, 0, 6.283); g.fill(); });
    // labels
    g.font = "11px JetBrains Mono, ui-monospace, monospace"; g.fillStyle = C.muted;
    g.fillText("breath in ↓", X(0.8), Y(TOP) + 4);
    g.fillText(`nozzle ${Wmm.toFixed(1)} mm`, X(0.8), Y(-1.2));
    g.fillStyle = C.blue; g.fillText("gas → exhaust", X(3.3), Y(0.75));
    g.textAlign = "right"; g.fillText("exhaust ←", X(-3.3), Y(0.75)); g.textAlign = "left";
    g.fillStyle = C.tealInk; g.fillText("electrode strip", X(-PLATE), Y(H) + 26);
  }

  function stats() {
    const d50 = Math.sqrt((0.59 * 18 * MU * Wmm * 1e-3) / (RHO * V)) * 1e6;
    $("sim-d50").textContent = d50 < 0.5 ? "< 0.5 µm" : d50 > 5 ? "> 5 µm" : `≈ ${d50.toFixed(1)} µm`;
    bins.forEach(([a, b], i) => {
      const o = outcomes.filter((q) => q.d >= a && q.d < b);
      const r = o.length ? o.filter((q) => q.hit).length / o.length : 0;
      $("sim-b" + i).style.width = (r * 100).toFixed(0) + "%";
      $("sim-v" + i).textContent = o.length ? Math.round(r * 100) + "%" : "—";
    });
  }

  function update() {
    V = +sV.value; Wmm = +sW.value;
    $("sim-speed-o").textContent = V + " m/s"; $("sim-width-o").textContent = Wmm.toFixed(1) + " mm";
    drops.forEach((p) => (p.s = stk(p.d)));
    outcomes.length = 0; deposits.length = 0;
  }
  sV.addEventListener("input", update); sW.addEventListener("input", update);

  let visible = true, last = performance.now(), acc = 0;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(cv);
  new ResizeObserver(resize).observe(cv);
  resize(); update();

  // warm up so the first frame already shows a working state
  for (let i = 0; i < 700; i++) { if (i % 2 === 0) spawn(); if (i % 1 === 0) tracers.push({ x: (Math.random() - 0.5) * 0.9, y: TOP }); step(0.03); }
  draw(); stats();
  if (reduce) return;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible) {
      const sim = dt * (0.9 + V * 0.05);
      acc += dt;
      for (let i = 0; i < 2; i++) spawn();
      for (let i = 0; i < 3; i++) tracers.push({ x: (Math.random() - 0.5) * 0.9, y: TOP });
      for (let i = 0; i < 4; i++) step(sim / 4 * 1.6);
      draw();
      if (acc > 0.4) { stats(); acc = 0; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
