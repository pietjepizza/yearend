// Participant (phone) view. mountJoin(rootElement, transport).
(function (root) {
  const LANES = ['#5fb8ff', '#3b6fff', '#8fd3ff', '#8f7bff', '#2fc6e0', '#a9b8ff'];
  const moodOf = (o, i) => (typeof o.score === 'number' ? Math.max(3, o.score) : [5, 4, 5, 4, 5, 4][i % 6]);

  const SHELL = `
  <div class="app">
    <div class="app-backdrop" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="app-bar"><canvas class="bar-snow" id="barSnow" aria-hidden="true"></canvas><span class="me" id="me"></span><span class="step" id="step"></span></div>
    <div class="tbar" id="tbar" hidden><i id="tfill"></i></div>
    <main class="app-main">
      <section id="lobby" class="done" hidden>
        <div class="hero" id="heroLobby"></div>
        <h2>You're in!</h2>
        <p>Your secret player name is <b id="myName"></b>. Look for it on the big screen!</p>
        <div class="react">
          <div class="react-h">Warm up the room</div>
          <div class="react-s">Tap a reaction as often as you like</div>
          <div class="react-row"></div>
        </div>
      </section>

      <section id="pick" hidden>
        <div class="anon st" style="--i:0"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>Anonymous: nobody sees who answered what</div>
        <div><span class="q-k st" style="--i:0" id="qk"></span></div>
        <h1 class="q-t st" style="--i:1" id="qt"></h1>
        <p class="q-ctx st" style="--i:1" id="qctx" hidden></p>
        <div class="opts" id="opts" role="radiogroup"></div>
        <div class="field st" id="wordField">
          <label for="word" id="wordLabel">One word (optional)</label>
          <input id="word" maxlength="24" autocomplete="off" autocapitalize="off" enterkeyhint="done">
          <div class="note-s">Your word floats onto the big screen.</div>
        </div>
        <p class="err" id="err" hidden></p>
      </section>

      <section id="done" class="done" hidden>
        <div class="hero" id="heroDone"></div>
        <h2>Locked in!</h2>
        <p>Watch your answer race across the big screen. The next question pops up here by itself.</p>
        <div class="chosen" id="chosen"></div>
        <button class="link" id="change">Change my answer</button>
        <div class="react">
          <div class="react-h">Cheer the race on</div>
          <div class="react-s">Tap as often as you like</div>
          <div class="react-row"></div>
        </div>
        <div class="waiting-note"><i></i>Waiting for the next question</div>
      </section>

      <section id="wrap" class="done" hidden>
        <div class="hero" id="heroWrap"></div>
        <h2>Look up!</h2>
        <p>The results and the road ahead are on the big screen now. Thanks for playing!</p>
        <div class="react">
          <div class="react-h">Give the team some love</div>
          <div class="react-s">Tap as often as you like</div>
          <div class="react-row"></div>
        </div>
      </section>

      <section id="cheer" class="done" hidden>
        <h2 class="yes-p">YES WE CAN!</h2>
        <p>Make some noise for the team!</p>
        <button class="cheer-btn" id="cheerBtn"><span>🙌</span>CHEER!</button>
        <p class="cheer-n"><b id="cheerN">0</b> cheers from you</p>
        <div class="react">
          <div class="react-row"></div>
        </div>
      </section>
    </main>
    <div class="cta-wrap" id="ctaWrap" hidden><button class="cta" id="send" disabled>Lock it in!</button></div>
  </div>
  <canvas id="confetti" aria-hidden="true"></canvas>`;

  function mountJoin(rootEl, T) {
    rootEl.innerHTML = SHELL;
    const $ = id => document.getElementById(id);
    new FX.Snow($('barSnow'), { rgb: '255,255,255', intensity: 3 });
    const confetti = new FX.Confetti($('confetti'));
    const me = T.me || { a: 0, n: 0, c: 1 };
    const myColor = LANES[me.c % LANES.length];
    const myName = PulseCore.playerName(me);
    const myInitials = myName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    $('me').innerHTML = `${orbText(myColor, myInitials)}<span></span>`;
    $('me').lastChild.textContent = myName;
    $('myName').textContent = myName;
    for (const id of ['heroLobby', 'heroDone', 'heroWrap']) $(id).innerHTML = orbText(myColor, myInitials);

    let s = null, current = null, choice = null, editing = false, reactionsBuilt = false, shown = null, cheers = 0;

    function show(which) {
      for (const k of ['lobby', 'pick', 'done', 'wrap', 'cheer']) $(k).hidden = k !== which;
      $('ctaWrap').hidden = which !== 'pick';
      if (which !== shown) {
        shown = which;
        const sec = $(which);
        sec.classList.remove('in'); void sec.offsetWidth; sec.classList.add('in');
        scrollTo(0, 0);
        if (which === 'cheer') { confetti.burst('cannons'); setTimeout(() => confetti.burst('top'), 1200); }
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
      if (now - lastReact < 260) return false;
      lastReact = now;
      btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
      const rect = btn.getBoundingClientRect(), f = document.createElement('div');
      f.className = 'mini-float'; f.textContent = r;
      f.style.left = rect.left + rect.width / 2 - 15 + 'px'; f.style.top = rect.top - 10 + 'px';
      document.body.appendChild(f); setTimeout(() => f.remove(), 900);
      if (navigator.vibrate) navigator.vibrate(8);
      T.react(r);
      return true;
    }
    $('cheerBtn').onclick = () => {
      const list = (s && s.reactions) || ['👏'];
      if (!react(list[cheers % list.length], $('cheerBtn'))) return;
      cheers++; $('cheerN').textContent = cheers;
      if (cheers % 5 === 0) { const b = $('cheerBtn').getBoundingClientRect(); confetti.burst('point', { x: b.left + b.width / 2, y: b.top }); }
    };

    // countdown bar
    let deadline = 0, total = 0, tOn = false;
    function timer(left, tot) {
      if (left > 0) {
        deadline = performance.now() + left; total = tot || left; $('tbar').hidden = false;
        if (!tOn) { tOn = true; requestAnimationFrame(tick); }
      } else { tOn = false; $('tbar').hidden = true; }
    }
    function tick() {
      if (!tOn) return;
      const rem = Math.max(0, deadline - performance.now());
      $('tfill').style.transform = `scaleX(${(rem / total).toFixed(4)})`;
      $('tbar').classList.toggle('hurry', rem < 5500);
      if (rem <= 0) { tOn = false; $('tbar').hidden = true; return; }
      requestAnimationFrame(tick);
    }

    function render() {
      buildReactions(s.reactions);
      const steps = s.total;
      timer(s.stage === 'question' && !s.revealed ? s.timeLeft : 0, s.timerTotal);
      if (s.stage === 'lobby') { $('step').textContent = 'Lobby'; return show('lobby'); }
      if (s.stage === 'finale') { $('step').textContent = 'Finale'; return show('cheer'); }
      if (s.stage !== 'question') { $('step').textContent = 'Done!'; return show('wrap'); }

      const q = s.question;
      $('step').textContent = `Q${s.index + 1} of ${steps}`;
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
          b.className = 'opt st'; b.style.setProperty('--i', i + 2); b.style.setProperty('--c', LANES[i % LANES.length]); b.dataset.id = o.id;
          b.setAttribute('role', 'radio');
          b.innerHTML = `${orbIcon(LANES[i % LANES.length], o.icon)}<span class="l"></span><span class="radio"></span>`;
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
        const i = q.options.findIndex(x => x.id === s.mine.option), o = q.options[i];
        $('chosen').innerHTML = o ? `${orbIcon(LANES[i % LANES.length], o.icon)}<span></span>` : '';
        if (o) $('chosen').lastChild.textContent = o.label + (s.mine.word ? ` · “${s.mine.word}”` : '');
        show('done');
      } else show('pick');
    }
    function markChoice() {
      document.querySelectorAll('.opt').forEach(x => {
        const on = x.dataset.id === choice;
        x.classList.toggle('sel', on);
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
