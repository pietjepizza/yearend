// Shared survey logic, used by the Node server and by the browser-only demo.
// state = { current, revealedQ: { [questionIndex]: true }, timerEnd, hidden: [word],
//           responses: { [questionIndex]: { [anonToken]: { option, word, ts } } } }
// current: a position in the running order (see steps()).
(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.PulseCore = core;
})(typeof self !== 'undefined' ? self : this, function () {
  // Anonymous player names: phones send three small numbers; the name is built from these lists,
  // so nobody can put arbitrary text on the big screen.
  const ADJ = ['Captain', 'Turbo', 'Agent', 'Sir', 'Lady', 'Mighty', 'Jolly', 'Cosmic', 'Speedy', 'Professor', 'Doctor', 'Super', 'Lucky', 'Sparkly', 'Mega', 'Chief'];
  const NOUN = ['Accrual', 'Ledger', 'Spreadsheet', 'Invoice', 'Pivot Table', 'Balance Sheet', 'Audit Trail', 'Forecast', 'Debit', 'Credit', 'VLOOKUP', 'Cash Flow', 'Budget', 'Journal Entry', 'Macro', 'Year-End'];
  const COLORS = 6;
  const int = (v, max) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < max ? n : 0; };
  const makePlayer = () => ({ a: (Math.random() * ADJ.length) | 0, n: (Math.random() * NOUN.length) | 0, c: (Math.random() * COLORS) | 0 });
  const cleanPlayer = p => ({ a: int(p && p.a, ADJ.length), n: int(p && p.n, NOUN.length), c: int(p && p.c, COLORS) });
  const playerName = p => `${ADJ[int(p && p.a, ADJ.length)]} ${NOUN[int(p && p.n, NOUN.length)]}`;

  const norm = w => String(w || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const clean = (s, n) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

  function fill(text, stats) {
    return text.replace(/\{(\w+)\}/g, (_, k) => (stats[k] ?? ''));
  }

  // Headlines are chosen by outcome, so every result is framed constructively.
  function pickTakeaway(q, stats) {
    if (!stats.n) return null;
    const list = q.takeaways || [{ text: q.takeaway || 'Most chosen: “{top}” ({topPct}%)' }];
    const hit = list.find(t =>
      (t.minTopBox == null || (stats.topBox ?? -1) >= t.minTopBox) &&
      (t.minAvg == null || (stats.avg ?? -1) >= t.minAvg)) || list[list.length - 1];
    return fill(hit.text, stats);
  }

  function analyse(q, byToken, hidden) {
    const hide = new Set((hidden || []).map(norm));
    const answers = Object.values(byToken || {});
    const counts = Object.fromEntries(q.options.map(o => [o.id, 0]));
    const words = {};
    let scoreSum = 0, scored = 0, topBoxN = 0;
    for (const a of answers) {
      const opt = q.options.find(o => o.id === a.option);
      if (!opt) continue;
      counts[opt.id]++;
      if (typeof opt.score === 'number') { scoreSum += opt.score; scored++; if (opt.score >= 4) topBoxN++; }
      const w = norm(a.word);
      if (w && !hide.has(w)) words[w] = (words[w] || 0) + 1;
    }
    const n = Object.values(counts).reduce((x, y) => x + y, 0);
    const top = q.options.reduce((best, o) => (counts[o.id] > counts[best.id] ? o : best), q.options[0]);
    const stats = {
      n,
      avg: scored ? +(scoreSum / scored).toFixed(1) : null,
      topBox: scored ? Math.round((100 * topBoxN) / scored) : null,
      top: n ? top.label : null,
      topId: n ? top.id : null,
      topPct: n ? Math.round((100 * counts[top.id]) / n) : 0,
    };
    return { counts, words, stats, takeaway: pickTakeaway(q, stats) };
  }

  function recentWords(byToken, hidden, max = 14) {
    const hide = new Set((hidden || []).map(norm));
    return Object.values(byToken || {})
      .filter(a => a.word && !hide.has(norm(a.word)))
      .sort((a, b) => b.ts - a.ts).slice(0, max).map(a => a.word);
  }

  // The running order. config.show lists every screen of the all-hands (slides, polls, recap, roadmap,
  // finale). Without it: lobby, then each question, then the outro screens.
  // state.current is a position in this list; answers, reveals and clears are keyed by question index (qi).
  const SPECIAL = ['lobby', 'recap', 'roadmap', 'finale'];
  const cache = new WeakMap();
  function steps(config) {
    if (cache.has(config)) return cache.get(config);
    const Q = config.questions;
    const byId = {};
    Q.forEach((q, i) => { byId[q.id || String(i)] = i; });
    const list = Array.isArray(config.show)
      ? config.show.map(st => st.type === 'question' ? { kind: 'question', qi: st.question in byId ? byId[st.question] : Number(st.question), nav: st.nav }
        : SPECIAL.includes(st.type) ? { kind: st.type, nav: st.nav }
        : { kind: 'slide', slide: st, nav: st.nav })
      : [{ kind: 'lobby' }, ...Q.map((q, i) => ({ kind: 'question', qi: i })), ...(config.outro || ['recap', 'roadmap', 'finale']).map(k => ({ kind: k }))];
    const out = list.filter(st => st.kind !== 'question' || Q[st.qi]);
    cache.set(config, out);
    return out;
  }
  const lastIndex = config => steps(config).length - 1;
  const clampIndex = (config, i) => Math.max(0, Math.min(lastIndex(config), Number(i) || 0));
  const stepAt = (config, i) => steps(config)[clampIndex(config, i)];
  const qiAt = (config, i) => { const st = stepAt(config, i); return st && st.kind === 'question' ? st.qi : -1; };
  const navLabel = (config, st) => st.nav || (st.kind === 'question' ? 'Q' + (st.qi + 1)
    : st.kind === 'slide' ? (st.slide.title || st.slide.type) : { lobby: 'Lobby', recap: 'Recap', roadmap: 'Road ahead', finale: 'Finale' }[st.kind]);

  // Timer: entering an unrevealed question starts a countdown (state.timerEnd); revealedQ marks revealed questions.
  const timerMs = (config, q) => 1000 * (q && q.timer != null ? q.timer : (config.timer || 0));
  function enter(config, state, index, now = Date.now()) {
    state.current = clampIndex(config, index);
    const qi = qiAt(config, state.current), q = config.questions[qi];
    const revealed = !!(state.revealedQ || {})[qi];
    state.timerEnd = q && !revealed && timerMs(config, q) ? now + timerMs(config, q) : 0;
  }

  function publicState(config, state, extra = {}) {
    const Q = config.questions, S = steps(config);
    const now = extra.now || Date.now();
    const index = clampIndex(config, state.current);
    const step = S[index], qi = step.kind === 'question' ? step.qi : -1, q = Q[qi];
    const revealed = !q || !!(state.revealedQ || {})[qi];
    const base = {
      team: config.team, event: config.event, holidayDate: config.holidayDate, countdown: config.countdown,
      reactions: config.reactions, ticker: config.ticker || [],
      index, qi, total: Q.length, stepCount: S.length, nav: navLabel(config, step),
      revealed,
      timeLeft: q && !revealed && state.timerEnd ? Math.max(0, state.timerEnd - now) : 0,
      timerTotal: timerMs(config, q),
      ...extra,
    };
    delete base.now;
    const participants = new Set(Object.values(state.responses || {}).flatMap(r => Object.keys(r || {}))).size;
    if (step.kind === 'lobby') return { ...base, stage: 'lobby', lobby: config.lobby, participants };
    if (step.kind === 'slide') return { ...base, stage: 'slide', slide: step.slide, participants };
    if (step.kind !== 'question') {
      const items = Q.map((q, i) => ({ title: q.title, options: q.options, pledge: q.pledge, ...analyse(q, state.responses[i], state.hidden) }));
      return { ...base, stage: step.kind, recap: config.recap || {}, roadmap: config.roadmap || {}, finale: config.finale || {}, items, participants };
    }
    return {
      ...base, stage: 'question', question: q,
      ...analyse(q, state.responses[qi], state.hidden),
      recent: recentWords(state.responses[qi], state.hidden),
    };
  }

  return { norm, clean, analyse, publicState, enter, steps, lastIndex, qiAt, navLabel, makePlayer, cleanPlayer, playerName, ADJ, NOUN };
});
