// Minimal line icons, drawn in currentColor, with class hooks for CSS animation.
// Names: "signal:1-5", "chart:<rocket|bull|volatile|recovery|sideways>", "battery:<0-100>",
//        "help:<target|focus|team|trophy|snow>".
(function (root) {
  const svg = (cls, body) =>
    `<svg class="ico ${cls}" viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  function snowflake(cx, cy, r) {
    let d = '';
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      d += `M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`;
      const bx = cx + r * .6 * Math.cos(a), by = cy + r * .6 * Math.sin(a);
      for (const s of [-1, 1]) {
        const b = a + s * .7;
        d += `M${bx.toFixed(1)} ${by.toFixed(1)}L${(bx + r * .32 * Math.cos(b)).toFixed(1)} ${(by + r * .32 * Math.sin(b)).toFixed(1)}`;
      }
    }
    return d;
  }

  function icon(spec) {
    const [kind, arg] = String(spec || '').split(':');

    if (kind === 'signal') {
      const n = Number(arg) || 0;
      let body = '';
      for (let i = 0; i < 5; i++) {
        const h = 6 + i * 5.5, x = 3 + i * 8.5;
        body += `<rect class="b${i < n ? ' on' : ''}" style="--b:${i}" x="${x}" y="${30 - h}" width="5.5" height="${h}" rx="1.5" stroke="none" fill="currentColor"/>`;
      }
      return svg('i-signal', body);
    }

    if (kind === 'chart') {
      const shapes = {
        rocket: ['M3 28 C 18 27.5, 30 24, 45 4', 45, 4],
        bull: ['M3 26 L11 21 L18 23 L26 15 L33 16 L45 6', 45, 6],
        volatile: ['M3 22 L9 10 L15 24 L21 9 L27 21 L33 7 L39 17 L45 5', 45, 5],
        recovery: ['M3 7 L12 15 L19 26 L27 19 L35 12 L45 8', 45, 8],
        sideways: ['M3 17 L10 13 L17 19 L24 14 L31 18 L38 14 L45 16', 45, 16],
      };
      const [d, ex, ey] = shapes[arg] || shapes.bull;
      return svg('i-chart',
        `<path class="axis" d="M3 30.5 H45" stroke-width="1.2" opacity=".25"/>` +
        `<path class="ln" pathLength="1" d="${d}"/>` +
        `<circle class="dot" cx="${ex}" cy="${ey}" r="2.6" fill="currentColor" stroke="none"/>`);
    }

    if (kind === 'battery') {
      const pct = Math.max(0, Math.min(100, Number(arg) || 0));
      const w = Math.max(2, (pct / 100) * 30);
      return svg('i-battery',
        `<rect x="3" y="7" width="38" height="18" rx="4"/><path d="M44.5 13 V19" stroke-width="3"/>` +
        `<rect class="lvl" x="6.5" y="10.5" width="${w}" height="11" rx="1.8" fill="currentColor" stroke="none" opacity="${pct < 30 ? 0.55 : 1}"/>` +
        `<path class="bolt" d="M24 9 L19 17 H24 L21 24 L29 14 H24 Z" fill="#ffc400" stroke="#ffffff" stroke-width="1.2"/>`);
    }

    if (kind === 'movie') {
      const bodies = {
        mission: '<path d="M5 27 C 13 27, 13 15, 21 15 S 29 23, 35 13"/><g class="h"><path d="M39 3.5 v3.5 M39 11 v3.5 M33.5 9 h3.5 M41 9 h3.5 M35 5 l2 2 M41 11 l2 2 M43 5 l-2 2 M37 11 l-2 2" stroke-width="2"/></g>',
        heist: '<path d="M14 10 L20 4 H28 L34 10 L24 28 Z"/><path d="M14 10 H34 M20 4 L22 10 L24 28 M28 4 L26 10 L24 28" stroke-width="1.6"/><path class="h" d="M37 4 l1.2 2.4 2.4 1.2 -2.4 1.2 -1.2 2.4 -1.2 -2.4 -2.4 -1.2 2.4 -1.2 z" fill="currentColor" stroke="none"/>',
        quest: '<path d="M4 28 L16 10 L23 19 L30 12 L44 28 Z"/><path class="h" d="M30 12 V3 L37 5.5 L30 8" stroke-width="2"/>',
        race: '<path d="M7 26 A17 17 0 0 1 41 26"/><path d="M11 18 l2.5 1.5 M24 9 v3 M37 18 l-2.5 1.5" stroke-width="1.8"/><path class="h" d="M24 26 L33 14" stroke-width="2.6"/><circle cx="24" cy="26" r="2.4" fill="currentColor" stroke="none"/>',
        toy: '<path d="M24 3 C 30 8, 31 16, 28 23 H20 C 17 16, 18 8, 24 3 Z"/><circle cx="24" cy="12.5" r="2.6"/><path d="M20 18 L15 25 L20 23 M28 18 L33 25 L28 23" stroke-width="2"/><path class="h" d="M21.5 25.5 L24 31 L26.5 25.5" stroke-width="2"/>',
      };
      return svg('i-help movie-' + arg, bodies[arg] || bodies.mission);
    }

    if (kind === 'weather') {
      const cloud = (dx, dy) => `<path transform="translate(${dx} ${dy})" d="M14 24 H33 A5.5 5.5 0 0 0 32.5 13 A8 8 0 0 0 18 14 A5 5 0 0 0 14 24 Z"/>`;
      let rays = '';
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k, c = Math.cos(a), s2 = Math.sin(a);
        rays += `M${(24 + c * 9).toFixed(1)} ${(16 + s2 * 9).toFixed(1)} L${(24 + c * 13).toFixed(1)} ${(16 + s2 * 13).toFixed(1)} `;
      }
      const bodies = {
        sun: `<circle cx="24" cy="16" r="6"/><path class="h" d="${rays}"/>`,
        partly: `<g transform="translate(-6 -5) scale(.8)"><circle cx="24" cy="16" r="6"/><path class="h" d="${rays}"/></g>${cloud(2, 3)}`,
        rain: `${cloud(0, -6)}<path class="h" d="M18 22 l-2 5 M25 22 l-2 5 M32 22 l-2 5" stroke-width="2"/>`,
        rainbow: '<path d="M6 28 A18 18 0 0 1 42 28"/><path d="M11.5 28 A12.5 12.5 0 0 1 36.5 28" opacity=".75"/><path class="h" d="M17 28 A7 7 0 0 1 31 28" opacity=".55"/>',
      };
      return svg('i-help weather-' + arg, bodies[arg] || bodies.sun);
    }

    if (kind === 'help') {
      const bodies = {
        target: '<circle cx="22" cy="17" r="12"/><circle cx="22" cy="17" r="6.5"/><circle class="h" cx="22" cy="17" r="2.2" fill="currentColor" stroke="none"/><path class="h" d="M40 3 L24.5 14.5 M35 3 h5 v5"/>',
        focus: '<path d="M11 22 v-5 a13 13 0 0 1 26 0 v5"/><rect class="h" x="8" y="19" width="7" height="10" rx="2.5" fill="currentColor" stroke="none"/><rect class="h" x="33" y="19" width="7" height="10" rx="2.5" fill="currentColor" stroke="none"/>',
        team: '<circle cx="18" cy="10" r="4.5"/><path d="M8 29 c0-6.5 4.5-10 10-10 s10 3.5 10 10"/><circle class="h" cx="32" cy="11" r="4"/><path class="h" d="M28 20.5 c1.2-.6 2.6-.9 4-.9 c5 0 8.5 3.2 8.5 9.4"/>',
        trophy: '<path d="M16 4 h16 v7 a8 8 0 0 1 -16 0 z"/><path d="M16 7 h-4.5 a4.5 4.5 0 0 0 5 6.5 M32 7 h4.5 a4.5 4.5 0 0 1 -5 6.5 M24 19 v5 M18 28.5 h12 M20 24.5 h8"/><path class="h" d="M24 7.5 l1.2 2.4 2.6.4 -1.9 1.8 .5 2.6 -2.4-1.3 -2.4 1.3 .5-2.6 -1.9-1.8 2.6-.4z" fill="currentColor" stroke="none"/>',
        snow: `<path class="h" d="${snowflake(24, 16, 13)}" stroke-width="2.2"/>`,
        heart: '<path d="M24 30 C 14 23, 8 18, 8 11.5 A 6.5 6.5 0 0 1 24 8 A 6.5 6.5 0 0 1 40 11.5 C 40 18, 34 23, 24 30 Z"/><path class="h" d="M15 11.5 a3 3 0 0 1 3-3"/>',
        boost: '<path d="M27 3 L12 19 h10 l-4 11 L36 13 h-10 z"/><path class="h" d="M8 8 l3 2 M40 22 l-3-2" />',
      };
      return svg('i-help help-' + arg, bodies[arg] || bodies.target);
    }
    return '';
  }

  // Light orbs: a glowing point of light in the lane colour (no faces).
  // orb(color) is plain; orbIcon(color, spec) puts a line icon inside; orbText(color, text) shows initials.
  function orb(color, inner = '') {
    return `<svg class="orb" viewBox="0 0 64 64" aria-hidden="true">
      <circle class="halo" cx="32" cy="32" r="30" fill="${color}" opacity=".16"/>
      <circle class="glow" cx="32" cy="32" r="23" fill="${color}" opacity=".3"/>
      <circle class="core" cx="32" cy="32" r="17" fill="${color}"/>
      <circle cx="32" cy="32" r="17" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
      ${inner || '<ellipse cx="27" cy="26" rx="6" ry="4" fill="#fff" opacity=".4"/>'}
    </svg>`;
  }
  const orbIcon = (color, spec) => orb(color, `<g style="color:#fff">${icon(spec).replace('<svg ', '<svg x="18" y="22.5" width="28" height="19" ')}</g>`);
  const orbText = (color, text) => orb(color, `<text x="32" y="37.5" text-anchor="middle" font-family="Space Grotesk, Inter, sans-serif" font-weight="700" font-size="15" fill="#fff">${String(text).replace(/[<>&]/g, '')}</text>`);
  // Kept for compatibility with older call sites: a plain orb.
  const blob = color => orb(color);

  root.icon = icon;
  root.blob = blob;
  root.orb = orb;
  root.orbIcon = orbIcon;
  root.orbText = orbText;
})(typeof self !== 'undefined' ? self : this);
