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

    if (kind === 'help') {
      const bodies = {
        target: '<circle cx="22" cy="17" r="12"/><circle cx="22" cy="17" r="6.5"/><circle class="h" cx="22" cy="17" r="2.2" fill="currentColor" stroke="none"/><path class="h" d="M40 3 L24.5 14.5 M35 3 h5 v5"/>',
        focus: '<path d="M11 22 v-5 a13 13 0 0 1 26 0 v5"/><rect class="h" x="8" y="19" width="7" height="10" rx="2.5" fill="currentColor" stroke="none"/><rect class="h" x="33" y="19" width="7" height="10" rx="2.5" fill="currentColor" stroke="none"/>',
        team: '<circle cx="18" cy="10" r="4.5"/><path d="M8 29 c0-6.5 4.5-10 10-10 s10 3.5 10 10"/><circle class="h" cx="32" cy="11" r="4"/><path class="h" d="M28 20.5 c1.2-.6 2.6-.9 4-.9 c5 0 8.5 3.2 8.5 9.4"/>',
        trophy: '<path d="M16 4 h16 v7 a8 8 0 0 1 -16 0 z"/><path d="M16 7 h-4.5 a4.5 4.5 0 0 0 5 6.5 M32 7 h4.5 a4.5 4.5 0 0 1 -5 6.5 M24 19 v5 M18 28.5 h12 M20 24.5 h8"/><path class="h" d="M24 7.5 l1.2 2.4 2.6.4 -1.9 1.8 .5 2.6 -2.4-1.3 -2.4 1.3 .5-2.6 -1.9-1.8 2.6-.4z" fill="currentColor" stroke="none"/>',
        snow: `<path class="h" d="${snowflake(24, 16, 13)}" stroke-width="2.2"/>`,
      };
      return svg('i-help help-' + arg, bodies[arg] || bodies.target);
    }
    return '';
  }

  // Blob characters: a round body in the lane colour with an expression for the mood (1 tired … 5 ecstatic).
  // Classes .lid (blink), .eyes (look around) and .bodyshape (squash) are animated in CSS.
  const INK = '#1d1b3a';
  function blob(color, mood = 4, variant = 0) {
    const bodies = [
      'M32 5 C49 5 59 17 59 34 C59 51 48 60 32 60 C16 60 5 51 5 34 C5 17 15 5 32 5 Z',
      'M31 6 C47 4 60 16 59 33 C58 50 47 61 31 60 C15 59 4 49 6 32 C8 16 17 7 31 6 Z',
      'M33 5 C50 7 60 19 58 36 C56 52 45 61 30 59 C14 57 4 46 6 31 C8 15 18 4 33 5 Z',
    ];
    const m = Math.max(1, Math.min(5, Math.round(mood)));
    const mouths = {
      5: `<path d="M21 39 Q32 56 43 39 Z" fill="${INK}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 47 Q32 51 37 47 Q35 44 32 45 Q29 44 27 47 Z" fill="#ff8fa3"/>`,
      4: `<path d="M23 41 Q32 50 41 41" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      3: `<path d="M25 45 H39" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      2: `<path d="M23 46 Q27.5 42 32 46 Q36.5 50 41 46" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M51 17 Q54 23 51 25 Q48 23 51 17 Z" fill="#7fd6ff" stroke="${INK}" stroke-width="1.5"/>`,
      1: `<path d="M24 48 Q32 41 40 48" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><text x="46" y="16" font-family="Fredoka, Nunito, sans-serif" font-weight="700" font-size="9" fill="${INK}">z</text><text x="51" y="10" font-family="Fredoka, Nunito, sans-serif" font-weight="700" font-size="7" fill="${INK}">z</text>`,
    };
    const lid = m === 1 ? 'tired' : '';
    const cheeks = m >= 4 ? `<ellipse cx="16" cy="40" rx="4" ry="2.6" fill="#ff8fa3" opacity=".75"/><ellipse cx="48" cy="40" rx="4" ry="2.6" fill="#ff8fa3" opacity=".75"/>` : '';
    return `<svg class="blob mood-${m}" viewBox="0 0 64 68" aria-hidden="true">
      <ellipse cx="22" cy="62" rx="7" ry="4" fill="${INK}"/><ellipse cx="42" cy="62" rx="7" ry="4" fill="${INK}"/>
      <path class="bodyshape" d="${bodies[variant % bodies.length]}" fill="${color}" stroke="${INK}" stroke-width="3"/>
      <path d="M16 18 Q22 11 30 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
      ${cheeks}
      <g class="eyes">
        <circle cx="24" cy="30" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="40" cy="30" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
        <circle class="pupil" cx="25" cy="31" r="2.8" fill="${INK}"/><circle class="pupil" cx="41" cy="31" r="2.8" fill="${INK}"/>
        <rect class="lid ${lid}" x="16" y="22" width="32" height="9" fill="${color}"/>
      </g>
      ${mouths[m]}
    </svg>`;
  }

  root.icon = icon;
  root.blob = blob;
})(typeof self !== 'undefined' ? self : this);
