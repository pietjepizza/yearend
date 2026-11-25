// Presenter screen. mountHost(rootElement, transport) — the transport supplies state and takes host actions.
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emphasise = s => esc(s).replace(/(\d+%|“[^”]+”)/g, '<span class="hl">$1</span>');
  const DAY = 864e5;
  const day = s => new Date(s + 'T00:00:00').getTime();

  const RING = '<svg class="ring" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true"><path d="M90 14 C 80 2, 22 0, 8 14 C -4 28, 24 49, 60 46 C 94 43, 104 24, 80 8"/></svg>';
  const ARROW = '<svg viewBox="0 0 32 26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3 C 12 4, 24 10, 29 22"/><path d="M29 22 L 21 20 M29 22 L 30 13"/></svg>';

  const SHELL = `
  <div class="deck" id="deck">
    <canvas class="snow" id="snow" aria-hidden="true"></canvas>
    <div class="topbar">
      <span class="team" id="team"></span><span class="sep"></span><span id="event"></span>
      <canvas class="pulse" id="pulse" aria-hidden="true"></canvas>
      <span class="spacer"></span>
      <span class="holiday" id="holiday"></span>
      <span class="live"><i></i>Live</span>
    </div>
    <div class="titleblock" id="titleblock">
      <div class="kicker" id="kicker"></div>
      <h1 class="action-title" id="title"></h1>
    </div>
    <div id="content"></div>
    <div class="foot">
      <span id="source"></span>
      <div class="ticker"><div class="ticker-in" id="ticker"></div></div>
      <span class="pager" id="pager"></span>
    </div>
  </div>
  <canvas id="confetti" aria-hidden="true"></canvas>
  <div class="toast" id="toast" role="status"></div>
  <div class="status" id="status"></div>
  <div class="controls" id="controls">
    <button data-a="prev" title="Previous (←)" aria-label="Previous">←</button>
    <span class="ctl-label" id="ctlLabel"></span>
    <button data-a="next" title="Next (→ or space)" aria-label="Next">→</button>
    <span class="ctl-sep"></span>
    <button data-a="reveal" id="ctlReveal" title="H">Hide results</button>
    <button data-a="snow" id="ctlSnow" title="S">Snow on</button>
    <button data-a="sim" id="ctlSim" hidden>▶ Simulate the room</button>
    <button data-a="reset" id="ctlReset">Reset</button>
  </div>`;

  function mountHost(rootEl, T) {
    rootEl.innerHTML = SHELL;
    document.body.classList.add('presenting');
    const $ = id => document.getElementById(id);
    const U = () => Math.min(innerWidth / 100, innerHeight * 1.7778 / 100);

    const snow = new FX.Snow($('snow'));
    const pulse = new FX.PulseLine($('pulse'));
    const confetti = new FX.Confetti($('confetti'));

    let summaryKey = '';
    let view = null, latest = null, lastTitle = '', lastTicker = '', lastN = null, transitioning = false, fresh = false;
    const cloudEls = new Map();

    // ---------- titles ----------
    function setTitle(html, waiting) {
      const t = $('title');
      t.classList.toggle('waiting', !!waiting);
      if (html === lastTitle) return;
      lastTitle = html;
      t.innerHTML = html;
      t.classList.toggle('long', t.textContent.length > 56);
      FX.splitWords(t);
      t.classList.remove('reveal'); void t.offsetWidth; t.classList.add('reveal');
    }

    function holidayChip(dateStr) {
      if (!dateStr) return '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const d = Math.round((day(dateStr) - today.getTime()) / DAY);
      const txt = d > 1 ? `${d} days to the holiday break` : d === 1 ? 'Holiday break starts tomorrow' : d === 0 ? 'Holiday break starts today' : 'Happy holidays!';
      return `${icon('help:snow')}<span>${txt}</span>`;
    }

    // ---------- screen transitions ----------
    function render(s, meta = {}) {
      latest = s;
      $('team').textContent = s.team;
      $('event').textContent = s.event;
      $('holiday').innerHTML = holidayChip(s.holidayDate);
      const label = s.stage === 'lobby' ? 'Welcome' : s.stage === 'summary' ? 'Summary' : `Q${s.index + 1} of ${s.total}`;
      $('pager').innerHTML = s.stage === 'question' ? `<b>${s.index + 1}</b> / ${s.total}` : `<b>${label}</b>`;
      $('ctlLabel').textContent = label;
      $('ctlReveal').textContent = s.revealed ? 'Hide results' : 'Reveal results';
      $('ctlReveal').hidden = s.stage !== 'question';

      const v = s.stage === 'question' ? 'q' + s.index : s.stage;
      if (v !== view) {
        const first = view === null;
        view = v;
        if (first) { build(s); paint(latest, meta); return; }
        transitioning = true;
        document.body.classList.add('leaving');
        setTimeout(() => {
          document.body.classList.remove('leaving');
          build(latest); transitioning = false; paint(latest, {});
        }, FX.reduce ? 0 : 380);
        return;
      }
      if (!transitioning) paint(s, meta);
    }

    function build(s) {
      cloudEls.clear(); lastN = null; lastTitle = ''; lastTicker = ''; summaryKey = ''; fresh = true;
      const c = $('content');
      c.className = 'stage-' + s.stage;
      if (s.stage === 'lobby') { buildLobby(s); snow.setIntensity(1.1); }
      else if (s.stage === 'summary') { buildSummary(s); snow.setIntensity(2); setTimeout(() => confetti.burst('cannons'), 500); }
      else { buildQuestion(s); snow.setIntensity(.55); }
      document.body.classList.remove('entering'); void c.offsetWidth; document.body.classList.add('entering');
    }

    function paint(s, meta) {
      if (s.stage === 'lobby') paintLobby(s);
      else if (s.stage === 'summary') paintSummary(s);
      else paintQuestion(s, meta);
      fresh = false;
    }

    // ---------- LOBBY: the road ahead ----------
    function buildLobby(s) {
      const L = s.lobby || {}, tl = L.timeline;
      $('kicker').innerHTML = `<b>${esc(L.kicker || 'Welcome')}</b>${s.total} quick questions · fully anonymous`;
      $('content').innerHTML = `
        <div class="lobby">
          <div class="lobby-main">
            <p class="intro st" style="--i:0">${esc(L.intro || '')}</p>
            ${tl ? `<div class="road st" style="--i:1">
              <div class="panel-h"><span><b>Exhibit 0</b> · The road ahead</span><span>${esc(rangeLabel(tl))}</span></div>
              ${gantt(tl)}
            </div>` : ''}
          </div>
          <aside class="lobby-side st" style="--i:2">
            <div class="join big call">
              <div class="qr">${T.qrHtml()}</div>
              <div class="k">Scan to join</div>
              <div class="url">${esc(T.joinLabel || T.joinUrl.replace(/^https?:\/\//, ''))}</div>
              <div class="hint">No name, no login · 10 seconds</div>
            </div>
            <div class="joined">
              <div class="joined-n"><span id="joinedN" data-v="0">0</span><small>connected</small></div>
              <div class="dots" id="dots"></div>
            </div>
          </aside>
        </div>`;
      $('source').textContent = 'Dates are indicative';
      $('ticker').innerHTML = '';
    }

    function rangeLabel(tl) {
      const f = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      const end = new Date(day(tl.end) - DAY).toISOString().slice(0, 10);
      return `${f(tl.start)} – ${f(end)}`;
    }

    function gantt(tl) {
      const t0 = day(tl.start), t1 = day(tl.end), span = t1 - t0;
      const pos = d => Math.max(0, Math.min(100, ((day(d) - t0) / span) * 100));
      // month gridlines + labels
      let months = '', m = new Date(t0);
      while (m.getTime() < t1) {
        const left = ((m.getTime() - t0) / span) * 100;
        months += `<div class="g-month" style="left:${left}%"><b>${m.toLocaleDateString('en-GB', { month: 'short' })}</b> ${m.getFullYear()}</div>`;
        m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      }
      const items = tl.items || [];
      const bars = items.map((it, r) => `
        <div class="g-bar" style="--r:${r};--i:${r};left:${pos(it.start)}%;width:${pos(it.end) - pos(it.start)}%"><span>${esc(it.note || '')}</span></div>`).join('');
      const labels = items.map((it, r) => `<div class="g-lab" style="--r:${r}">${esc(it.label)}</div>`).join('') +
        `<div class="g-lab load-lab" style="--r:${items.length}">Workload</div>`;
      // workload curve: overlapping workstreams per day, dipping over the holiday break
      const N = 90, pts = [];
      const hs = tl.holiday ? day(tl.holiday.start) : 0, he = tl.holiday ? day(tl.holiday.end) : 0;
      for (let k = 0; k <= N; k++) {
        const t = t0 + (span * k) / N;
        let v = items.filter(it => t >= day(it.start) && t < day(it.end)).length;
        if (t >= hs && t < he) v *= .35;
        pts.push(v);
      }
      const sm = pts.map((v, k) => (pts[Math.max(0, k - 2)] + pts[Math.max(0, k - 1)] + v + pts[Math.min(N, k + 1)] + pts[Math.min(N, k + 2)]) / 5);
      const max = Math.max(1, ...sm);
      const line = sm.map((v, k) => `${k ? 'L' : 'M'}${(k / N * 100).toFixed(2)} ${(19 - v / max * 17).toFixed(2)}`).join(' ');
      const peakK = sm.indexOf(max);
      const now = Date.now(), nowPos = Math.max(0, Math.min(100, ((now - t0) / span) * 100));
      const hol = tl.holiday ? `<div class="g-holiday" style="left:${pos(tl.holiday.start)}%;width:${pos(tl.holiday.end) - pos(tl.holiday.start)}%"><span>${icon('help:snow')}${esc(tl.holiday.label)}</span></div>` : '';
      return `
        <div class="gantt" style="--rows:${items.length}">
          <div class="g-labels">${labels}</div>
          <div class="g-area">
            ${months}
            ${hol}
            ${bars}
            <div class="g-load" style="--r:${items.length}">
              <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
                <path class="load-area" d="${line} L100 20 L0 20 Z"/>
                <path class="load-line" pathLength="1" d="${line}"/>
              </svg>
              <div class="g-peak" style="left:${(peakK / N * 100).toFixed(1)}%">Peak</div>
            </div>
            <div class="g-today" style="left:${nowPos}%"><span>${now < t0 ? 'We are here' : 'Today'}</span></div>
          </div>
        </div>`;
    }

    function paintLobby(s) {
      setTitle(esc(s.lobby?.title || 'Welcome'));
      const n = s.connected || 0;
      const prev = Number($('joinedN').dataset.v || 0);
      FX.tween($('joinedN'), n);
      const dots = $('dots'), want = Math.min(n, 160);
      while (dots.children.length < want) { const d = document.createElement('i'); d.style.setProperty('--h', Math.floor(Math.random() * 4)); dots.appendChild(d); }
      while (dots.children.length > want) dots.lastChild.remove();
      if (n > prev && !fresh) pulse.spike(.6);
    }

    // ---------- QUESTION ----------
    function buildQuestion(s) {
      const q = s.question, scored = q.options.some(o => typeof o.score === 'number');
      $('content').innerHTML = `
        <div class="body" id="body">
          <div class="exhibit st" style="--i:0">
            <div class="panel-h"><span><b>Exhibit ${s.index + 1}a</b> · Distribution of responses, % of respondents</span><span id="nlabel"></span></div>
            <div class="rows">
              ${q.options.map((o, i) => `
                <div class="row st" style="--i:${i + 1}" data-id="${esc(o.id)}">
                  <div class="ic">${icon(o.icon)}</div>
                  <div class="main">
                    <div class="line">
                      <span class="lab">${esc(o.label)}</span>
                      <span class="val"><span class="pct" data-v="0">0%</span><span class="cnt"></span>${RING}${o.note ? `<span class="note">${esc(o.note)}${ARROW}</span>` : ''}</span>
                    </div>
                    <div class="track"><div class="fill"></div></div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
          <div class="cloud-panel st" style="--i:3">
            <div class="panel-h"><span><b>Exhibit ${s.index + 1}b</b> · In their own words</span><span id="wlabel"></span></div>
            <div class="cloud ${T.canControl ? 'can-edit' : ''}" id="cloud"><div class="w" id="measure" style="visibility:hidden;transition:none"></div></div>
            <div class="cloud-empty" id="cloudEmpty">Words from the room<br>will appear here</div>
            <div class="veil"><span>Results under embargo…</span></div>
          </div>
          <aside class="side st" style="--i:4">
            <div class="kpis">
              <div class="kpi"><div class="k">Responses</div><div class="v" id="k-n" data-v="0">0</div></div>
              ${scored
                ? `<div class="kpi"><div class="k">Pulse index</div><div class="v"><span id="k-avg" data-v="0">–</span><small>/ 5</small></div></div>
                   <div class="kpi wide"><div class="k">Positive share (top-2 box)</div><div class="v"><span id="k-top" data-v="0">–</span><small>%</small></div><div class="meter"><i id="k-meter"></i></div></div>`
                : `<div class="kpi"><div class="k">Leading</div><div class="v"><span id="k-lead" data-v="0">–</span><small>%</small></div></div>
                   <div class="kpi wide"><div class="k">Top answer</div><div class="v txt" id="k-lab">–</div></div>`}
            </div>
            <div class="join" id="joinCard">
              <div class="qr">${T.qrHtml()}</div>
              <div class="k">Scan to join</div>
              <div class="url">${esc(T.joinLabel || T.joinUrl.replace(/^https?:\/\//, ''))}</div>
              <div class="hint">100% anonymous · 10 seconds</div>
            </div>
          </aside>
        </div>`;
      $('kicker').innerHTML = `<b>Q${s.index + 1}</b>${esc(q.title)}${q.context ? `<span class="ctx">${esc(q.context)}</span>` : ''}`;
    }

    function paintQuestion(s, meta) {
      const n = s.stats.n;
      if (!n) setTitle('Waiting for the first responses…', true);
      else if (!s.revealed) setTitle('Results are coming in…', true);
      else setTitle(emphasise(s.takeaway));

      const body = $('body');
      body.classList.toggle('concealed', !s.revealed);
      body.classList.toggle('empty', n === 0);
      $('joinCard').classList.toggle('call', n < 3);
      $('nlabel').textContent = `n = ${n}`;
      const max = Math.max(1, ...Object.values(s.counts));
      [...document.querySelectorAll('.row')].forEach((row, i) => {
        const c = s.counts[row.dataset.id] || 0, pct = n ? Math.round(100 * c / n) : 0;
        const fill = row.querySelector('.fill');
        if (fresh) fill.style.transitionDelay = (450 + i * 110) + 'ms';
        fill.style.width = (c / max) * 100 + '%';
        FX.tween(row.querySelector('.pct'), pct, v => Math.round(v) + '%');
        row.querySelector('.cnt').textContent = `(${c})`;
        row.classList.toggle('top', n > 0 && row.dataset.id === s.stats.topId);
      });
      if (fresh) setTimeout(() => document.querySelectorAll('.row .fill').forEach(f => (f.style.transitionDelay = '')), 1600);
      FX.tween($('k-n'), n);
      if ($('k-avg')) {
        if (s.stats.avg != null) FX.tween($('k-avg'), s.stats.avg, v => v.toFixed(1)); else $('k-avg').textContent = '–';
        if (s.stats.topBox != null) { FX.tween($('k-top'), s.stats.topBox); $('k-meter').style.width = s.stats.topBox + '%'; } else $('k-top').textContent = '–';
      } else {
        FX.tween($('k-lead'), s.stats.topPct);
        $('k-lab').textContent = s.stats.top || '–';
      }
      if (meta.pop) { pulse.spike(1); if (s.revealed) bump(meta.pop); }
      scheduleCloud(s);

      const tick = (s.recent || []).map(w => `<span>${esc(w)}</span>`).join('');
      if (tick !== lastTicker) { lastTicker = tick; $('ticker').innerHTML = tick; }
      $('ticker').parentElement.classList.toggle('off', !s.revealed);
      $('source').textContent = `Source: live pulse, ${s.team}, n = ${n}`;

      if (lastN !== null && n > lastN) {
        const hit = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500].find(m => lastN < m && n >= m);
        if (hit) { FX.toast($('toast'), `🎉 ${hit} responses and counting!`); confetti.burst('top'); }
      }
      lastN = n;
    }

    function bump(id) {
      const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump');
      const p = document.createElement('div'); p.className = 'plus'; p.textContent = '+1';
      row.querySelector('.main').appendChild(p); setTimeout(() => p.remove(), 1200);
    }

    // ---------- word cloud (spiral placement, animated) ----------
    // Re-layout at most about once a second so words glide instead of jittering in a busy room.
    let cloudAt = 0, cloudTimer = null, cloudNext = null;
    function scheduleCloud(s) {
      cloudNext = s;
      const wait = 1100 - (Date.now() - cloudAt);
      if (wait <= 0 || fresh) { cloudAt = Date.now(); layoutCloud(s); return; }
      if (!cloudTimer) cloudTimer = setTimeout(() => { cloudTimer = null; cloudAt = Date.now(); if (latest && latest.stage === 'question') layoutCloud(latest); }, wait);
    }
    const INKS = ['var(--ink)', 'var(--brand)', '#3b6fd8', '#2a8fd6', '#5a4fcf', 'var(--muted)'];
    const hash = w => [...w].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    function layoutCloud(s) {
      const box = $('cloud'), measure = $('measure');
      if (!box) return;
      const entries = Object.entries(s.words).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 45);
      $('cloudEmpty').hidden = entries.length > 0;
      const total = entries.reduce((a, [, c]) => a + c, 0);
      $('wlabel').textContent = total ? `${entries.length} unique of ${total}` : '';
      const W = box.clientWidth, H = box.clientHeight, u = U();
      const hi = entries.length ? entries[0][1] : 1, lo = entries.length ? entries[entries.length - 1][1] : 1;
      const maxF = u * (entries.length > 28 ? 3.1 : entries.length > 14 ? 3.7 : 4.4), minF = u * 1.2, pad = u * .55;
      const placed = [], seen = new Set();
      entries.forEach(([w, n], i) => {
        seen.add(w);
        const t = hi === lo ? (entries.length === 1 ? 1 : .35) : Math.sqrt((n - lo) / (hi - lo));
        const fs = minF + (maxF - minF) * t;
        measure.style.fontSize = fs + 'px'; measure.textContent = w;
        const bw = measure.offsetWidth, bh = measure.offsetHeight;
        let pos = null;
        for (let k = 0; k < 2400 && !pos; k++) {
          const a = k * .22, r = u * .28 * a;
          const x = W / 2 + r * Math.cos(a) * 1.3 - bw / 2, y = H / 2 + r * Math.sin(a) * .85 - bh / 2;
          if (x < 0 || y < 0 || x + bw > W || y + bh > H) continue;
          if (placed.some(p => x < p.x + p.w + pad && x + bw + pad > p.x && y < p.y + p.h + pad * .4 && y + bh + pad * .4 > p.y)) continue;
          pos = { x, y, w: bw, h: bh };
        }
        let rec = cloudEls.get(w);
        if (!rec) {
          const el = document.createElement('div');
          el.className = 'w new'; el.innerHTML = `<i>${esc(w)}</i>`;
          if (T.canControl) { el.title = 'Click to hide this word'; el.onclick = () => T.act('hide', w); }
          box.appendChild(el);
          rec = { el, n };
          cloudEls.set(w, rec);
          if (pos) { el.style.transition = 'none'; el.style.fontSize = fs + 'px'; el.style.transform = `translate(${pos.x}px,${pos.y}px)`; void el.offsetWidth; el.style.transition = ''; }
        } else if (n > rec.n) {
          rec.el.classList.remove('grow', 'new'); void rec.el.offsetWidth; rec.el.classList.add('grow');
        }
        rec.n = n;
        if (!pos) { rec.el.style.opacity = 0; return; }
        placed.push(pos);
        Object.assign(rec.el.style, { opacity: '', fontSize: fs + 'px', transform: `translate(${pos.x}px,${pos.y}px)`, color: i === 0 ? 'var(--brand)' : INKS[hash(w) % INKS.length] });
      });
      for (const [w, rec] of cloudEls) if (!seen.has(w)) { rec.el.remove(); cloudEls.delete(w); }
    }

    // ---------- SUMMARY ----------
    function buildSummary(s) {
      $('kicker').innerHTML = `<b>Summary</b>What we heard today`;
      $('content').innerHTML = `<div class="summary" id="sumCards" style="--cols:${s.items.length}"></div><div class="sum-band st" id="sumBand" style="--i:${s.items.length + 1}"></div>`;
      $('ticker').innerHTML = '';
    }
    function paintSummary(s) {
      setTitle(emphasise((s.summary.title || 'Executive summary: {participants} colleagues shared their pulse').replace('{participants}', s.participants)));
      const idx = s.items.map(it => it.stats.avg).filter(v => v != null);
      const avgAll = idx.length ? +(idx.reduce((a, b) => a + b, 0) / idx.length).toFixed(1) : null;
      const wordsAll = s.items.reduce((a, it) => a + Object.values(it.words).reduce((x, y) => x + y, 0), 0);
      const key = JSON.stringify([s.participants, s.items.map(it => [it.stats, it.takeaway, it.words])]);
      if (key === summaryKey) return;
      summaryKey = key;
      $('sumCards').innerHTML = s.items.map((it, i) => {
        const opt = it.options.find(o => o.id === it.stats.topId);
        const chips = Object.entries(it.words).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w], k) => `<span style="--k:${k}">${esc(w)}</span>`).join('');
        return `<div class="sum-card st" style="--i:${i}">
          <div class="num">${String(i + 1).padStart(2, '0')}</div>
          <div class="q">${esc(it.title)}</div>
          <div class="t">${it.takeaway ? emphasise(it.takeaway) : '<span style="color:var(--faint)">No responses yet</span>'}</div>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
          <div class="top">${opt ? `<span class="ic">${icon(opt.icon)}</span><span><b>${esc(opt.label)}</b> · ${it.stats.topPct}%</span>` : ''}</div>
        </div>`;
      }).join('');
      $('sumBand').innerHTML = `
        <div><div class="k">Participants</div><div class="v" id="sb-p" data-v="0">0</div></div>
        <div><div class="k">Avg. pulse index</div><div class="v"><span id="sb-a" data-v="0">–</span><small> / 5</small></div></div>
        <div><div class="k">Words shared</div><div class="v" id="sb-w" data-v="0">0</div></div>
        <div class="thanks">${esc(s.summary.thanks || `Thank you, ${s.team}!`)}</div>`;
      FX.tween($('sb-p'), s.participants, undefined, 1400);
      if (avgAll != null) FX.tween($('sb-a'), avgAll, v => v.toFixed(1), 1400);
      FX.tween($('sb-w'), wordsAll, undefined, 1400);
      $('source').textContent = `Source: live pulse, ${s.team}`;
    }

    // ---------- reactions ----------
    function onReact(r) { if (!r) return; FX.floatReaction(r); pulse.spike(.45); }

    // ---------- controls ----------
    let resetArmed = 0, clearArmed = 0;
    function control(a) {
      if (a === 'snow') { const on = snow.toggle(); $('ctlSnow').textContent = on ? 'Snow on' : 'Snow off'; return; }
      if (a === 'sim') { const on = T.simulate(!T.simulating()); $('ctlSim').textContent = on ? '■ Stop simulation' : '▶ Simulate the room'; return; }
      if (!T.canControl) { $('status').textContent = T.controlHint || 'Only the presenter can control this screen'; return; }
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
    addEventListener('resize', () => { if (latest && latest.stage === 'question') layoutCloud(latest); });
    document.fonts && document.fonts.ready.then(() => latest && latest.stage === 'question' && layoutCloud(latest));

    T.onStatus = msg => ($('status').textContent = msg || '');
    T.subscribe(render, onReact);
  }

  root.mountHost = mountHost;
})(typeof self !== 'undefined' ? self : this);
