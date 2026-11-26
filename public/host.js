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
      const label = s.stage === 'question' ? `Q${s.qi + 1} of ${s.total}` : s.nav || LABELS[s.stage] || '';
      $('pager').textContent = `${s.index + 1} / ${s.stepCount}`;
      $('ctlLabel').textContent = label;
      $('ctlReveal').hidden = s.stage !== 'question';
      $('ctlReveal').textContent = s.revealed ? 'Hide results' : 'Reveal now';
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

    function build(s) {
      timers.forEach(clearTimeout); timers = [];
      cloudEls.clear(); lastN = null; lastTicker = ''; cardsKey = ''; titleKey = ''; revealedPrev = null; fresh = true;
      stopTimer(); fireworks.stop();
      $('deck').dataset.stage = s.stage;
      $('ticker').innerHTML = '';
      const builders = { lobby: buildLobby, question: buildQuestion, slide: buildSlide, recap: buildRecap, roadmap: buildRoadmap, finale: buildFinale };
      (builders[s.stage] || buildLobby)(s);
      $('deck').dataset.layout = s.stage === 'slide' ? s.slide.type : '';
      snow.setIntensity({ lobby: 1, question: .4, slide: .6, recap: 1, roadmap: .8, finale: 1.8 }[s.stage] ?? 1);
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
      const q = s.question, scored = q.options.some(o => typeof o.score === 'number');
      $('titleblock').innerHTML = `
        <div class="qrow">
          <div class="qbadge"><b>Q${s.qi + 1}</b><span>of ${s.total}</span></div>
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
      const jokes = s.ticker || [];
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
      } else if (sl.type === 'quote') {
        T2.innerHTML = '';
        C.innerHTML = `<div class="s-quote"><div class="s-qmark">“</div><blockquote>${ph(sl.quote || '')}</blockquote>${sl.by ? `<div class="s-by">${ph(sl.by)}</div>` : ''}</div>`;
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
      $('titleblock').innerHTML = R.style === 'road' ? head : `
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
      const span = it => it.date ? fmtDay(day(it.date)) : `${fmtDay(day(it.start))} – ${fmtDay(day(it.end))}`;
      $('ticker').innerHTML = gantt
        ? (R.rows || []).flatMap(r => (r.items || []).map(it => `<span>${esc((r.items.length > 1 ? it.label : r.label) || r.label)}: ${esc(it.when || span(it))}</span>`)).join('')
        : (R.steps || []).map(st => `<span>${esc(st.label)}: ${esc(st.when || '')}</span>`).join('');
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
    // ---------- ROADMAP (default style "gantt"): a real timeline of overlapping workstreams, with the workload beneath ----------
    // A playhead sweeps through the months: bars draw in as it passes, milestones pop with their callouts, the
    // workload chart fills in underneath, and it slows down for the cutover. H skips to the end.
    const fmtDay = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    function drawGantt(R) {
      const box = $('road'), rows = (R && R.rows) || [];
      skipRoad = null;
      if (!box || !rows.length || !R.start || !R.end) return;
      const token = (drawGantt.token = (drawGantt.token || 0) + 1);
      const at = (fn, ms) => later(() => token === drawGantt.token && fn(), ms);
      const W = box.clientWidth, H = box.clientHeight, u = U();
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const t0 = day(R.start), t1 = day(R.end), span = t1 - t0;
      const cx0 = u * 12.5, cx1 = W - u * 1.2;
      const X = t => cx0 + (cl(t, t0, t1) - t0) / span * (cx1 - cx0);
      const T = x => t0 + (x - cx0) / (cx1 - cx0) * span;
      const headH = u * 4.8, axisH = u * 2.2, gapH = u * 1.4;
      const rowH = cl((H - headH - axisH - gapH - u * 9) / rows.length, u * 3, u * 4.6);
      const rowsTop = headH, rowsBot = headH + rowH * rows.length;
      const loadTop = rowsBot + gapH, loadBot = H - axisH;
      const ly0 = loadTop + u * 2.4, ly1 = loadBot - u * .3;
      const yOf = v => ly1 - v / 100 * (ly1 - ly0);

      // ---- the workload: every active workstream adds its weight, the holiday break damps it ----
      const items = rows.flatMap((r, ri) => (r.items || []).map(it => {
        const a = day(it.start || it.date), b = it.end ? day(it.end) : a + DAY;
        return { ...it, ri, a, b, mid: (a + b) / 2, color: it.key ? 'var(--gold)' : (r.color || LANES[ri % LANES.length]) };
      }));
      const hol = R.holiday ? { a: day(R.holiday.start), b: day(R.holiday.end) } : null;
      const rawAt = t => {
        let v = R.baseLoad ?? .6;
        for (const it of items) {
          const w = it.weight ?? (it.type === 'milestone' ? .8 : 1);
          if (it.type === 'milestone') { const d = (t - it.mid) / (DAY * 2.5); v += w * Math.exp(-d * d); }
          else if (t >= it.a && t < it.b) v += it.fade ? w * (1 - .7 * (t - it.a) / (it.b - it.a)) : w;
        }
        return hol && t >= hol.a && t < hol.b ? v * (R.holiday.factor ?? .35) : v;
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
      const lowT = hol ? days.filter(t => t >= hol.a && t < hol.b).reduce((m, t) => (curve(X(t)) < curve(X(m)) ? t : m), hol.a) : null;

      // ---- grid ----
      const months = [], weeks = [];
      for (let m = new Date(t0); m.getTime() < t1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(Math.max(t0, new Date(m.getFullYear(), m.getMonth(), 1).getTime()));
      for (let t = t0; t < t1; t += DAY) if (new Date(t).getDay() === 1) weeks.push(t);
      const today = R.today ? day(R.today) : new Date(new Date().toDateString()).getTime();
      const marks = [];
      if (today >= t0 && today <= t1) marks.push({ cls: 'today', x: X(today), html: 'Today' });
      if (hol) marks.push({ cls: 'hol', x: (X(hol.a) + X(hol.b)) / 2, html: `${icon('help:snow')}${esc(R.holiday.label || 'Holiday break')}`, t: hol.a });
      items.forEach((it, k) => { if (it.key) marks.push({ cls: 'key', x: X(it.mid), html: `${esc(it.label)}${it.when ? ` <small>${esc(it.when)}</small>` : ''}`, t: it.a, k }); });
      const rowName = r => esc(r.label || '');
      box.classList.add('gt');
      box.innerHTML = `
        <svg class="gt-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <defs>
            <linearGradient id="gtFill" x1="0" y1="${ly0}" x2="0" y2="${ly1}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffc400" stop-opacity=".55"/><stop offset=".45" stop-color="#5fb8ff" stop-opacity=".35"/><stop offset="1" stop-color="#3b6fff" stop-opacity=".05"/>
            </linearGradient>
            <linearGradient id="gtStroke" x1="0" y1="${ly0}" x2="0" y2="${ly1}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffc400"/><stop offset=".45" stop-color="#ffe08a"/><stop offset=".7" stop-color="#8fd3ff"/><stop offset="1" stop-color="#5fb8ff"/>
            </linearGradient>
            <clipPath id="gtClip"><rect id="gtClipRect" x="0" y="0" width="${cx0}" height="${H}"/></clipPath>
          </defs>
          ${rows.map((_, i) => i % 2 ? '' : `<rect class="gt-stripe" x="0" y="${rowsTop + rowH * i}" width="${W}" height="${rowH}"/>`).join('')}
          ${weeks.map(t => `<line class="gt-week" x1="${X(t)}" x2="${X(t)}" y1="${rowsTop}" y2="${rowsBot}"/>`).join('')}
          ${months.map(t => `<line class="gt-mline" x1="${X(t)}" x2="${X(t)}" y1="${headH * .5}" y2="${loadBot}"/>`).join('')}
          ${hol ? `<rect class="gt-hol" id="gtHol" x="${X(hol.a)}" y="${headH * .5}" width="${X(hol.b) - X(hol.a)}" height="${loadBot - headH * .5}"/>` : ''}
          ${[100, 60, 20].map(v => `<line class="gt-lgrid" x1="${cx0}" x2="${cx1}" y1="${yOf(v)}" y2="${yOf(v)}"/>`).join('')}
          <line class="gt-axis" x1="${cx0}" x2="${cx1}" y1="${loadBot}" y2="${loadBot}"/>
          ${marks.map((m, k) => `<line class="gt-mk-line ${m.cls}" id="gtML${k}" x1="${m.x}" x2="${m.x}" y1="${u * 2}" y2="${loadBot}"/>`).join('')}
          <path class="gt-ghost" d="${line}"/>
          <g clip-path="url(#gtClip)">
            <path class="gt-area" d="${line} L${cx1} ${ly1} L${cx0} ${ly1} Z"/>
            <path class="gt-line" d="${line}"/>
          </g>
          <path class="gt-shimmer" id="gtShimmer" pathLength="100" d="${line}"/>
        </svg>
        ${months.map((t, k) => `<div class="gt-mon" style="left:${X(t)}px;top:${headH * .5}px;--k:${k}"><b>${new Date(t).toLocaleDateString('en-GB', { month: 'short' })}</b> ${new Date(t).getFullYear()}</div>`).join('')}
        ${marks.map((m, k) => `<div class="gt-mk ${m.cls}" id="gtMK${k}" style="left:${m.x}px">${m.html}</div>`).join('')}
        ${rows.map((r, i) => `
          <div class="gt-rlab" style="top:${rowsTop + rowH * i}px;height:${rowH}px;--c:${r.color || LANES[i % LANES.length]};--k:${i}">
            <i></i><span><b>${rowName(r)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
          </div>`).join('')}
        <div class="gt-items" id="gtItems">
          ${items.map((it, k) => it.type === 'milestone' ? `
            <div class="gt-ms ${it.key ? 'key' : ''}" id="gtI${k}" style="left:${X(it.mid)}px;top:${rowsTop + rowH * (it.ri + .5)}px;--c:${it.color}">
              <i></i>${it.key ? '' : `<span><b>${esc(it.label)}</b>${it.note ? ` · ${esc(it.note)}` : ''}</span>`}
            </div>` : `
            <div class="gt-bar ${it.fade ? 'fade' : ''} ${it.key ? 'key' : ''}" id="gtI${k}" style="left:${X(it.a)}px;width:${Math.max(u * .6, X(it.b) - X(it.a))}px;top:${rowsTop + rowH * (it.ri + .2)}px;height:${rowH * .6}px;--c:${it.color}">
              <span>${esc(it.label || '')}</span>
            </div>`).join('')}
        </div>
        <div class="gt-ylab" style="top:${loadTop}px">${esc(R.workloadLabel || 'Workload')}</div>
        ${[[100, 'Peak'], [60, 'Busy'], [20, 'Calm']].map(([v, w]) => `<div class="gt-lv" style="top:${yOf(v)}px">${w}</div>`).join('')}
        <div class="gt-call peak" id="gtPeak" style="left:${X(peakT)}px;top:${yOf(100)}px"><span>${esc(R.peakLabel || 'Peak')}</span></div>
        ${lowT != null ? `<div class="gt-call low" id="gtLow" style="left:${X(lowT)}px;top:${yOf(curve(X(lowT)))}px"><span>${esc(R.holiday.callout || 'Recharge')}</span></div>` : ''}
        <div class="gt-play" id="gtPlay" style="top:${headH * .5}px;height:${loadBot - headH * .5}px"><i></i><span id="gtDate"></span></div>
        <div class="gt-dot" id="gtDot"></div>`;

      // a bar label that does not fit inside its bar moves just left of the bar when there is room there,
      // otherwise it is dropped (the ticker still lists it)
      items.forEach((it, k) => {
        const el = $('gtI' + k), sp = el.querySelector('.gt-bar > span');
        if (!sp || sp.scrollWidth <= el.clientWidth - 2) return;
        const need = sp.scrollWidth + u * .6;
        const prevEnd = Math.max(cx0, ...items.filter((o, j) => j !== k && o.ri === it.ri && o.a < it.a).map(o => o.type === 'milestone' ? X(o.mid) + u * 14 : X(o.b)));
        sp.remove();
        if (X(it.a) - need < prevEnd) return;
        el.insertAdjacentHTML('afterend', `<div class="gt-out" id="gtO${k}" style="right:${W - X(it.a) + u * .4}px;top:${rowsTop + rowH * (it.ri + .5)}px">${esc(it.label)}</div>`);
      });
      // header callouts: keep them apart
      let edge = -Infinity;
      marks.forEach((m, k) => {
        const el = $('gtMK' + k), w = el.offsetWidth;
        let left = cl(m.x - w / 2, Math.max(cx0 - u * 2, edge + u * .4), W - w);
        el.style.left = left + 'px';
        el.style.setProperty('--tip', (m.x - left) + 'px');
        edge = left + w;
      });

      // ---- the sweep ----
      const items$ = items.map((_, k) => $('gtI' + k)), clip = $('gtClipRect'), play = $('gtPlay'), dot = $('gtDot'), dateEl = $('gtDate');
      const hudBars = [...document.querySelectorAll('#pkHud .pk-seg i')], hudWord = $('pkWord'), hudNow = $('pkNow');
      let shownBars = -1, shownNow = '', inHol = false;
      const seen = new Set();
      const meter = (v, now) => {
        const b = loadBars(v);
        if (b !== shownBars) {
          shownBars = b;
          hudBars.forEach((el, k) => el.classList.toggle('on', k < b));
          if (hudWord) { hudWord.textContent = loadWord(v); hudWord.classList.toggle('hot', b === 5); }
        }
        if (hudNow && now !== shownNow) { shownNow = now; hudNow.innerHTML = now; }
      };
      const activeAt = t => {
        if (hol && t >= hol.a && t < hol.b) return esc(R.holiday.label || 'Holiday break');
        const names = rows.filter((r, ri) => items.some(it => it.ri === ri && (it.type === 'milestone' ? Math.abs(t - it.mid) < DAY * 2 : t >= it.a && t < it.b))).map(rowName);
        return names.length ? names.join(' · ') : 'Business as usual';
      };
      const marksAt = (x, k) => { const mk = $('gtMK' + k), ml = $('gtML' + k); if (mk && !mk.classList.contains('on') && (marks[k].cls === 'today' || x >= marks[k].x - u)) { mk.classList.add('on'); ml.classList.add('on'); } };
      const update = x => {
        const t = T(x), v = curve(x);
        clip.setAttribute('width', x);
        play.style.transform = `translateX(${x}px)`;
        dot.style.transform = `translate(${x}px, ${yOf(v)}px)`;
        dateEl.textContent = fmtDay(t);
        meter(v, `<span>${fmtDay(t)}</span> ${activeAt(t)}`);
        $('gtItems').style.clipPath = `inset(0 ${Math.max(0, W - x)}px 0 0)`;
        items.forEach((it, k) => {
          if (seen.has(k) || X(it.a) > x) return;
          seen.add(k);
          items$[k].classList.add('on');
          const out = $('gtO' + k); if (out) out.classList.add('on');
          if (it.key) { $('deck').classList.remove('shake'); void $('deck').offsetWidth; $('deck').classList.add('shake'); flashLights(); pulse.spike(1); }
          else if (it.type === 'milestone') pulse.spike(.7);
        });
        marks.forEach((_, k) => marksAt(x, k));
        const nowHol = !!(hol && t >= hol.a && t < hol.b);
        if (nowHol !== inHol) { inHol = nowHol; snow.setIntensity(nowHol ? 2.6 : .8); if (nowHol) $('gtHol').classList.add('on'); }
        if (x >= X(peakT)) $('gtPeak').classList.add('on');
        if (lowT != null && x >= X(lowT)) $('gtLow').classList.add('on');
      };
      const done = () => {
        drawGantt.token++;
        update(cx1);
        items$.forEach(el => el.classList.add('on'));
        box.querySelectorAll('.gt-out').forEach(el => el.classList.add('on'));
        marks.forEach((_, k) => { $('gtMK' + k).classList.add('on'); $('gtML' + k).classList.add('on'); });
        if (hol) $('gtHol').classList.add('on');
        $('gtPeak').classList.add('on');
        if (lowT != null) $('gtLow').classList.add('on');
        $('gtItems').style.clipPath = 'none';
        box.classList.add('done');
        snow.setIntensity(.8);
        meter(100, `${esc(R.peakLabel || 'Peak')} around <span>${fmtDay(peakT)}</span>`);
      };
      skipRoad = done;
      update(cx0);
      marks.forEach((m, k) => { if (m.cls === 'today') marksAt(cx0, k); });
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
      box.classList.add('intro');
      const speed = (cx1 - cx0) / ((R.sweepSeconds || 12) * 1000);
      const keyXs = items.filter(it => it.key).map(it => X(it.mid));
      let x = cx0, last = 0;
      const tick = now => {
        if (token !== drawGantt.token || !box.isConnected) return;
        const dt = last ? Math.min(50, now - last) : 0;
        last = now;
        const slow = keyXs.reduce((m, kx) => Math.min(m, 1 - .72 * Math.exp(-(((x - kx) / (u * 3.5)) ** 2))), 1);
        x = Math.min(cx1, x + speed * slow * dt);
        update(x);
        if (x < cx1) requestAnimationFrame(tick); else at(done, 400);
      };
      at(() => { play.classList.add('on'); dot.classList.add('on'); requestAnimationFrame(tick); }, 1300);
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
      else if (k === 'h') { if (latest && latest.stage === 'roadmap') { if (skipRoad) skipRoad(); } else control('reveal'); }
      else if (k === 's') control('snow');
      else if (k === 'u') control('unhide');
      else if (k === 'c') control('clear');
    });
    addEventListener('resize', () => {
      if (!latest) return;
      if (latest.stage === 'question') layoutCloud(latest);
      if (latest.stage === 'roadmap') { timers.forEach(clearTimeout); timers = []; drawRoadmap(latest.roadmap); }
    });
    document.fonts && document.fonts.ready.then(() => latest && latest.stage === 'question' && layoutCloud(latest));

    T.onStatus = msg => ($('status').textContent = msg || '');
    T.subscribe(render, onReact);
  }

  root.mountHost = mountHost;
})(typeof self !== 'undefined' ? self : this);
