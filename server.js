// Year-end all-hands "Mood Pulse": anonymous live check-in with a consulting-style presenter screen.
// Zero-framework Node server: static pages + JSON API + Server-Sent Events. Survey logic lives in public/core.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Core = require('./public/core.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST_KEY = process.env.HOST_KEY || crypto.randomBytes(3).toString('hex');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const CONFIG_FILE = [process.env.CONFIG_FILE, path.join(__dirname, 'questions.json'), path.join(__dirname, 'questions.example.json')].find(f => f && fs.existsSync(f));
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const QUESTIONS = CONFIG.questions;
const REACTIONS = CONFIG.reactions || ['👏', '🎉', '🔥', '💙', '😂', '🚀'];
const LAST = Core.lastIndex(CONFIG);
const qiNow = () => Core.qiAt(CONFIG, state.current);

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');

// ---- state -------------------------------------------------------------
// responses[questionIndex] = { anonymousDeviceToken: { option, word, ts } }. No names are collected.
const fresh = () => ({ current: 0, revealedQ: {}, timerEnd: 0, responses: {}, hidden: [], qa: { done: [], hidden: [] }, tug: null, kudosHidden: [] });
let state = fresh();
try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch {}
for (const r of Object.values(state.responses)) for (const a of Object.values(r || {})) delete a.name;
state.revealedQ ||= {};
state.qa ||= { done: [], hidden: [] };
state.kudosHidden ||= [];
state.current = Math.max(0, Math.min(LAST, Number(state.current) || 0));
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(state), () => {}), 300);
}

// ---- live updates (SSE) -------------------------------------------------
// Presenter screens get every update; phones only hear about presenter actions.
const clients = new Map(); // res -> { role: 'host' | 'phone', player }
const phones = () => [...clients.values()].filter(c => c.role === 'phone');
const publicState = extra => Core.publicState(CONFIG, state, {
  joinUrl: PUBLIC_URL, connected: phones().length, players: phones().slice(-80).map(c => c.player), ...extra,
});
function send(filter, payload, event) {
  const msg = (event ? `event: ${event}\n` : '') + `data: ${JSON.stringify(payload)}\n\n`;
  for (const [res, c] of clients) if (filter(c.role)) res.write(msg);
}
const toHosts = role => role === 'host';
const toAll = () => true;
let countTimer;
const announceCount = () => { clearTimeout(countTimer); countTimer = setTimeout(() => send(toHosts, publicState()), 250); };
setInterval(() => { for (const res of clients.keys()) res.write(': ping\n\n'); }, 25000);

// ---- helpers ------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const HTML = 'text/html; charset=utf-8', JS = 'text/javascript; charset=utf-8';
const STATIC = {
  '/': ['join.html', HTML], '/join': ['join.html', HTML], '/host': ['host.html', HTML],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/core.js': ['core.js', JS], '/icons.js': ['icons.js', JS], '/fx.js': ['fx.js', JS],
  '/host.js': ['host.js', JS], '/join.js': ['join.js', JS], '/transport-server.js': ['transport-server.js', JS],
  '/notes.js': ['notes.js', JS], '/help.js': ['help.js', JS],
};
function sendFile(res, file, type) {
  fs.readFile(path.join(__dirname, 'public', file), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

const lastReaction = new Map();

// ---- routes -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (req.method === 'GET' && STATIC[p]) return sendFile(res, ...STATIC[p]);

  if (req.method === 'GET' && p === '/qr.svg') {
    const svg = await QRCode.toString(PUBLIC_URL, { type: 'svg', margin: 0, color: { dark: '#0b0b3b', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(svg);
  }

  if (req.method === 'GET' && p === '/api/state') {
    const s = publicState();
    const me = url.searchParams.get('id');
    s.mine = me && s.stage === 'question' ? (state.responses[s.qi] || {})[me] || null : null;
    s.mineAsk = me ? (state.responses.ask || {})[me] || null : null;
    s.mineTug = me ? (state.responses.tug || {})[me] || null : null;
    s.mineKudos = me ? (((state.responses.kudos || {})[me] || {}).list || []) : [];
    s.myTeam = me ? Core.teamOf(me) : 0;
    return json(res, 200, s);
  }

  if (req.method === 'GET' && p === '/events') {
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'phone';
    const player = Core.cleanPlayer({ a: url.searchParams.get('a'), n: url.searchParams.get('n'), c: url.searchParams.get('c') });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.set(res, { role, player });
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    if (role === 'phone') announceCount();
    req.on('close', () => { clients.delete(res); if (role === 'phone') announceCount(); });
    return;
  }

  if (req.method === 'POST' && p === '/api/vote') {
    let b;
    try { b = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = Core.clean(b.id, 64);
    if (!id) return json(res, 400, { error: 'missing id' });
    const qi = qiNow();
    if (Number(b.index) !== state.current || qi < 0) return json(res, 409, { error: 'question changed' });
    const q = QUESTIONS[qi];
    if (!q.options.some(o => o.id === b.option)) return json(res, 400, { error: 'unknown option' });
    const answer = { option: b.option, word: Core.clean(b.word, 24), ts: Date.now() };
    (state.responses[qi] ||= {})[id] = answer;
    save();
    send(toHosts, publicState({ pop: answer.option }));
    return json(res, 200, { ok: true });
  }

  // Anonymous Q&A: a phone may ask up to three questions and upvote any question once.
  if (req.method === 'POST' && (p === '/api/ask' || p === '/api/upvote')) {
    let b;
    try { b = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = Core.clean(b.id, 64);
    if (!id) return json(res, 400, { error: 'missing id' });
    const mine = ((state.responses.ask ||= {})[id] ||= { q: [], up: [], ts: 0 });
    if (p === '/api/ask') {
      const text = Core.clean(b.text, 140);
      if (text.length < 3) return json(res, 400, { error: 'too short' });
      if (mine.q.length >= 3) return json(res, 429, { error: 'limit' });
      mine.q.push({ id: 'q' + crypto.randomBytes(4).toString('hex'), text, ts: Date.now() });
    } else {
      const qid = Core.clean(b.qid, 24);
      mine.up = mine.up.filter(x => x !== qid);
      if (b.on) mine.up.push(qid);
    }
    mine.ts = Date.now();
    save();
    send(toAll, publicState());
    return json(res, 200, { ok: true });
  }

  // Tug of war (taps from a phone, about every 0.7 s) and the kudos wall.
  if (req.method === 'POST' && (p === '/api/tug' || p === '/api/kudos')) {
    let b;
    try { b = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = Core.clean(b.id, 64);
    if (!id) return json(res, 400, { error: 'missing id' });
    if (p === '/api/tug') {
      const round = Core.clean(b.round, 24);
      (state.responses.tug ||= {})[id] = { id: round, team: Core.teamOf(id), taps: Math.max(0, Math.min(400, Number(b.taps) || 0)), ts: Date.now() };
      send(toHosts, publicState());
      return json(res, 200, { ok: true });
    }
    const text = Core.clean(b.text, 140), to = Core.clean(b.to, 40);
    if (text.length < 3 || !to) return json(res, 400, { error: 'too short' });
    const mine = ((state.responses.kudos ||= {})[id] ||= { list: [], ts: 0 });
    if (mine.list.length >= 5) return json(res, 429, { error: 'limit' });
    mine.list.push({ id: 'k' + crypto.randomBytes(4).toString('hex'), to, text, kind: Core.clean(b.kind, 12), ts: Date.now() });
    mine.ts = Date.now();
    save();
    send(toHosts, publicState());
    return json(res, 200, { ok: true });
  }

  // The presenter tools: the full content (for the content check) and the results summary.
  if (req.method === 'GET' && (p === '/api/config' || p === '/api/summary')) {
    if (url.searchParams.get('key') !== HOST_KEY) return json(res, 403, { error: 'wrong host key' });
    return json(res, 200, p === '/api/config' ? CONFIG : Core.summary(CONFIG, state));
  }

  if (req.method === 'POST' && p === '/api/react') {
    let b;
    try { b = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = Core.clean(b.id, 64);
    if (!id || !REACTIONS.includes(b.r)) return json(res, 400, { error: 'bad reaction' });
    const now = Date.now();
    if (now - (lastReaction.get(id) || 0) < 250) return json(res, 429, { error: 'slow down' });
    lastReaction.set(id, now);
    send(toHosts, { r: b.r }, 'react');
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && p.startsWith('/api/host/')) {
    if (url.searchParams.get('key') !== HOST_KEY) return json(res, 403, { error: 'wrong host key' });
    const action = p.slice('/api/host/'.length);
    if (action === 'next') Core.enter(CONFIG, state, Core.nextIndex(CONFIG, state.current));
    else if (action === 'prev') Core.enter(CONFIG, state, Core.prevIndex(CONFIG, state.current));
    else if (action === 'goto') Core.enter(CONFIG, state, Number(url.searchParams.get('word')));
    else if (action === 'reveal') { if (qiNow() >= 0) state.revealedQ[qiNow()] = true; state.timerEnd = 0; }
    else if (action === 'conceal') { delete state.revealedQ[qiNow()]; state.timerEnd = 0; }
    else if (action === 'clear') { if (qiNow() >= 0) { delete state.responses[qiNow()]; delete state.revealedQ[qiNow()]; Core.enter(CONFIG, state, state.current); } }
    else if (action === 'hide') { const w = Core.norm(url.searchParams.get('word')); if (w && !state.hidden.includes(w)) state.hidden.push(w); }
    else if (action === 'unhide') state.hidden = [];
    else if (action === 'qa') {
      const [what, id] = String(url.searchParams.get('word') || '').split(':');
      const qa = state.qa;
      qa.done = qa.done.filter(x => x !== id); qa.hidden = qa.hidden.filter(x => x !== id);
      if (what === 'done') qa.done.push(id); else if (what === 'hide') qa.hidden.push(id);
      if (what === 'reset') state.qa = { done: [], hidden: [] };
    }
    else if (action === 'tug') {
      const [what, id, ta, tb] = String(url.searchParams.get('word') || '').split(':');
      const t = state.tug;
      if (what === 'start') state.tug = { id: 'r' + Date.now().toString(36), phase: 'countdown', at: Date.now() };
      else if (what === 'go' && t && t.id === id && t.phase === 'countdown') state.tug = { ...t, phase: 'go', goAt: Date.now() };
      else if (what === 'done' && t && t.id === id && t.phase === 'go') state.tug = { ...t, phase: 'done', final: [Number(ta) || 0, Number(tb) || 0] };
      else if (what === 'reset') state.tug = null;
    }
    else if (action === 'kudos') {
      const [what, id] = String(url.searchParams.get('word') || '').split(':');
      state.kudosHidden = what === 'reset' ? [] : [...new Set([...state.kudosHidden, id])];
    }
    else if (action === 'reset') state = fresh();
    else return json(res, 404, { error: 'unknown action' });
    save();
    send(['hide', 'unhide'].includes(action) ? toHosts : toAll, publicState());
    return json(res, 200, { ok: true });
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Mood Pulse is running\n`);
  console.log(`  Participants (QR code points here): ${PUBLIC_URL}`);
  console.log(`  Presenter screen:                    ${PUBLIC_URL}/host?key=${HOST_KEY}\n`);
});
