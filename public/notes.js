// Presenter view: a second window for the presenter's laptop. It shows the speaker notes, what is on the
// big screen now and what comes next, live counts and a clock, and it drives the show: the projector follows.
// mountNotes(rootElement, transport). Opened from the presenter guide ("Open presenter view").
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = s => String(s ?? '').replace(/[\[\]]/g, '');
  const KIND = { lobby: 'Join screen', recap: 'Recap', roadmap: 'Timeline', finale: 'Finale' };

  function titleOf(s) {
    if (s.stage === 'question') return s.question.title;
    if (s.stage === 'slide') return (s.slide && (s.slide.title || s.slide.type)) || s.nav;
    if (s.stage === 'lobby') return (s.lobby && s.lobby.title) || 'Join';
    if (s.stage === 'roadmap') return (s.roadmap && s.roadmap.title) || 'The road ahead';
    if (s.stage === 'recap') return (s.recap && s.recap.title) || 'Recap';
    if (s.stage === 'finale') return (s.finale && s.finale.title) || 'Finale';
    return s.nav;
  }
  function kindOf(s) {
    if (s.stage === 'question') return s.question.type === 'award' ? 'Award vote' : s.group === 'checkin' ? `Check-in poll ${s.qn} of ${s.qtotal}` : `Poll ${s.qn} of ${s.qtotal}`;
    if (s.stage === 'slide') return s.slide && s.slide.type === 'qa' ? 'Live Q&A' : s.slide && s.slide.type === 'tug' ? 'Tug of war' : s.slide && s.slide.type === 'kudos' ? 'Kudos wall' : 'Slide';
    return KIND[s.stage] || s.stage;
  }

  function mountNotes(rootEl, T) {
    document.title = 'Presenter view';
    document.body.classList.add('notes-mode');
    rootEl.innerHTML = `
      <div class="nv">
        <div class="nv-head">
          <header class="nv-top">
            <b>Presenter view</b>
            <span id="nvPos"></span>
            <span class="nv-sp"></span>
            <span id="nvStatus" class="nv-status"></span>
            <span class="nv-clock" title="Time since you opened this view (click to restart)"><small>Running</small><b id="nvRun">0:00</b></span>
            <span class="nv-clock"><small>Time</small><b id="nvNow"></b></span>
            <button id="nvGuide" class="nv-ghost">Guide</button>
          </header>
          <!-- the controls stay at the top while you scroll, so the phone or laptop works as a clicker -->
          <div class="nv-ctl">
            <button id="nvPrev" aria-label="Previous screen">← Back</button>
            <button id="nvReveal" class="nv-reveal" hidden></button>
            <button id="nvNextBtn" class="nv-go" aria-label="Next screen"><span>Next →</span><small id="nvNext"></small></button>
          </div>
        </div>
        <div class="nv-main">
          <section class="nv-now">
            <div class="nv-k">On the big screen now · <span id="nvKind"></span></div>
            <h1 id="nvTitle"></h1>
            <div class="nv-live" id="nvLive"></div>
            <div class="nv-k nv-k2">Your notes</div>
            <div class="nv-notes" id="nvNotes"></div>
          </section>
          <aside class="nv-side">
            <div class="nv-k">Jump to</div>
            <ol class="nv-list" id="nvList"></ol>
          </aside>
        </div>
      </div>`;
    const $ = id => document.getElementById(id);
    let latest = null, start = Date.now(), listKey = '';
    const help = root.PulseHelp ? PulseHelp.mount({ T, getState: () => latest }) : null;
    $('nvGuide').onclick = () => help && help.toggle();
    document.querySelector('.nv-clock').onclick = () => { start = Date.now(); tick(); };

    function act(a, arg) {
      if (!T.canControl) { $('nvStatus').textContent = T.controlHint || 'Enter the presenter key to control the show'; return; }
      if (a === 'reveal' && latest && latest.tug) { if (!['countdown', 'go'].includes(latest.tug.phase)) T.act('tug', 'start'); return; }
      if (a === 'reveal') a = latest && latest.revealed ? 'conceal' : 'reveal';
      T.act(a, arg);
    }
    $('nvPrev').onclick = () => act('prev');
    $('nvNextBtn').onclick = () => act('next');
    $('nvReveal').onclick = () => act('reveal');
    $('nvList').onclick = e => { const li = e.target.closest('li[data-i]'); if (li) act('goto', Number(li.dataset.i)); };

    const two = n => String(n).padStart(2, '0');
    function tick() {
      const sec = Math.floor((Date.now() - start) / 1000);
      $('nvRun').textContent = `${Math.floor(sec / 60)}:${two(sec % 60)}`;
      const d = new Date();
      $('nvNow').textContent = `${two(d.getHours())}:${two(d.getMinutes())}`;
      if (latest && latest.stage === 'question' && !latest.revealed && latest.timerTotal) liveInfo(latest);
    }
    setInterval(tick, 1000); tick();

    let timerBase = 0, timerAt = 0;
    function liveInfo(s) {
      const parts = [];
      if (s.stage === 'question') {
        const n = s.stats.n;
        parts.push(`<span><b>${n}</b> vote${n === 1 ? '' : 's'}</span>`);
        if (!s.revealed && s.timerTotal) { const left = Math.max(0, Math.ceil((timerBase - (Date.now() - timerAt)) / 1000)); parts.push(`<span><b>${left}</b> s left</span>`); }
        parts.push(`<span>${s.revealed ? 'Results shown' : 'Results hidden'}</span>`);
        if (s.revealed && s.stats.n) parts.push(`<span>Top: <b>${esc(plain(s.stats.top))}</b> (${s.stats.topPct}%)</span>`);
      } else if (s.stage === 'lobby') parts.push(`<span><b>${s.connected || 0}</b> phones connected</span>`);
      else if (s.tug) parts.push(`<span>Phase: <b>${esc(s.tug.phase || 'ready')}</b></span>`, `<span>Players <b>${s.tug.players[0]}</b> vs <b>${s.tug.players[1]}</b></span>`, `<span>Pulls <b>${s.tug.taps[0]}</b> vs <b>${s.tug.taps[1]}</b></span>`);
      else if (s.kudos) parts.push(`<span><b>${s.kudos.length}</b> kudos</span>`, ...s.kudos.slice(0, 3).map(k => `<span class="nv-q">For ${esc(k.to)} · ${esc(k.text)}</span>`));
      else if (s.qa) parts.push(`<span><b>${s.qa.length}</b> question${s.qa.length === 1 ? '' : 's'}</span>`, ...s.qa.slice(0, 3).map(x => `<span class="nv-q">▲ ${x.votes} · ${esc(x.text)}</span>`));
      else if (s.participants != null) parts.push(`<span><b>${s.participants}</b> people have voted so far</span>`);
      $('nvLive').innerHTML = parts.join('');
    }

    function render(s) {
      latest = s;
      if (s.stage === 'question') { timerBase = s.timeLeft || 0; timerAt = Date.now(); }
      $('nvPos').textContent = `Screen ${s.index + 1} of ${s.stepCount}${s.extra ? ' · February check-in' : ''}`;
      $('nvKind').textContent = kindOf(s);
      $('nvTitle').textContent = plain(titleOf(s));
      $('nvNotes').innerHTML = s.notes ? esc(s.notes).replace(/\[([^\]]*)\]/g, '<span class="ph">[$1]</span>').replace(/\n/g, '<br>') : '<span class="nv-empty">No notes for this screen. Add them as "notes" in the running order.</span>';
      $('nvNext').textContent = s.next ? 'then: ' + s.next : 'End of this part of the show';
      $('nvReveal').hidden = s.stage !== 'question' && !s.tug;
      $('nvReveal').innerHTML = (s.tug ? (s.tug.phase === 'done' ? 'Rematch' : 'Start the tug of war') : s.revealed ? 'Hide results' : s.question && s.question.type === 'award' ? 'Reveal the winner' : 'Reveal results') + '<span class="nv-kbd"> (H)</span>';
      liveInfo(s);
      // the running order, built once from the content
      const steps = T.config ? PulseCore.steps(T.config) : null;
      if (steps) {
        const key = steps.length + ':' + s.index;
        if (key !== listKey) {
          listKey = key;
          $('nvList').innerHTML = steps.map((st, i) => `<li data-i="${i}" class="${i === s.index ? 'on' : ''} ${st.extra ? 'extra' : ''}" tabindex="0">${i + 1}. ${esc(PulseCore.navLabel(T.config, st))}</li>`).join('');
          // scroll only the list itself, never the page, so the controls and notes stay where they are
          const L = $('nvList'), on = L.querySelector('.on');
          if (on && L.scrollHeight > L.clientHeight + 2) L.scrollTop = Math.max(0, on.offsetTop - L.clientHeight / 2);
        }
      }
    }
    if (!T.config && T.loadConfig) T.loadConfig().then(() => latest && render(latest));

    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      const k = e.key.toLowerCase();
      if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); return help && help.toggle(); }
      if (help && help.isOpen()) { if (k === 'escape') help.close(); return; }
      if (['arrowright', ' ', 'pagedown'].includes(k)) { e.preventDefault(); act('next'); }
      else if (['arrowleft', 'pageup'].includes(k)) act('prev');
      else if (k === 'h' && latest && (latest.stage === 'question' || latest.tug)) act('reveal');
      else if (k === 'enter' && e.target.closest && e.target.closest('li[data-i]')) act('goto', Number(e.target.closest('li[data-i]').dataset.i));
    });
    T.onStatus = msg => ($('nvStatus').textContent = msg || '');
    T.subscribe(render, null);
  }

  root.mountNotes = mountNotes;
})(typeof self !== 'undefined' ? self : this);
