// Builds the public GitHub Pages site into docs/. The pages hold the app only, never the content:
//   index.html      landing page
//   presenter.html  presenter screen: asks for the presenter key, then loads the content from Supabase
//                   (presenter.html#notes is the presenter view with speaker notes)
//   phone.html      phone view: loads the poll questions with the join code that the QR code carries
//   simulator.html  presenter screen + phones + control panel, after the presenter key
//   vendor/         supabase-js, hosted alongside so the day does not depend on a CDN
// Every page tells search engines not to index it. The content itself is uploaded separately with
// `npm run content:push` (see scripts/content.js). The Supabase URL and anon key are public by design.
// Usage: PAGES_URL=https://<user>.github.io/<repo>/ node scripts/build-pages.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pagesUrl = (process.env.PAGES_URL || 'https://pietjepizza.github.io/yearend/').replace(/\/?$/, '/');
const out = path.join(root, 'docs');
const LIVE = {
  url: process.env.SUPABASE_URL || 'https://evdtpvbacpibeasrczhu.supabase.co',
  key: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZHRwdmJhY3BpYmVhc3Jjemh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5Nzc0ODgsImV4cCI6MjExMDU1MzQ4OH0.SfKzou_Ogcsroj9EpOgB7yBhvd6tNyYGm8Lqiu7EZAQ',
};

// 1) the app bundle without content, and the simulator around it
execFileSync('node', [path.join(__dirname, 'build-artifact.js')], { env: { ...process.env, PULSE_PUBLIC: '1' }, stdio: 'inherit' });
execFileSync('node', [path.join(__dirname, 'build-simulator.js')], { stdio: 'inherit' });
const app = fs.readFileSync(path.join(root, 'dist', 'mood-pulse.html'), 'utf8');
const sim = fs.readFileSync(path.join(root, 'dist', 'simulator.html'), 'utf8').replace(/<link rel="artifact-thumbnail"[^>]*>\n?/, '');

// The bundles are page fragments (claude.ai adds the document skeleton); wrap them for a plain web host.
const inline = p => `<script>\n${fs.readFileSync(path.join(root, p), 'utf8')}\n</script>`;
const page = (body, { live, simLock } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#10069f">
<style>[hidden]{display:none!important}</style>
${live ? `<script src="vendor/supabase.js"></script>
<script>window.PULSE_LIVE=${JSON.stringify(live)};</script>
${inline('public/backend-supabase.js')}` : ''}
${simLock ? `<script>window.PULSE_SIM_LOCK=${JSON.stringify(simLock)};</script>
${inline('public/lock.js')}` : ''}
</head>
<body>
${body}
</body>
</html>
`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'simulator.html'), page(sim, { simLock: LIVE }));
fs.writeFileSync(path.join(out, 'presenter.html'), page(app, { live: { ...LIVE, role: 'host' } }));
fs.writeFileSync(path.join(out, 'phone.html'), page(app, { live: { ...LIVE, role: 'phone' } }));
const vendor = path.join(out, 'vendor'), umd = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd');
fs.mkdirSync(vendor, { recursive: true });
for (const f of fs.readdirSync(umd)) if (f.endsWith('.js')) fs.copyFileSync(path.join(umd, f), path.join(vendor, f));
fs.writeFileSync(path.join(vendor, 'LICENSE-supabase-js.txt'), 'supabase-js is MIT licensed: https://github.com/supabase/supabase-js/blob/master/LICENSE\n');
fs.writeFileSync(path.join(out, 'index.html'), page(fs.readFileSync(path.join(root, 'simulator', 'landing.html'), 'utf8')));
fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// 2) safety net: no text from the private content may end up in the public pages
const privateFile = path.join(root, 'questions.json');
if (fs.existsSync(privateFile)) {
  const cfg = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
  const texts = new Set();
  const collect = v => {
    if (typeof v === 'string') { if (v.length >= 12 && !/^\[.*\]$/.test(v)) texts.add(v); }
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect({ show: cfg.show, roadmap: cfg.roadmap, questions: cfg.questions, recap: cfg.recap, finale: cfg.finale, countdown: cfg.countdown });
  // texts that are also defaults in the app code itself (such as "The road ahead") are not content leaks
  const code = ['public', 'artifact'].flatMap(d => fs.readdirSync(path.join(root, d)).filter(f => /\.(js|css)$/.test(f)).map(f => fs.readFileSync(path.join(root, d, f), 'utf8'))).join('\n');
  for (const t of [...texts]) if (code.includes(t)) texts.delete(t);
  const leaks = [];
  for (const f of ['index.html', 'presenter.html', 'phone.html', 'simulator.html']) {
    const html = fs.readFileSync(path.join(out, f), 'utf8');
    for (const t of texts) if (html.includes(t) || html.includes(JSON.stringify(t).slice(1, -1))) leaks.push(`${f}: ${t.slice(0, 60)}`);
  }
  if (leaks.length) { console.error('Private content found in the public pages:\n  ' + leaks.slice(0, 20).join('\n  ')); process.exit(1); }
  console.log(`checked: none of ${texts.size} private texts appear in docs/`);
}
console.log(`docs/ written for ${pagesUrl}`);
