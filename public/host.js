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
      <span class="spacer"></span>
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

    function holidayChip(dateStr) {
      if (!dateStr) return '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const d = Math.round((day(dateStr) - today.getTime()) / DAY);
      const txt = d > 1 ? `${d} days to the holiday break` : d === 1 ? 'Holiday break tomorrow!' : d === 0 ? 'Holiday break starts today!' : 'Happy holidays!';
      return `${icon('help:snow')}<span>${txt}</span>`;
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
      $('holiday').innerHTML = holidayChip(s.holidayDate);
      const label = s.stage === 'question' ? `Q${s.index + 1} of ${s.total}` : LABELS[s.stage] || '';
      $('pager').textContent = label;
      $('ctlLabel').textContent = label;
      $('ctlReveal').hidden = s.stage !== 'question';
      $('ctlReveal').textContent = s.revealed ? 'Hide results' : 'Reveal now';
      if (meta.pop) { pulse.spike(1); flashLights(); }

      const v = s.stage === 'question' ? 'q' + s.index : s.stage;
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

    function build(s) {
      timers.forEach(clearTimeout); timers = [];
      cloudEls.clear(); lastN = null; lastTicker = ''; cardsKey = ''; titleKey = ''; revealedPrev = null; fresh = true;
      stopTimer(); fireworks.stop();
      $('deck').dataset.stage = s.stage;
      $('ticker').innerHTML = '';
      const builders = { lobby: buildLobby, question: buildQuestion, recap: buildRecap, roadmap: buildRoadmap, finale: buildFinale };
      (builders[s.stage] || buildLobby)(s);
      snow.setIntensity({ lobby: 1, question: .4, recap: 1, roadmap: .8, finale: 1.8 }[s.stage] ?? 1);
      document.body.classList.remove('entering'); void $('content').offsetWidth; document.body.classList.add('entering');
    }

    function paint(s, meta) {
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
      $('ticker').innerHTML = '<span>Scan the code to join</span><span>Fully anonymous</span><span>Four quick questions</span><span>Answers race live on screen</span>';
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
      const q = s.question, scored = q.options.some(o => typeof o.score === 'number');
      $('titleblock').innerHTML = `
        <div class="qrow">
          <div class="qbadge"><b>Q${s.index + 1}</b><span>of ${s.total}</span></div>
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
                ${scored ? `<div class="mini-k">Team energy</div>
                  <svg class="gauge" viewBox="0 0 120 70" aria-hidden="true">
                    <path d="M12 62 A48 48 0 0 1 26.1 28.1" class="seg" stroke="#2a1fd1"/>
                    <path d="M26.1 28.1 A48 48 0 0 1 60 14" class="seg" stroke="#3b6fff"/>
                    <path d="M60 14 A48 48 0 0 1 93.9 28.1" class="seg" stroke="#5fb8ff"/>
                    <path d="M93.9 28.1 A48 48 0 0 1 108 62" class="seg" stroke="#8fd3ff"/>
                    <g class="needle" id="needle"><path d="M60 62 L60 22" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="62" r="7" fill="#ffffff"/></g>
                  </svg>
                  <div class="mini-v"><span id="k-avg" data-v="0">?</span><small>/ 5</small></div>`
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
      if ($('needle')) {
        if (s.revealed && s.stats.avg != null) { $('needle').style.setProperty('--a', ((s.stats.avg - 1) / 4 * 180 - 90).toFixed(1) + 'deg'); FX.tween($('k-avg'), s.stats.avg, v => v.toFixed(1)); }
        else $('k-avg').textContent = '?';
      } else {
        const opt = q.options.find(o => o.id === s.stats.topId), i = q.options.indexOf(opt);
        const html = s.revealed && opt ? `${orbIcon(LANES[i % LANES.length], opt.icon)}<b>${esc(opt.label)}</b>` : '<span class="q">?</span>';
        if ($('leader').dataset.k !== html) { $('leader').dataset.k = html; $('leader').innerHTML = html; }
      }
      if (meta.pop) hop(meta.pop);
      scheduleCloud(s);

      const tick = (s.recent || []).map(w => `<span>${esc(w)}</span>`).join('');
      if (tick !== lastTicker) { lastTicker = tick; $('ticker').innerHTML = tick; }
      $('source').textContent = 'Live feed';

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
        <div class="stat"><span class="v"><span id="sb-a" data-v="0">–</span><small>/5</small></span><span class="k">team energy</span></div>
        <div class="stat"><span class="v" id="sb-w" data-v="0">0</span><span class="k">words shared</span></div>
        <div class="thanks">Honesty makes us stronger. Thank you.</div>`;
      FX.tween($('sb-p'), s.participants, undefined, 1400);
      if (avgAll != null) FX.tween($('sb-a'), avgAll, v => v.toFixed(1), 1400);
      FX.tween($('sb-w'), wordsAll, undefined, 1400);
    }

    // ---------- ROADMAP: the team walks the road ahead ----------
    function buildRoadmap(s) {
      const R = s.roadmap || {};
      $('titleblock').innerHTML = `${bouncy(R.title || 'The road ahead', 'mid')}<p class="sub">${esc(R.subtitle || '')}</p>`;
      $('content').innerHTML = `<div class="card roadmap st" style="--i:0"><div class="road-box" id="road"></div></div>`;
      $('source').textContent = 'Next few months';
      $('ticker').innerHTML = (R.steps || []).map(st => `<span>${esc(st.label)}: ${esc(st.when || '')}</span>`).join('');
      requestAnimationFrame(() => drawRoad(R.steps || []));
    }
    function drawRoad(steps) {
      const box = $('road');
      if (!box || !steps.length) return;
      const W = box.clientWidth, H = box.clientHeight, u = U();
      const y = H * .5;
      const pts = steps.map((st, i) => ({ x: u * 7 + (W - u * 14) * (i / (steps.length - 1)), y }));
      const segs = pts.slice(1).map((b, i) => `M${pts[i].x} ${y} L${b.x} ${y}`);
      const glyph = st => st.type === 'start' ? '<i class="now"></i>'
        : st.type === 'rest' ? icon('help:snow')
        : st.type === 'boss' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L14.6 8.6 L21.5 9.2 L16.2 13.7 L17.9 20.5 L12 16.8 L6.1 20.5 L7.8 13.7 L2.5 9.2 L9.4 8.6 Z" fill="currentColor"/></svg>'
        : st.type === 'finish' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19.5 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : `<b>${steps.slice(0, steps.indexOf(st) + 1).filter(x => x.type === 'level').length}</b>`;
      box.innerHTML = `
        <svg class="road-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <path class="road-bed" d="M${pts[0].x} ${y} L${pts[pts.length - 1].x} ${y}"/>
          <path class="road-done" id="roadDone" d="M${pts[0].x} ${y} L${pts[pts.length - 1].x} ${y}"/>
          ${segs.map((d, i) => `<path class="seg-measure" id="seg${i}" d="${d}"/>`).join('')}
        </svg>
        ${steps.map((st, i) => `
          <div class="stop ${st.type} ${i === 0 ? 'first' : i === steps.length - 1 ? 'last' : ''}" id="stop${i}" style="left:${pts[i].x}px;top:${y}px;--c:${LANES[i % LANES.length]}">
            <div class="dot">${glyph(st)}</div>
            <div class="stem ${i % 2 ? 'below' : 'above'}"></div>
            <div class="scard ${i % 2 ? 'below' : 'above'}">
              <span class="when">${esc(st.when || '')}</span>
              <b>${esc(st.label)}</b>
              ${st.note ? `<span class="snote">${esc(st.note)}</span>` : ''}
            </div>
          </div>`).join('')}
        <div class="walker" id="walker"><i></i></div>`;
      walk(steps, pts);
    }
    function walk(steps, pts) {
      const lens = steps.slice(1).map((_, i) => $('seg' + i).getTotalLength());
      const totalLen = lens.reduce((a, b) => a + b, 0);
      const done = $('roadDone'), walker = $('walker');
      done.style.strokeDasharray = `${totalLen} ${totalLen}`;
      done.style.strokeDashoffset = totalLen;
      const place = (i, len) => {
        const p = $('seg' + i).getPointAtLength(len);
        walker.style.transform = `translate(${p.x}px, ${p.y}px)`;
      };
      walker.style.transform = `translate(${pts[0].x}px, ${pts[0].y}px)`;
      const reach = i => {
        const stop = $('stop' + i);
        if (!stop) return;
        stop.classList.add('reached');
        const st = steps[i];
        pulse.spike(st.type === 'boss' ? 1 : .7);
        if (st.type === 'boss' || st.type === 'finish') flashLights();
        if (st.type === 'finish') walker.classList.add('arrived');
      };
      let seg = 0, acc = 0;
      const startWalk = () => {
        walker.classList.add('moving');
        const dur = 1400, t0 = performance.now();
        const step = t => {
          if (!walker.isConnected) return;
          const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          place(seg, lens[seg] * e);
          done.style.strokeDashoffset = totalLen - (acc + lens[seg] * e);
          if (k < 1) return requestAnimationFrame(step);
          acc += lens[seg]; seg++;
          walker.classList.remove('moving');
          reach(seg);
          if (seg < lens.length) later(startWalk, steps[seg].type === 'boss' ? 1600 : 1100);
        };
        requestAnimationFrame(step);
      };
      later(() => reach(0), 700);
      later(startWalk, 1700);
    }

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
    function control(a) {
      if (a === 'snow') { const on = snow.toggle(); $('ctlSnow').textContent = on ? 'Snow on' : 'Snow off'; return; }
      if (a === 'sim') { const on = T.simulate(!T.simulating()); $('ctlSim').textContent = on ? '■ Stop simulation' : '▶ Simulate the room'; return; }
      if (!T.canControl) { $('status').textContent = T.controlHint || 'Only the presenter can control this screen'; return; }
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
      if (['arrowright', ' ', 'pagedown'].includes(k)) { e.preventDefault(); control('next'); }
      else if (['arrowleft', 'pageup'].includes(k)) control('prev');
      else if (k === 'h') control('reveal');
      else if (k === 's') control('snow');
      else if (k === 'u') control('unhide');
      else if (k === 'c') control('clear');
    });
    addEventListener('resize', () => {
      if (!latest) return;
      if (latest.stage === 'question') layoutCloud(latest);
      if (latest.stage === 'roadmap') { timers.forEach(clearTimeout); timers = []; drawRoad((latest.roadmap || {}).steps || []); }
    });
    document.fonts && document.fonts.ready.then(() => latest && latest.stage === 'question' && layoutCloud(latest));

    T.onStatus = msg => ($('status').textContent = msg || '');
    T.subscribe(render, onReact);
  }

  root.mountHost = mountHost;
})(typeof self !== 'undefined' ? self : this);
