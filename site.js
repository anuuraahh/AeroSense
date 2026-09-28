/* Team Nostromo — shared signature layer
   intro loader · page curtain · live clock ·
   kinetic type · work-row previews · copy email            */
(function () {
  const d = document, root = d.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------- split text into animatable pieces ---------- */
  d.querySelectorAll(".kinetic").forEach((el) => {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.textContent = "";
    [...text].forEach((c, i) => {
      const m = d.createElement("span"); m.className = "mask"; m.setAttribute("aria-hidden", "true");
      const s = d.createElement("span"); s.className = "ch"; s.style.setProperty("--i", i);
      s.textContent = c === " " ? " " : c;
      m.appendChild(s); el.appendChild(m);
    });
  });
  d.querySelectorAll(".split-words").forEach((el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(" ")); return; }
            const w = d.createElement("span"); w.className = "word";
            const inner = d.createElement("span"); inner.style.setProperty("--i", i++); inner.textContent = part;
            w.appendChild(inner); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    };
    walk(el);
  });
  /* ---------- giant words fill their container exactly, whatever font loads ---------- */
  const fit = () => d.querySelectorAll(".mega").forEach((el) => {
    const masks = el.querySelectorAll(".mask"); if (!masks.length) return;
    el.style.fontSize = "";
    const size = parseFloat(getComputedStyle(el).fontSize);
    const w = masks[masks.length - 1].getBoundingClientRect().right - masks[0].getBoundingClientRect().left;
    const avail = el.clientWidth;
    if (w > 0 && avail > 0) el.style.fontSize = Math.min(340, size * (avail * 0.995) / w) + "px";
  });
  fit();
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(fit);
  let fitT; addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(fit, 120); });

  /* headings animate in when they reach the viewport; the ones already on screen go first */
  let revealIO = null;
  const reveal = () => {
    window.__nostromoRevealed = true;
    dispatchEvent(new Event("nostromo:reveal"));      // hero.js starts the droplet scene on this
    d.querySelectorAll(".intro").forEach((el) => el.classList.add("on"));
    const els = [...d.querySelectorAll(".kinetic, .split-words")];
    if (!("IntersectionObserver" in window) || reduce) { els.forEach((el) => el.classList.add("ready")); return; }
    revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("ready"); revealIO.unobserve(e.target); }
    }), { rootMargin: "0px 0px -12% 0px" });
    els.forEach((el) => revealIO.observe(el));
  };
  window.__siteReady = true;

  /* ---------- page curtain ---------- */
  let curtain = d.querySelector(".curtain");
  if (!curtain) { curtain = d.createElement("div"); curtain.className = "curtain"; curtain.innerHTML = "<span></span>"; d.body.appendChild(curtain); }
  const cameByCurtain = root.classList.contains("from-curtain");
  if (cameByCurtain) {
    requestAnimationFrame(() => {
      setTimeout(() => curtain.classList.add("out"), 180);   // hold the AeroSense screen for a beat, then ease it away
      setTimeout(() => { root.classList.remove("from-curtain"); curtain.classList.remove("out"); }, 750);
    });
  }
  /* "/", "/index.html", "/aerosense" and "/aerosense.html" should all count as the same page */
  const pageOf = (p) => p.replace(/index(\.html)?$/, "").replace(/\.html$/, "");
  const samePage = (url) => pageOf(url.pathname) === pageOf(location.pathname);

  /* warm the other page's HTML while the pointer is still on its way to the link */
  const warmed = new Set();
  const warm = (href) => {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || samePage(url)) return;
      const key = url.pathname; if (warmed.has(key)) return; warmed.add(key);
      const l = d.createElement("link"); l.rel = "prefetch"; l.href = url.pathname; d.head.appendChild(l);
    } catch (e) {}
  };
  ["pointerover", "focusin", "touchstart"].forEach((ev) => d.addEventListener(ev, (e) => {
    const a = e.target.closest && e.target.closest("a[href]"); if (a) warm(a.href);
  }, { passive: true }));
  addEventListener("load", () => setTimeout(() => d.querySelectorAll("a[data-curtain], a[href$='.html'], a[href*='.html#']").forEach((a) => warm(a.href)), 1500), { once: true });

  d.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
    if (a.getAttribute("href") === "#") { e.preventDefault(); return; }        // placeholder links (team socials) do nothing yet
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (samePage(url)) {
      if (url.hash.length > 1) return;                     // same page + #section: the anchor handler scrolls there
      e.preventDefault();                                   // e.g. the logo on its own page: glide back to the top
      if (lenis) lenis.scrollTo(0, { duration: 1 }); else scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    /* other page: the browser navigates straight away (nothing to wait for; the page is already prefetched).
       The dark label screen just fades in over the old page and fades out on the new one. */
    store.set("nostromo-intro", "1");                      // never replay the intro loader mid-visit
    if (reduce) return;
    const label = "AeroSense";                               // every page change shows the same AeroSense screen
    store.set("nostromo-curtain", "1"); store.set("nostromo-curtain-label", label);
    curtain.querySelector("span").textContent = label;
    curtain.classList.remove("out"); curtain.classList.add("in");
  });
  addEventListener("pageshow", (e) => { if (e.persisted) curtain.classList.remove("in"); });

  /* ---------- intro loader ---------- */
  const loader = d.querySelector(".loader");
  const firstVisit = loader && !root.classList.contains("intro-seen") && !reduce && !cameByCurtain;
  if (firstVisit && loader) {
    const count = loader.querySelector("[data-count]");
    const t0 = performance.now(), dur = 1500;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      if (count) count.textContent = String(Math.round(p * 100)).padStart(3, "0");
      if (p < 1) requestAnimationFrame(tick);
      else {
        loader.classList.add("done"); store.set("nostromo-intro", "1");
        setTimeout(reveal, 250);
        setTimeout(() => loader.remove(), 1000);
      }
    };
    requestAnimationFrame(tick);
  } else {
    if (loader) loader.remove();
    store.set("nostromo-intro", "1");
    setTimeout(reveal, cameByCurtain ? 120 : 60);
  }

  /* ---------- deep space: a few distant stars, drawn once (no animation, no cost) ---------- */
  (() => {
    const c = d.createElement("canvas"); c.className = "stars"; c.setAttribute("aria-hidden", "true");
    d.body.prepend(c);
    const g = c.getContext("2d"); if (!g) return;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // same sky on every load
    const draw = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
      c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = 7;
      const n = Math.round((W * H) / 9000);                       // sparse: ~140 on a laptop screen
      for (let i = 0; i < n; i++) {
        const x = rnd() * W, y = rnd() * H, z = rnd();
        g.globalAlpha = 0.18 + z * z * 0.6;
        g.fillStyle = rnd() < 0.2 ? "#c9cfff" : "#eef0ff";
        g.beginPath(); g.arc(x, y, 0.35 + z * z * 0.9, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    };
    draw(); let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  })();

  /* ---------- live clock (India Standard Time) ---------- */
  const tf = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const df = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  const clocks = d.querySelectorAll("[data-clock]"), dates = d.querySelectorAll("[data-date]");
  const tickClock = () => {
    const now = new Date();
    clocks.forEach((c) => (c.textContent = tf.format(now) + " IST"));
    dates.forEach((c) => (c.textContent = df.format(now).toUpperCase()));
  };
  if (clocks.length || dates.length) { tickClock(); setInterval(tickClock, 1000); }

  /* ---------- kinetic letters react to the pointer ---------- */
  /* letters thin out near the cursor. Each letter's box is locked to its normal width (in em, so it
     still scales with the headline) and weights ease towards their targets every frame, so
     nothing reflows or jitters while the pointer moves */
  d.querySelectorAll(".kinetic[data-react]").forEach((el) => {
    if (!fine || reduce) return;
    const chars = [...el.querySelectorAll(".ch")];
    const cur = chars.map(() => 800), goal = chars.map(() => 800);
    let centers = [], px = -1e4, py = -1e4, raf = 0, locked = false;
    const lock = () => {
      chars.forEach((c) => { c.style.width = ""; c.style.setProperty("--w", 800); });
      const fs = parseFloat(getComputedStyle(el).fontSize) || 1;
      chars.forEach((c) => { c.style.width = (c.getBoundingClientRect().width / fs).toFixed(4) + "em"; });
      chars.forEach((c, i) => c.style.setProperty("--w", Math.round(cur[i])));
      locked = true;
    };
    const measure = () => { centers = chars.map((c) => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); };
    const step = () => {
      raf = 0;
      const sigma = Math.max(70, innerWidth * 0.075);
      let moving = false;
      chars.forEach((c, i) => {
        const [cx, cy] = centers[i] || [0, 0];
        const dx = px - cx, dy = py - cy;
        goal[i] = 800 - 520 * Math.exp(-(dx * dx + dy * dy * 0.25) / (2 * sigma * sigma));
        const next = cur[i] + (goal[i] - cur[i]) * 0.14;
        if (Math.abs(goal[i] - next) > 0.5) moving = true;
        if (Math.round(next) !== Math.round(cur[i])) c.style.setProperty("--w", Math.round(next));
        cur[i] = next;
      });
      if (moving) raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    const zone = el.closest("section, header") || el;
    zone.addEventListener("pointerenter", () => { if (!locked) lock(); measure(); });
    zone.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; if (!centers.length) measure(); kick(); });
    zone.addEventListener("pointerleave", () => { px = py = -1e4; kick(); });
    addEventListener("scroll", () => { centers = []; }, { passive: true });
    addEventListener("resize", () => { locked = false; centers = []; });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => { locked = false; });
  });

  /* (custom cursor removed: the normal system cursor is used everywhere) */

  /* ---------- copy email ---------- */
  d.querySelectorAll(".copy-mail").forEach((b) => {
    b.addEventListener("click", async () => {
      const mail = b.dataset.email, hint = b.querySelector(".hint");
      try { await navigator.clipboard.writeText(mail); }
      catch (e) { const r = d.createRange(); r.selectNodeContents(b.querySelector(".addr")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      b.classList.add("copied"); if (hint) hint.textContent = "copied ✓";
      setTimeout(() => { b.classList.remove("copied"); if (hint) hint.textContent = "click to copy"; }, 2200);
    });
  });


  /* ==========================================================
     Motion engine: smooth scroll, scrub text, parallax,
     marquee, pinned numbers, horizontal gallery, magnetic
     ========================================================== */
  let lenis = null;
  const startLenis = () => {
    if (lenis || !window.Lenis || reduce) return;
    lenis = new window.Lenis({ lerp: 0.075, wheelMultiplier: 0.75, touchMultiplier: 0.85, smoothWheel: true });
    window.__lenis = lenis;
    if (location.hash.length < 2) { if (window.__arriveTop) window.__arriveTop(); else if (scrollY < 2) lenis.scrollTo(0, { immediate: true, force: true }); }
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  };
  /* ---------- anchor links: land exactly on the section, below the top bar ----------
     Pinned sections size themselves after load and images can shift the layout,
     so the target is re-measured after the scroll and corrected if it drifted. */
  const navOffset = () => d.querySelector(".nav")?.offsetHeight || 0;       // sections sit flush under the top bar
  const topOf = (el) => Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - navOffset()));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let glideMs = 1100;
  const scrollToEl = (el, smooth) => {
    const y = topOf(el);
    /* one smooth glide whose length grows gently with distance (0.7–1.5 s) */
    const dur = Math.min(1.5, Math.max(0.7, 0.55 + Math.abs(y - scrollY) / 9000));
    glideMs = dur * 1000;
    if (lenis) lenis.scrollTo(y, { immediate: !smooth, duration: dur, easing: easeInOut, lock: smooth, force: true });
    else scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
  };
  const settleOn = (el) => {
    const check = () => { if (Math.abs(el.getBoundingClientRect().top - navOffset()) > 3) scrollToEl(el, false); };
    setTimeout(check, reduce ? 60 : glideMs + 150);
    setTimeout(check, glideMs + 900);
  };
  d.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="#"]'); if (!a || e.defaultPrevented) return;
    const url = new URL(a.href, location.href);
    if (!samePage(url) || url.hash.length < 2) return;
    const el = d.getElementById(decodeURIComponent(url.hash.slice(1))); if (!el) return;
    e.preventDefault();
    history.replaceState(null, "", url.hash);
    scrollToEl(el, !reduce); settleOn(el);
    /* replay the heading motion as you land, so every section arrives the same way
       (otherwise a heading can finish animating while it's still gliding into view) */
    if (!reduce) {
      const heads = [...el.querySelectorAll(".split-words")].slice(0, 2);
      heads.forEach((h) => { if (typeof revealIO !== "undefined" && revealIO) revealIO.unobserve(h); h.classList.remove("ready"); });
      setTimeout(() => heads.forEach((h) => h.classList.add("ready")), Math.max(250, glideMs - 250));
    }
  });
  /* arriving from the other page with #section: wait for the layout, then go there */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  /* no #section in the address: always open at the very top (some hosts carry the old
     scroll position over when you move between pages) */
  if (location.hash.length < 2) {
    let touched = false;                                   // never yank someone who has already started scrolling
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((ev) => addEventListener(ev, () => (touched = true), { once: true, passive: true }));
    const toTop = () => { if (touched) return; if (lenis) lenis.scrollTo(0, { immediate: true, force: true }); scrollTo(0, 0); };
    window.__arriveTop = toTop;                            // Lenis calls this again when it starts
    addEventListener("load", toTop, { once: true });
    toTop(); requestAnimationFrame(toTop);
    addEventListener("pageshow", (e) => { if (e.persisted) toTop(); });
  }
  if (location.hash.length > 1) {
    const el = d.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) {
      const jump = () => scrollToEl(el, false);
      jump(); addEventListener("load", () => { sizeH(); jump(); settleOn(el); });
    }
  }

  if (!reduce) {
    if (window.Lenis) startLenis();
    else {
      const ls = d.createElement("script");
      ls.src = "https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"; ls.async = true; ls.onload = startLenis;
      d.head.appendChild(ls);
    }
  }

  /* scrub paragraphs: split into words */
  const scrubs = [...d.querySelectorAll(".scrub")];
  scrubs.forEach((el) => {
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = d.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(" ")); return; }
          const w = d.createElement("span"); w.className = "sw"; w.textContent = part; frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(el);
    el._words = [...el.querySelectorAll(".sw")];
    /* .bolt phrases get a lightning strike the moment their last word lights up */
    el._bolts = [...el.querySelectorAll(".bolt")].map((b) => {
      b.insertAdjacentHTML("beforeend", '<svg class="bolt-svg" viewBox="0 0 40 100" aria-hidden="true"><path pathLength="100" d="M26 0 L14 38 L24 40 L8 72 L18 74 L6 100"/><path class="fork" pathLength="100" d="M14 38 L4 52 L9 55 L1 68"/></svg>');
      return { b, words: [...b.querySelectorAll(".sw")], on: false };
    });
  });
  const strike = (bolt) => {
    bolt.b.classList.remove("strike"); void bolt.b.offsetWidth; bolt.b.classList.add("strike");
    const sec = bolt.b.closest("section");
    if (sec && !reduce) {
      const f = d.createElement("div"); f.className = "bolt-flash"; sec.appendChild(f);
      setTimeout(() => f.remove(), 900);
    }
  };

  const introWord = d.querySelector(".intro-word .mega");
  const introScroll = d.querySelector(".intro-scroll"), introHero = introScroll && introScroll.querySelector(".intro");
  /* the moon reaches down to the last letter of NOSTROMO */
  const sizeMoon = () => {
    const moon = introHero && introHero.querySelector(".moon"), masks = introWord && introWord.querySelectorAll(".mask");
    if (!moon || !masks || !masks.length) return;
    const m = masks[masks.length - 1].getBoundingClientRect(), hr = introHero.getBoundingClientRect();
    const reach = m.top - hr.top + m.height * 0.2;                   // towards the last O
    const w = Math.max(140, Math.min(innerWidth * 0.32, reach / 0.62 / 0.797 * 0.72));   // a backdrop, not the headline
    introHero.style.setProperty("--moon-w", w.toFixed(0) + "px");
  };
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => setTimeout(sizeMoon, 60));
  setTimeout(sizeMoon, 300); addEventListener("resize", () => setTimeout(sizeMoon, 200));
  const parallax = [...d.querySelectorAll("[data-parallax]")];
  const marquees = [...d.querySelectorAll(".marquee-track")].map((t) => ({ t, x: 0, w: 0 }));
  const measureMarquees = () => marquees.forEach((m) => (m.w = m.t.scrollWidth / 2));
  measureMarquees();

  /* pinned numbers story */
  const numbers = [...d.querySelectorAll(".numbers")].map((sec) => ({
    sec, items: [...sec.querySelectorAll(".num-item")], bars: [...sec.querySelectorAll(".num-bar i")],
  }));
  const inr = (v) => "₹" + Math.round(v).toLocaleString("en-IN");
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const formats = { inr, mmss, pct: (v) => Math.round(v) + "%", int: (v) => Math.round(v).toLocaleString("en-IN") };

  /* horizontal galleries */
  const hscrolls = [...d.querySelectorAll(".hscroll")].map((sec) => ({ sec, track: sec.querySelector(".hscroll-track"), bar: sec.querySelector(".hscroll-progress i"), dist: 0 }));
  /* pacing: 2.2px of scrolling per 1px of sideways travel, with a short pause before and after
     so the gallery always reaches the last photo before the page carries on down */
  const H_SPEED = 2.8, holdIn = () => innerHeight * 0.15, holdOut = () => innerHeight * 0.35;
  const sizeH = () => hscrolls.forEach((h) => {
    h.dist = Math.max(0, h.track.scrollWidth - innerWidth);
    h.sec.style.height = reduce ? "auto" : (innerHeight + holdIn() + h.dist * H_SPEED + holdOut()) + "px";
  });
  sizeH();
  addEventListener("resize", () => { sizeH(); measureMarquees(); });
  addEventListener("load", () => { sizeH(); measureMarquees(); });

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let lastY = scrollY, vel = 0, lastT = performance.now();

  const frame = (now) => {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const y = scrollY, vh = innerHeight;
    vel += ((y - lastY) / Math.max(dt, 0.001) - vel) * 0.1; lastY = y;

    /* the opening word exhales as you scroll away from it */
    /* the pinned opening: NOSTROMO blurs away, the AeroSense showcase comes into focus, then it
       blurs away too before the page moves on (progress 0 → 1 across .intro-scroll) */
    if (introScroll && introHero) {
      const r = introScroll.getBoundingClientRect();
      const span = Math.max(1, r.height - introHero.offsetHeight);
      const prog = clamp01(-r.top / span);
      window.__heroProg = prog;
      const seg = (a, b) => clamp01((prog - a) / (b - a));
      const pw = reduce ? (prog > 0.2 ? 1 : 0) : seg(0, 0.26);           // word out
      const sIn = reduce ? (prog > 0.2 ? 1 : 0) : seg(0.2, 0.44);        // showcase in
      const sOut = reduce ? (prog > 0.85 ? 1 : 0) : seg(0.74, 0.97);     // showcase out
      if (introWord) {
        introWord.style.transform = reduce ? "" : `translate3d(0, ${(-pw * 90).toFixed(1)}px, 0) scale(${(1 + pw * 0.1).toFixed(3)})`;
        introWord.style.opacity = (1 - pw).toFixed(3);
        introWord.style.filter = pw > 0.01 && !reduce ? `blur(${(pw * 6).toFixed(1)}px)` : "";
      }
      introHero.style.setProperty("--pw", pw.toFixed(3));
      introHero.style.setProperty("--sin", sIn.toFixed(3));
      introHero.style.setProperty("--sout", sOut.toFixed(3));
      introHero.classList.toggle("show-on", sIn > 0.5 && sOut < 0.5);
      /* while the AeroSense E-Nose model is on screen, the corner labels and the nav clock step aside */
      root.classList.toggle("showcase-up", pw > 0.4 && prog < 0.995);
    } else if (introWord && !reduce) {
      const p = clamp01(y / (vh * 0.75));
      introWord.style.transform = `translate3d(0, ${(-p * 90).toFixed(1)}px, 0) scale(${(1 + p * 0.1).toFixed(3)})`;
      introWord.style.opacity = (1 - p * 0.95).toFixed(3);
      introWord.style.filter = p > 0.01 ? `blur(${(p * 6).toFixed(1)}px)` : "";
    }

    scrubs.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = clamp01((vh * 0.85 - r.top) / (vh * 0.55 + r.height * 0.6));
      const n = Math.round(p * el._words.length);
      el._words.forEach((w, i) => w.classList.toggle("lit", i < n));
      el._bolts.forEach((bolt) => {
        const lit = bolt.words.every((w) => w.classList.contains("lit"));
        if (lit && !bolt.on) strike(bolt);
        if (!lit && bolt.on) bolt.b.classList.remove("strike");
        bolt.on = lit;
      });
    });

    if (!reduce) parallax.forEach((el) => {
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh) return;
      const k = parseFloat(el.dataset.parallax) || 0.15;
      el.style.transform = `translate3d(0, ${((r.top + r.height / 2 - vh / 2) * -k).toFixed(1)}px, 0)`;
    });

    if (!reduce) marquees.forEach((m) => {
      if (!m.w) return;
      const speed = 40 + Math.min(260, Math.abs(vel) * 0.22);
      m.x -= speed * dt * (vel < -5 ? -1 : 1);
      if (m.x <= -m.w) m.x += m.w; if (m.x > 0) m.x -= m.w;
      m.t.style.transform = `translate3d(${m.x.toFixed(1)}px, 0, 0)`;
    });

    numbers.forEach(({ sec, items, bars }) => {
      const r = sec.getBoundingClientRect();
      const total = r.height - vh; if (total <= 0) return;
      const p = clamp01(-r.top / total);
      const seg = Math.min(items.length - 1, Math.floor(p * items.length));
      items.forEach((it, i) => {
        it.classList.toggle("on", i === seg);
        const local = clamp01(p * items.length - i);
        bars[i] && (bars[i].style.width = (local * 100).toFixed(1) + "%");
        const el = it.querySelector("[data-from]"); if (!el) return;
        const a = parseFloat(el.dataset.from), b = parseFloat(el.dataset.to), f = formats[el.dataset.fmt] || formats.int;
        const t = ease(clamp01((local - 0.12) / 0.7));
        const v = el.dataset.log ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t) : a + (b - a) * t;
        el.textContent = f(v);
      });
    });

    hscrolls.forEach((h) => {
      if (reduce) return;
      const r = h.sec.getBoundingClientRect();
      const p = h.dist ? clamp01((-r.top - holdIn()) / (h.dist * H_SPEED)) : 0;
      h.track.style.transform = `translate3d(${(-p * h.dist).toFixed(1)}px, 0, 0)`;
      if (h.bar) h.bar.style.width = (p * 100).toFixed(1) + "%";
    });

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* magnetic buttons */
  if (fine && !reduce) d.querySelectorAll(".btn, .copy-mail, [data-magnetic]").forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.28, y = (e.clientY - r.top - r.height / 2) * 0.4;
      b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
    b.addEventListener("pointerleave", () => (b.style.transform = ""));
  });
})();
