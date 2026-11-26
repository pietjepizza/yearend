// Builds the static GitHub Pages site into docs/:
//   index.html      landing page
//   simulator.html  presenter screen + live phones + control panel (fully working, all in the browser)
//   presenter.html  the presenter screen on its own (demo mode, with the room simulator)
//   phone.html      the phone view (syncs with presenter.html in the same browser only)
// GitHub Pages only serves files, so live voting from other devices needs the Node server or a realtime backend.
// Usage: PAGES_URL=https://<user>.github.io/<repo>/ node scripts/build-pages.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pagesUrl = (process.env.PAGES_URL || 'https://pietjepizza.github.io/yearend/').replace(/\/?$/, '/');
const out = path.join(root, 'docs');

// 1) app bundle + simulator, with the QR code pointing at the Pages phone view
execFileSync('node', [path.join(__dirname, 'build-artifact.js')], { env: { ...process.env, ARTIFACT_URL: pagesUrl + 'phone.html' }, stdio: 'inherit' });
execFileSync('node', [path.join(__dirname, 'build-simulator.js')], { stdio: 'inherit' });
const strip = html => html.replace(/<link rel="artifact-thumbnail"[^>]*>\n?/, '');
const app = strip(fs.readFileSync(path.join(root, 'dist', 'mood-pulse.html'), 'utf8')).replace(/#join"/g, '"').replace(/phone\.html#join/g, 'phone.html');
const sim = strip(fs.readFileSync(path.join(root, 'dist', 'simulator.html'), 'utf8'));

// The bundles are page fragments (claude.ai adds the document skeleton); wrap them for a plain web host.
const page = (body, sim) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>[hidden]{display:none!important}</style>
${sim ? `<script>window.SIM=${JSON.stringify(sim)}</script>` : ''}
</head>
<body>
${body}
</body>
</html>
`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'simulator.html'), page(sim));
fs.writeFileSync(path.join(out, 'presenter.html'), page(app, { role: 'host', label: 'Demo: open phone.html in another tab of this browser' }));
fs.writeFileSync(path.join(out, 'phone.html'), page(app, { role: 'phone', slot: 1 }));
fs.writeFileSync(path.join(out, 'index.html'), page(fs.readFileSync(path.join(root, 'simulator', 'landing.html'), 'utf8')));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`docs/ written for ${pagesUrl}`);
