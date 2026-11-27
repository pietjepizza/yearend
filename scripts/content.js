// The presentation content is private: it lives in questions.json on your own computer (never in git)
// and in Supabase, behind the presenter key. The public website only holds the app.
//
//   PULSE_KEY=<presenter key> node scripts/content.js push   upload questions.json
//   PULSE_KEY=<presenter key> node scripts/content.js pull   download it into questions.json
//
// push stores two versions:
//   full   everything, for the presenter screen, the presenter view and the simulator (needs the presenter key)
//   phone  only what phones need to vote (needs the join code that the QR code on the big screen carries)
// The join code stays the same between uploads, so phones that joined keep working.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'questions.json');
const URL_ = process.env.SUPABASE_URL || 'https://evdtpvbacpibeasrczhu.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZHRwdmJhY3BpYmVhc3Jjemh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5Nzc0ODgsImV4cCI6MjExMDU1MzQ4OH0.SfKzou_Ogcsroj9EpOgB7yBhvd6tNyYGm8Lqiu7EZAQ';
const PAGES = (process.env.PAGES_URL || 'https://pietjepizza.github.io/yearend/').replace(/\/?$/, '/');
const KEY = process.env.PULSE_KEY;

async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Only what a phone needs: the running order (types and short labels) and the poll questions.
const SPECIAL = ['lobby', 'recap', 'roadmap', 'finale'];
function phoneConfig(c) {
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
  return {
    team: c.team, event: c.event, timer: c.timer, reactions: c.reactions,
    questions: c.questions.map(q => ({
      ...pick(q, ['id', 'type', 'group', 'title', 'context', 'wordPrompt', 'noWord', 'timer', 'compareWith']),
      options: q.options.map(o => pick(o, ['id', 'label', 'icon', 'score', 'team'])),
    })),
    show: c.show.map(st => st.type === 'question' ? pick(st, ['type', 'question', 'nav', 'extra'])
      : SPECIAL.includes(st.type) ? pick(st, ['type', 'nav', 'extra'])
      : { ...pick(st, ['type', 'nav', 'extra', 'question']), ...(st.type === 'qa' ? pick(st, ['title']) : {}) }),
  };
}

(async () => {
  const cmd = process.argv[2];
  if (!KEY) { console.error('Set PULSE_KEY to the presenter key.'); process.exit(1); }
  if (cmd === 'pull') {
    const data = await rpc('pulse_get_content', { p_key: KEY });
    if (!data || !data.config) { console.error('No content uploaded yet.'); process.exit(1); }
    fs.writeFileSync(FILE, JSON.stringify(data.config, null, 2) + '\n');
    console.log('questions.json written from Supabase (uploaded ' + (data.uploadedAt || 'earlier') + ')');
  } else if (cmd === 'push') {
    const config = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    let joinCode = process.env.PULSE_JOIN_CODE;
    if (!joinCode) {
      try { const prev = await rpc('pulse_get_content', { p_key: KEY }); joinCode = prev && prev.joinCode; } catch (e) { if (/wrong presenter key/.test(e.message)) throw e; }
    }
    joinCode ||= crypto.randomBytes(9).toString('base64url');
    const joinUrl = `${PAGES}phone.html#j=${joinCode}`;
    const qr = await QRCode.toString(joinUrl, { type: 'svg', margin: 0, color: { dark: '#0b0b3b', light: '#ffffff' } });
    const full = { config, joinCode, joinUrl, qr, uploadedAt: new Date().toISOString() };
    const phone = { config: phoneConfig(config) };
    await rpc('pulse_set_content', { p_key: KEY, p_full: full, p_phone: phone, p_join_hash: crypto.createHash('sha256').update(joinCode).digest('hex') });
    console.log(`Content uploaded: ${config.show.length} screens, ${config.questions.length} questions. Phones join through the QR code on the presenter screen.`);
  } else {
    console.error('Usage: PULSE_KEY=… node scripts/content.js push|pull');
    process.exit(1);
  }
})().catch(e => { console.error(e.message); process.exit(1); });

