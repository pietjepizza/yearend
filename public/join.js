// Participant (phone) view. mountJoin(rootElement, transport).
(function (root) {
  const SHELL = `
  <div class="app">
    <div class="app-bar"><canvas class="bar-snow" id="barSnow" aria-hidden="true"></canvas><span class="team" id="team">Mood Pulse</span><span class="step" id="step"></span></div>
    <div class="progress"><i id="prog" style="width:0"></i></div>
    <main class="app-main">
      <section id="lobby" class="done" hidden>
        <div class="lobby-pulse"><canvas id="lobbyPulse" aria-hidden="true"></canvas></div>
        <h2>You're in!</h2>
        <p>The first question appears here as soon as we start. Fully anonymous: no name, no login.</p>
        <div class="react st" style="--i:2">
          <div class="react-h">Warm up the big screen</div>
          <div class="react-s">Tap a reaction, as often as you like</div>
          <div class="react-row"></div>
        </div>
      </section>

      <section id="pick" hidden>
        <div class="anon st" style="--i:0"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>Anonymous: no name, no login</div>
        <div class="q-k st" style="--i:0" id="qk"></div>
        <h1 class="q-t st" style="--i:1" id="qt"></h1>
        <p class="q-ctx st" style="--i:1" id="qctx" hidden></p>
        <div class="opts" id="opts" role="radiogroup"></div>
        <div class="field st" id="wordField">
          <label for="word" id="wordLabel">One word (optional)</label>
          <input id="word" maxlength="24" autocomplete="off" autocapitalize="off" enterkeyhint="done">
          <div class="note-s">Your word joins the live word cloud on the big screen.</div>
        </div>
        <p class="err" id="err" hidden></p>
      </section>

      <section id="done" class="done" hidden>
        <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h2>Response recorded</h2>
        <p>Your answer is live on the big screen. The next question appears here automatically.</p>
        <div class="chosen" id="chosen"></div>
        <button class="link" id="change">Change my answer</button>
        <div class="react">
          <div class="react-h">Send a reaction to the big screen</div>
          <div class="react-s">Tap as often as you like</div>
          <div class="react-row"></div>
        </div>
        <div class="waiting-note"><i></i>Waiting for the next question</div>
      </section>

      <section id="wrap" class="done" hidden>
        <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h2>That's a wrap</h2>
        <p>Thank you for sharing your pulse. Look up: the summary is on the big screen now. Happy holidays!</p>
        <div class="react">
          <div class="react-h">Give the team a round of applause</div>
          <div class="react-s">Tap as often as you like</div>
          <div class="react-row"></div>
        </div>
      </section>
    </main>
    <div class="cta-wrap" id="ctaWrap" hidden><button class="cta" id="send" disabled>Submit response</button></div>
  </div>
  <canvas id="confetti" aria-hidden="true"></canvas>`;

  function mountJoin(rootEl, T) {
    rootEl.innerHTML = SHELL;
    const $ = id => document.getElementById(id);
    new FX.Snow($('barSnow'), { rgb: '255,255,255', intensity: 3 });
    const confetti = new FX.Confetti($('confetti'));
    let pulse = null;

    let s = null, current = null, choice = null, editing = false, reactionsBuilt = false, shown = null;

    function show(which) {
      for (const k of ['lobby', 'pick', 'done', 'wrap']) $(k).hidden = k !== which;
      $('ctaWrap').hidden = which !== 'pick';
      if (which !== shown) {
        shown = which;
        const sec = $(which);
        sec.classList.remove('in'); void sec.offsetWidth; sec.classList.add('in');
        if (which === 'lobby' && !pulse) pulse = new FX.PulseLine($('lobbyPulse'), { idle: 1100 });
      }
    }

    function buildReactions(list) {
      if (reactionsBuilt || !list) return;
      reactionsBuilt = true;
      for (const row of document.querySelectorAll('.react-row')) {
        list.forEach((r, i) => {
          const b = document.createElement('button');
          b.textContent = r; b.setAttribute('aria-label', 'React ' + r); b.style.setProperty('--k', i);
          b.onclick = () => react(r, b);
          row.appendChild(b);
        });
      }
    }
    let lastReact = 0;
    function react(r, btn) {
      const now = Date.now();
      if (now - lastReact < 260) return;
      lastReact = now;
      btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
      const rect = btn.getBoundingClientRect(), f = document.createElement('div');
      f.className = 'mini-float'; f.textContent = r;
      f.style.left = rect.left + rect.width / 2 - 14 + 'px'; f.style.top = rect.top - 10 + 'px';
      document.body.appendChild(f); setTimeout(() => f.remove(), 900);
      if (navigator.vibrate) navigator.vibrate(8);
      if (pulse) pulse.spike(.8);
      T.react(r);
    }

    function render() {
      $('team').textContent = s.team;
      buildReactions(s.reactions);
      const steps = s.total;
      if (s.stage === 'lobby') { $('step').textContent = 'Welcome'; $('prog').style.width = '0'; return show('lobby'); }
      if (s.stage === 'summary') { $('step').textContent = 'Done'; $('prog').style.width = '100%'; return show('wrap'); }
      $('prog').style.width = (s.index / steps) * 100 + '%';

      const q = s.question;
      $('step').textContent = `Question ${s.index + 1} of ${steps}`;
      $('qk').textContent = `Question ${s.index + 1}`;
      $('qt').textContent = q.title;
      $('qctx').hidden = !q.context; $('qctx').textContent = q.context || '';
      $('wordLabel').textContent = q.wordPrompt || 'One word (optional)';
      $('wordField').style.setProperty('--i', q.options.length + 2);
      if ($('opts').dataset.q !== String(s.index)) {
        $('opts').dataset.q = s.index;
        $('opts').innerHTML = '';
        q.options.forEach((o, i) => {
          const b = document.createElement('button');
          b.className = 'opt st'; b.style.setProperty('--i', i + 2); b.dataset.id = o.id;
          b.setAttribute('role', 'radio');
          b.innerHTML = `<span class="ic">${icon(o.icon)}</span><span class="l"></span><span class="radio"></span>`;
          b.querySelector('.l').textContent = o.label;
          b.onclick = () => {
            choice = o.id; markChoice();
            $('send').disabled = false; $('err').hidden = true;
            if (navigator.vibrate) navigator.vibrate(10);
          };
          $('opts').appendChild(b);
        });
      }
      markChoice();
      $('send').disabled = !choice;

      if (s.mine && !editing) {
        const o = q.options.find(x => x.id === s.mine.option);
        $('chosen').innerHTML = o ? `<span class="ic">${icon(o.icon)}</span><span></span>` : '';
        if (o) $('chosen').lastChild.textContent = o.label + (s.mine.word ? ` · “${s.mine.word}”` : '');
        show('done');
      } else show('pick');
    }
    function markChoice() {
      document.querySelectorAll('.opt').forEach(x => {
        const on = x.dataset.id === choice;
        if (on && !x.classList.contains('sel')) { x.classList.add('sel'); }
        else if (!on) x.classList.remove('sel');
        x.setAttribute('aria-checked', on);
      });
    }

    async function load() {
      s = await T.getState();
      if (current !== s.index) {
        choice = s.mine ? s.mine.option : null; editing = false;
        $('word').value = s.mine ? s.mine.word : '';
        current = s.index; scrollTo(0, 0);
      }
      render();
    }

    $('send').onclick = async () => {
      if (!choice) return;
      $('send').disabled = true;
      const rect = $('send').getBoundingClientRect();
      const res = await T.vote(current, choice, $('word').value);
      editing = false;
      if (res === 'moved') { $('err').textContent = 'The question just changed. Please answer the new one.'; $('err').hidden = false; }
      else if (res !== 'ok') { $('err').textContent = 'Your answer could not be saved. Check your connection and try again.'; $('err').hidden = false; $('send').disabled = false; return; }
      else confetti.burst('point', { x: rect.left + rect.width / 2, y: rect.top });
      await load();
    };
    $('change').onclick = () => { editing = true; render(); };

    T.subscribe(() => load(), null);
  }

  root.mountJoin = mountJoin;
})(typeof self !== 'undefined' ? self : this);
