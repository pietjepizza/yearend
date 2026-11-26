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
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
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
const fresh = () => ({ current: 0, revealedQ: {}, timerEnd: 0, responses: {}, hidden: [] });
let state = fresh();
try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch {}
for (const r of Object.values(state.responses)) for (const a of Object.values(r || {})) delete a.name;
state.revealedQ ||= {};
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
    if (action === 'next') Core.enter(CONFIG, state, Math.min(state.current + 1, LAST));
    else if (action === 'prev') Core.enter(CONFIG, state, Math.max(state.current - 1, 0));
    else if (action === 'goto') Core.enter(CONFIG, state, Number(url.searchParams.get('word')));
    else if (action === 'reveal') { if (qiNow() >= 0) state.revealedQ[qiNow()] = true; state.timerEnd = 0; }
    else if (action === 'conceal') { delete state.revealedQ[qiNow()]; state.timerEnd = 0; }
    else if (action === 'clear') { if (qiNow() >= 0) { delete state.responses[qiNow()]; delete state.revealedQ[qiNow()]; Core.enter(CONFIG, state, state.current); } }
    else if (action === 'hide') { const w = Core.norm(url.searchParams.get('word')); if (w && !state.hidden.includes(w)) state.hidden.push(w); }
    else if (action === 'unhide') state.hidden = [];
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
