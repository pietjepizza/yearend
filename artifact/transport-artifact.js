// Transport for the claude.ai test build.
// - Presenter state lives in the shared `db` document live/state (only editors can change it).
// - Each phone writes one anonymous document votes/<random token>; the presenter subscribes to them.
// - Reactions and "who is connected" travel over the live `room`.
// - Without db/room (signed out, or a local preview), tabs in the same browser sync via BroadcastChannel.
// - The presenter can also simulate a full room, so the whole flow can be tested alone.
(function (root) {
  root.ArtifactTransport = function (config, role, joinUrl, opts = {}) {
    const sfx = opts.slot ? '-' + opts.slot : '';   // separate identities for several phones in one browser (simulator)
    const Core = root.PulseCore;
    const S = config.questions.length, LAST = Core.lastIndex(config);
    const qiNow = () => Core.qiAt(config, control.current);
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    };
    let token = store.get('mp-id' + sfx);
    if (!token) { token = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('mp-id' + sfx, token); }
    let mine = null;
    try { mine = JSON.parse(store.get('mp-mine' + sfx) || 'null'); } catch {}
    if (!mine || typeof mine !== 'object') mine = { epoch: null, answers: {} };
    let me = null;
    try { me = JSON.parse(store.get('mp-player' + sfx) || 'null'); } catch {}
    if (!me) { me = Core.makePlayer(); store.set('mp-player' + sfx, JSON.stringify(me)); }
    me = Core.cleanPlayer(me);

    const simVotes = () => sim ? Object.fromEntries(Object.entries(sim.answers).filter(([, a]) => a.ask).map(([b, a]) => [b, { epoch: control.epoch, answers: { ask: a.ask } }])) : {};
    const DEFAULT = { current: 0, revealedQ: {}, timerEnd: 0, hidden: [], epoch: 'e0', cleared: {}, rev: 0, qa: { done: [], hidden: [] } };
    const isQaStep = i => { const st = Core.steps(config)[Math.max(0, Math.min(LAST, i))]; return !!(st && st.slide && st.slide.type === 'qa'); };
    let control = { ...DEFAULT };
    let votes = {};                // token -> { epoch, answers: { [qi]: { option, word, ts } } }
    let phonesHere = 0, roomPlayers = [], localPhones = new Map();
    let db = null, room = null, sim = null;
    const subs = { state: [], react: [] };
    let bc = null;
    try { bc = new BroadcastChannel('mood-pulse-demo'); } catch {}

    // ---------- state ----------
    function stateObj() {
      const responses = {}, cleared = control.cleared || {};
      const add = (tok, qi, a) => { if (a && a.ts > (cleared[qi] || 0)) (responses[qi] ||= {})[tok] = a; };
      for (const [tok, v] of Object.entries(votes)) {
        if (!v || v.epoch !== control.epoch) continue;
        for (const [qi, a] of Object.entries(v.answers || {})) add(tok, qi, a);
      }
      if (sim) for (const [bot, ans] of Object.entries(sim.answers)) for (const [qi, a] of Object.entries(ans)) add(bot, qi, a);
      return { current: control.current, revealedQ: control.revealedQ || {}, timerEnd: control.timerEnd || 0, hidden: control.hidden || [], qa: control.qa || DEFAULT.qa, responses };
    }
    const publicState = () => Core.publicState(config, stateObj(), {
      joinUrl, connected: phonesHere + (sim ? sim.connected : 0),
      players: [...roomPlayers, ...(sim ? sim.players.slice(0, sim.connected) : [])].slice(-80),
    });
    let emitQueued = false, pendingPop = null;
    function emit(meta = {}) {
      if (meta.pop) pendingPop = meta.pop;
      if (emitQueued) return;
      emitQueued = true;
      queueMicrotask(() => {
        emitQueued = false;
        const s = publicState(), m = pendingPop ? { pop: pendingPop } : {};
        pendingPop = null;
        subs.state.forEach(f => f(s, m));
      });
    }

    // ---------- presenter actions ----------
    let writing = Promise.resolve();
    function writeControl() {
      const snapshot = { ...control };
      writing = writing.then(async () => {
        if (db) {
          try { await db.doc('live/state').set(snapshot); }
          catch (e) { T.onStatus && T.onStatus(e && e.code === 'invalid_argument' ? (opts.controlHint || 'Only editors of this page can control the presenter screen') : 'Could not save the presenter state, retrying on the next action'); }
        }
        if (bc) bc.postMessage({ t: 'control', control: snapshot });
      });
    }
    function act(a, word) {
      const c = { ...control, hidden: [...(control.hidden || [])], cleared: { ...(control.cleared || {}) }, revealedQ: { ...(control.revealedQ || {}) } };
      if (a === 'next') Core.enter(config, c, Core.nextIndex(config, c.current));
      else if (a === 'prev') Core.enter(config, c, Core.prevIndex(config, c.current));
      else if (a === 'goto') Core.enter(config, c, Number(word) || 0);
      else if (a === 'reveal') { const qi = Core.qiAt(config, c.current); if (qi >= 0) c.revealedQ[qi] = true; c.timerEnd = 0; }
      else if (a === 'conceal') { delete c.revealedQ[Core.qiAt(config, c.current)]; c.timerEnd = 0; }
      else if (a === 'hide') { const w = Core.norm(word); if (w && !c.hidden.includes(w)) c.hidden.push(w); }
      else if (a === 'unhide') c.hidden = [];
      else if (a === 'qa') {
        // word = "done:<id>" (mark answered), "hide:<id>" (remove) or "undo:<id>"
        const [what, id] = String(word || '').split(':');
        const qa = { done: [...((c.qa && c.qa.done) || [])], hidden: [...((c.qa && c.qa.hidden) || [])] };
        qa.done = qa.done.filter(x => x !== id); qa.hidden = qa.hidden.filter(x => x !== id);
        if (what === 'done') qa.done.push(id); else if (what === 'hide') qa.hidden.push(id);
        c.qa = what === 'reset' ? { done: [], hidden: [] } : qa;
      }
      else if (a === 'clear') { const qi = Core.qiAt(config, c.current); if (qi < 0) return; c.cleared[qi] = Date.now(); delete c.revealedQ[qi]; Core.enter(config, c, c.current); if (sim) for (const b of Object.values(sim.answers)) delete b[qi]; }
      else if (a === 'reset') { Object.assign(c, DEFAULT, { epoch: 'e' + Date.now().toString(36), rev: c.rev }); if (sim) { sim.answers = {}; } }
      else return;
      c.rev = (control.rev || 0) + 1;
      control = c;
      emit();
      writeControl();
    }

    // ---------- phone actions ----------
    async function vote(index, option, word) {
      const qi = qiNow();
      if (index !== control.current || qi < 0) return 'moved';
      if (mine.epoch !== control.epoch) mine = { epoch: control.epoch, answers: {} };
      mine.answers[qi] = { option, word: Core.clean(word, 24), ts: Date.now() };
      store.set('mp-mine' + sfx, JSON.stringify(mine));
      const body = { epoch: mine.epoch, answers: mine.answers };
      if (db) {
        try { await db.doc('votes/' + token).set(body); }
        catch (e) { return 'error'; }
      }
      if (bc) bc.postMessage({ t: 'vote', token, v: body });
      return 'ok';
    }
    // Q&A: a phone keeps its own questions and upvotes under answers.ask, written like a vote.
    async function saveMine() {
      const body = { epoch: mine.epoch, answers: mine.answers };
      store.set('mp-mine' + sfx, JSON.stringify(mine));
      if (db) { try { await db.doc('votes/' + token).set(body); } catch (e) { return 'error'; } }
      if (bc) bc.postMessage({ t: 'vote', token, v: body });
      votes[token] = body;
      emit();
      return 'ok';
    }
    function myAsk() {
      if (mine.epoch !== control.epoch) mine = { epoch: control.epoch, answers: {} };
      const a = mine.answers.ask || { q: [], up: [] };
      return { q: [...(a.q || [])], up: [...(a.up || [])] };
    }
    async function ask(text) {
      const t = Core.clean(text, 140);
      if (t.length < 3) return 'short';
      const a = myAsk();
      if (a.q.length >= 3) return 'limit';
      a.q.push({ id: 'q' + Math.random().toString(36).slice(2, 9), text: t, ts: Date.now() });
      mine.answers.ask = { ...a, ts: Date.now() };
      return saveMine();
    }
    async function upvote(id, on) {
      const a = myAsk();
      a.up = a.up.filter(x => x !== id);
      if (on) a.up.push(id);
      mine.answers.ask = { ...a, ts: Date.now() };
      return saveMine();
    }
    function react(r) {
      if (room) room.emit('react', { r }).catch(() => {});
      if (bc) bc.postMessage({ t: 'react', r });
    }
    function getState() {
      const s = publicState();
      const qi = s.qi, a = mine.answers[qi];
      s.mine = s.stage === 'question' && mine.epoch === control.epoch && a && a.ts > ((control.cleared || {})[qi] || 0) ? a : null;
      s.mineAsk = mine.epoch === control.epoch ? mine.answers.ask || null : null;
      return Promise.resolve(s);
    }

    // ---------- same-browser fallback ----------
    if (bc) bc.onmessage = ({ data: m }) => {
      if (!m || typeof m !== 'object') return;
      if (role === 'host') {
        if (m.t === 'vote' && !db && m.v && typeof m.token === 'string') {
          const prev = votes[m.token], a = m.v.answers && m.v.answers[qiNow()], pa = prev && prev.answers && prev.answers[qiNow()];
          votes[m.token] = m.v;
          emit(a && (!pa || pa.ts !== a.ts) ? { pop: a.option } : {});
        }
        if (m.t === 'react' && !room && config.reactions.includes(m.r)) subs.react.forEach(f => f(m.r));
        if (m.t === 'here' && !room) { localPhones.set(m.token, { t: Date.now(), p: Core.cleanPlayer(m.p) }); countLocal(); }
        if (m.t === 'hello' && !db) { bc.postMessage({ t: 'control', control }); bc.postMessage({ t: 'votes', votes: { ...votes, ...simVotes() } }); }
        // a second presenter window (the presenter view) on this computer: follow it at once
        if (m.t === 'control' && m.control && (m.control.rev || 0) > (control.rev || 0)) { control = { ...DEFAULT, ...m.control }; emit(); }
      } else {
        if (m.t === 'control' && !db && m.control) { control = { ...DEFAULT, ...m.control }; emit(); }
        if (m.t === 'vote' && !db && m.v && typeof m.token === 'string') { votes[m.token] = m.v; emit(); }
        if (m.t === 'votes' && !db && m.votes && typeof m.votes === 'object') { Object.assign(votes, m.votes); emit(); }
      }
    };
    function countLocal() {
      const now = Date.now();
      for (const [k, v] of localPhones) if (now - v.t > 12000) localPhones.delete(k);
      const list = [...localPhones.values()].map(v => v.p);
      if (list.length !== phonesHere || JSON.stringify(list) !== JSON.stringify(roomPlayers)) { phonesHere = list.length; roomPlayers = list; emit(); }
    }
    if (bc && role === 'phone') { bc.postMessage({ t: 'hello' }); const here = () => bc.postMessage({ t: 'here', token, p: me }); here(); setInterval(here, 5000); }
    if (role === 'host') setInterval(() => { if (!room) countLocal(); }, 4000);

    // ---------- the votes: always for the presenter, only on the Q&A screen for phones ----------
    let unwatch = null, firstVotes = true;
    function watchVotes(on) {
      if (!db || on === !!unwatch) return;
      if (!on) { try { unwatch(); } catch {} unwatch = null; votes = {}; return; }
      firstVotes = true;
      unwatch = db.collection('votes').onSnapshot(qs => {
        let pop = null;
        for (const ch of qs.docChanges()) {
          if (ch.type === 'removed') { delete votes[ch.doc.id]; continue; }
          const d = ch.doc.data(), prev = votes[ch.doc.id];
          votes[ch.doc.id] = d;
          const a = d && d.answers && d.answers[qiNow()], pa = prev && prev.answers && prev.answers[qiNow()];
          if (a && a.option && d.epoch === control.epoch && (!pa || pa.ts !== a.ts)) pop = a.option;
        }
        emit(pop && !firstVotes ? { pop } : {});
        firstVotes = false;
      }, () => {}) || (() => {});
    }

    // ---------- claude.ai capabilities ----------
    (async () => {
      const use = name => (!opts.local && root.claude && typeof root.claude.use === 'function' ? root.claude.use(name).catch(() => null) : Promise.resolve(null));
      const [dbNs, roomNs, user] = opts.backend ? [opts.backend.db, opts.backend.room, opts.backend.user] : await Promise.all([use('db'), use('room'), use('user')]);
      db = dbNs; room = roomNs;
      if (role === 'host' && user && typeof user.canEdit === 'function') {
        try { const can = await user.canEdit(); if (can === false) { T.canControl = false; T.controlHint = opts.controlHint || 'Only editors of this page can control the presenter screen'; } } catch {}
      }
      if (db) {
        const timer = setTimeout(() => T.onStatus && T.onStatus('Waiting for the shared session data…'), 10000);
        db.doc('live/state').onSnapshot(snap => {
          clearTimeout(timer); T.onStatus && T.onStatus('');
          if (!snap.exists) return;
          const d = snap.data() || {};
          if (role === 'host' && (d.rev || 0) < (control.rev || 0)) return; // an older echo of our own writes
          control = { ...DEFAULT, ...d };
          if (role === 'phone') watchVotes(isQaStep(control.current));
          emit();
        }, () => { clearTimeout(timer); });
        watchVotes(role === 'host');
      } else if (role === 'host') {
        if (!opts.local) T.onStatus && T.onStatus('Test mode: phones in this browser only. Sign in to claude.ai to connect other devices.');
        if (bc) setTimeout(() => bc.postMessage({ t: 'control', control }), 300);
      }
      if (room) {
        if (role === 'host') room.on('react', msg => { const r = msg && msg.data && msg.data.r; if (config.reactions.includes(r)) subs.react.forEach(f => f(r)); }, () => {});
        if (role === 'phone') room.presence({ role: 'phone', p: me }).catch(() => {});
        room.onPeers(ch => {
          const phones = ch.peers.filter(p => p.presence && p.presence.role === 'phone');
          phonesHere = phones.length;
          roomPlayers = phones.map(p => Core.cleanPlayer(p.presence.p));
          emit();
        }, () => {});
      }
      emit();
    })();

    // ---------- room simulator (presenter only) ----------
    function weighted(q) {
      const w = (q.demo && q.demo.weights) || q.options.map(() => 1);
      const total = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < q.options.length; i++) { r -= w[i] || 0; if (r < 0) return q.options[i].id; }
      return q.options[0].id;
    }
    function simTick() {
      if (!sim) return;
      if (sim.connected < sim.target && Math.random() < .7) { sim.connected += Math.random() < .3 ? 2 : 1; emit(); }
      const qi = qiNow(), stage = Core.steps(config)[Math.max(0, Math.min(LAST, control.current))].kind;
      if (qi >= 0 && Math.random() < .62) {
        const q = config.questions[qi];
        const open = [];
        for (let k = 0; k < sim.connected; k++) if (!(sim.answers['bot' + k] || {})[qi]) open.push(k);
        if (open.length) {
          const k = open[(Math.random() * open.length) | 0], words = (q.demo && q.demo.words) || [];
          const option = weighted(q);
          (sim.answers['bot' + k] ||= {})[qi] = { option, word: words.length && Math.random() < .68 ? words[(Math.random() * words.length) | 0] : '', ts: Date.now() };
          emit({ pop: option });
        }
      }
      if (isQaStep(control.current) && Math.random() < .35) {
        const demo = (Core.steps(config)[control.current].slide.demo) || [];
        const k = (Math.random() * sim.connected) | 0, bot = (sim.answers['bot' + k] ||= {});
        const a = bot.ask || { q: [], up: [], ts: 0 };
        const all = Object.values(sim.answers).flatMap(b => (b.ask && b.ask.q) || []);
        const unused = demo.filter(t => !all.some(x => x.text === t));
        if (unused.length && Math.random() < .3 && !a.q.length) a.q = [{ id: 'q' + Math.random().toString(36).slice(2, 9), text: unused[0], ts: Date.now() }];
        else if (all.length) { const pick = all[Math.min(all.length - 1, (Math.random() ** 1.6 * all.length) | 0)]; if (!a.up.includes(pick.id)) a.up = [...a.up, pick.id]; }
        bot.ask = { ...a, ts: Date.now() };
        if (bc) bc.postMessage({ t: 'votes', votes: simVotes() });
        emit();
      }
      const party = stage === 'finale' || stage === 'recap';
      if (Math.random() < (party ? .5 : qi >= 0 ? .14 : .08)) {
        const n = 1 + ((Math.random() * (party ? 4 : 2)) | 0);
        for (let i = 0; i < n; i++) setTimeout(() => subs.react.forEach(f => f(config.reactions[(Math.random() * config.reactions.length) | 0])), i * 140);
      }
    }
    const SPEED = { calm: 650, normal: 280, busy: 110 };
    function simulate(on, o = {}) {
      if (on) {
        const target = o.size || (sim ? sim.target : 36 + ((Math.random() * 12) | 0));
        if (!sim) sim = { answers: {}, connected: 0, target, players: [] };
        sim.target = target;
        while (sim.players.length < target) sim.players.push(Core.makePlayer());
        if (sim.connected > target) sim.connected = target;
        clearInterval(sim.timer);
        sim.timer = setInterval(simTick, SPEED[o.speed] || sim.interval || SPEED.normal);
        if (o.speed) sim.interval = SPEED[o.speed];
      }
      else if (sim) { clearInterval(sim.timer); sim = null; }
      emit();
      return !!sim;
    }
    const simReact = r => subs.react.forEach(f => f(r));

    const T = {
      me,
      joinUrl, joinLabel: joinUrl ? 'Scan with your phone camera' : 'Open this page with #join on your phone',
      canControl: true,
      controlHint: '',
      qrHtml: () => '',
      subscribe(onState, onReact) { subs.state.push(onState); if (onReact) subs.react.push(onReact); emit(); },
      act, vote, react, getState, ask, upvote,
      config,
      summary: () => Core.summary(config, stateObj()),
      simulate: role === 'host' && !opts.noSim ? simulate : undefined,
      simulating: () => !!sim,
      simReact: role === 'host' ? simReact : undefined,
    };
    return T;
  };
})(typeof self !== 'undefined' ? self : this);
