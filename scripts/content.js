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
    ...(c.finale && c.finale.holidays !== undefined ? { finale: { holidays: c.finale.holidays } } : {}),
    questions: c.questions.map(q => ({
      ...pick(q, ['id', 'type', 'group', 'title', 'context', 'wordPrompt', 'noWord', 'timer', 'compareWith']),
      options: q.options.map(o => pick(o, ['id', 'label', 'icon', 'score', 'team'])),
    })),
    show: c.show.map(st => st.type === 'question' ? pick(st, ['type', 'question', 'nav', 'extra'])
      : SPECIAL.includes(st.type) ? pick(st, ['type', 'nav', 'extra'])
      : { ...pick(st, ['type', 'nav', 'extra', 'question']), ...(st.type === 'qa' || st.type === 'kudos' ? pick(st, ['title']) : st.type === 'tug' ? pick(st, ['title', 'teams', 'seconds']) : {}) }),
  };
}

// The key dates (the timeline) can be kept out of the live presentation and parked in a private archive
// (behind the presenter key, never shown on any screen): hide-dates puts a neutral "date TBD" timeline live,
// show-dates puts the real one back.
const roadSection = c => c.show.find(st => st.type === 'section' && /road ahead/i.test(st.title || ''));
const timelineStep = c => c.show.find(st => st.type === 'roadmap');
const PLACEHOLDER_ROADMAP = (live) => ({
  ...live,
  steps: undefined,
  placeholder: true,
  subtitle: 'A demanding stretch with a lot to deliver. Key dates to follow.',
  source: 'Key dates to follow',
  stats: [{ value: '{items}', label: 'key moments' }, { value: '1', label: 'team' }],
  rows: [
    { label: '[Workstream 1]', items: [
      { type: 'bar', label: '[Phase]', start: '2026-12-07', end: '2026-12-18', when: 'dates TBD', weight: 0.5 },
      { type: 'milestone', key: true, label: '[Key milestone]', date: '2027-02-01', when: 'date TBD', weight: 1.6 },
      { type: 'bar', label: '[Follow-up]', start: '2027-02-01', end: '2027-02-15', when: 'dates TBD', weight: 1.2, fade: true } ] },
    { label: '[Workstream 2]', items: [
      { type: 'bar', label: '[Phase]', start: '2026-12-09', end: '2026-12-23', when: 'dates TBD', weight: 0.4 },
      { type: 'bar', label: '[Phase]', start: '2027-01-04', end: '2027-01-29', when: 'dates TBD', weight: 1 } ] },
    { label: '[Workstream 3]', items: [
      { type: 'bar', label: '[Phase]', start: '2027-01-05', end: '2027-01-08', when: 'dates TBD', weight: 1.6 },
      { type: 'milestone', label: '[Deadline]', date: '2027-01-15', when: 'date TBD', weight: 1.2 },
      { type: 'milestone', label: '[Deadline]', date: '2027-01-27', when: 'date TBD', weight: 0.9 } ] },
    { label: '[Workstream 4]', items: [
      { type: 'milestone', label: '[Deadline]', date: '2027-01-20', when: 'date TBD', weight: 1.2 } ] },
  ],
});

async function push(config) {
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
    await push(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } else if (cmd === 'hide-dates') {
    const config = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (config.roadmap.placeholder) { console.log('The key dates are already off the live presentation.'); return; }
    const archive = (await rpc('pulse_get_archive', { p_key: KEY })) || {};
    archive.keyDates = { roadmap: config.roadmap, sectionSubtitle: (roadSection(config) || {}).subtitle, timelineNotes: (timelineStep(config) || {}).notes, savedAt: new Date().toISOString() };
    await rpc('pulse_set_archive', { p_key: KEY, p_data: archive });
    config.roadmap = PLACEHOLDER_ROADMAP(config.roadmap);
    if (roadSection(config)) roadSection(config).subtitle = 'What is coming, and how we get through it together';
    if (timelineStep(config)) timelineStep(config).notes = 'The key dates are not on screen yet. Talk through the busy months ahead and stress: look out for each other.';
    fs.writeFileSync(FILE, JSON.stringify(config, null, 2) + '\n');
    await push(config);
    console.log('Key dates saved in the private archive and replaced by "date TBD" on the live presentation.');
  } else if (cmd === 'show-dates') {
    const archive = await rpc('pulse_get_archive', { p_key: KEY });
    const d = archive && archive.keyDates;
    if (!d) { console.error('No key dates in the archive.'); process.exit(1); }
    const config = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    config.roadmap = d.roadmap;
    if (roadSection(config) && d.sectionSubtitle) roadSection(config).subtitle = d.sectionSubtitle;
    if (timelineStep(config) && d.timelineNotes) timelineStep(config).notes = d.timelineNotes;
    fs.writeFileSync(FILE, JSON.stringify(config, null, 2) + '\n');
    await push(config);
    console.log('The key dates (saved ' + d.savedAt + ') are back on the live presentation.');
  } else {
    console.error('Usage: PULSE_KEY=… node scripts/content.js push|pull|hide-dates|show-dates');
    process.exit(1);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
