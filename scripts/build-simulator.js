// Builds the simulator page: the presenter screen, live phones and a control panel on one page.
// It embeds the app bundle from dist/mood-pulse.html, so run build:artifact first (npm run build:sim does both).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'dist', 'mood-pulse.html'), 'utf8')
  .replace(/<link rel="artifact-thumbnail"[^>]*>\n?/, '');
const tpl = fs.readFileSync(path.join(root, 'simulator', 'simulator.html'), 'utf8');
const json = JSON.stringify(app).replace(/</g, '\\u003c');
const html = tpl.replace('__APP_JSON__', () => json);
const thumb = fs.existsSync(path.join(root, 'dist', 'sim-thumb.png')) ? '\n<link rel="artifact-thumbnail" href="sim-thumb.png">' : '';
const out = html.replace('<title>Pulse Simulator</title>', '<title>Pulse Simulator</title>' + thumb);
fs.writeFileSync(path.join(root, 'dist', 'simulator.html'), out);
console.log(`dist/simulator.html (${(out.length / 1024).toFixed(0)} KB)`);
