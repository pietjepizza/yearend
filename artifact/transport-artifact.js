// Transport for the claude.ai test build.
// - Presenter state lives in the shared `db` document live/state (only editors can change it).
// - Each phone writes one anonymous document votes/<random token>; the presenter subscribes to them.
// - Reactions and "who is connected" travel over the live `room`.
// - Without db/room (signed out, or a local preview), tabs in the same browser sync via BroadcastChannel.
// - The presenter can also simulate a full room, so the whole flow can be tested alone.
(function (root) {
  root.ArtifactTransport = function (config, role, joinUrl) {
    const Core = root.PulseCore;
    const S = config.questions.length;
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    };
    let token = store.get('mp-id');
    if (!token) { token = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('mp-id', token); }
    let mine = null;
    try { mine = JSON.parse(store.get('mp-mine') || 'null'); } catch {}
    if (!mine || typeof mine !== 'object') mine = { epoch: null, answers: {} };

    const DEFAULT = { current: -1, revealed: true, hidden: [], epoch: 'e0', cleared: {}, rev: 0 };
    let control = { ...DEFAULT };
    let votes = {};                // token -> { epoch, answers: { [qi]: { option, word, ts } } }
    let phonesHere = 0, localPhones = new Map();
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
      return { current: control.current, revealed: control.revealed, hidden: control.hidden || [], responses };
    }
    const publicState = () => Core.publicState(config, stateObj(), { joinUrl, connected: phonesHere + (sim ? sim.connected : 0) });
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
          catch (e) { T.onStatus && T.onStatus(e && e.code === 'invalid_argument' ? 'Only editors of this page can control the presenter screen' : 'Could not save the presenter state, retrying on the next action'); }
        }
        if (bc) bc.postMessage({ t: 'control', control: snapshot });
      });
    }
    function act(a, word) {
      const c = { ...control, hidden: [...(control.hidden || [])], cleared: { ...(control.cleared || {}) } };
      if (a === 'next') c.current = Math.min(c.current + 1, S);
      else if (a === 'prev') c.current = Math.max(c.current - 1, -1);
      else if (a === 'reveal') c.revealed = !c.revealed;
      else if (a === 'hide') { const w = Core.norm(word); if (w && !c.hidden.includes(w)) c.hidden.push(w); }
      else if (a === 'unhide') c.hidden = [];
      else if (a === 'clear') { c.cleared[c.current] = Date.now(); if (sim) for (const b of Object.values(sim.answers)) delete b[c.current]; }
      else if (a === 'reset') { Object.assign(c, DEFAULT, { epoch: 'e' + Date.now().toString(36), rev: c.rev }); if (sim) { sim.answers = {}; } }
      else return;
      c.rev = (control.rev || 0) + 1;
      control = c;
      emit();
      writeControl();
    }

    // ---------- phone actions ----------
    async function vote(index, option, word) {
      if (index !== control.current) return 'moved';
      if (mine.epoch !== control.epoch) mine = { epoch: control.epoch, answers: {} };
      mine.answers[index] = { option, word: Core.clean(word, 24), ts: Date.now() };
      store.set('mp-mine', JSON.stringify(mine));
      const body = { epoch: mine.epoch, answers: mine.answers };
      if (db) {
        try { await db.doc('votes/' + token).set(body); }
        catch (e) { return 'error'; }
      }
      if (bc) bc.postMessage({ t: 'vote', token, v: body });
      return 'ok';
    }
    function react(r) {
      if (room) room.emit('react', { r }).catch(() => {});
      if (bc) bc.postMessage({ t: 'react', r });
    }
    function getState() {
      const s = publicState();
      s.mine = s.stage === 'question' && mine.epoch === control.epoch ? (mine.answers[control.current] && mine.answers[control.current].ts > ((control.cleared || {})[control.current] || 0) ? mine.answers[control.current] : null) : null;
      return Promise.resolve(s);
    }

    // ---------- same-browser fallback ----------
    if (bc) bc.onmessage = ({ data: m }) => {
      if (!m || typeof m !== 'object') return;
      if (role === 'host') {
        if (m.t === 'vote' && !db && m.v && typeof m.token === 'string') {
          const prev = votes[m.token], a = m.v.answers && m.v.answers[control.current], pa = prev && prev.answers && prev.answers[control.current];
          votes[m.token] = m.v;
          emit(a && (!pa || pa.ts !== a.ts) ? { pop: a.option } : {});
        }
        if (m.t === 'react' && !room && config.reactions.includes(m.r)) subs.react.forEach(f => f(m.r));
        if (m.t === 'here' && !room) { localPhones.set(m.token, Date.now()); countLocal(); }
        if (m.t === 'hello' && !db) bc.postMessage({ t: 'control', control });
      } else if (m.t === 'control' && !db && m.control) { control = { ...DEFAULT, ...m.control }; emit(); }
    };
    function countLocal() {
      const now = Date.now();
      for (const [k, t] of localPhones) if (now - t > 12000) localPhones.delete(k);
      if (localPhones.size !== phonesHere) { phonesHere = localPhones.size; emit(); }
    }
    if (bc && role === 'phone') { bc.postMessage({ t: 'hello' }); const here = () => bc.postMessage({ t: 'here', token }); here(); setInterval(here, 5000); }
    if (role === 'host') setInterval(() => { if (!room) countLocal(); }, 4000);

    // ---------- claude.ai capabilities ----------
    (async () => {
      const use = name => (root.claude && typeof root.claude.use === 'function' ? root.claude.use(name).catch(() => null) : Promise.resolve(null));
      const [dbNs, roomNs, user] = await Promise.all([use('db'), use('room'), use('user')]);
      db = dbNs; room = roomNs;
      if (role === 'host' && user && typeof user.canEdit === 'function') {
        try { const can = await user.canEdit(); if (can === false) { T.canControl = false; T.controlHint = 'Only editors of this page can control the presenter screen'; } } catch {}
      }
      if (db) {
        const timer = setTimeout(() => T.onStatus && T.onStatus('Waiting for the shared session data…'), 10000);
        db.doc('live/state').onSnapshot(snap => {
          clearTimeout(timer); T.onStatus && T.onStatus('');
          if (!snap.exists) return;
          const d = snap.data() || {};
          if (role === 'host' && (d.rev || 0) < (control.rev || 0)) return; // an older echo of our own writes
          control = { ...DEFAULT, ...d };
          emit();
        }, () => { clearTimeout(timer); });
        if (role === 'host') {
          let first = true;
          db.collection('votes').onSnapshot(qs => {
            let pop = null;
            for (const ch of qs.docChanges()) {
              if (ch.type === 'removed') { delete votes[ch.doc.id]; continue; }
              const d = ch.doc.data(), prev = votes[ch.doc.id];
              votes[ch.doc.id] = d;
              const a = d && d.answers && d.answers[control.current], pa = prev && prev.answers && prev.answers[control.current];
              if (a && d.epoch === control.epoch && (!pa || pa.ts !== a.ts)) pop = a.option;
            }
            emit(pop && !first ? { pop } : {});
            first = false;
          }, () => {});
        }
      } else if (role === 'host') {
        T.onStatus && T.onStatus('Test mode: phones in this browser only. Sign in to claude.ai to connect other devices.');
      }
      if (room) {
        if (role === 'host') room.on('react', msg => { const r = msg && msg.data && msg.data.r; if (config.reactions.includes(r)) subs.react.forEach(f => f(r)); }, () => {});
        if (role === 'phone') room.presence({ role: 'phone' }).catch(() => {});
        room.onPeers(ch => {
          const n = ch.peers.filter(p => p.presence && p.presence.role === 'phone').length;
          if (n !== phonesHere) { phonesHere = n; emit(); }
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
      const qi = control.current;
      if (qi >= 0 && qi < S && Math.random() < .62) {
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
      if (Math.random() < (qi >= S ? .5 : .14)) {
        const n = 1 + ((Math.random() * (qi >= S ? 4 : 2)) | 0);
        for (let i = 0; i < n; i++) setTimeout(() => subs.react.forEach(f => f(config.reactions[(Math.random() * config.reactions.length) | 0])), i * 140);
      }
    }
    function simulate(on) {
      if (on && !sim) { sim = { answers: {}, connected: 0, target: 36 + ((Math.random() * 12) | 0), timer: setInterval(simTick, 280) }; }
      else if (!on && sim) { clearInterval(sim.timer); sim = null; }
      emit();
      return !!sim;
    }

    const T = {
      joinUrl, joinLabel: joinUrl ? 'Scan with your phone camera' : 'Open this page with #join on your phone',
      canControl: true,
      controlHint: '',
      qrHtml: () => '',
      subscribe(onState, onReact) { subs.state.push(onState); if (onReact) subs.react.push(onReact); emit(); },
      act, vote, react, getState,
      simulate: role === 'host' ? simulate : undefined,
      simulating: () => !!sim,
    };
    return T;
  };
})(typeof self !== 'undefined' ? self : this);
