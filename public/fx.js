// Shared motion + effects: count-ups, word reveals, confetti, snowfall, the live pulse line, reactions.
(function (root) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const raf = cb => requestAnimationFrame(cb);

  function tween(el, to, fmt = v => Math.round(v), d = 750) {
    if (!el) return;
    const from = Number(el.dataset.v || 0); el.dataset.v = to;
    if (from === to || reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) raf(step);
    };
    raf(step);
  }

  // Wrap each word of an element's text in a span so CSS can reveal them one by one.
  function splitWords(el, step = 55) {
    let i = 0;
    const walk = node => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span');
            s.className = 'wd'; s.style.setProperty('--w', i++); s.style.setProperty('--step', step + 'ms');
            s.textContent = part; frag.appendChild(s);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) walk(child);
      }
    };
    walk(el);
  }

  function fitCanvas(c) {
    const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  // ---------- confetti ----------
  const COLORS = ['#5fb8ff', '#ffffff', '#3b6fff', '#8fd3ff', '#ffc400', '#10069f', '#a9b8ff'];
  function Confetti(canvas) {
    let parts = [], running = false, ctx, W, H;
    this.burst = (kind = 'top', origin) => {
      if (reduce) return;
      ({ ctx, w: W, h: H } = fitCanvas(canvas));
      const spawn = (x, y, angle, spread, speed, count) => {
        for (let i = 0; i < count; i++) {
          const a = angle + (Math.random() - .5) * spread, v = speed * (.55 + Math.random() * .6);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
            w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: COLORS[(Math.random() * COLORS.length) | 0], life: 0 });
        }
      };
      if (kind === 'cannons') { spawn(0, H, -Math.PI / 3, .7, H * .032, 150); spawn(W, H, -Math.PI * 2 / 3, .7, H * .032, 150); }
      else if (kind === 'point' && origin) spawn(origin.x, origin.y, -Math.PI / 2, 1.6, H * .018, 46);
      else spawn(W / 2, -10, Math.PI / 2, 2.4, H * .012, 110);
      if (running) return;
      running = true;
      const frame = () => {
        ctx.clearRect(0, 0, W, H);
        parts = parts.filter(p => p.y < H + 40 && p.life < 420);
        for (const p of parts) {
          p.life++; p.vy += .32; p.vx *= .99; p.vy *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.life * .15));
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        }
        if (parts.length) raf(frame); else { running = false; ctx.clearRect(0, 0, W, H); }
      };
      raf(frame);
    };
  }

  // ---------- snowfall (ambient, December) ----------
  function Snow(canvas, { rgb = '150,170,235', intensity = 1 } = {}) {
    let flakes = [], on = !reduce, level = intensity, ctx, W = 0, H = 0, scale = 1;
    const resize = () => { ({ ctx, w: W, h: H } = fitCanvas(canvas)); scale = Math.max(.6, W / 1400); };
    const make = top => ({ x: Math.random() * W, y: top ? -8 : Math.random() * H, r: (.8 + Math.random() * 2.4) * scale,
      vy: .18 + Math.random() * .45, ph: Math.random() * 6.3, sw: .2 + Math.random() * .5, a: .22 + Math.random() * .5 });
    resize(); addEventListener('resize', resize);
    const loop = t => {
      if (!canvas.isConnected) return;
      ctx.clearRect(0, 0, W, H);
      if (on) {
        const target = Math.min(level > 2 ? 520 : 320, Math.round(W * H / 11000 * level));
        while (flakes.length < target) flakes.push(make(flakes.length > target * .5));
        if (flakes.length > target) flakes.length = target;
        for (const f of flakes) {
          f.y += f.vy * (f.r / scale) * .7; f.x += Math.sin(f.ph + t * .0008 * f.sw * 3) * .3;
          if (f.y > H + 6) Object.assign(f, make(true));
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283);
          ctx.fillStyle = `rgba(${rgb},${f.a})`; ctx.fill();
        }
      }
      raf(loop);
    };
    raf(loop);
    this.setIntensity = x => { level = x; };
    this.toggle = force => { on = force ?? !on; if (!on) flakes = []; return on; };
    this.isOn = () => on;
  }

  // ---------- live pulse line (heartbeat that spikes on activity) ----------
  function PulseLine(canvas, { color = '#8fd3ff', samples = 150, idle = 2600 } = {}) {
    let ctx, W, H, buf = new Array(samples).fill(0), queue = [], lastBeat = 0;
    const resize = () => { ({ ctx, w: W, h: H } = fitCanvas(canvas)); };
    resize(); addEventListener('resize', resize);
    const beat = k => queue.push(...[.12, .3, -.18, 1, -.6, .28, .08, 0].map(v => v * k));
    this.spike = (k = 1) => { if (queue.length < 40) beat(Math.min(1, k)); };
    let acc = 0, prev = performance.now();
    const loop = t => {
      if (!canvas.isConnected) return;
      acc += t - prev; prev = t;
      while (acc > 16) {
        acc -= 16;
        if (!queue.length && t - lastBeat > idle) { beat(.32); lastBeat = t; }
        if (queue.length) lastBeat = t;
        buf.push(queue.length ? queue.shift() : (Math.random() - .5) * .04);
        buf.shift();
      }
      ctx.clearRect(0, 0, W, H);
      const mid = H * .58, amp = H * .48, dx = (W - H * .3) / (samples - 1);
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, color + '00'); g.addColorStop(.5, color + '66'); g.addColorStop(1, color);
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.4, H * .07); ctx.lineJoin = 'round';
      ctx.beginPath();
      buf.forEach((v, i) => { const x = i * dx, y = mid - v * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      const ey = mid - buf[samples - 1] * amp, ex = (samples - 1) * dx;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, H * .1, 0, 6.283); ctx.fill();
      ctx.fillStyle = color + '33'; ctx.beginPath(); ctx.arc(ex, ey, H * (.18 + .06 * Math.sin(t / 180)), 0, 6.283); ctx.fill();
      raf(loop);
    };
    if (!reduce) raf(loop);
  }

  // ---------- fireworks (finale) ----------
  function Fireworks(canvas, colors = COLORS) {
    let ctx, W, H, rockets = [], sparks = [], on = false, last = 0;
    const resize = () => { ({ ctx, w: W, h: H } = fitCanvas(canvas)); };
    resize(); addEventListener('resize', resize);
    const launch = () => rockets.push({ x: W * (.15 + Math.random() * .7), y: H + 10, vy: -(H * (.013 + Math.random() * .006)), tx: H * (.12 + Math.random() * .3), c: colors[(Math.random() * colors.length) | 0] });
    const burst = r => {
      const n = 60 + (Math.random() * 40) | 0, sp = H * (.004 + Math.random() * .003);
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, v = sp * (.6 + Math.random() * .6); sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: Math.random() < .25 ? '#ffffff' : r.c }); }
    };
    const loop = t => {
      if (!on || !canvas.isConnected) { ctx.clearRect(0, 0, W, H); return; }
      if (t - last > 650) { launch(); if (Math.random() < .5) launch(); last = t; }
      ctx.clearRect(0, 0, W, H);
      rockets = rockets.filter(r => {
        r.y += r.vy; r.vy *= .985;
        ctx.fillStyle = r.c; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, 6.283); ctx.fill();
        if (r.y <= r.tx || r.vy > -1) { burst(r); return false; }
        return true;
      });
      sparks = sparks.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += .05; p.vx *= .985; p.life -= .012;
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 6.283); ctx.fill();
        return p.life > 0;
      });
      ctx.globalAlpha = 1;
      raf(loop);
    };
    this.start = () => { if (on || reduce) return; on = true; resize(); raf(loop); };
    this.stop = () => { on = false; };
  }

  // ---------- reactions floating up ----------
  let floaters = 0;
  function floatReaction(r, { max = 45 } = {}) {
    if (floaters > max || reduce) return;
    floaters++;
    const d = document.createElement('div');
    d.className = 'reaction'; d.textContent = r;
    const dur = 3.2 + Math.random() * 1.4;
    d.style.left = (3 + Math.random() * 90) + 'vw';
    d.style.setProperty('--dx', (Math.random() * 14 - 7) + 'vw');
    d.style.setProperty('--dur', dur + 's');
    document.body.appendChild(d);
    setTimeout(() => { d.remove(); floaters--; }, dur * 1000);
  }

  function toast(el, text, ms = 3200) {
    el.textContent = text; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  root.FX = { reduce, tween, splitWords, Confetti, Snow, PulseLine, Fireworks, floatReaction, toast, fitCanvas };
})(typeof self !== 'undefined' ? self : this);
