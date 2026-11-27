// Bundles the app into one self-contained HTML page (dist/mood-pulse.html).
// - For the private claude.ai test link: the content (questions.json) is inlined. ARTIFACT_URL=<link> sets the QR code.
// - With PULSE_PUBLIC=1 (used by build-pages for the public website) no content and no QR code go into the page:
//   the presenter screen loads them after the presenter key, phones with the join code (see public/lock.js).
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const PUBLIC = process.env.PULSE_PUBLIC === '1';
const configFile = ['questions.json', 'questions.example.json'].find(f => fs.existsSync(path.join(root, f)));
const config = PUBLIC ? null : JSON.parse(read(configFile));
const base = PUBLIC ? '' : (process.env.ARTIFACT_URL || '').replace(/#.*$/, '');
const joinUrl = base ? base + '#join' : '';
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
const script = p => {
  const src = read(p);
  if (/<\/script/i.test(src)) throw new Error(p + ' contains a closing script tag');
  return `<script>\n${src}\n</script>`;
};

(async () => {
  const qr = joinUrl ? await QRCode.toString(joinUrl, { type: 'svg', margin: 0, color: { dark: '#0b0b3b', light: '#ffffff' } }) : '';
  const thumb = !PUBLIC && fs.existsSync(path.join(root, 'dist', 'thumb.png')) ? '\n<link rel="artifact-thumbnail" href="thumb.png">' : '';
  const html = `<title>Mood Pulse</title>${thumb}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
${read('public/style.css')}
</style>
<div id="app"></div>
<template id="qr-template">${qr}</template>
${script('public/core.js')}
${script('public/icons.js')}
${script('public/fx.js')}
${script('public/lock.js')}
${script('public/help.js')}
${script('public/notes.js')}
${script('public/host.js')}
${script('public/join.js')}
<script>window.PULSE_CONFIG = ${json(config)}; window.PULSE_JOIN_URL = ${json(joinUrl)};</script>
${script('artifact/transport-artifact.js')}
${script('artifact/main.js')}
`;
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'mood-pulse.html'), html);
  console.log(`dist/mood-pulse.html (${(html.length / 1024).toFixed(0)} KB)${PUBLIC ? ' · public: no content inside' : joinUrl ? ' · QR → ' + joinUrl : ' · no QR yet (set ARTIFACT_URL)'}`);
})();
