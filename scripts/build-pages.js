// Builds the static GitHub Pages site into docs/:
//   index.html      landing page
//   simulator.html  presenter screen + live phones + control panel (fully working, all in the browser)
//   presenter.html  the presenter screen, LIVE via Supabase (controls need ?key=<presenter key>)
//   phone.html      the phone view, LIVE via Supabase (this is where the QR code points)
//   vendor/         supabase-js, hosted alongside so the day does not depend on a CDN
// The Supabase URL and anon key are public by design; the database only accepts writes through
// two checked functions (see supabase/pulse_live_voting.sql).
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

// 1) app bundle + simulator, with the QR code pointing at the Pages phone view
execFileSync('node', [path.join(__dirname, 'build-artifact.js')], { env: { ...process.env, ARTIFACT_URL: pagesUrl + 'phone.html' }, stdio: 'inherit' });
execFileSync('node', [path.join(__dirname, 'build-simulator.js')], { stdio: 'inherit' });
const strip = html => html.replace(/<link rel="artifact-thumbnail"[^>]*>\n?/, '');
const app = strip(fs.readFileSync(path.join(root, 'dist', 'mood-pulse.html'), 'utf8')).replace(/#join"/g, '"').replace(/phone\.html#join/g, 'phone.html');
const sim = strip(fs.readFileSync(path.join(root, 'dist', 'simulator.html'), 'utf8'));

// The bundles are page fragments (claude.ai adds the document skeleton); wrap them for a plain web host.
const backend = fs.readFileSync(path.join(root, 'public', 'backend-supabase.js'), 'utf8');
const page = (body, sim, live) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#10069f">
<style>[hidden]{display:none!important}</style>
${sim ? `<script>window.SIM=${JSON.stringify(sim)}</script>` : ''}
${live ? `<script src="vendor/supabase.js"></script>
<script>window.PULSE_LIVE=${JSON.stringify(live)};</script>
<script>
${backend}
</script>` : ''}
</head>
<body>
${body}
</body>
</html>
`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'simulator.html'), page(sim));
fs.writeFileSync(path.join(out, 'presenter.html'), page(app, null, { ...LIVE, role: 'host' }));
fs.writeFileSync(path.join(out, 'phone.html'), page(app, null, { ...LIVE, role: 'phone' }));
const vendor = path.join(out, 'vendor'), umd = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd');
fs.mkdirSync(vendor, { recursive: true });
for (const f of fs.readdirSync(umd)) if (f.endsWith('.js')) fs.copyFileSync(path.join(umd, f), path.join(vendor, f));
fs.writeFileSync(path.join(vendor, 'LICENSE-supabase-js.txt'), 'supabase-js is MIT licensed: https://github.com/supabase/supabase-js/blob/master/LICENSE\n');
fs.writeFileSync(path.join(out, 'index.html'), page(fs.readFileSync(path.join(root, 'simulator', 'landing.html'), 'utf8')));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`docs/ written for ${pagesUrl}`);
