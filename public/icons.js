// Minimal line icons, drawn in currentColor. Names: "signal:1-5", "chart:<shape>", "battery:<0-100>".
window.icon = function icon(spec) {
  const [kind, arg] = String(spec || '').split(':');
  const svg = (vb, body) => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  if (kind === 'signal') {
    const n = Number(arg) || 0;
    let body = '';
    for (let i = 0; i < 5; i++) {
      const h = 6 + i * 5.5, x = 3 + i * 8.5;
      body += `<rect x="${x}" y="${30 - h}" width="5.5" height="${h}" rx="1.5" stroke="none" fill="currentColor" opacity="${i < n ? 1 : 0.18}"/>`;
    }
    return svg('0 0 48 32', body);
  }

  if (kind === 'chart') {
    const shapes = {
      rocket: 'M3 28 C 18 27.5, 30 24, 45 4',
      bull: 'M3 26 L11 21 L18 23 L26 15 L33 16 L45 6',
      volatile: 'M3 22 L9 10 L15 24 L21 9 L27 21 L33 7 L39 17 L45 5',
      recovery: 'M3 7 L12 15 L19 26 L27 19 L35 12 L45 8',
      sideways: 'M3 17 L10 13 L17 19 L24 14 L31 18 L38 14 L45 16',
    };
    const d = shapes[arg] || shapes.bull;
    const end = d.trim().split(/[ ,LMC]+/).filter(Boolean).slice(-2);
    return svg('0 0 48 32',
      `<path d="M3 30.5 H45" stroke-width="1.2" opacity=".25"/><path d="${d}"/>` +
      `<circle cx="${end[0]}" cy="${end[1]}" r="2.6" fill="currentColor" stroke="none"/>`);
  }

  if (kind === 'battery') {
    const pct = Math.max(0, Math.min(100, Number(arg) || 0));
    const w = Math.max(2, (pct / 100) * 30);
    return svg('0 0 48 32',
      `<rect x="3" y="7" width="38" height="18" rx="4"/><path d="M44.5 13 V19" stroke-width="3"/>` +
      `<rect x="6.5" y="10.5" width="${w}" height="11" rx="1.8" fill="currentColor" stroke="none" opacity="${pct < 30 ? 0.55 : 1}"/>`);
  }
  return '';
};
