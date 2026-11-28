// Presenter screen ("game show" style). mountHost(rootElement, transport).
// Screens: lobby → questions (race + reveal) → recap (thanks + pledges) → roadmap (animated timeline) → finale.
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emphasise = s => esc(s).replace(/(\d+%|“[^”]+”)/g, '<span class="hl">$1</span>');
  const LANES = ['#5fb8ff', '#3b6fff', '#8fd3ff', '#8f7bff', '#2fc6e0', '#a9b8ff'];
  const LIGHTS = ['#ffffff', '#8fd3ff', '#ffc400', '#5fb8ff'];
  const DAY = 864e5;
  const day = s => new Date(s + 'T00:00:00').getTime();
  const hash = w => [...String(w)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const moodOf = (o, i) => (typeof o.score === 'number' ? Math.max(3, o.score) : [5, 4, 5, 4, 5, 4][i % 6]);
  const CROWN = '<svg class="crown" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="none" stroke="#ffc400" stroke-width="2.5"/><circle class="ring-dash" cx="32" cy="32" r="30" fill="none" stroke="#fff3c4" stroke-width="2.5" stroke-dasharray="3 9" stroke-linecap="round"/></svg>';
  const initials = p => PulseCore.playerName(p).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const FLAG = '<svg class="flag" viewBox="0 0 20 40" aria-hidden="true"><path d="M3 2 V38" stroke="#1d1b3a" stroke-width="2.5" stroke-linecap="round"/><path d="M4 3 h14 v12 h-14z" fill="#fff" stroke="#1d1b3a" stroke-width="2"/><path d="M4 3 h3.5 v3 h-3.5z M11 3 h3.5 v3 h-3.5z M7.5 6 h3.5 v3 h-3.5z M14.5 6 h3.5 v3 h-3.5z M4 9 h3.5 v3 h-3.5z M11 9 h3.5 v3 h-3.5z M7.5 12 h3.5 v3 h-3.5z M14.5 12 h3.5 v3 h-3.5z" fill="#1d1b3a"/></svg>';
  const PHONE = '<svg class="phone-ico" viewBox="0 0 40 60" aria-hidden="true"><rect x="3" y="3" width="34" height="54" rx="7" fill="#fff" stroke="#1d1b3a" stroke-width="3"/><rect x="10" y="14" width="8" height="8" fill="#1d1b3a"/><rect x="22" y="14" width="8" height="8" fill="#1d1b3a"/><rect x="10" y="26" width="8" height="8" fill="#1d1b3a"/><rect x="24" y="28" width="4" height="4" fill="#1d1b3a"/><rect x="22" y="34" width="8" height="2.5" fill="#1d1b3a"/><path class="scanline" d="M7 18 H33" stroke="#ff5a5f" stroke-width="2.5"/><rect x="15" y="47" width="10" height="3" rx="1.5" fill="#1d1b3a"/></svg>';

  const SHELL = `
  <div class="deck" id="deck">
    <div class="backdrop" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="rays" aria-hidden="true"></div>
    <canvas class="snow" id="snow" aria-hidden="true"></canvas>
    <canvas class="fireworks" id="fireworks" aria-hidden="true"></canvas>
    <div class="lights" id="lights" aria-hidden="true"></div>
    <div class="topbar">
      <span class="tag" id="team"></span>
      <span class="event" id="event"></span>
      <canvas class="pulse" id="pulse" aria-hidden="true"></canvas>
      <nav class="chapters" id="chapters" aria-label="Chapters"></nav>
      <span class="holiday" id="holiday"></span>
      <span class="live"><i></i>LIVE</span>
    </div>
    <div class="titleblock" id="titleblock"></div>
    <div id="content"></div>
    <div class="foot">
      <span class="foot-k" id="source"></span>
      <div class="ticker"><div class="ticker-in" id="ticker"></div></div>
      <span class="pager" id="pager"></span>
    </div>
  </div>
  <div class="wipe" id="wipe" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
  <div class="slam" id="slam" aria-hidden="true"><span></span></div>
  <canvas id="confetti" aria-hidden="true"></canvas>
  <div class="toast" id="toast" role="status"></div>
  <div class="status" id="status"></div>
  <div class="controls" id="controls">
    <button data-a="prev" title="Previous (←)" aria-label="Previous">←</button>
    <span class="ctl-label" id="ctlLabel"></span>
    <button data-a="next" title="Next (→ or space)" aria-label="Next">→</button>
    <span class="ctl-sep"></span>
    <button data-a="reveal" id="ctlReveal" title="H">Reveal now</button>
    <button data-a="snow" id="ctlSnow" title="S">Snow on</button>
    <button data-a="sim" id="ctlSim" hidden>▶ Simulate the room</button>
    <button data-a="reset" id="ctlReset">Reset</button>
    <span class="ctl-sep"></span>
    <button data-a="full" title="F">Full screen</button>
    <button data-a="help" title="?">Guide</button>
  </div>`;

  function mountHost(rootEl, T) {
    rootEl.innerHTML = SHELL;
    document.body.classList.add('presenting');
    const $ = id => document.getElementById(id);
    const U = () => Math.min(innerWidth / 100, innerHeight * 1.7778 / 100);

    const snow = new FX.Snow($('snow'), { rgb: '255,255,255', intensity: .9 });
    const pulse = new FX.PulseLine($('pulse'), { color: '#8fd3ff' });
    const confetti = new FX.Confetti($('confetti'));
    const fireworks = new FX.Fireworks($('fireworks'));
    buildLights();

    let view = null, latest = null, transitioning = false, fresh = false;
    let lastTicker = '', lastN = null, revealedPrev = null, cardsKey = '', titleKey = '';
    let timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const cloudEls = new Map();

    // ---------- string lights (flash on every vote) ----------
    function buildLights() {
      const n = 28;
      let html = '<svg class="wire" viewBox="0 0 1000 60" preserveAspectRatio="none"><path d="M-5 6 Q 125 52 250 8 Q 375 52 500 8 Q 625 52 750 8 Q 875 52 1005 6"/></svg>';
      for (let i = 0; i < n; i++) {
        const x = (i + .5) / n, seg = (x * 4) % 1, y = 8 + 4 * seg * (1 - seg) * 21;
        html += `<i style="left:${(x * 100).toFixed(2)}%;top:${(y / 60 * 100).toFixed(1)}%;--c:${LIGHTS[i % LIGHTS.length]};--d:${(Math.random() * 2.4).toFixed(2)}s"></i>`;
      }
      $('lights').innerHTML = html;
    }
    function flashLights() { const l = $('lights'); l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash'); }

    // The countdown chip in the top bar: days to the date in config.countdown (falls back to the holiday break).
    const CAL = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10 H20.5 M8 3 V7 M16 3 V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="7" y="13" width="4" height="4" rx="1" fill="currentColor"/></svg>';
    function countdownChip(s) {
      const c = s.countdown || (s.holidayDate ? { date: s.holidayDate, label: 'the holiday break' } : null);
      if (!c || !c.date) return '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const d = Math.round((day(c.date) - today.getTime()) / DAY);
      const what = c.label || 'the big day', What = what.charAt(0).toUpperCase() + what.slice(1);
      const txt = d > 1 ? `${d} days to ${what}` : d === 1 ? `${What} starts tomorrow!` : d === 0 ? `${What} starts today!` : (c.after || `${What} is under way`);
      return `${c.date === s.holidayDate ? icon('help:snow') : CAL}<span>${esc(txt)}</span>`;
    }

    // Big bouncy title: each letter its own colour, bouncing in a wave.
    function bouncy(text, cls = '') {
      let i = 0;
      return `<h1 class="bouncy ${cls}">` + String(text).split(' ').map(word =>
        `<span class="word">${[...word].map(ch => `<span style="--i:${i};--c:${LANES[i++ % LANES.length]}">${esc(ch)}</span>`).join('')}</span>`
      ).join('<span class="sp"> </span>') + '</h1>';
    }

    // ---------- routing between screens ----------
    const LABELS = { lobby: 'Lobby', recap: 'Recap', roadmap: 'Road ahead', finale: 'Finale' };
    function render(s, meta = {}) {
      latest = s;
      $('team').textContent = s.team;
      $('event').textContent = s.event;
      $('holiday').innerHTML = countdownChip(s);
      renderChapters(s);
      const label = s.stage === 'question' ? (s.question.type === 'award' ? 'Award vote' : s.group === 'checkin' ? `Check-in ${s.qn} of ${s.qtotal}` : `Q${s.qn} of ${s.qtotal}`) : s.nav || LABELS[s.stage] || '';
      $('pager').textContent = `${s.index + 1} / ${s.stepCount}`;
      $('ctlLabel').textContent = label;
      $('ctlReveal').hidden = s.stage !== 'question' && !s.tug;
      $('ctlReveal').textContent = s.tug ? (s.tug.phase === 'done' ? 'Rematch' : 'Start the tug of war') : s.revealed ? 'Hide results' : 'Reveal now';
      if (meta.pop) { pulse.spike(1); flashLights(); }

      const v = s.stage === 'question' || s.stage === 'slide' ? s.stage + s.index : s.stage;
      if (v !== view) {
        const first = view === null;
        view = v;
        if (first || FX.reduce) { build(s); paint(latest, meta); return; }
        transitioning = true;
        const w = $('wipe');
        w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
        setTimeout(() => { build(latest); transitioning = false; paint(latest, {}); }, 520);
        return;
      }
      if (!transitioning) paint(s, meta);
    }

    // the chapter bar at the top: where we are in the all-hands
    let chapKey = '';
    function renderChapters(s) {
      const list = s.chapters || [], cur = s.chapter ?? -1;
      const key = list.join('|') + ':' + cur;
      if (key === chapKey) return;
      chapKey = key;
      $('chapters').innerHTML = cur < 0 ? (s.extra ? '<span class="ch on">February check-in</span>' : '')
        : list.map((n, i) => `<span class="ch ${i < cur ? 'done' : i === cur ? 'on' : ''}" ${i === cur ? 'aria-current="step"' : ''}>${esc(n)}</span>`).join('');
    }

    function build(s) {
      timers.forEach(clearTimeout); timers = [];
      cloudEls.clear(); lastN = null; lastTicker = ''; cardsKey = ''; titleKey = ''; revealedPrev = null; fresh = true; rankKey = '';
      stopTimer(); fireworks.stop();
      $('deck').dataset.stage = s.stage;
      $('ticker').innerHTML = '';
      const builders = { lobby: buildLobby, question: buildQuestion, slide: buildSlide, recap: buildRecap, roadmap: buildRoadmap, finale: buildFinale };
      (builders[s.stage] || buildLobby)(s);
      $('deck').dataset.layout = s.stage === 'slide' ? s.slide.type : '';
      // festive screens (opening, sections, joining, the award, the finale) get the full effects; the rest stays calm
      const layout = s.stage === 'slide' ? (s.slide || {}).type : '';
      const festive = s.stage === 'lobby' || s.stage === 'finale' || ['title', 'section', 'tug'].includes(layout) || (s.stage === 'question' && s.question.type === 'award');
      $('deck').dataset.mood = festive ? 'festive' : 'calm';
      snow.setIntensity(festive ? ({ lobby: 1, finale: 1.8 }[s.stage] ?? .9) : s.stage === 'recap' ? .5 : (s.roadmap && s.roadmap.style) === 'peak' && s.stage === 'roadmap' ? .8 : .15);
      document.body.classList.remove('entering'); void $('content').offsetWidth; document.body.classList.add('entering');
    }

    // ---------- BAR CHART slide: stacked columns (e.g. reported quarters + an outlook), one axis, with a takeaway ----------
    // slide = { type: 'chart', bars: [{ label, note, parts: [{ label, value, max?, outlook? }], total? }], unit, callout, source }
    const CHART_COLORS = ['#3f5fe8', '#38a0ea'];   // validated against the dark slide surface (dataviz validator)
    function drawBarChart(sl) {
      const box = $('chBox');
      if (!box) return;
      const W = box.clientWidth, H = box.clientHeight, u = U();
      const bars = sl.bars || [];
      const sum = b => b.parts.reduce((t, p) => t + (p.max != null ? (p.value + p.max) / 2 : p.value), 0);
      const top = b => b.parts.reduce((t, p) => t + (p.max != null ? p.max : p.value), 0);
      const step = 10, maxV = Math.ceil(Math.max(...bars.map(top)) * 1.08 / step) * step;
      const padL = u * 4.2, padR = u * 1, padT = u * 4.4, padB = u * 4.6;
      const pw = W - padL - padR, ph2 = H - padT - padB;
      const y = v => padT + ph2 - (v / maxV) * ph2;
      const bw = Math.min(u * 11, pw / (bars.length * 2.2)), gap = 2;
      const cx = i => padL + pw * (i + .5) / bars.length;
      const fmt = v => (Math.round(v * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      let svg = `<defs><pattern id="chHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${CHART_COLORS[1]}" opacity=".28"/><line x1="0" y1="0" x2="0" y2="8" stroke="${CHART_COLORS[1]}" stroke-width="3"/></pattern></defs>`;
      for (let v = 0; v <= maxV; v += step) svg += `<line class="ch-grid ${v ? '' : 'base'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-ylab" x="${padL - u * .7}" y="${y(v)}" dy=".35em">${v}</text>`;
      // the earlier bar's level, carried across as a dashed reference
      if (bars.length > 1) { const ref = sum(bars[0]); svg += `<line class="ch-ref" x1="${cx(0) + bw / 2}" x2="${cx(bars.length - 1) + bw / 2 + u}" y1="${y(ref)}" y2="${y(ref)}"/>`; }
      let html = '', k = 0;
      bars.forEach((b, i) => {
        const color = CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)];
        let acc = 0;
        b.parts.forEach((p, j) => {
          const v = p.max != null ? (p.value + p.max) / 2 : p.value;
          const y0 = y(acc), y1 = y(acc + v), last = j === b.parts.length - 1;
          const h = Math.max(1, y0 - y1 - (acc > 0 ? gap : 0));
          const x = cx(i) - bw / 2, yTop = y1;
          const r = last ? 4 : 0;
          const path = `M${x} ${yTop + h} V${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} H${x + bw - r} Q${x + bw} ${yTop} ${x + bw} ${yTop + r} V${yTop + h} Z`;
          const tip = `${b.label} ${p.label}: €${p.max != null ? `${fmt(p.value)}–${fmt(p.max)}` : fmt(v)} bn${p.outlook ? ' (outlook)' : ''}`;
          svg += `<path class="ch-seg ${p.outlook ? 'outlook' : ''}" style="--k:${k};transform-origin:${cx(i)}px ${y(0)}px" d="${path}" fill="${p.outlook ? 'url(#chHatch)' : color}" ${p.outlook ? `stroke="${CHART_COLORS[1]}" stroke-width="1.5" stroke-dasharray="4 3"` : ''}><title>${esc(tip)}</title></path>`;
          if (h > u * 2.4) html += `<div class="ch-in ${p.outlook ? 'outlook' : ''} ${i === 0 ? 'dark' : ''}" style="left:${cx(i)}px;top:${yTop + h / 2}px;--k:${k}"><b>${esc(p.label)}</b> ${p.max != null ? `${fmt(p.value)}–${fmt(p.max)}` : fmt(v)}</div>`;
          // the outlook range shows in the segment label and the total (a whisker of a few pixels would only look like noise)
          acc += v; k++;
        });
        html += `<div class="ch-total" style="left:${cx(i)}px;top:${y(top(b))}px;--k:${k}">${esc(b.total || '€' + fmt(sum(b)) + ' bn')}</div>`;
        html += `<div class="ch-xlab" style="left:${cx(i)}px;top:${y(0)}px"><b>${esc(b.label)}</b>${b.note ? `<span>${esc(b.note)}</span>` : ''}</div>`;
      });
      box.innerHTML = `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc((sl.title || '') + ': ' + bars.map(b => `${b.label} ${b.total || fmt(sum(b))}`).join(', '))}">${svg}</svg>${html}
        <div class="ch-unit" style="left:${padL - u * .7}px;top:${padT - u * 2.2}px">${esc(sl.unit || '')}</div>`;
    }

    // ---------- TUG OF WAR: Team Debit vs Team Credit ----------
    // The presenter starts a round (H). The projector runs it: 3-2-1, then "PULL!" for `seconds`, then it freezes
    // the score. Phones tap; the rope follows the share of pulls. H again starts a rematch.
    const TUG_COLORS = ['#5fb8ff', '#a08cff'];
    let tugRun = {}, tugPos = 0, tugAim = 0, tugRaf = 0, tugLast = [0, 0];
    function buildTug(s) {
      const sl = s.slide || {}, teams = sl.teams || ['Debit', 'Credit'], secs = sl.seconds || 20;
      $('titleblock').innerHTML = `${bouncy(sl.title || 'Tug of war', 'mid')}${sl.subtitle ? `<p class="sub">${ph(sl.subtitle)}</p>` : ''}`;
      const crew = k => Array.from({ length: 5 }, (_, i) => `<i style="--i:${i}">${orb(TUG_COLORS[k])}</i>`).join('');
      const team = k => `
        <div class="tug-team t${k}" id="tugT${k}" style="--c:${TUG_COLORS[k]}">
          <div class="tug-name">Team ${esc(teams[k])}</div>
          <div class="tug-n"><b id="tugN${k}" data-v="0">0</b><span>pulls</span></div>
          <div class="tug-p"><b id="tugP${k}">0</b> players</div>
          <div class="tug-crown">${TROPHY}<span>Winner</span></div>
        </div>`;
      $('content').innerHTML = `
        <div class="tug" id="tug" data-phase="ready">
          <div class="tug-head">${team(0)}
            <div class="tug-mid"><div class="tug-big" id="tugBig">${secs}</div><div class="tug-msg" id="tugMsg">Get your thumbs ready</div></div>
          ${team(1)}</div>
          <div class="tug-field">
            <div class="tug-zone z0"></div><div class="tug-zone z1"></div><div class="tug-line"></div>
            <div class="tug-rope" id="tugRope">
              <div class="tug-crew c0" style="--c:${TUG_COLORS[0]}">${crew(0)}</div>
              <div class="tug-cord"><i></i></div>
              <div class="tug-knot"><i></i></div>
              <div class="tug-crew c1" style="--c:${TUG_COLORS[1]}">${crew(1)}</div>
            </div>
          </div>
          <div class="tug-foot"><div class="qr">${T.qrHtml()}</div><span>Your phone already picked your team. When the screen says <b>PULL!</b>, tap as fast as you can.</span></div>
        </div>`;
      $('source').textContent = T.canControl ? 'Press H to start · H again for a rematch' : 'Tug of war';
      $('ticker').innerHTML = '';
      tugRun = {}; tugPos = tugAim = 0; tugLast = [0, 0];
      cancelAnimationFrame(tugRaf);
      const loop = () => {
        const rope = $('tugRope');
        if (!rope) return;
        tugPos += (tugAim - tugPos) * .07;
        rope.style.setProperty('--p', tugPos.toFixed(4));
        tugRaf = requestAnimationFrame(loop);
      };
      loop();
    }
    function tugAct(what) { if (T.canControl) T.act('tug', what); }
    function paintTug(s) {
      const el = $('tug');
      if (!el) return;
      const t = s.tug, sl = s.slide || {}, teams = sl.teams || ['Debit', 'Credit'], secs = sl.seconds || 20;
      const [a, b] = t.taps;
      el.dataset.phase = t.phase || 'ready';
      FX.tween($('tugN0'), a); FX.tween($('tugN1'), b);
      $('tugP0').textContent = t.players[0]; $('tugP1').textContent = t.players[1];
      [a, b].forEach((v, k) => { if (v > tugLast[k]) { const tm = $('tugT' + k); tm.classList.remove('pull'); void tm.offsetWidth; tm.classList.add('pull'); el.classList.toggle('pull' + k, true); setTimeout(() => el.classList.remove('pull' + k), 380); } });
      tugLast = [a, b];
      const total = a + b;
      if (t.phase !== 'done') tugAim = total ? Math.max(-1, Math.min(1, ((b - a) / Math.max(total, 24)) * 1.8)) : 0;
      if (!t.id || t.phase === 'ready') {
        el.classList.remove('won0', 'won1', 'draw');
        $('tugBig').textContent = secs;
        $('tugMsg').textContent = t.players[0] + t.players[1] ? `${t.players[0] + t.players[1]} players on the rope` : 'Get your thumbs ready';
      } else if (t.phase === 'countdown' && tugRun.id !== t.id) {
        tugRun = { id: t.id };
        el.classList.remove('won0', 'won1', 'draw');
        $('tugMsg').textContent = 'Get ready…';
        [3, 2, 1].forEach((n, i) => later(() => { if (latest.tug && latest.tug.id === t.id && latest.tug.phase === 'countdown') { const big = $('tugBig'); big.textContent = n; big.classList.remove('beat'); void big.offsetWidth; big.classList.add('beat'); pulse.spike(.6); } }, i * 1000));
        later(() => tugAct('go:' + t.id), 3000);
      } else if (t.phase === 'go') {
        if (tugRun.go !== t.id) {
          tugRun = { id: t.id, go: t.id };
          slam('PULL!'); flashLights();
          const tick = () => {
            const cur = latest && latest.tug;
            if (!$('tugBig') || !cur || cur.id !== t.id || cur.phase !== 'go') return;
            const left = Math.max(0, secs * 1000 - (Date.now() - (cur.goAt || Date.now())));
            $('tugBig').textContent = Math.ceil(left / 1000);
            $('tugBig').classList.toggle('hurry', left < 5500);
            if (left > 0) later(tick, 200);
            else tugAct(`done:${t.id}:${cur.taps[0]}:${cur.taps[1]}`);
          };
          tick();
        }
        $('tugMsg').textContent = a === b ? 'Neck and neck!' : `Team ${teams[a > b ? 0 : 1]} is pulling ahead!`;
      } else if (t.phase === 'done' && tugRun.done !== t.id) {
        tugRun = { id: t.id, go: t.id, done: t.id };
        const w = a === b ? -1 : a > b ? 0 : 1;
        tugAim = w < 0 ? 0 : w ? 1.15 : -1.15;
        el.classList.add(w < 0 ? 'draw' : 'won' + w);
        $('tugBig').textContent = '';
        $('tugBig').classList.remove('hurry');
        $('tugMsg').textContent = w < 0 ? `A draw: ${a} – ${b}` : `${Math.max(a, b)} to ${Math.min(a, b)}`;
        slam(w < 0 ? "IT'S A DRAW!" : `TEAM ${String(teams[w]).toUpperCase()} WINS!`); flashLights();
        $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake');
        later(() => { confetti.burst('cannons'); flashLights(); fireworks.start(); }, 500);
        later(() => fireworks.stop(), 6500);
      }
    }

    // ---------- KUDOS WALL ----------
    // Colleagues thank each other from their phones. One card at a time is in the spotlight (a new one goes there
    // straight away); the rest form a living wall. The presenter can remove a card with a click (U brings it back).
    const KUDOS_KINDS = {
      thanks: { label: 'Thank you', icon: 'help:heart', c: '#5fb8ff' },
      hero: { label: 'Hero of the year', icon: 'help:trophy', c: '#ffc400' },
      team: { label: 'Team player', icon: 'help:team', c: '#a08cff' },
      calm: { label: 'Calm in the storm', icon: 'help:snow', c: '#8fd3ff' },
      boost: { label: 'Energy boost', icon: 'help:boost', c: '#2fc6e0' },
    };
    const kudosKind = k => KUDOS_KINDS[k] || KUDOS_KINDS.thanks;
    const kudosTilt = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((Math.abs(h) % 7) - 3) * .4; };
    const kudosCard = (k, cls = '') => {
      const m = kudosKind(k.kind);
      return `<div class="kd-card ${cls}" data-id="${esc(k.id)}" style="--c:${m.c};--t:${kudosTilt(k.id)}deg">
        <div class="kd-top"><span class="kd-ico">${icon(m.icon)}</span><span class="kd-kind">${esc(m.label)}</span></div>
        <div class="kd-to">For <b>${esc(k.to)}</b></div>
        <p class="kd-text">${esc(k.text)}</p>
      </div>`;
    };
    let kwKey = null, kwFeat = 0, kwSeen = new Set(), kwFeatId = '', kwSince = 0;
    function buildKudos(s) {
      const sl = s.slide || {};
      $('titleblock').innerHTML = `
        <div class="pk-head">
          <div>${bouncy(sl.title || 'Kudos wall', 'mid')}${sl.subtitle ? `<p class="sub">${ph(sl.subtitle)}</p>` : ''}</div>
          <div class="kw-join st" style="--i:1"><div class="qr">${T.qrHtml()}</div><div><b id="kwN" data-v="0">0</b><span>kudos sent</span><small>Scan to send one</small></div></div>
        </div>`;
      $('content').innerHTML = `<div class="kw" id="kw"><div class="kw-feature" id="kwFeature"></div><div class="kw-wall" id="kwWall"></div></div>`;
      $('source').textContent = T.canControl ? 'Click a card to remove it · U brings removed cards back' : 'Kudos wall';
      $('ticker').innerHTML = '';
      kwKey = null; kwFeat = 0; kwSeen = new Set(); kwFeatId = ''; kwSince = Date.now();
      // every card gets about seven seconds in the spotlight; a new kudos starts its own seven seconds
      const rotate = () => { if (!$('kw')) return; if (Date.now() - kwSince > 7000) { kwFeat++; showFeature(latest, true); kwSince = Date.now(); } later(rotate, 500); };
      later(rotate, 500);
      $('kw').addEventListener('click', e => {
        const c = e.target.closest('.kd-card[data-id]');
        if (c && T.canControl) T.act('kudos', 'hide:' + c.dataset.id);
      });
    }
    function showFeature(s, rotating) {
      const list = (s && s.kudos) || [], box = $('kwFeature');
      if (!box || !list.length) return;
      const f = list[kwFeat % list.length];
      if (f.id === kwFeatId) return;
      kwFeatId = f.id;
      kwSince = Date.now();
      box.innerHTML = kudosCard(f, 'feat');
      document.querySelectorAll('#kwWall .kd-card').forEach(c => c.classList.toggle('is-feat', c.dataset.id === f.id));
      if (!rotating) pulse.spike(.6);
    }
    function paintKudos(s) {
      const list = s.kudos || [], wall = $('kwWall');
      if (!wall) return;
      FX.tween($('kwN'), list.length);
      const key = list.map(k => k.id).join(',');
      if (key === kwKey) return;
      kwKey = key;
      if (!list.length) {
        $('kwFeature').innerHTML = `<div class="kd-card feat kd-invite"><div class="kd-top"><span class="kd-ico">${icon('help:heart')}</span><span class="kd-kind">Kudos</span></div>
          <p class="kd-text">Who deserves a thank-you?</p><div class="kd-to">Scan the code and send a kudos to a colleague or a whole team. It appears right here.</div></div>`;
        wall.innerHTML = [0, 1, 2, 3, 4, 5].map(i => `<div class="kd-card kd-ghost" style="--t:${(i % 3 - 1) * .5}deg"><i></i><i></i><i></i></div>`).join('');
        kwFeatId = '';
        return;
      }
      wall.querySelectorAll('.kd-ghost').forEach(g => g.remove());
      const fresh = list.filter(k => !kwSeen.has(k.id));
      const had = kwSeen.size > 0;
      fresh.forEach(k => kwSeen.add(k.id));
      // the wall: the latest cards, keeping the ones already there
      const old = new Map([...wall.querySelectorAll('.kd-card[data-id]')].map(c => [c.dataset.id, c]));
      const shown = list.slice(0, 14);
      shown.forEach(k => {
        let c = old.get(k.id);
        if (!c) { wall.insertAdjacentHTML('beforeend', kudosCard(k, had ? 'new' : '')); c = wall.lastElementChild; }
        wall.appendChild(c);
        old.delete(k.id);
      });
      old.forEach(c => c.remove());
      // a new kudos goes straight into the spotlight
      if (had && fresh.length) { kwFeat = list.indexOf(fresh[0]); kwFeatId = ''; }
      showFeature(s, !(had && fresh.length));
    }

    // ---------- live Q&A board ----------
    let qaKeyHost = '';
    function paintQa(s) {
      const board = $('qaBoard');
      if (!board) return;
      const list = (s.qa || []).slice(0, 7), more = (s.qa || []).length - list.length;
      const key = JSON.stringify([list, more]);
      if (key === qaKeyHost) return;
      qaKeyHost = key;
      if (!list.length) { board.innerHTML = '<div class="qa-wait"><b>Questions appear here</b><span>Scan the code and ask anything. It stays anonymous.</span></div>'; return; }
      const before = new Map([...board.querySelectorAll('.qa-card')].map(el => [el.dataset.id, el.getBoundingClientRect().top]));
      const old = new Map([...board.querySelectorAll('.qa-card')].map(el => [el.dataset.id, el]));
      board.querySelector('.qa-wait')?.remove();
      board.querySelector('.qa-more')?.remove();
      list.forEach((x, k) => {
        let el = old.get(x.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'card qa-card new'; el.dataset.id = x.id;
          el.innerHTML = '<div class="qa-votes"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3 L13.5 10 H2.5 Z" fill="currentColor"/></svg><b>0</b></div><p></p>';
          el.querySelector('p').textContent = x.text;
          if (T.canControl) el.onclick = () => T.act('qa', `${el.classList.contains('qa-done') ? 'hide' : 'done'}:${x.id}`);
          pulse.spike(.5);
        }
        const b = el.querySelector('.qa-votes b');
        if (b.textContent !== String(x.votes)) { b.textContent = x.votes; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
        el.classList.toggle('qa-done', x.done);
        el.classList.toggle('top', k === 0 && x.votes > 0 && !x.done);
        board.appendChild(el);
        old.delete(x.id);
      });
      old.forEach(el => el.remove());
      if (more > 0) board.insertAdjacentHTML('beforeend', `<div class="qa-more">+ ${more} more question${more === 1 ? '' : 's'}</div>`);
      // slide the cards from their old to their new place
      board.querySelectorAll('.qa-card').forEach(el => {
        const was = before.get(el.dataset.id);
        if (was == null) return;
        const dy = was - el.getBoundingClientRect().top;
        if (!dy) return;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }

    function paint(s, meta) {
      if (s.stage === 'slide' && s.qa) paintQa(s);
      if (s.stage === 'slide' && s.tug) paintTug(s);
      if (s.stage === 'slide' && s.kudos) paintKudos(s);
      if (s.stage === 'lobby') paintLobby(s);
      else if (s.stage === 'question') paintQuestion(s, meta);
      else if (s.stage === 'recap') paintRecap(s);
      else if (s.stage === 'finale') paintFinale(s);
      fresh = false;
    }

    // ---------- LOBBY ----------
    function buildLobby(s) {
      const L = s.lobby || {};
      $('titleblock').innerHTML = `${bouncy(L.title || 'Mood Pulse', 'big')}<p class="sub">${esc(L.intro || '')}</p>`;
      $('content').innerHTML = `
        <div class="lobby">
          <div class="card how st" style="--i:0">
            <div class="card-h"><b>How to play</b><span>Takes about two minutes</span></div>
            <div class="steps">
              <div class="step" style="--k:0"><div class="num">1</div><div class="sico">${PHONE}</div><b>Scan the code</b><span>No app, no login</span></div>
              <div class="arrow" style="--k:0"></div>
              <div class="step" style="--k:1"><div class="num">2</div><div class="sico">${orbIcon(LANES[1], 'signal:4')}</div><b>Pick your answer</b><span>100% anonymous</span></div>
              <div class="arrow" style="--k:1"></div>
              <div class="step" style="--k:2"><div class="num">3</div><div class="sico race-ico">${CROWN}${orbIcon(LANES[0], 'chart:rocket')}</div><b>Watch the results</b><span>Live on this screen</span></div>
            </div>
          </div>
          <div class="card join-card call st" style="--i:1">
            <div class="join-k">Scan to play!</div>
            <div class="qr">${T.qrHtml()}</div>
            <div class="join-url">${esc(T.joinLabel || T.joinUrl.replace(/^https?:\/\//, ''))}</div>
            <div class="join-hint">No name · no login · 100% anonymous</div>
          </div>
          <div class="card players st" style="--i:2">
            <div class="players-n"><span id="joinedN" data-v="0">0</span><small>players in the lobby</small></div>
            <div class="chips" id="chips"><div class="chips-empty">Your secret player name appears here when you join…</div></div>
          </div>
        </div>`;
      $('source').textContent = 'Grab your phone';
      $('ticker').innerHTML = ['Scan the code to join', ...(s.ticker || [])].map(t => `<span class="joke">${esc(t)}</span>`).join('');
    }

    function paintLobby(s) {
      const n = s.connected || 0;
      const prev = Number($('joinedN').dataset.v || 0);
      FX.tween($('joinedN'), n);
      if (n > prev && !fresh) { pulse.spike(.7); flashLights(); }
      renderChips($('chips'), (s.players || []).slice(-24).reverse());
    }
    function renderChips(box, players) {
      if (!players.length) return;
      const want = players.map(p => `${p.a}-${p.n}-${p.c}`);
      const have = [...box.querySelectorAll('.chip')].map(c => c.dataset.k);
      if (want.join() === have.join()) return;
      const old = new Set(have);
      box.innerHTML = players.map((p, i) => {
        const k = want[i];
        return `<div class="chip ${old.has(k) ? '' : 'pop'}" data-k="${k}" style="--c:${LANES[p.c % LANES.length]};--d:${(hash(k) % 20) / 10}s">${orbText(LANES[p.c % LANES.length], initials(p))}<span>${esc(PulseCore.playerName(p))}</span></div>`;
      }).join('');
    }

    // ---------- QUESTION ----------
    function buildQuestion(s) {
      if (s.question.type === 'award') return buildAward(s);
      const q = s.question, scored = q.options.some(o => typeof o.score === 'number');
      $('titleblock').innerHTML = `
        <div class="qrow">
          <div class="qbadge"><b>${s.group === 'checkin' ? s.qn : 'Q' + s.qn}</b><span>of ${s.qtotal}</span></div>
          <div class="qtext"><h1 id="qtitle">${esc(q.title)}</h1>${q.context ? `<div class="ctx">${esc(q.context)}</div>` : ''}</div>
          <div class="timer" id="timer" hidden>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="t-bg" cx="50" cy="50" r="42"/><circle class="t-fg" id="tfg" cx="50" cy="50" r="42" pathLength="100"/></svg>
            <b id="tnum">25</b>
          </div>
        </div>
        <div class="banner" id="banner"></div>`;
      $('content').innerHTML = `
        <div class="body" id="body">
          <div class="card race st" id="race" style="--i:0">
            <div class="card-h"><b>The race</b><span id="nlabel"></span></div>
            <div class="lanes">
              ${q.options.map((o, i) => `
                <div class="lane" data-id="${esc(o.id)}" style="--c:${LANES[i % LANES.length]};--i:${i}">
                  <div class="badge"><span class="ic">${icon(o.icon)}</span><span class="lab">${esc(o.label)}</span></div>
                  <div class="track">
                    <div class="trail"></div>
                    ${FLAG}
                    <div class="runner" style="--f:0">
                      ${o.note ? `<div class="bubble">${esc(o.note)}</div>` : ''}
                      ${CROWN}
                      <div class="body-wrap" style="--d:${(i * .37).toFixed(2)}s">${orb(LANES[i % LANES.length])}</div>
                    </div>
                  </div>
                  <div class="pct" data-v="0">0%</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="right">
            <div class="card words st" style="--i:1">
              <div class="card-h"><b>In your words</b><span id="wlabel"></span></div>
              <div class="cloud ${T.canControl ? 'can-edit' : ''}" id="cloud"><div class="w" id="measure" style="visibility:hidden;transition:none"><i></i></div></div>
              <div class="cloud-empty" id="cloudEmpty">Type a word on your phone<br>and watch it pop up here</div>
            </div>
            <div class="minis">
              <div class="card mini meter st" style="--i:2" id="meterCard">
                ${scored ? `<div class="mini-k">${esc(q.meterLabel || 'Team energy')}</div>
                  <svg class="gauge" viewBox="0 0 120 70" aria-hidden="true">
                    <path d="M12 62 A48 48 0 0 1 26.1 28.1" class="seg" stroke="#2a1fd1"/>
                    <path d="M26.1 28.1 A48 48 0 0 1 60 14" class="seg" stroke="#3b6fff"/>
                    <path d="M60 14 A48 48 0 0 1 93.9 28.1" class="seg" stroke="#5fb8ff"/>
                    <path d="M93.9 28.1 A48 48 0 0 1 108 62" class="seg" stroke="#8fd3ff"/>
                    <g class="needle" id="needle"><path d="M60 62 L60 22" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="62" r="7" fill="#ffffff"/></g>
                  </svg>
                  <div class="mini-v"><span id="k-avg" data-v="0">?</span><small>/ 5</small></div>
                  ${s.compare ? `<div class="mini-cmp" id="cmp" hidden></div>` : ''}`
                : `<div class="mini-k">In the lead</div><div class="leader" id="leader"><span class="q">?</span></div>`}
              </div>
              <div class="card mini qr-mini st" style="--i:3" id="joinCard">
                <div class="mini-k">Scan to play</div>
                <div class="qr">${T.qrHtml()}</div>
                <div class="mini-n"><b id="k-n" data-v="0">0</b> votes</div>
              </div>
            </div>
          </div>
        </div>`;
    }

    function paintQuestion(s, meta) {
      if (s.question.type === 'award') return paintAward(s, meta);
      const q = s.question, n = s.stats.n;
      $('body').classList.toggle('concealed', !s.revealed);
      $('race').classList.toggle('racing', !s.revealed);
      $('joinCard').classList.toggle('call', n < 3);
      $('nlabel').textContent = n ? `${n} vote${n === 1 ? '' : 's'}` : 'Waiting for votes…';

      const key = s.revealed ? 'r:' + s.takeaway : n ? 'v' : 'w';
      if (key !== titleKey) {
        titleKey = key;
        const b = $('banner');
        b.className = 'banner ' + (s.revealed && s.takeaway ? 'result' : 'hint');
        b.innerHTML = s.revealed && s.takeaway ? emphasise(s.takeaway) : n ? 'Votes are pouring in… who will win the race?' : 'Grab your phone, scan the code, pick your answer!';
        if (s.revealed && s.takeaway) FX.splitWords(b, 45);
        b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
      }

      const max = Math.max(1, ...Object.values(s.counts));
      [...document.querySelectorAll('.lane')].forEach(lane => {
        const c = s.counts[lane.dataset.id] || 0, pct = n ? Math.round(100 * c / n) : 0;
        lane.querySelector('.runner').style.setProperty('--f', (c / max).toFixed(3));
        lane.querySelector('.trail').style.setProperty('--f', (c / max).toFixed(3));
        FX.tween(lane.querySelector('.pct'), pct, v => Math.round(v) + '%');
        lane.classList.toggle('top', n > 0 && lane.dataset.id === s.stats.topId);
      });
      FX.tween($('k-n'), n);
      // after the reveal the race turns into a ranked bar chart (a moment later, so the race result lands first)
      if (!s.revealed || !n) rankResults(null);
      else if (revealedPrev === false) later(() => latest && latest.revealed && rankResults(latest), 1300);
      else rankResults(s);
      if ($('needle')) {
        if (s.revealed && s.stats.avg != null) { $('needle').style.setProperty('--a', ((s.stats.avg - 1) / 4 * 180 - 90).toFixed(1) + 'deg'); FX.tween($('k-avg'), s.stats.avg, v => v.toFixed(1)); }
        else $('k-avg').textContent = '?';
        if ($('cmp')) {
          const c = s.compare, show = s.revealed && c && c.avg != null && s.stats.avg != null;
          $('cmp').hidden = !show;
          if (show) { const d = +(s.stats.avg - c.avg).toFixed(1); $('cmp').innerHTML = `${esc(c.label)}: <b>${c.avg}</b> <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`; }
        }
      } else {
        const opt = q.options.find(o => o.id === s.stats.topId), i = q.options.indexOf(opt);
        const html = s.revealed && opt ? `${orbIcon(LANES[i % LANES.length], opt.icon)}<b>${esc(opt.label)}</b>` : '<span class="q">?</span>';
        if ($('leader').dataset.k !== html) { $('leader').dataset.k = html; $('leader').innerHTML = html; }
      }
      if (meta.pop) hop(meta.pop);
      scheduleCloud(s);

      // live words, with a light-hearted ticker line after every few words (or only jokes until words arrive)
      const jokes = s.ticker || [], words = s.recent || [];
      const parts = [];
      words.forEach((w, k) => { parts.push(`<span>${esc(w)}</span>`); if (k % 4 === 3 && jokes.length) parts.push(`<span class="joke">${esc(jokes[(s.index + k) % jokes.length])}</span>`); });
      if (!words.length) jokes.forEach(j => parts.push(`<span class="joke">${esc(j)}</span>`));
      const tick = parts.join('');
      if (tick !== lastTicker) { lastTicker = tick; $('ticker').innerHTML = tick; }
      $('source').textContent = words.length ? 'Live feed' : 'Finance news';

      if (!s.revealed && s.timeLeft > 0) startTimer(s.timeLeft, s.timerTotal);
      else stopTimer(!s.revealed && s.timerTotal > 0);
      if (revealedPrev === false && s.revealed) revealMoment(timesUp ? "TIME'S UP!" : 'REVEAL!');
      revealedPrev = s.revealed;

      if (lastN !== null && n > lastN) {
        const hit = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500].find(m => lastN < m && n >= m);
        if (hit) { FX.toast($('toast'), `🎉 ${hit} votes and counting!`); confetti.burst('top'); }
      }
      lastN = n;
    }

    // ---------- AWARD: three nominees, a secret vote, a drumroll reveal ----------
    const TROPHY = icon('help:trophy');
    const nomineeCard = (o, k, extra = '') => `
      <div class="card aw-card" data-id="${esc(o.id)}" style="--k:${k};--c:${LANES[k % LANES.length]}">
        <span class="aw-num" aria-hidden="true">${k + 1}</span>
        <div class="aw-top">${orbText(LANES[k % LANES.length], String(k + 1))}<div class="aw-name"><b>${ph(o.label || '')}</b>${o.team ? `<span>${ph(o.team)}</span>` : ''}</div></div>
        ${o.idea ? `<p class="aw-idea">${ph(o.idea)}</p>` : ''}
        ${extra}
      </div>`;
    let rolling = false;
    function buildAward(s) {
      const q = s.question;
      $('titleblock').innerHTML = `
        <div class="qrow">
          <div class="qbadge award"><span class="aw-ico">${TROPHY}</span><span>Award</span></div>
          <div class="qtext"><h1 id="qtitle">${esc(q.title)}</h1>${q.context ? `<div class="ctx">${esc(q.context)}</div>` : ''}</div>
          <div class="timer" id="timer" hidden>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="t-bg" cx="50" cy="50" r="42"/><circle class="t-fg" id="tfg" cx="50" cy="50" r="42" pathLength="100"/></svg>
            <b id="tnum">25</b>
          </div>
        </div>
        <div class="banner" id="banner"></div>`;
      $('content').innerHTML = `
        <div class="aw" id="aw">
          <div class="aw-cards" style="--n:${q.options.length}">
            ${q.options.map((o, k) => nomineeCard(o, k, `
              <div class="aw-res"><div class="aw-bar"><i></i></div><span class="aw-pct">?</span></div>
              <div class="aw-ribbon">${TROPHY}<span>Winner${q.prize ? ` · ${ph(q.prize)}` : ''}</span></div>`)).join('')}
          </div>
          <div class="card aw-foot st" style="--i:4">
            <div class="qr" id="awQr">${T.qrHtml()}</div>
            <div class="aw-count"><b id="k-n" data-v="0">0</b><span>votes in</span></div>
            <div class="aw-prize">${TROPHY}<div><small>The winner takes home</small><b>${ph(q.prize || '[Prize]')}</b></div></div>
          </div>
        </div>`;
      $('source').textContent = 'Improvement Award';
      $('ticker').innerHTML = (s.ticker || []).map(j => `<span class="joke">${esc(j)}</span>`).join('');
      rolling = false;
    }
    const winnersOf = s => {
      const best = Math.max(0, ...Object.values(s.counts));
      return best ? s.question.options.filter(o => (s.counts[o.id] || 0) === best).map(o => o.id) : [];
    };
    function showAwardResult(s) {
      const n = s.stats.n, wins = winnersOf(s), q = s.question;
      $('aw').classList.add('aw-out');
      document.querySelectorAll('.aw-card').forEach(card => {
        const c = s.counts[card.dataset.id] || 0, pct = n ? Math.round(100 * c / n) : 0;
        card.classList.remove('aw-spot');
        card.classList.toggle('aw-win', wins.includes(card.dataset.id));
        card.classList.toggle('aw-lose', wins.length > 0 && !wins.includes(card.dataset.id));
        card.querySelector('.aw-bar i').style.width = pct + '%';
        FX.tween(card.querySelector('.aw-pct'), pct, v => Math.round(v) + '%');
      });
      const names = q.options.filter(o => wins.includes(o.id)).map(o => String(o.label).replace(/[\[\]]/g, ''));
      const b = $('banner');
      const html = !names.length ? 'No votes yet' : names.length > 1 ? emphasise(`It's a tie: “${names.join('” and “')}”!`)
        : emphasise((q.winnerText || 'And the Improvement Award goes to… {winner}!').replace('{winner}', `“${names[0]}”`));
      if (b.dataset.k === html && b.classList.contains('result')) return;   // same winner: leave the banner be
      b.dataset.k = html;
      b.className = 'banner result';
      b.innerHTML = html;
      FX.splitWords(b, 45);
      b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    }
    function clearAwardResult() {
      $('aw').classList.remove('aw-out');
      document.querySelectorAll('.aw-card').forEach(card => {
        card.classList.remove('aw-win', 'aw-lose', 'aw-spot');
        card.querySelector('.aw-bar i').style.width = '0%';
        card.querySelector('.aw-pct').textContent = '?';
        card.querySelector('.aw-pct').dataset.v = 0;
      });
    }
    // The drumroll: a spotlight jumps between the nominees, slows down and lands on the winner.
    function drumroll() {
      const cards = [...document.querySelectorAll('.aw-card')];
      const s0 = latest, wins = winnersOf(s0);
      if (!cards.length || !wins.length) { showAwardResult(s0); return; }
      rolling = true;
      const b = $('banner');
      b.className = 'banner hint'; b.textContent = 'And the winner is…';
      b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
      const target = cards.findIndex(c => c.dataset.id === wins[0]);
      const hops = cards.length * 4 + ((target - (cards.length * 4) % cards.length) + cards.length) % cards.length;
      let i = 0, k = 0;
      const step = () => {
        if (!rolling || !$('aw')) return;
        cards.forEach((c, j) => c.classList.toggle('aw-spot', j === i));
        pulse.spike(.4);
        if (k >= hops) {
          rolling = false;
          later(() => {
            cardsKey = JSON.stringify(latest.counts);
            showAwardResult(latest);
            slam(wins.length > 1 ? "IT'S A TIE!" : 'WINNER!'); flashLights();
            $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake');
            later(() => { confetti.burst('cannons'); flashLights(); fireworks.start(); }, 500);
            later(() => fireworks.stop(), 6500);
          }, 650);
          return;
        }
        i = (i + 1) % cards.length; k++;
        later(step, 70 + 380 * Math.pow(k / hops, 2.2));
      };
      later(step, 600);
    }
    function paintAward(s, meta) {
      const n = s.stats.n;
      FX.tween($('k-n'), n);
      if (meta.pop) { const c = $('k-n').parentElement; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
      $('awQr').parentElement.classList.toggle('call', n < 3);
      if (!s.revealed) {
        if (rolling) rolling = false;
        cardsKey = '';
        if (revealedPrev !== false) {
          clearAwardResult();
          const b = $('banner');
          b.className = 'banner hint';
          b.textContent = n ? 'Votes are coming in… the result stays secret until the reveal!' : 'Scan the code and vote for the improvement that impressed you most';
          b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
        } else if (n && $('banner').textContent.startsWith('Scan')) $('banner').textContent = 'Votes are coming in… the result stays secret until the reveal!';
      } else if (revealedPrev === false) drumroll();
      else if (!rolling && cardsKey !== JSON.stringify(s.counts)) { cardsKey = JSON.stringify(s.counts); showAwardResult(s); }
      stopTimer(false);
      revealedPrev = s.revealed;
    }

    let rankKey = '';
    function rankResults(s) {
      const race = $('race');
      if (!race) return;
      const key = s ? JSON.stringify(s.counts) : '';
      if (key === rankKey) return;
      rankKey = key;
      race.classList.toggle('ranked', !!s);
      race.querySelector('.card-h b').textContent = s ? 'Results' : 'The race';
      const box = race.querySelector('.lanes'), lanes = [...box.children];
      const before = new Map(lanes.map(l => [l, l.getBoundingClientRect().top]));
      const pos = l => Number(l.style.getPropertyValue('--i')) || 0;
      const order = s ? [...lanes].sort((a, b) => (s.counts[b.dataset.id] || 0) - (s.counts[a.dataset.id] || 0) || pos(a) - pos(b)) : [...lanes].sort((a, b) => pos(a) - pos(b));
      order.forEach(l => box.appendChild(l));
      order.forEach(l => {
        const dy = before.get(l) - l.getBoundingClientRect().top;
        if (dy) l.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 750, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }

    function hop(id) {
      const lane = document.querySelector(`.lane[data-id="${CSS.escape(id)}"]`);
      if (!lane) return;
      const r = lane.querySelector('.runner');
      r.classList.remove('hop'); void r.offsetWidth; r.classList.add('hop');
      const p = document.createElement('div'); p.className = 'plus'; p.textContent = '+1';
      r.appendChild(p); setTimeout(() => p.remove(), 1000);
    }

    // ---------- countdown ----------
    let deadline = 0, total = 0, timerOn = false, autoSent = false, timesUp = false, lastSec = null;
    function startTimer(left, tot) {
      deadline = performance.now() + left; total = tot || left;
      const t = $('timer');
      t.hidden = false; t.classList.remove('done');
      if (!timerOn) { timerOn = true; autoSent = false; timesUp = false; requestAnimationFrame(tickTimer); }
    }
    function stopTimer(showZero) {
      timerOn = false;
      const t = $('timer');
      if (!t) return;
      if (showZero) { t.hidden = false; $('tnum').textContent = '0'; $('tfg').style.strokeDashoffset = 100; t.classList.add('done'); }
      else t.hidden = true;
    }
    function tickTimer() {
      if (!timerOn || !$('timer')) return;
      const rem = Math.max(0, deadline - performance.now());
      const sec = Math.ceil(rem / 1000);
      if (sec !== lastSec) { lastSec = sec; const b = $('tnum'); b.textContent = sec; b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick'); }
      $('tfg').style.strokeDashoffset = (100 * (1 - rem / total)).toFixed(2);
      $('timer').classList.toggle('hurry', rem < 5500 && rem > 0);
      if (rem <= 0) {
        timerOn = false; timesUp = true;
        $('timer').classList.remove('hurry'); $('timer').classList.add('done');
        if (T.canControl && !autoSent) { autoSent = true; T.act('reveal'); }
        else if (!T.canControl) slam("TIME'S UP!");
        return;
      }
      requestAnimationFrame(tickTimer);
    }

    function slam(text) {
      const el = $('slam');
      el.firstChild.textContent = text;
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    }
    function revealMoment(text) {
      slam(text); flashLights();
      $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake');
      setTimeout(() => { confetti.burst('cannons'); flashLights(); }, 650);
      timesUp = false;
    }

    // ---------- word bubbles ----------
    let cloudAt = 0, cloudTimer = null;
    function scheduleCloud(s) {
      const wait = 1100 - (Date.now() - cloudAt);
      if (wait <= 0 || fresh) { cloudAt = Date.now(); layoutCloud(s); return; }
      if (!cloudTimer) cloudTimer = setTimeout(() => { cloudTimer = null; cloudAt = Date.now(); if (latest && latest.stage === 'question') layoutCloud(latest); }, wait);
    }
    function layoutCloud(s) {
      const box = $('cloud'), measure = $('measure');
      if (!box) return;
      const entries = Object.entries(s.words).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30);
      $('cloudEmpty').hidden = entries.length > 0;
      const total = entries.reduce((a, [, c]) => a + c, 0);
      $('wlabel').textContent = total ? `${total} word${total === 1 ? '' : 's'}` : '';
      const W = box.clientWidth, H = box.clientHeight, u = U();
      const hi = entries.length ? entries[0][1] : 1, lo = entries.length ? entries[entries.length - 1][1] : 1;
      const maxF = u * (entries.length > 18 ? 2.3 : entries.length > 9 ? 2.7 : 3.2), minF = u * 1.15, pad = u * .5;
      const placed = [], seen = new Set();
      entries.forEach(([w, n], i) => {
        seen.add(w);
        const t = hi === lo ? (entries.length === 1 ? 1 : .3) : Math.sqrt((n - lo) / (hi - lo));
        const fs = minF + (maxF - minF) * t;
        measure.style.fontSize = fs + 'px'; measure.firstChild.textContent = w;
        const bw = measure.offsetWidth, bh = measure.offsetHeight;
        let pos = null;
        for (let k = 0; k < 2400 && !pos; k++) {
          const a = k * .22, r = u * .3 * a;
          const x = W / 2 + r * Math.cos(a) * 1.35 - bw / 2, y = H / 2 + r * Math.sin(a) * .85 - bh / 2;
          if (x < 0 || y < 0 || x + bw > W || y + bh > H) continue;
          if (placed.some(p => x < p.x + p.w + pad && x + bw + pad > p.x && y < p.y + p.h + pad * .6 && y + bh + pad * .6 > p.y)) continue;
          pos = { x, y, w: bw, h: bh };
        }
        let rec = cloudEls.get(w);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'w new';
          el.innerHTML = `<i>${esc(w)}</i>`;
          el.style.setProperty('--c', LANES[hash(w) % LANES.length]);
          el.style.setProperty('--d', (hash(w) % 30) / 10 + 's');
          if (T.canControl) { el.title = 'Click to hide this word'; el.onclick = () => T.act('hide', w); }
          box.appendChild(el);
          rec = { el, n };
          cloudEls.set(w, rec);
          if (pos) { el.style.transition = 'none'; el.style.fontSize = fs + 'px'; el.style.transform = `translate(${pos.x}px,${pos.y}px)`; void el.offsetWidth; el.style.transition = ''; }
        } else if (n > rec.n) {
          rec.el.classList.remove('grow', 'new'); void rec.el.offsetWidth; rec.el.classList.add('grow');
        }
        rec.n = n;
        rec.el.classList.toggle('lead', i === 0);
        if (!pos) { rec.el.style.opacity = 0; return; }
        placed.push(pos);
        Object.assign(rec.el.style, { opacity: '', fontSize: fs + 'px', transform: `translate(${pos.x}px,${pos.y}px)` });
      });
      for (const [w, rec] of cloudEls) if (!seen.has(w)) { rec.el.remove(); cloudEls.delete(w); }
    }

    // ---------- SLIDES: the rest of the all-hands deck ----------
    // Layouts: title, agenda, section, bullets, stats, shoutouts, quote, qa. Text in [brackets] is a placeholder.
    const ph = t => esc(t).replace(/\[([^\]]*)\]/g, '<span class="ph">[$1]</span>');
    function buildSlide(s) {
      const sl = s.slide || {}, T2 = $('titleblock'), C = $('content');
      const head = () => `${bouncy(sl.title || '', 'mid')}${sl.subtitle ? `<p class="sub">${ph(sl.subtitle)}</p>` : ''}`;
      // the light-hearted ticker runs on opening and section slides; content slides stay quiet
      const jokes = ['title', 'section'].includes(sl.type) ? s.ticker || [] : [];
      $('ticker').innerHTML = jokes.map(j => `<span class="joke">${esc(j)}</span>`).join('');
      $('source').textContent = s.team;
      if (sl.type === 'title') {
        T2.innerHTML = '';
        C.innerHTML = `<div class="s-title">
          ${sl.kicker ? `<div class="s-kicker">${ph(sl.kicker)}</div>` : ''}
          ${bouncy(sl.title || '', 'xl')}
          ${sl.subtitle ? `<p class="s-sub">${ph(sl.subtitle)}</p>` : ''}
          ${sl.meta ? `<div class="s-meta">${ph(sl.meta)}</div>` : ''}
        </div>`;
      } else if (sl.type === 'section') {
        T2.innerHTML = '';
        C.innerHTML = `<div class="s-section">
          <div class="s-num">${esc(sl.number || '')}</div>
          <div class="s-sec-text">${bouncy(sl.title || '', 'mid')}${sl.subtitle ? `<p class="sub">${ph(sl.subtitle)}</p>` : ''}</div>
          <div class="s-beam"></div>
        </div>`;
      } else if (sl.type === 'agenda') {
        T2.innerHTML = head();
        C.innerHTML = `<div class="card s-agenda st" style="--i:0"><ol>${(sl.items || []).map((it, k) => `
          <li style="--k:${k}"><span class="time">${ph(it.time || '')}</span><span class="what"><b>${ph(it.title || '')}</b>${it.who ? `<small>${ph(it.who)}</small>` : ''}</span>${it.live ? '<span class="live-tag">Live poll</span>' : ''}</li>`).join('')}</ol></div>`;
      } else if (sl.type === 'bullets') {
        T2.innerHTML = head();
        const pts = sl.points || [];
        C.innerHTML = `<div class="s-points" style="--n:${pts.length}">${pts.map((pt, k) => `
          <div class="card s-point" style="--k:${k};--c:${LANES[k % LANES.length]}">
            ${pt.icon ? `<div class="s-ico">${orbIcon(LANES[k % LANES.length], pt.icon)}</div>` : ''}
            <b>${ph(pt.title || '')}</b>${pt.text ? `<p>${ph(pt.text)}</p>` : ''}
          </div>`).join('')}</div>`;
      } else if (sl.type === 'stats') {
        T2.innerHTML = head();
        const st = sl.stats || [];
        C.innerHTML = `<div class="s-stats" style="--n:${st.length}">${st.map((x, k) => `
          <div class="card s-stat" style="--k:${k};--c:${LANES[k % LANES.length]}">
            <div class="s-val" data-val="${esc(x.value || '')}">${ph(x.value || '')}</div>
            <div class="s-lab">${ph(x.label || '')}</div>
            ${x.note ? `<div class="s-note">${ph(x.note)}</div>` : ''}
          </div>`).join('')}</div>`;
        // count up numeric values; placeholders such as "XX" stay as they are
        later(() => C.querySelectorAll('.s-val').forEach((el, k) => {
          const raw = el.dataset.val, m = raw.match(/^([^\d-]*)(-?[\d.,]+)(.*)$/);
          if (!m) return;
          const num = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length;
          if (!isFinite(num)) return;
          el.dataset.v = 0;
          setTimeout(() => FX.tween(el, num, v => m[1] + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3], 1400), k * 250);
        }), 500);
      } else if (sl.type === 'shoutouts') {
        T2.innerHTML = head();
        const people = sl.people || [];
        C.innerHTML = `<div class="s-shouts" style="--n:${people.length}">${people.map((p, k) => {
          const ini = String(p.name || '?').replace(/[\[\]]/g, '').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '★';
          return `<div class="card s-shout" style="--k:${k}">
            <div class="s-avatar">${CROWN}${orbText(LANES[k % LANES.length], ini)}</div>
            <b>${ph(p.name || '')}</b>${p.team ? `<span class="s-team">${ph(p.team)}</span>` : ''}
            ${p.reason ? `<p>${ph(p.reason)}</p>` : ''}
          </div>`;
        }).join('')}</div>`;
      } else if (sl.type === 'chart') {
        T2.innerHTML = head();
        const co = sl.callout || {};
        C.innerHTML = `<div class="s-chart">
          <div class="card ch-card st" style="--i:0"><div class="ch-box" id="chBox"></div></div>
          <div class="ch-side st" style="--i:1">
            ${co.badge ? `<div class="ch-badge">${TROPHY}<span>${esc(co.badge)}</span></div>` : ''}
            ${co.value ? `<div class="ch-big">${esc(co.value)}</div>` : ''}
            ${co.label ? `<div class="ch-biglab">${esc(co.label)}</div>` : ''}
            ${(co.points || []).map(t => `<p class="ch-pt">${ph(t)}</p>`).join('')}
            <div class="ch-legend"><span><i class="sw" style="background:linear-gradient(90deg, ${CHART_COLORS[0]} 50%, ${CHART_COLORS[1]} 50%)"></i>Reported</span><span><i class="sw hatch"></i>Outlook</span></div>
          </div>
        </div>`;
        $('source').textContent = sl.source || '';
        requestAnimationFrame(() => drawBarChart(sl));
      } else if (sl.type === 'tug') {
        buildTug(s);
      } else if (sl.type === 'kudos') {
        buildKudos(s);
      } else if (sl.type === 'nominees') {
        T2.innerHTML = head();
        const list = s.nominees || [];
        C.innerHTML = `<div class="aw nominees"><div class="aw-cards" style="--n:${list.length}">${list.map((o, k) => nomineeCard(o, k)).join('')}</div></div>`;
        $('source').textContent = 'Improvement Award';
      } else if (sl.type === 'quote') {
        T2.innerHTML = '';
        C.innerHTML = `<div class="s-quote"><div class="s-qmark">“</div><blockquote>${ph(sl.quote || '')}</blockquote>${sl.by ? `<div class="s-by">${ph(sl.by)}</div>` : ''}</div>`;
      } else if (sl.type === 'qa' && s.qa) {
        // live anonymous Q&A: the questions from the phones, ranked by votes
        T2.innerHTML = '';
        C.innerHTML = `<div class="qa-wall">
          <div class="qa-side">
            <div class="s-qa-orbs">${[0, 1, 2, 3, 4].map(k => `<span style="--k:${k}">${orb(LANES[k % LANES.length])}</span>`).join('')}</div>
            ${bouncy(sl.title || 'Questions?', 'big')}
            ${sl.subtitle ? `<p class="s-sub">${ph(sl.subtitle)}</p>` : ''}
            <div class="card qa-join st" style="--i:2"><div class="qr">${T.qrHtml()}</div><div><b>Scan to ask</b><span>Anonymous. Vote for the questions you want answered.</span></div></div>
          </div>
          <div class="qa-board" id="qaBoard"></div>
        </div>`;
        $('source').textContent = T.canControl ? 'Click a question: answered · click again: hide · U: bring back' : 'Live Q&A';
        qaKeyHost = '';
      } else if (sl.type === 'qa') {
        T2.innerHTML = '';
        C.innerHTML = `<div class="s-qa">
          <div class="s-qa-orbs">${[0, 1, 2, 3, 4].map(k => `<span style="--k:${k}">${orb(LANES[k % LANES.length])}</span>`).join('')}</div>
          ${bouncy(sl.title || 'Questions?', 'xl')}
          ${sl.subtitle ? `<p class="s-sub">${ph(sl.subtitle)}</p>` : ''}
        </div>`;
      } else {
        T2.innerHTML = head();
        C.innerHTML = sl.text ? `<div class="card st" style="--i:0"><p class="s-text">${ph(sl.text)}</p></div>` : '';
      }
    }

    // ---------- RECAP: thank you + what we'll do ----------
    function buildRecap(s) {
      const R = s.recap || {};
      $('titleblock').innerHTML = `${bouncy(R.title || 'Thank you!', 'mid')}<p class="sub">${esc(R.subtitle || '')}</p>`;
      $('content').innerHTML = `<div class="final" id="recapCards" style="--cols:${s.items.length}"></div><div class="final-band st" id="recapBand" style="--i:${s.items.length + 1}"></div>`;
      $('source').textContent = 'You said, we do';
      $('ticker').innerHTML = s.items.map(it => it.pledge ? `<span>${esc(it.pledge)}</span>` : '').join('');
    }
    function paintRecap(s) {
      const idx = s.items.map(it => it.stats.avg).filter(v => v != null);
      const avgAll = idx.length ? +(idx.reduce((a, b) => a + b, 0) / idx.length).toFixed(1) : null;
      const wordsAll = s.items.reduce((a, it) => a + Object.values(it.words).reduce((x, y) => x + y, 0), 0);
      const key = JSON.stringify([s.participants, s.items.map(it => [it.stats, it.takeaway, it.words])]);
      if (key === cardsKey) return;
      cardsKey = key;
      $('recapCards').innerHTML = s.items.map((it, i) => {
        const oi = it.options.findIndex(o => o.id === it.stats.topId), opt = it.options[oi];
        const chips = Object.entries(it.words).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w], k) => `<span style="--k:${k}">${esc(w)}</span>`).join('');
        return `<div class="card fcard st" style="--i:${i};--c:${LANES[i % LANES.length]}">
          <div class="fhead">Round ${i + 1}</div>
          <div class="fwin">${opt ? `<div class="fblob">${CROWN}${orbIcon(LANES[oi % LANES.length], opt.icon)}</div><div><b>${esc(opt.label)}</b><span>${it.stats.topPct}% of votes</span></div>` : '<div><b>No votes yet</b></div>'}</div>
          <div class="ft">${it.takeaway ? emphasise(it.takeaway) : ''}</div>
          ${chips ? `<div class="fchips">${chips}</div>` : ''}
          ${it.pledge ? `<div class="pledge" style="--k:${i}"><span class="stamp">We'll do</span>${esc(it.pledge)}</div>` : ''}
        </div>`;
      }).join('');
      $('recapBand').innerHTML = `
        <div class="stat"><span class="v" id="sb-p" data-v="0">0</span><span class="k">players</span></div>
        <div class="stat"><span class="v"><span id="sb-a" data-v="0">–</span><small>/5</small></span><span class="k">team outlook</span></div>
        <div class="stat"><span class="v" id="sb-w" data-v="0">0</span><span class="k">words shared</span></div>
        <div class="thanks">Honesty makes us stronger. Thank you.</div>`;
      FX.tween($('sb-p'), s.participants, undefined, 1400);
      if (avgAll != null) FX.tween($('sb-a'), avgAll, v => v.toFixed(1), 1400);
      FX.tween($('sb-w'), wordsAll, undefined, 1400);
    }

    // ---------- ROADMAP: the team walks a winding road, with the workload curve beneath ----------
    const LOAD_WORDS = [[90, 'Peak'], [75, 'Very busy'], [55, 'Busy'], [35, 'Steady'], [0, 'Calm']];
    const loadWord = v => LOAD_WORDS.find(([min]) => v >= min)[1];
    const SAY = { rest: 'Recharge time!', boss: "We've got this!", finish: 'We did it!' };
    // Smooth curve through the workload points that never overshoots them (monotone cubic).
    function smoothCurve(xs, ys) {
      const n = xs.length;
      if (n === 1) return () => ys[0];
      const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
      const m = xs.map((_, i) => i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
      d.forEach((di, i) => {
        if (!di) { m[i] = m[i + 1] = 0; return; }
        const a = m[i] / di, b = m[i + 1] / di, s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * di; m[i + 1] = t * b * di; }
      });
      return x => {
        let i = 0;
        while (i < n - 2 && x > xs[i + 1]) i++;
        const h = xs[i + 1] - xs[i], t = Math.max(0, Math.min(1, (x - xs[i]) / h)), t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
      };
    }
    function buildRoadmap(s) {
      const R = s.roadmap || {};
      const head = `${bouncy(R.title || 'The road ahead', 'mid')}<p class="sub">${esc(R.subtitle || '')}</p>`;
      $('titleblock').innerHTML = R.style === 'road' ? head : (!R.style || R.style === 'gantt') ? `
        <div class="pk-head">
          <div>${head}</div>
          <div class="gt-stats st" style="--i:1" id="gtStats"></div>
        </div>` : `
        <div class="pk-head">
          <div>${head}</div>
          <div class="pk-hud st" style="--i:1" id="pkHud">
            <div class="pk-hud-k">${esc(R.workloadLabel || 'Workload')}</div>
            <div class="pk-hud-m"><span class="pk-seg">${'<i></i>'.repeat(5)}</span><b id="pkWord">&nbsp;</b></div>
            <div class="pk-hud-now" id="pkNow">&nbsp;</div>
          </div>
        </div>`;
      $('content').innerHTML = `<div class="card roadmap st" style="--i:0"><div class="road-box" id="road"></div></div>`;
      $('source').textContent = R.source || 'Next few months';
      const gantt = !R.style || R.style === 'gantt';
      $('ticker').innerHTML = gantt ? '' : (R.steps || []).map(st => `<span>${esc(st.label)}: ${esc(st.when || '')}</span>`).join('');
      requestAnimationFrame(() => drawRoadmap(R));
    }
    function drawRoad(R) {
      const box = $('road'), steps = (R && R.steps) || [];
      if (!box || !steps.length) return;
      const W = box.clientWidth, H = box.clientHeight, u = U(), n = steps.length;
      const loaded = steps.map((st, i) => [i, st.load]).filter(([, v]) => typeof v === 'number');
      const hasLoad = loaded.length > 1;
      const loadH = hasLoad ? Math.max(u * 8, H * .26) : 0;
      const roadBottom = H - loadH - (hasLoad ? u * 1.2 : 0);
      const x0 = u * 6, x1 = W - u * 5, gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
      const xs = steps.map((_, i) => n > 1 ? x0 + gap * i : W / 2);
      // Cards alternate above and below, so each one may use about two gaps; the end cards are pushed inside the box.
      const cw = Math.max(u * 9, Math.min(u * 14.5, gap * 2 - u * 1.2, (x0 + gap * 2 - u) / 1.5, (W - x1 + gap * 2 - u) / 1.5));
      const dx = x => Math.max(0, Math.min(W - cw, x - cw / 2)) - (x - cw / 2);
      box.style.setProperty('--cw', cw + 'px');
      const levels = steps.map((_, i) => steps.slice(0, i + 1).filter(x => (x.type || 'level') === 'level').length);
      const glyph = (st, i) => st.type === 'start' ? '<b>GO</b>'
        : st.type === 'rest' ? icon('help:snow')
        : st.type === 'boss' ? '<b>!</b>'
        : st.type === 'finish' ? icon('help:trophy')
        : `<b>${levels[i]}</b>`;
      box.innerHTML = `
        <svg class="road-svg" id="roadSvg" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
        ${hasLoad ? `<div class="load" id="load" style="height:${loadH}px"></div>` : ''}
        ${steps.map((st, i) => `
          <div class="stop ${st.type || 'level'} ${i === 0 ? 'first' : i === n - 1 ? 'last' : ''}" id="stop${i}" style="left:${xs[i]}px">
            <div class="dot">${glyph(st, i)}</div>
            <div class="scard ${i % 2 ? 'below' : 'above'}" style="--c:${LANES[i % LANES.length]};--dx:${dx(xs[i])}px">
              <span class="when">${esc(st.when || '')}</span>
              <b>${esc(st.type === 'boss' ? 'Boss level: ' + st.label : st.label)}</b>
              ${st.note ? `<span class="snote">${esc(st.note)}</span>` : ''}
            </div>
          </div>`).join('')}
        <div class="walker" id="walker"><div class="say" id="say"></div><i></i></div>`;

      // Wind the road as far as the cards allow: high stops carry their card above, low stops below.
      const cards = [...box.querySelectorAll('.scard')];
      const tallest = side => Math.max(0, ...cards.filter(c => c.classList.contains(side)).map(c => c.offsetHeight));
      const reach = u * 2.6 + u * 1.2;   // biggest dot radius + the gap to its card
      let hi = tallest('above') + reach, lo = roadBottom - tallest('below') - reach;
      const mid = (hi + lo) / 2, amp = Math.max(0, Math.min(lo - hi, u * 10));
      hi = mid - amp / 2; lo = mid + amp / 2;
      const pts = xs.map((x, i) => ({ x, y: i % 2 ? lo : hi }));
      pts.forEach((p, i) => ($('stop' + i).style.top = p.y + 'px'));
      const segs = pts.slice(1).map((b, i) => { const a = pts[i], mx = (a.x + b.x) / 2; return `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`; });
      const full = segs.map((d, i) => i ? d.replace(/^M[^C]+/, '') : d).join(' ') || `M${pts[0].x} ${pts[0].y}`;
      $('roadSvg').innerHTML = `
        <path class="road-bed" d="${full}"/>
        <path class="road-dash" d="${full}"/>
        <path class="road-done" id="roadDone" d="${full}"/>
        ${segs.map((d, i) => `<path class="seg-measure" id="seg${i}" d="${d}"/>`).join('')}`;

      const meter = hasLoad ? drawLoad(R, steps, xs, loaded, W, loadH, u) : null;
      walk(steps, pts, meter);
    }
    // The workload strip: a faint forecast line, filled in behind the walker, with a live readout.
    function drawLoad(R, steps, xs, loaded, W, lh, u) {
      const curve = smoothCurve(loaded.map(([i]) => xs[i]), loaded.map(([, v]) => Math.max(0, Math.min(100, v))));
      const xa = xs[loaded[0][0]], xb = xs[loaded[loaded.length - 1][0]];
      const top = u * 2.4, base = lh - u * 2.3;
      const yOf = v => base - (Math.max(0, Math.min(100, v)) / 100) * (base - top);
      const samples = [];
      for (let x = xa; x < xb; x += 4) samples.push([x, yOf(curve(x))]);
      samples.push([xb, yOf(curve(xb))]);
      const line = samples.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const groups = [];
      steps.forEach((st, i) => {
        if (!st.group) return;
        const g = groups[groups.length - 1];
        if (g && g.label === st.group && g.last === i - 1) g.last = i; else groups.push({ label: st.group, first: i, last: i });
      });
      const half = (xs[1] - xs[0] || u * 8) * .42;
      const box = $('load');
      box.innerHTML = `
        <svg class="load-svg" viewBox="0 0 ${W} ${lh}" aria-hidden="true">
          <defs>
            <linearGradient id="loadFill" x1="0" y1="${top}" x2="0" y2="${base}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffc400" stop-opacity=".55"/><stop offset=".45" stop-color="#5fb8ff" stop-opacity=".32"/><stop offset="1" stop-color="#3b6fff" stop-opacity=".04"/>
            </linearGradient>
            <linearGradient id="loadStroke" x1="0" y1="${top}" x2="0" y2="${base}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffc400"/><stop offset=".5" stop-color="#8fd3ff"/><stop offset="1" stop-color="#5fb8ff"/>
            </linearGradient>
            <clipPath id="loadClip"><rect id="loadRect" x="0" y="0" width="${xa}" height="${lh}"/></clipPath>
          </defs>
          ${[100, 60, 20].map(v => `<line class="load-grid" x1="${xa}" x2="${xb}" y1="${yOf(v)}" y2="${yOf(v)}"/>`).join('')}
          ${xs.map(x => `<line class="load-guide" x1="${x}" x2="${x}" y1="0" y2="${base}"/>`).join('')}
          <path class="load-ghost" d="${line}"/>
          <g clip-path="url(#loadClip)">
            <path class="load-area" d="${line} L${xb} ${base} L${xa} ${base} Z"/>
            <path class="load-line" d="${line}"/>
          </g>
        </svg>
        <div class="load-k">${esc(R.workloadLabel || 'Workload')}</div>
        ${[[100, 'Peak'], [60, 'Busy'], [20, 'Calm']].map(([v, w]) => `<div class="load-lv" style="top:${yOf(v)}px">${w}</div>`).join('')}
        ${groups.map((g, k) => `<div class="load-band" id="band${k}" style="left:${xs[g.first] - half}px;width:${xs[g.last] - xs[g.first] + half * 2}px"><span>${esc(g.label)}</span></div>`).join('')}
        <div class="load-mark" id="loadMark"><i></i><span id="loadWord"></span></div>`;
      const mark = $('loadMark'), word = $('loadWord'), rect = $('loadRect');
      return {
        at(x) {
          const cx = Math.max(xa, Math.min(xb, x)), v = curve(cx);
          rect.setAttribute('width', Math.max(0, x));
          mark.style.transform = `translate(${cx}px, ${yOf(v)}px)`;
          mark.classList.toggle('hot', v >= 90);
          mark.classList.toggle('flip', cx > W - u * 12);
          const w = loadWord(v);
          if (word.textContent !== w) word.textContent = w;
        },
        reach(i) {
          if (i === 0) mark.classList.add('on');
          groups.forEach((g, k) => { if (g.first === i) $('band' + k).classList.add('on'); });
        },
      };
    }
    function walk(steps, pts, meter) {
      const lens = steps.slice(1).map((_, i) => $('seg' + i).getTotalLength());
      const totalLen = lens.reduce((a, b) => a + b, 0);
      const done = $('roadDone'), walker = $('walker'), say = $('say');
      done.style.strokeDasharray = `${totalLen} ${totalLen}`;
      done.style.strokeDashoffset = totalLen;
      const place = (i, len) => {
        const p = $('seg' + i).getPointAtLength(len);
        walker.style.transform = `translate(${p.x}px, ${p.y}px)`;
        if (meter) meter.at(p.x);
      };
      walker.style.transform = `translate(${pts[0].x}px, ${pts[0].y}px)`;
      if (meter) meter.at(pts[0].x);
      const reach = i => {
        const stop = $('stop' + i);
        if (!stop) return;
        stop.classList.add('reached');
        if (meter) meter.reach(i);
        const st = steps[i], line = st.say || SAY[st.type];
        if (line) { say.textContent = line; say.classList.remove('on'); void say.offsetWidth; say.classList.add('on'); }
        if (st.type === 'boss') { $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake'); flashLights(); pulse.spike(1); }
        else if (st.type === 'finish') { walker.classList.add('arrived'); confetti.burst('cannons'); flashLights(); pulse.spike(1); }
        else pulse.spike(.7);
      };
      let seg = 0, acc = 0;
      const startWalk = () => {
        walker.classList.add('moving');
        const dur = 1100, t0 = performance.now();
        const step = t => {
          if (!walker.isConnected) return;
          const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          place(seg, lens[seg] * e);
          done.style.strokeDashoffset = totalLen - (acc + lens[seg] * e);
          if (k < 1) return requestAnimationFrame(step);
          acc += lens[seg]; seg++;
          walker.classList.remove('moving');
          reach(seg);
          if (seg < lens.length) later(startWalk, steps[seg].type === 'boss' ? 1800 : steps[seg].say || SAY[steps[seg].type] ? 1400 : 950);
        };
        requestAnimationFrame(step);
      };
      later(() => reach(0), 700);
      if (lens.length) later(startWalk, 1700);
    }

    // ---------- ROADMAP (default style "peak"): the season as a mountain range whose height is the workload ----------
    // The mountains rise, the camera zooms in and follows a light climbing the ridge from milestone to milestone,
    // each milestone plants a flag, and the camera pulls back to show the whole range. H skips to the end.
    let skipRoad = null;
    const loadBars = v => v >= 90 ? 5 : v >= 75 ? 4 : v >= 55 ? 3 : v >= 35 ? 2 : 1;
    function drawPeak(R) {
      const box = $('road'), steps = (R && R.steps) || [];
      skipRoad = null;
      if (!box || !steps.length) return;
      const token = (drawPeak.token = (drawPeak.token || 0) + 1);
      const W = box.clientWidth, H = box.clientHeight, u = U(), n = steps.length;
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const loads = steps.map(st => cl(typeof st.load === 'number' ? st.load : 50, 0, 100));
      const x0 = u * 5, x1 = W - u * 5, gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
      const xs = steps.map((_, i) => n > 1 ? x0 + gap * i : W / 2);
      const lw = Math.max(u * 8, Math.min(u * 12.5, gap * 2 - u * .8));
      const levels = steps.map((_, i) => steps.slice(0, i + 1).filter(x => (x.type || 'level') === 'level').length);
      const glyph = (st, i) => st.type === 'start' ? '<b>GO</b>'
        : st.type === 'rest' ? icon('help:snow')
        : st.type === 'boss' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21 V3.5 M6 4 H18 L15 8 L18 12 H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>'
        : st.type === 'finish' ? icon('help:trophy')
        : `<b>${levels[i]}</b>`;
      box.classList.add('pk');
      box.innerHTML = `
        <div class="pk-world" id="pkWorld">
          <svg class="pk-svg" id="pkSvg" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
          ${steps.map((st, i) => `<div class="pk-pin ${st.type || 'level'}" id="pkPin${i}"><div class="dot">${glyph(st, i)}</div></div>`).join('')}
          ${steps.map((st, i) => `
            <div class="pk-lab ${st.type || 'level'}" id="pkLab${i}" style="width:${lw}px;--c:${st.type === 'boss' ? 'var(--gold)' : LANES[i % LANES.length]}">
              <span class="when">${esc(st.when || '')}</span>
              <b>${esc(st.label)}</b>
              ${st.note ? `<span class="snote"><span>${esc(st.note)}</span></span>` : ''}
            </div>`).join('')}
          <div class="pk-climber" id="pkClimber"><div class="say" id="say"></div><i></i></div>
        </div>`;

      // ---- geometry: the labels decide how tall the mountains may be ----
      const labs = steps.map((_, i) => $('pkLab' + i)), lh = labs.map(l => l.offsetHeight), maxH = Math.max(...lh);
      const rulerH = u * 2.4, base = H - rulerH, pole = u * 2.2, lgap = u * .6, mR = u * 1.3;
      const low = base - u * 3.2;
      const noteH = u * 1.6;   // the note that unfolds on the label in focus
      const skyTop = Math.min(low - u * 6, u * .6 + noteH + maxH * 2 + lgap + pole + mR + u * 1.4);
      const yOf = v => low - (v / 100) * (low - skyTop);
      const curve = smoothCurve(xs, loads);
      const valAt = x => n < 2 ? loads[0] : x < x0 ? loads[0] * (.5 + .5 * Math.max(0, x) / x0) : x > x1 ? loads[n - 1] * (.5 + .5 * Math.max(0, W - x) / (W - x1)) : curve(x);
      // rocky detail between milestones (zero at each milestone, so the values stay exact)
      const detail = x => {
        if (!gap) return 0;
        const k = Math.sin(Math.PI * (x - x0) / gap) ** 2, q = x / u;
        return k * u * ((1 - Math.abs(Math.sin(q * .55))) * 1.5 + (1 - Math.abs(Math.sin(q * 1.6 + 1))) * .6 - .75);
      };
      const ridgeY = x => yOf(valAt(x)) - detail(x);
      const sample = (f, a, b, stepPx) => { const p = []; for (let x = a; x < b; x += stepPx) p.push([x, f(x)]); p.push([b, f(b)]); return p; };
      const toPath = p => p.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const ridge = toPath(sample(ridgeY, 0, W, 3));
      const area = `${ridge} L${W} ${base} L0 ${base} Z`;
      const backRidge = (lift, ph, amp) => toPath(sample(x => yOf(cl(valAt(cl(x, 0, W)) * .6 + 30 + amp * Math.sin(x / W * 6.3 + ph) + amp * .5 * Math.sin(x / W * 15 + ph * 2), 0, 100)) - lift, -W * .3, W * 1.3, 8)) + ` L${W * 1.3} ${base} L${-W * .3} ${base} Z`;
      const summit = loads.indexOf(Math.max(...loads));

      // month bands on the ground, and highlighted stretches such as the ERP migration
      const runs = key => {
        const out = [];
        steps.forEach((st, i) => {
          const v = st[key]; if (!v) return;
          const g = out[out.length - 1];
          if (g && g.label === v && g.last === i - 1) g.last = i; else out.push({ label: v, first: i, last: i });
        });
        return out.map(g => ({ ...g, a: Math.max(0, xs[g.first] - gap / 2), b: Math.min(W, xs[g.last] + gap / 2) }));
      };
      const months = runs('month'), zones = runs('group');

      // labels float clear of the ridge and the markers beneath them, and stack above a left neighbour they would hit
      const lefts = xs.map(x => cl(x - lw / 2, u * .3, W - lw - u * .3));
      const highest = (a, b) => { let m = Infinity; for (let x = a; x <= b; x += 4) m = Math.min(m, ridgeY(x)); return m; };
      const bottoms = [];
      steps.forEach((_, i) => {
        let b = Math.min(ridgeY(xs[i]) - mR - pole, highest(lefts[i], lefts[i] + lw) - u * 1.1);
        xs.forEach((x, j) => { if (j !== i && x + mR > lefts[i] && x - mR < lefts[i] + lw) b = Math.min(b, ridgeY(x) - mR - u * .6); });
        const j = i - 1;
        if (j >= 0 && lefts[i] < lefts[j] + lw + u * .4) {
          const pb = bottoms[j], pt = pb - lh[j];
          if (b - lh[i] < pb + lgap && b > pt - lgap) b = pt - lgap;
        }
        bottoms.push(Math.max(lh[i] + noteH + u * .4, b));
      });
      labs.forEach((l, i) => { l.style.left = lefts[i] + 'px'; l.style.top = bottoms[i] + 'px'; });
      steps.forEach((_, i) => { const p = $('pkPin' + i).style; p.left = xs[i] + 'px'; p.top = ridgeY(xs[i]) + 'px'; });

      $('pkSvg').innerHTML = `
        <defs>
          <linearGradient id="pkBody" x1="0" y1="${skyTop}" x2="0" y2="${base}" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#2a3fd6"/><stop offset=".55" stop-color="#151085"/><stop offset="1" stop-color="#0b0848"/>
          </linearGradient>
          <linearGradient id="pkSnow" x1="0" y1="${yOf(100) - u}" x2="0" y2="${yOf(68)}" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="pkLit" x1="0" y1="${yOf(100)}" x2="0" y2="${yOf(20)}" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffc400"/><stop offset=".35" stop-color="#ffe08a"/><stop offset=".6" stop-color="#8fd3ff"/><stop offset="1" stop-color="#5fb8ff"/>
          </linearGradient>
          <linearGradient id="pkZone">
            <stop offset="0" stop-color="#ffc400" stop-opacity="0"/><stop offset=".18" stop-color="#ffc400" stop-opacity=".22"/>
            <stop offset=".82" stop-color="#ffc400" stop-opacity=".22"/><stop offset="1" stop-color="#ffc400" stop-opacity="0"/>
          </linearGradient>
          <radialGradient id="pkGlow"><stop offset="0" stop-color="#ffc400" stop-opacity=".45"/><stop offset="1" stop-color="#ffc400" stop-opacity="0"/></radialGradient>
          <clipPath id="pkBodyClip"><path d="${area}"/></clipPath>
          <clipPath id="pkLitClip"><rect id="pkLitRect" x="0" y="0" width="0" height="${H}"/></clipPath>
        </defs>
        <circle class="pk-glow" id="pkGlow" cx="${xs[summit]}" cy="${ridgeY(xs[summit])}" r="${u * 16}" fill="url(#pkGlow)"/>
        <g class="pk-back" id="pkBack">
          <path class="pk-far" d="${backRidge(u * 1, 1.7, 16)}" style="transform-origin:0 ${base}px"/>
          <path class="pk-mid" d="${backRidge(-u * 1.5, 4.1, 12)}" style="transform-origin:0 ${base}px"/>
        </g>
        <g class="pk-terrain" style="transform-origin:0 ${base}px">
          <path class="pk-body" d="${area}"/>
          <path class="pk-snowcap" d="${area}"/>
          <g clip-path="url(#pkBodyClip)">
            ${zones.map((z, k) => `<rect class="pk-zone" id="pkZone${k}" x="${z.a}" y="${skyTop - u}" width="${z.b - z.a}" height="${base - skyTop + u}"/>`).join('')}
          </g>
          ${zones.map((z, k) => `<text class="pk-zone-t" id="pkZoneT${k}" x="${(z.a + z.b) / 2}" y="${base - u * 1}" font-size="${u * .85}">${esc(z.label.toUpperCase())}</text>`).join('')}
          <path class="pk-ridge" d="${ridge}"/>
          <path class="pk-ridge-lit" d="${ridge}" clip-path="url(#pkLitClip)"/>
        </g>
        ${steps.map((_, i) => `<line class="pk-pole" id="pkPole${i}" pathLength="1" x1="${xs[i]}" x2="${xs[i]}" y1="${ridgeY(xs[i]) - mR}" y2="${bottoms[i]}"/>`).join('')}
        <rect class="pk-ground" x="${-W * .3}" y="${base}" width="${W * 1.6}" height="${rulerH + u}"/>
        ${months.map((m, k) => `
          <g class="pk-month" id="pkMonth${k}">
            ${m.first ? `<line x1="${m.a}" x2="${m.a}" y1="${base + u * .4}" y2="${H - u * .4}"/>` : ''}
            <text x="${(m.a + m.b) / 2}" y="${base + rulerH * .62}" font-size="${u * .8}">${esc(m.label.toUpperCase())}</text>
          </g>`).join('')}`;

      // ---- camera ----
      const world = $('pkWorld'), climber = $('pkClimber'), say = $('say'), litRect = $('pkLitRect'), back = $('pkBack');
      const Z = 1.4;
      const cam = { x: W / 2, y: H / 2, z: 1 }, aim = { x: W / 2, y: H / 2, z: 1 };
      const focusY = i => (bottoms[i] - lh[i] - noteH + ridgeY(xs[i]) + mR) / 2;
      const apply = () => {
        const z = cam.z, tx = cl(W / 2 - cam.x * z, W - W * z, 0), ty = cl(H / 2 - cam.y * z, H - H * z, 0);
        world.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${z.toFixed(4)})`;
        back.setAttribute('transform', `translate(${((cam.x - W / 2) * .3 * (z - 1) / (Z - 1)).toFixed(2)} 0)`);
      };
      let lastT = performance.now();
      const frame = t => {
        if (token !== drawPeak.token || !world.isConnected) return;
        const k = 1 - Math.exp(-Math.min(.05, (t - lastT) / 1000) * 3.2);
        lastT = t;
        cam.x += (aim.x - cam.x) * k; cam.y += (aim.y - cam.y) * k; cam.z += (aim.z - cam.z) * k;
        apply();
        requestAnimationFrame(frame);
      };

      // ---- workload meter next to the title ----
      const hudBars = [...document.querySelectorAll('#pkHud .pk-seg i')], hudWord = $('pkWord'), hudNow = $('pkNow');
      let shownBars = -1;
      const meter = v => {
        const b = loadBars(v);
        if (b === shownBars) return;
        shownBars = b;
        hudBars.forEach((el, k) => el.classList.toggle('on', k < b));
        if (hudWord) { hudWord.textContent = loadWord(v); hudWord.classList.toggle('hot', b === 5); }
      };
      const placeClimber = x => {
        climber.style.transform = `translate(${x}px, ${ridgeY(x)}px)`;
        litRect.setAttribute('width', Math.max(0, x));
        meter(valAt(x));
      };

      // ---- the climb ----
      const lightGroup = (list, prefix, i) => list.forEach((g, k) => { if (g.first === i) { $(prefix + k).classList.add('on'); const t = $(prefix + 'T' + k); if (t) t.classList.add('on'); } });
      const reach = i => {
        const st = steps[i];
        $('pkPin' + i).classList.add('reached');
        $('pkPole' + i).classList.add('on');
        labs.forEach((l, k) => l.classList.toggle('focus', k === i));
        labs[i].classList.add('on');
        lightGroup(months, 'pkMonth', i);
        lightGroup(zones, 'pkZone', i);
        if (hudNow) hudNow.innerHTML = `<span>${esc(st.when || '')}</span> ${esc(st.label)}`;
        const line = st.say || SAY[st.type];
        if (line) { say.textContent = line; say.classList.remove('on'); void say.offsetWidth; say.classList.add('on'); }
        if (st.type === 'rest') snow.setIntensity(2.6);
        if (i === summit) $('pkGlow').classList.add('on');
        if (st.type === 'boss') { $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake'); flashLights(); pulse.spike(1); }
        else if (st.type === 'finish') { climber.classList.add('arrived'); confetti.burst('cannons'); flashLights(); pulse.spike(1); }
        else pulse.spike(.6);
      };
      const dwell = i => steps[i].type === 'boss' ? 2100 : (steps[i].say || SAY[steps[i].type]) ? 1700 : 1150;
      const overview = () => {
        aim.x = W / 2; aim.y = H / 2; aim.z = 1;
        world.classList.remove('touring');
        labs.forEach(l => l.classList.remove('focus'));
        steps.forEach((_, i) => { labs[i].classList.add('on'); $('pkPin' + i).classList.add('reached'); $('pkPole' + i).classList.add('on'); });
        if (hudNow) hudNow.textContent = R.overview || 'The whole road ahead';
      };
      const travel = i => {
        if (token !== drawPeak.token) return;
        const a = xs[i], b = xs[i + 1], fa = focusY(i), fb = focusY(i + 1), t0 = performance.now(), dur = 950;
        if (steps[i].type === 'rest') snow.setIntensity(.8);
        const step = t => {
          if (token !== drawPeak.token || !world.isConnected) return;
          const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const x = a + (b - a) * e;
          placeClimber(x);
          aim.x = x; aim.y = fa + (fb - fa) * e;
          if (k < 1) return requestAnimationFrame(step);
          reach(i + 1);
          if (i + 2 < n) at(() => travel(i + 1), dwell(i + 1));
          else at(overview, 2300);
        };
        requestAnimationFrame(step);
      };
      const finish = () => {
        drawPeak.token++;
        box.classList.remove('rise');
        world.classList.add('shown');
        placeClimber(xs[n - 1]);
        climber.classList.add('arrived');
        months.forEach((_, k) => $('pkMonth' + k).classList.add('on'));
        zones.forEach((_, k) => { $('pkZone' + k).classList.add('on'); $('pkZoneT' + k).classList.add('on'); });
        $('pkGlow').classList.add('on');
        cam.x = aim.x = W / 2; cam.y = aim.y = H / 2; cam.z = aim.z = 1;
        overview(); apply();
        snow.setIntensity(.8);
      };
      skipRoad = finish;

      const at = (fn, ms) => later(() => token === drawPeak.token && fn(), ms);
      placeClimber(xs[0]);
      apply();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
      box.classList.add('rise');
      requestAnimationFrame(frame);
      at(() => world.classList.add('shown'), 900);
      at(() => { world.classList.add('touring'); aim.x = xs[0]; aim.y = focusY(0); aim.z = Z; }, 1400);
      at(() => reach(0), 1900);
      if (n > 1) at(() => travel(0), 1900 + dwell(0)); else at(overview, 3000);
    }
    // ---------- ROADMAP (default style "gantt"): a clean timeline of overlapping workstreams, with the workload beneath ----------
    // Thin flat bars on a month axis, three quiet markers (today, the holiday break, the gold cutover), and one workload
    // line underneath. On entry the bars grow in from left to right and the workload line draws along. H skips to the end.
    const fmtDay = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    function drawGantt(R) {
      const box = $('road'), rows = (R && R.rows) || [];
      skipRoad = null;
      if (!box || !rows.length || !R.start || !R.end) return;
      const W = box.clientWidth, H = box.clientHeight, u = U();
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const t0 = day(R.start), t1 = day(R.end), span = t1 - t0;
      const cx0 = u * 11, cx1 = W - u * 1;
      const X = t => cx0 + (cl(t, t0, t1) - t0) / span * (cx1 - cx0);
      const sweep = x => (.25 + 1.6 * (x - cx0) / (cx1 - cx0)).toFixed(2) + 's';   // entry delay: left to right
      const headH = u * 4.4, gap = u * 1.6, loadH = Math.max(u * 6.5, H * .22);
      const rowH = cl((H - headH - gap - loadH) / rows.length, u * 3.8, u * 5.4);
      const rowsTop = headH, rowsBot = headH + rowH * rows.length;
      const loadTop = rowsBot + gap, loadBot = H - u * .4;
      const ly0 = loadTop + u * 1.6, ly1 = loadBot;
      const yOf = v => ly1 - v / 100 * (ly1 - ly0);
      const barY = ri => rowsTop + rowH * ri + rowH * .5;   // centre line of a row's bars
      const barH = u * .85;

      // ---- the workload: every active workstream adds its weight, the holiday break damps it ----
      const items = rows.flatMap((r, ri) => (r.items || []).map(it => {
        const a = day(it.start || it.date), b = (it.end ? day(it.end) : a) + DAY;   // end dates are inclusive
        return { ...it, ri, a, b, mid: (a + b) / 2 };
      }));
      // days off (Christmas, New Year): end dates are inclusive
      const hols = (R.holidays || (R.holiday ? [R.holiday] : [])).map(h => ({ ...h, a: day(h.start), b: day(h.end || h.start) + DAY }));
      const offAt = t => hols.find(h => t >= h.a && t < h.b);
      const rawAt = t => {
        let v = R.baseLoad ?? .6;
        for (const it of items) {
          const w = it.weight ?? (it.type === 'milestone' ? .8 : 1);
          if (it.type === 'milestone') { const d = (t - it.mid) / (DAY * 2.5); v += w * Math.exp(-d * d); }
          else if (t >= it.a && t < it.b) v += it.fade ? w * (1 - .7 * (t - it.a) / (it.b - it.a)) : w;
        }
        const off = offAt(t);
        return off ? v * (off.factor ?? .35) : v;
      };
      const days = [];
      for (let t = t0; t <= t1; t += DAY) days.push(t);
      const raw = days.map(t => rawAt(t + DAY / 2));
      const sm = raw.map((_, k) => { let s = 0, ws = 0; for (let j = -4; j <= 4; j++) { const w = Math.exp(-(j * j) / 6); s += raw[cl(k + j, 0, raw.length - 1)] * w; ws += w; } return s / ws; });
      const top = Math.max(...sm), vals = sm.map(v => v / top * 100);
      const curve = smoothCurve(days.map(X), vals);
      const pts = [];
      for (let x = cx0; x < cx1; x += 3) pts.push([x, yOf(curve(x))]);
      pts.push([cx1, yOf(curve(cx1))]);
      const line = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const peakT = days[vals.indexOf(100)];
      // the peak weeks: the stretch around the peak where the workload stays high
      const pk = vals.indexOf(100), thr = R.peakZone ?? 55;
      let z0 = pk, z1 = pk;
      while (z0 > 0 && vals[z0 - 1] >= thr) z0--;
      while (z1 < vals.length - 1 && vals[z1 + 1] >= thr) z1++;
      const zone = { a: days[z0], b: days[z1] + DAY };

      // ---- the numbers beside the title: how much, how soon, who ----
      const keyMs = items.find(it => it.key && it.type === 'milestone');
      const todayT = R.today ? day(R.today) : new Date(new Date().toDateString()).getTime();
      const weeks = keyMs ? Math.round((keyMs.a - todayT) / (7 * DAY)) : 0;
      const stats = (R.stats || [{ value: '{items}', label: 'key moments' }, { value: '{weeks}', label: `weeks to ${keyMs ? keyMs.label.split(' ')[0].toLowerCase() : 'go'}` }, { value: '1', label: 'team' }])
        .map(st => ({ ...st, value: String(st.value).replace('{items}', items.length).replace('{weeks}', weeks) }))
        .filter(st => !/^-|^0$/.test(st.value));
      if ($('gtStats')) $('gtStats').innerHTML = stats.map((st, k) => `<div style="--k:${k}"><b data-v="0">${esc(st.value)}</b><span>${esc(st.label)}</span></div>`).join('');
      if ($('gtStats')) $('gtStats').querySelectorAll('b').forEach((el, k) => { const v = Number(el.textContent); if (v > 1) { el.textContent = '0'; later(() => FX.tween(el, v, x => Math.round(x), 1200), 500 + k * 200); } });

      // ---- grid and markers ----
      const months = [];
      for (let m = new Date(t0); m.getTime() < t1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(Math.max(t0, new Date(m.getFullYear(), m.getMonth(), 1).getTime()));
      const today = R.today ? day(R.today) : new Date(new Date().toDateString()).getTime();
      const when = it => {
        const a = new Date(it.a), b = new Date(it.b - DAY);
        if (it.type === 'milestone' || it.b - it.a <= DAY) return fmtDay(it.a);
        return a.getMonth() === b.getMonth() ? `${a.getDate()}–${fmtDay(b)}` : `${fmtDay(a)} – ${fmtDay(b)}`;
      };
      const marks = [];
      if (today >= t0 && today <= t1) marks.push({ cls: 'today', x: X(today), text: 'Today' });
      hols.forEach(h => marks.push({ cls: 'hol', x: (X(h.a) + X(h.b)) / 2, text: h.label || 'Holiday' }));
      marks.sort((p, q) => p.x - q.x);
      items.forEach(it => { if (it.key && it.type === 'milestone') marks.push({ cls: 'key', x: X(it.mid), text: `${it.label} · ${it.when || when(it)}` }); });
      box.classList.add('gt');
      box.classList.remove('done');
      box.innerHTML = `
        <svg class="gt-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <defs>
            <linearGradient id="gtStroke" x1="0" y1="${ly0}" x2="0" y2="${ly1}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffc400"/><stop offset=".5" stop-color="#8fd3ff"/><stop offset="1" stop-color="#5fb8ff"/>
            </linearGradient>
            <linearGradient id="gtFill" x1="0" y1="${ly0}" x2="0" y2="${ly1}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffc400" stop-opacity=".32"/><stop offset=".45" stop-color="#8fd3ff" stop-opacity=".16"/><stop offset="1" stop-color="#5fb8ff" stop-opacity=".02"/>
            </linearGradient>
          </defs>
          <linearGradient id="gtZone" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#ffc400" stop-opacity="0"/><stop offset=".08" stop-color="#ffc400" stop-opacity=".13"/>
            <stop offset=".92" stop-color="#ffc400" stop-opacity=".13"/><stop offset="1" stop-color="#ffc400" stop-opacity="0"/>
          </linearGradient>
          <g class="gt-zone">
            <rect x="${X(zone.a) - u * 1.5}" y="${rowsTop - u * .4}" width="${X(zone.b) - X(zone.a) + u * 3}" height="${loadBot - rowsTop + u * .4}" fill="url(#gtZone)"/>
            <line class="gt-zedge" x1="${X(zone.a)}" x2="${X(zone.b)}" y1="${rowsTop - u * .4}" y2="${rowsTop - u * .4}"/>
            <line class="gt-zedge" x1="${X(zone.a)}" x2="${X(zone.b)}" y1="${loadBot}" y2="${loadBot}"/>
          </g>
          ${hols.map(h => `<rect class="gt-hol" x="${X(h.a)}" y="${rowsTop - u * .4}" width="${X(h.b) - X(h.a)}" height="${loadBot - rowsTop + u * .4}"/>`).join('')}
          ${months.map(t => `<line class="gt-mline" x1="${X(t)}" x2="${X(t)}" y1="${headH - u * 2}" y2="${loadBot}"/>`).join('')}
          <line class="gt-sep" x1="0" x2="${W}" y1="${rowsBot + gap / 2}" y2="${rowsBot + gap / 2}"/>
          <path class="gt-area" d="${line} L${cx1} ${ly1} L${cx0} ${ly1} Z"/>
          <path class="gt-line" pathLength="1" d="${line}"/>
          ${marks.map((m, k) => `<path class="gt-mk-line ${m.cls}" id="gtML${k}" style="--d:${sweep(m.x)}" d="M${m.x} ${u * 1.5} V${loadBot}"/>`).join('')}
        </svg>
        ${months.map(t => `<div class="gt-mon" style="left:${X(t)}px;top:${headH - u * 1.9}px">${new Date(t).toLocaleDateString('en-GB', { month: 'short' })}</div>`).join('')}
        ${marks.map((m, k) => `<div class="gt-mk ${m.cls}" id="gtMK${k}" style="left:${m.x}px;--d:${sweep(m.x)}">${esc(m.text)}</div>`).join('')}
        ${rows.map((r, i) => `<div class="gt-rlab" style="top:${barY(i)}px">${esc(r.label || '')}${r.note ? `<small>${esc(r.note)}</small>` : ''}</div>`).join('')}
        ${items.map((it, k) => it.type === 'milestone' ? `
          <div class="gt-ms ${it.key ? 'key' : ''}" style="left:${X(it.mid)}px;top:${barY(it.ri)}px;--d:${sweep(X(it.mid))}"><i></i></div>` : `
          <div class="gt-bar ${it.fade ? 'fade' : ''} ${it.key ? 'key' : ''}" style="left:${X(it.a)}px;width:${Math.max(u * .6, X(it.b) - X(it.a))}px;top:${barY(it.ri) - barH / 2}px;height:${barH}px;--d:${sweep(X(it.a))}"></div>`).join('')}
        ${items.map((it, k) => it.key && it.type === 'milestone' ? '' : `
          <div class="gt-blab ${it.key ? 'key' : ''}" id="gtL${k}" style="left:${it.type === 'milestone' ? X(it.mid) - u * .45 : X(it.a)}px;--d:${sweep(X(it.a))}"><b>${esc(it.label || '')}</b> ${esc(it.when || when(it))}</div>`).join('')}
        <div class="gt-rlab wl" style="top:${(ly0 + ly1) / 2}px">${esc(R.workloadLabel || 'Workload')}</div>
        <div class="gt-peak" style="left:${X(peakT)}px;top:${yOf(100)}px"><span>${esc(R.peakLabel || 'Peak')}</span></div>
        <div class="gt-zlab" id="gtZlab" style="left:${X(zone.a)}px;top:${loadTop + u * .1}px"><b>${esc(R.peakZoneLabel || 'Peak weeks')}</b>${R.placeholder ? '' : ` ${fmtDay(zone.a)} – ${fmtDay(zone.b - DAY)}`}${R.peakZoneNote ? ` · ${esc(R.peakZoneNote)}` : ''}</div>`;

      // item labels: above the bar when the lane is free, otherwise below it; keep them inside the box
      rows.forEach((_, ri) => {
        const lane = { up: -Infinity, down: -Infinity };
        items.map((it, k) => ({ it, k, el: $('gtL' + k) })).filter(o => o.el && o.it.ri === ri)
          .sort((p, q) => p.el.offsetLeft - q.el.offsetLeft)
          .forEach(({ it, el }) => {
            const w = el.offsetWidth;
            let left = Math.min(el.offsetLeft, W - w - u * .2);
            const side = left >= lane.up + u * .8 ? 'up' : left >= lane.down + u * .8 ? 'down' : 'up';
            lane[side] = left + w;
            el.style.left = left + 'px';
            el.classList.add(side);
            el.style.top = (side === 'up' ? barY(ri) - barH / 2 - u * .3 : barY(ri) + barH / 2 + u * .3) + 'px';
          });
      });
      // the marker lines break where they cross a label, so the text stays clean
      const rects = [...box.querySelectorAll('.gt-blab')].map(el => {
        const h = el.offsetHeight, top = parseFloat(el.style.top) - (el.classList.contains('up') ? h : 0);
        return { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth, t: top - u * .15, b: top + h + u * .15 };
      });
      marks.forEach((m, k) => {
        const cuts = rects.filter(r => m.x > r.l - 2 && m.x < r.r + 2).sort((p, q) => p.t - q.t);
        let y = u * 1.5, d = '';
        cuts.forEach(c => { if (c.t > y) d += `M${m.x} ${y} V${c.t} `; y = Math.max(y, c.b); });
        if (y < loadBot) d += `M${m.x} ${y} V${loadBot}`;
        $('gtML' + k).setAttribute('d', d.trim());
      });
      // the peak-weeks label and the "Peak" label must not overlap: move the first to the end of the zone, else drop the second
      {
        const zl = $('gtZlab'), pk = box.querySelector('.gt-peak span');
        const hit = () => { const a = zl.getBoundingClientRect(), b = pk.getBoundingClientRect(); return a.left < b.right + 8 && b.left < a.right + 8 && a.top < b.bottom && b.top < a.bottom; };
        if (zl && pk && hit()) { zl.style.left = Math.max(cx0, X(zone.b) - zl.offsetWidth) + 'px'; if (hit()) pk.hidden = true; }
      }
      // keep the marker labels apart
      let edge = -Infinity;
      marks.forEach((m, k) => {
        const el = $('gtMK' + k), w = el.offsetWidth;
        const left = cl(m.x - w / 2, Math.max(0, edge + u * .8), W - w);
        el.style.left = left + 'px';
        edge = left + w;
      });
      const done = () => box.classList.add('done');
      skipRoad = done;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    }

    const drawRoadmap = R => ({ road: drawRoad, peak: drawPeak }[(R && R.style)] || drawGantt)(R || {});

    // ---------- FINALE: yes we can! ----------
    function buildFinale(s) {
      const F = s.finale || {};
      $('titleblock').innerHTML = '';
      $('content').innerHTML = `
        <div class="finale">
          <div class="lines">${(F.lines || []).map((l, i) => `<div class="fline" style="--k:${i};--c:${LANES[(i * 2 + 1) % LANES.length]}">${esc(l)}</div>`).join('')}</div>
          <div class="yes" id="yes">${bouncy(F.title || 'YES WE CAN!', 'huge')}</div>
          <div class="fthanks">${esc(F.thanks || '')}</div>
          <div class="parade" id="parade"></div>
        </div>`;
      $('source').textContent = 'Tap cheer on your phone!';
      $('ticker').innerHTML = (F.lines || []).map(l => `<span>${esc(l)}</span>`).join('');
      const nLines = (F.lines || []).length;
      (F.lines || []).forEach((_, i) => later(() => { flashLights(); pulse.spike(1); }, 600 + i * 900));
      later(() => {
        $('yes').classList.add('go');
        fireworks.start(); confetti.burst('cannons'); flashLights();
        $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake');
      }, 700 + nLines * 900);
      [4, 8, 12].forEach(k => later(() => { confetti.burst(k % 8 ? 'top' : 'cannons'); flashLights(); }, (700 + nLines * 900) + k * 1000));
    }
    function paintFinale(s) {
      const box = $('parade');
      if (!box || box.dataset.done) return;
      box.dataset.done = '1';
      const players = (s.players || []).slice(-40);
      const crew = players.length >= 12 ? players : Array.from({ length: 28 }, (_, i) => ({ a: i, n: i * 3, c: i % 6 }));
      box.innerHTML = crew.map((p, i) => `<i style="--i:${i};--c:${LANES[p.c % LANES.length]}"></i>`).join('');
    }

    // ---------- reactions ----------
    function onReact(r) { if (!r) return; FX.floatReaction(r); pulse.spike(.45); if (view === 'finale') flashLights(); }

    // ---------- controls ----------
    let resetArmed = 0, clearArmed = 0;
    const help = root.PulseHelp ? PulseHelp.mount({ T, getState: () => latest }) : null;
    function control(a) {
      if (a === 'help') { if (help) help.toggle(); return; }
      if (a === 'full') { if (help) help.fullscreen(); return; }
      if (a === 'snow') { const on = snow.toggle(); $('ctlSnow').textContent = on ? 'Snow on' : 'Snow off'; return; }
      if (a === 'sim') { const on = T.simulate(!T.simulating()); $('ctlSim').textContent = on ? '■ Stop simulation' : '▶ Simulate the room'; return; }
      if (!T.canControl) { $('status').textContent = T.controlHint || 'Only the presenter can control this screen'; return; }
      if (a === 'reveal' && latest && latest.tug) { if (!['countdown', 'go'].includes(latest.tug.phase)) T.act('tug', 'start'); return; }
      if (a === 'reveal') { if (!latest || latest.stage !== 'question') return; a = latest.revealed ? 'conceal' : 'reveal'; }
      if (a === 'reset') {
        if (Date.now() - resetArmed > 3000) { resetArmed = Date.now(); $('ctlReset').textContent = 'Click again to reset'; setTimeout(() => ($('ctlReset').textContent = 'Reset'), 3000); return; }
        resetArmed = 0; $('ctlReset').textContent = 'Reset';
      }
      if (a === 'clear') {
        if (Date.now() - clearArmed > 3000) { clearArmed = Date.now(); FX.toast($('toast'), 'Press C again to clear this question', 2800); return; }
        clearArmed = 0;
      }
      T.act(a);
    }
    $('controls').addEventListener('click', e => { const b = e.target.closest('button'); if (b) control(b.dataset.a); });
    if (T.simulate) $('ctlSim').hidden = false;
    let idleT;
    addEventListener('mousemove', () => {
      document.body.classList.add('show-controls');
      clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.remove('show-controls'), 2600);
    });
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      const k = e.key.toLowerCase();
      if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); return control('help'); }
      if (help && help.isOpen()) { if (k === 'escape') help.close(); return; }
      if (k === 'f' && !e.ctrlKey && !e.metaKey) return control('full');
      if (['arrowright', ' ', 'pagedown'].includes(k)) { e.preventDefault(); control('next'); }
      else if (['arrowleft', 'pageup'].includes(k)) control('prev');
      else if (k === 'h') { if (latest && latest.stage === 'roadmap') { if (skipRoad) skipRoad(); } else control('reveal'); }
      else if (k === 's') control('snow');
      else if (k === 'u') { control('unhide'); if (latest && latest.qa) T.act('qa', 'reset:'); if (latest && latest.kudos) T.act('kudos', 'reset:'); }
      else if (k === 'c') control('clear');
    });
    addEventListener('resize', () => {
      if (!latest) return;
      if (latest.stage === 'question') layoutCloud(latest);
      if (latest.stage === 'roadmap') { timers.forEach(clearTimeout); timers = []; drawRoadmap(latest.roadmap); }
      if (latest.stage === 'slide' && latest.slide && latest.slide.type === 'chart') drawBarChart(latest.slide);
    });
    document.fonts && document.fonts.ready.then(() => latest && latest.stage === 'question' && layoutCloud(latest));

    T.onStatus = msg => ($('status').textContent = msg || '');
    T.subscribe(render, onReact);
    if (T.canControl && help) setTimeout(() => FX.toast($('toast'), 'Press ? for the presenter guide · F for full screen', 4200), 1800);
  }

  root.mountHost = mountHost;
})(typeof self !== 'undefined' ? self : this);
