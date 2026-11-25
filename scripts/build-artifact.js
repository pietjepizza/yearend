// Bundles the app into one self-contained HTML page for a claude.ai artifact (the test link).
// Usage: ARTIFACT_URL=https://claude.ai/... node scripts/build-artifact.js
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const config = JSON.parse(read('questions.json'));
const base = (process.env.ARTIFACT_URL || '').replace(/#.*$/, '');
const joinUrl = base ? base + '#join' : '';
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
const script = p => {
  const src = read(p);
  if (/<\/script/i.test(src)) throw new Error(p + ' contains a closing script tag');
  return `<script>\n${src}\n</script>`;
};

(async () => {
  const qr = joinUrl ? await QRCode.toString(joinUrl, { type: 'svg', margin: 0, color: { dark: '#0b0b3b', light: '#ffffff' } }) : '';
  const thumb = fs.existsSync(path.join(root, 'dist', 'thumb.png')) ? '\n<link rel="artifact-thumbnail" href="thumb.png">' : '';
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
${script('public/host.js')}
${script('public/join.js')}
<script>window.PULSE_CONFIG = ${json(config)}; window.PULSE_JOIN_URL = ${json(joinUrl)};</script>
${script('artifact/transport-artifact.js')}
${script('artifact/main.js')}
`;
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'mood-pulse.html'), html);
  console.log(`dist/mood-pulse.html (${(html.length / 1024).toFixed(0)} KB)${joinUrl ? ' · QR → ' + joinUrl : ' · no QR yet (set ARTIFACT_URL)'}`);
})();
