// Year-end all-hands "Mood Pulse": anonymous live check-in with a consulting-style presenter screen.
// Zero-framework Node server: static pages + JSON API + Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const HOST_KEY = process.env.HOST_KEY || crypto.randomBytes(3).toString('hex');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
const QUESTIONS = CONFIG.questions;
const REACTIONS = CONFIG.reactions || ['👏', '🎉', '🔥', '💙', '😂', '🚀'];
const SUMMARY = QUESTIONS.length; // index of the closing "executive summary" screen

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');

// ---- state -------------------------------------------------------------
// responses[questionIndex] = { anonymousDeviceId: { option, word, ts } }. No names are collected.
let state = { current: 0, revealed: true, responses: {}, hidden: [] };
try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch {}
for (const r of Object.values(state.responses)) for (const a of Object.values(r || {})) delete a.name;
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(state), () => {}), 300);
}
const normWord = w => String(w || '').toLowerCase().trim();
const isHidden = w => state.hidden.includes(normWord(w));

// ---- analytics ------------------------------------------------------------
function analyse(qi) {
  const q = QUESTIONS[qi];
  const answers = Object.values(state.responses[qi] || {});
  const counts = Object.fromEntries(q.options.map(o => [o.id, 0]));
  const words = {};
  let scoreSum = 0, scored = 0, topBoxN = 0;
  for (const a of answers) {
    const opt = q.options.find(o => o.id === a.option);
    if (!opt) continue;
    counts[opt.id]++;
    if (typeof opt.score === 'number') { scoreSum += opt.score; scored++; if (opt.score >= 4) topBoxN++; }
    if (a.word && !isHidden(a.word)) { const w = normWord(a.word); words[w] = (words[w] || 0) + 1; }
  }
  const n = answers.length;
  const top = q.options.reduce((best, o) => (counts[o.id] > counts[best.id] ? o : best), q.options[0]);
  const pct = x => (n ? Math.round((100 * x) / n) : 0);
  const stats = {
    n,
    avg: scored ? +(scoreSum / scored).toFixed(1) : null,
    topBox: scored ? Math.round((100 * topBoxN) / scored) : null,
    top: n ? top.label : null,
    topId: n ? top.id : null,
    topPct: pct(counts[top.id]),
  };
  const takeaway = n
    ? (q.takeaway || 'Most chosen: “{top}” ({topPct}%)').replace(/\{(\w+)\}/g, (_, k) => stats[k] ?? '')
    : null;
  return { counts, words, stats, takeaway };
}

function publicState() {
  const base = {
    team: CONFIG.team, event: CONFIG.event, index: state.current, total: QUESTIONS.length,
    revealed: state.revealed, joinUrl: PUBLIC_URL, reactions: REACTIONS,
  };
  if (state.current === SUMMARY) {
    const items = QUESTIONS.map((q, i) => ({ title: q.title, options: q.options, ...analyse(i) }));
    const participants = new Set(Object.values(state.responses).flatMap(r => Object.keys(r || {}))).size;
    return { ...base, summary: true, items, participants };
  }
  const q = QUESTIONS[state.current];
  const recent = Object.values(state.responses[state.current] || {})
    .filter(a => a.word && !isHidden(a.word)).sort((a, b) => b.ts - a.ts).slice(0, 14).map(a => a.word);
  return { ...base, question: q, ...analyse(state.current), recent };
}

// ---- live updates (SSE) -------------------------------------------------
// Presenter screens get every update; phones only hear about host actions (question changes etc.).
const clients = new Map(); // res -> 'host' | 'phone'
function send(filter, payload, event) {
  const msg = (event ? `event: ${event}\n` : '') + `data: ${JSON.stringify(payload)}\n\n`;
  for (const [res, role] of clients) if (filter(role)) res.write(msg);
}
const toHosts = role => role === 'host';
const toAll = () => true;
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
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

const STATIC = {
  '/': ['join.html', 'text/html; charset=utf-8'],
  '/join': ['join.html', 'text/html; charset=utf-8'],
  '/host': ['host.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/icons.js': ['icons.js', 'text/javascript; charset=utf-8'],
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
    s.mine = me && !s.summary ? (state.responses[state.current] || {})[me] || null : null;
    return json(res, 200, s);
  }

  if (req.method === 'GET' && p === '/events') {
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'phone';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    clients.set(res, role);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'POST' && p === '/api/vote') {
    let b;
    try { b = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = clean(b.id, 64);
    if (!id) return json(res, 400, { error: 'missing id' });
    if (Number(b.index) !== state.current || state.current === SUMMARY) return json(res, 409, { error: 'question changed' });
    const q = QUESTIONS[state.current];
    if (!q.options.some(o => o.id === b.option)) return json(res, 400, { error: 'unknown option' });
    const answer = { option: b.option, word: clean(b.word, 24), ts: Date.now() };
    (state.responses[state.current] ||= {})[id] = answer;
    save();
    send(toHosts, { ...publicState(), pop: answer.option });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && p === '/api/react') {
    let b;
    try { b = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = clean(b.id, 64);
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
    if (action === 'next') state.current = Math.min(state.current + 1, SUMMARY);
    else if (action === 'prev') state.current = Math.max(state.current - 1, 0);
    else if (action === 'reveal') state.revealed = !state.revealed;
    else if (action === 'clear') delete state.responses[state.current];
    else if (action === 'hide') { const w = normWord(url.searchParams.get('word')); if (w && !state.hidden.includes(w)) state.hidden.push(w); }
    else if (action === 'unhide') state.hidden = [];
    else if (action === 'reset') { state.responses = {}; state.current = 0; state.revealed = true; state.hidden = []; }
    else return json(res, 404, { error: 'unknown action' });
    save();
    const toWho = ['hide', 'unhide', 'reveal'].includes(action) ? toHosts : toAll;
    send(toWho, publicState());
    return json(res, 200, { ok: true });
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Mood Pulse is running\n`);
  console.log(`  Participants (QR code points here): ${PUBLIC_URL}`);
  console.log(`  Presenter screen:                    ${PUBLIC_URL}/host?key=${HOST_KEY}\n`);
});
