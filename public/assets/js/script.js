(() => {
  const reduced = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("bg");
  const ctx = canvas?.getContext("2d", { alpha: true });
  if (!ctx) return;

  const A = [122, 248, 198];
  const B = [144, 163, 255];
  const CHARS = "0123456789abcdef[]{}()<>/\\|_+-=*#%&@^~";
  const s = {
    w: 0,
    h: 0,
    dpr: 1,
    raf: 0,
    last: 0,
    particles: [],
    pulses: [],
    pointer: { x: 0.5, y: 0.35, vx: 0, vy: 0, heat: 0, on: false, last: 0 },
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const char = () => CHARS[(Math.random() * CHARS.length) | 0];
  const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  const isForeground = (ev) => ev.target?.closest?.(".hero, .panel, .skip");

  function resize() {
    s.dpr = clamp(devicePixelRatio || 1, 1, 2);
    s.w = innerWidth;
    s.h = innerHeight;
    canvas.width = s.w * s.dpr;
    canvas.height = s.h * s.dpr;
    canvas.style.width = `${s.w}px`;
    canvas.style.height = `${s.h}px`;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  }

  function smooth(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function warp(x, y) {
    const p = s.pointer;
    if (!p.on || p.heat < 0.001) return [x, y];

    const px = p.x * s.w;
    const py = p.y * s.h;
    const dx = x - px;
    const dy = y - py;
    const d = Math.hypot(dx, dy) || 1;
    const radius = reduced ? 140 : 210;
    const fall = 1 - smooth(radius * 0.2, radius, d);
    if (fall <= 0) return [x, y];

    const nx = dx / d;
    const ny = dy / d;
    const speed = clamp(Math.hypot(p.vx, p.vy) * 0.015, 0, 1);
    const repel = (reduced ? 7 : 11) * fall * p.heat;
    const swirl = (reduced ? 4 : 9) * fall * p.heat * speed;
    return [x + nx * repel - ny * swirl, y + ny * repel + nx * swirl];
  }

  function line(points) {
    points.forEach(([x, y], i) => {
      const [wx, wy] = warp(x, y);
      i ? ctx.lineTo(wx, wy) : ctx.moveTo(wx, wy);
    });
  }

  function drawGrid(t) {
    const gap = 48;
    const step = reduced ? 26 : 18;
    const dx = reduced ? 0 : (t * 0.003) % gap;
    const dy = reduced ? 0 : (t * 0.004) % gap;
    const points = (fixed, max, vertical) =>
      Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) =>
        vertical ? [fixed, i * step] : [i * step, fixed]
      );

    ctx.strokeStyle = rgba(A, reduced ? 0.04 : 0.045);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -dx; x <= s.w + gap; x += gap) line(points(x, s.h, true));
    for (let y = -dy; y <= s.h + gap; y += gap) line(points(y, s.w, false));
    ctx.stroke();
  }

  function spawn(x, y) {
    const now = performance.now();
    s.pulses.push({ x, y, born: now, life: reduced ? 420 : 650, tone: Math.random() < 0.5 ? A : B });
    s.pulses.splice(0, Math.max(0, s.pulses.length - (reduced ? 2 : 5)));

    for (let i = 0, n = reduced ? 10 : 22; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(70, 240) * (reduced ? 1 : 1.35);
      s.particles.push({
        x: clamp(x + rand(-6, 6), 0, s.w),
        y: clamp(y + rand(-6, 6), 0, s.h),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        born: now,
        life: rand(520, 1150),
        c: char(),
        tone: Math.random() < 0.55 ? A : B,
        flip: now + rand(120, 420),
      });
    }
    s.particles.splice(0, Math.max(0, s.particles.length - (reduced ? 110 : 260)));
  }

  function drawPulses(now) {
    ctx.lineWidth = 1;
    for (let i = s.pulses.length - 1; i >= 0; i--) {
      const p = s.pulses[i];
      const k = (now - p.born) / p.life;
      if (k > 1) {
        s.pulses.splice(i, 1);
        continue;
      }

      const r = 18 + (1 - (1 - k) ** 3) * (reduced ? 72 : 128);
      const x = p.x - r;
      const y = p.y - r;
      const size = r * 2;
      const b = Math.min(18, 6 + r * 0.18);
      ctx.strokeStyle = rgba(p.tone, (1 - k) * (reduced ? 0.28 : 0.22));
      ctx.strokeRect(x, y, size, size);
      ctx.beginPath();
      [[0, 0], [size, 0], [size, size], [0, size]].forEach(([cx, cy]) => {
        const sx = x + cx;
        const sy = y + cy;
        ctx.moveTo(sx, sy + (cy ? -b : b));
        ctx.lineTo(sx, sy);
        ctx.lineTo(sx + (cx ? -b : b), sy);
      });
      ctx.stroke();
    }
  }

  function drawParticles(now, dt) {
    ctx.font = "13px ui-monospace, 'Cascadia Mono', Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      const k = (now - p.born) / p.life;
      if (k > 1 || p.x < -40 || p.x > s.w + 40 || p.y < -40 || p.y > s.h + 40) {
        s.particles.splice(i, 1);
        continue;
      }

      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vx *= reduced ? 0.92 : 0.95;
      p.vy *= reduced ? 0.92 : 0.95;
      if (now > p.flip && Math.random() < 0.14) {
        p.c = char();
        p.flip = now + rand(80, 260);
      }
      ctx.fillStyle = rgba(p.tone, (1 - k) * (reduced ? 0.26 : 0.38));
      ctx.fillText(p.c, p.x, p.y);
    }
  }

  function tick(t) {
    const dt = s.last ? Math.min(48, t - s.last) : 16;
    s.last = t;
    ctx.fillStyle = `rgba(11, 13, 16, ${reduced ? 0.32 : s.pointer.on ? 0.22 : 0.28})`;
    ctx.fillRect(0, 0, s.w, s.h);
    drawGrid(t);
    drawPulses(performance.now());
    drawParticles(performance.now(), dt);

    const target = s.pointer.on ? 1 : 0;
    s.pointer.heat += (target - s.pointer.heat) * (reduced ? 0.06 : 0.1);
    s.pointer.vx *= reduced ? 0.9 : 0.93;
    s.pointer.vy *= reduced ? 0.9 : 0.93;
    s.raf = requestAnimationFrame(tick);
  }

  function move(ev) {
    const now = performance.now();
    const x = clamp(ev.clientX / Math.max(1, s.w), 0, 1);
    const y = clamp(ev.clientY / Math.max(1, s.h), 0, 1);
    const dt = s.pointer.last ? Math.max(8, now - s.pointer.last) : 16;
    s.pointer.vx = ((x - s.pointer.x) * s.w) / dt;
    s.pointer.vy = ((y - s.pointer.y) * s.h) / dt;
    Object.assign(s.pointer, { x, y, last: now, on: !isForeground(ev) });
  }

  function start() {
    cancelAnimationFrame(s.raf);
    resize();
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, s.w, s.h);
    s.raf = requestAnimationFrame(tick);
  }

  addEventListener("resize", resize, { passive: true });
  addEventListener("pointermove", move, { passive: true });
  addEventListener("pointerleave", () => (s.pointer.on = false), { passive: true });
  addEventListener("pointerdown", (ev) => {
    move(ev);
    if (!isForeground(ev)) spawn(ev.clientX, ev.clientY);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? cancelAnimationFrame(s.raf) : start()));

  function setupTitle() {
    const el = document.querySelector("[data-title]");
    if (!el) return;

    const target = Array.from(el.dataset.title || el.textContent);
    const locks = new WeakMap();
    el.replaceChildren(...target.map((c) => {
      const span = document.createElement("span");
      span.className = "ch";
      span.textContent = c;
      return span;
    }));

    const spans = [...el.children];
    const scramble = (span, i) => {
      const token = {};
      locks.set(span, token);
      const end = performance.now() + (reduced ? 120 : 260);
      span.classList.add("is-hot");

      function frame(t) {
        if (locks.get(span) !== token) return;
        if (t >= end) {
          span.textContent = target[i];
          span.classList.remove("is-hot");
          return;
        }
        if (Math.random() < (reduced ? 0.16 : 0.42)) span.textContent = char();
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    };

    let run = 0;
    el.addEventListener("focus", () => {
      const id = ++run;
      spans.forEach((span, i) => setTimeout(() => id === run && scramble(span, i), i * (reduced ? 0 : 28)));
    });
    spans.forEach((span, i) => span.addEventListener("pointerenter", () => scramble(span, i)));
  }

  function setupDetails() {
    const items = [...document.querySelectorAll("details.buildItem")];
    if (!items.length) return;
    const running = new WeakMap();
    const canAnimate = !reduced && Element.prototype.animate;
    const body = (item) => item.querySelector(".buildBody");

    function clean(item) {
      const b = body(item);
      running.get(item)?.anim?.cancel();
      running.delete(item);
      if (b) Object.assign(b.style, { height: "", opacity: "", overflow: "" });
    }

    function toggle(item, open) {
      if (!canAnimate) {
        item.open = open;
        return;
      }

      const b = body(item);
      if (!b) return (item.open = open);
      clean(item);
      if (open) {
        items.forEach((other) => other !== item && other.open && toggle(other, false));
        item.open = true;
      }

      const from = open ? 0 : Math.max(1, b.getBoundingClientRect().height || b.scrollHeight);
      const to = open ? Math.max(1, b.scrollHeight) : 0;
      Object.assign(b.style, { height: `${from}px`, opacity: open ? 0 : 1, overflow: "hidden" });

      const anim = b.animate(
        [{ height: `${from}px`, opacity: open ? 0 : 1 }, { height: `${to}px`, opacity: open ? 1 : 0 }],
        { duration: open ? 180 : 160, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" }
      );
      running.set(item, { anim, open });
      anim.onfinish = () => {
        if (running.get(item)?.anim !== anim) return;
        item.open = open;
        clean(item);
        if (open) b.style.height = "auto";
      };
    }

    items.forEach((item) => item.querySelector("summary")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      toggle(item, running.get(item) ? !running.get(item).open : !item.open);
    }));
  }

  setupTitle();
  setupDetails();
  start();
})();
