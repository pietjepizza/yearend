// Presenter guide and tools, opened with the "Guide" button or the ? key on the presenter screen:
// how to go full screen, the keys and buttons, a before-you-start checklist, the presenter view,
// the results download, the February check-in, and a check for placeholders still left in the content.
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // ---------- full screen ----------
  function toggleFullscreen() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else {
      const el = d.documentElement;
      const go = el.requestFullscreen || el.webkitRequestFullscreen;
      if (go) Promise.resolve(go.call(el)).catch(() => {});
    }
  }

  // ---------- placeholders still in the content ----------
  function placeholders(config) {
    if (!config) return null;
    const found = [];
    const scan = (where, v) => {
      if (typeof v === 'string') {
        const hits = v.match(/\[[^\]]+\]|\bXX\b/g);
        if (hits) found.push({ where, text: v });
      } else if (Array.isArray(v)) v.forEach(x => scan(where, x));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'demo' && k !== 'notes') scan(where, x);
    };
    (config.show || []).forEach((st, i) => { if (st.type !== 'question') scan(`${i + 1} · ${st.nav || st.title || st.type}`, st); });
    (config.questions || []).forEach(q => scan(q.type === 'award' ? 'Award vote' : `Question “${q.title}”`, q));
    scan('Timeline', config.roadmap && { rows: config.roadmap.rows, holidays: config.roadmap.holidays });
    return found;
  }

  // ---------- results summary (a standalone page to save or print) ----------
  function summaryHtml(sum) {
    const day = new Date(sum.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const qs = (sum.questions || []).filter(q => q.stats && q.stats.n);
    const block = q => {
      const rows = q.options.map(o => {
        const c = q.counts[o.id] || 0, pct = q.stats.n ? Math.round(100 * c / q.stats.n) : 0;
        return `<tr><td>${esc(String(o.label).replace(/[\[\]]/g, ''))}</td><td class="bar"><i style="width:${pct}%"></i></td><td class="n">${pct}%</td><td class="n">${c}</td></tr>`;
      }).join('');
      const words = Object.entries(q.words || {}).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => `<span>${esc(w)}${n > 1 ? ` <b>${n}</b>` : ''}</span>`).join('');
      const label = q.type === 'award' ? 'Improvement Award' : q.group === 'checkin' ? 'February check-in' : 'Poll';
      return `<section>
        <div class="k">${label} · ${q.stats.n} response${q.stats.n === 1 ? '' : 's'}${q.stats.avg != null ? ` · average ${q.stats.avg} / 5` : ''}</div>
        <h2>${esc(q.title)}</h2>
        ${q.takeaway && q.type !== 'award' ? `<p class="take">${esc(q.takeaway)}</p>` : ''}
        ${q.type === 'award' && q.stats.top ? `<p class="take">Winner: <b>${esc(String(q.stats.top).replace(/[\[\]]/g, ''))}</b> (${q.stats.topPct}% of the votes)</p>` : ''}
        <table>${rows}</table>
        ${words ? `<div class="words">${words}</div>` : ''}
        ${q.pledge ? `<p class="pledge"><b>We'll do:</b> ${esc(q.pledge)}</p>` : ''}
      </section>`;
    };
    const qa = (sum.qa || []).map(x => `<li><b>${x.votes}</b> ${esc(x.text)}${x.done ? ' <em>answered</em>' : ''}</li>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(sum.event)} · Results</title>
<style>
  :root { --ink: #0b0b3b; --blue: #10069f; --sky: #3b6fff; --muted: #5b5f7a; --line: #e2e4ef; }
  body { margin: 0; background: #fff; color: var(--ink); font: 15px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 40px 20px 60px; }
  header { border-bottom: 3px solid var(--blue); padding-bottom: 16px; margin-bottom: 8px; }
  .kick { color: var(--sky); font-weight: 700; letter-spacing: .1em; text-transform: uppercase; font-size: 12px; }
  h1 { margin: 6px 0 4px; font-size: 30px; line-height: 1.15; }
  .meta { color: var(--muted); }
  section { padding: 22px 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
  .k { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
  h2 { margin: 4px 0 8px; font-size: 20px; line-height: 1.25; }
  .take { margin: 0 0 10px; font-weight: 600; color: var(--blue); }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px 5px 0; vertical-align: middle; }
  td.bar { width: 40%; } td.bar i { display: block; height: 10px; border-radius: 99px; background: var(--sky); min-width: 2px; }
  td.n { text-align: right; width: 48px; font-variant-numeric: tabular-nums; color: var(--muted); }
  .words { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .words span { background: #eef1ff; border-radius: 99px; padding: 2px 10px; font-size: 13px; }
  .pledge { margin: 10px 0 0; }
  ol { padding-left: 0; list-style: none; margin: 8px 0 0; }
  ol li { padding: 7px 0; border-bottom: 1px solid var(--line); }
  ol li b { display: inline-block; min-width: 34px; color: var(--sky); }
  em { color: var(--muted); font-style: normal; font-size: 12px; border: 1px solid var(--line); border-radius: 99px; padding: 0 8px; margin-left: 6px; }
  footer { margin-top: 24px; color: var(--muted); font-size: 13px; }
  @media print { main { padding: 0; } }
</style></head><body><main>
<header><div class="kick">${esc(sum.team)}</div><h1>${esc(sum.event)}: results</h1>
<div class="meta">${esc(day)} · ${sum.participants} participant${sum.participants === 1 ? '' : 's'} · fully anonymous</div></header>
${qs.length ? qs.map(block).join('') : '<section><p>No votes yet.</p></section>'}
${qa ? `<section><div class="k">Q&amp;A · ${sum.qa.length} question${sum.qa.length === 1 ? '' : 's'}, by votes</div><h2>Your questions</h2><ol>${qa}</ol></section>` : ''}
<footer>No names were collected: every answer was anonymous. Generated by Peak Season Pulse.</footer>
</main></body></html>`;
  }
  async function downloadSummary(T) {
    const sum = await Promise.resolve(T.summary());
    const html = summaryHtml(sum);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `all-hands-results-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- the guide ----------
  function mount({ T, getState }) {
    const el = document.createElement('div');
    el.className = 'help';
    el.id = 'help';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'helpTitle');
    document.body.appendChild(el);
    const fsKey = isMac ? '<kbd>Ctrl</kbd> <kbd>⌘</kbd> <kbd>F</kbd>' : '<kbd>F11</kbd>';

    async function render() {
      if (!T.config && T.loadConfig) await T.loadConfig();
      const s = getState() || {};
      const list = placeholders(T.config);
      const inCheckin = !!s.extra;
      el.innerHTML = `
        <div class="help-card">
          <div class="help-head"><h2 id="helpTitle">Presenter guide</h2><button class="help-x" data-h="close" aria-label="Close the guide">✕</button></div>
          <div class="help-grid">
            <section>
              <h3>Before you start</h3>
              <ol class="help-steps">
                <li><b>Go full screen.</b> Press ${fsKey} or <kbd>F</kbd>, or click <i>Full screen</i> below. Nobody then sees the address bar or your key.</li>
                <li><b>Clear the test votes.</b> Move the mouse and click <i>Reset</i> twice in the bar at the bottom. Skip this before the February check-in if you want the comparison with December.</li>
                <li><b>Presenter view (optional).</b> Click <i>Open presenter view</i>: it opens on your laptop with notes and the next screen. Drag this window to the projector and make it full screen.</li>
                <li><b>Test the QR code</b> on the Join screen with your own phone.</li>
                <li><b>Clicker:</b> a presentation clicker works too. It sends Page Down and Page Up.</li>
              </ol>
            </section>
            <section>
              <h3>Keys</h3>
              <table class="help-keys">
                <tr><td><kbd>→</kbd> <kbd>Space</kbd> <kbd>PgDn</kbd></td><td>Next screen (phones follow)</td></tr>
                <tr><td><kbd>←</kbd> <kbd>PgUp</kbd></td><td>Previous screen</td></tr>
                <tr><td><kbd>H</kbd></td><td>Reveal the results, or hide them again. Award: the drumroll. Timeline: skip the animation. Tug of war: start, and again for a rematch.</td></tr>
                <tr><td><kbd>F</kbd></td><td>Full screen on or off</td></tr>
                <tr><td><kbd>S</kbd></td><td>Snow on or off</td></tr>
                <tr><td><kbd>U</kbd></td><td>Bring back removed words, Q&amp;A questions and kudos</td></tr>
                <tr><td><kbd>C</kbd> then <kbd>C</kbd></td><td>Clear the votes of the current question</td></tr>
                <tr><td><kbd>?</kbd> / <kbd>Esc</kbd></td><td>Open or close this guide</td></tr>
              </table>
              <h3>Mouse</h3>
              <ul class="help-list">
                <li>Move the mouse to show the bar at the bottom: <i>←</i> <i>→</i>, <i>Reveal now</i>, <i>Snow</i>, <i>Reset</i> (click twice), <i>Full screen</i> and <i>Guide</i>.</li>
                <li>Click a word in the word cloud to remove it.</li>
                <li>Q&amp;A: click a question once to mark it answered, again to hide it.</li>
                <li>Kudos wall: click a card to remove it.</li>
              </ul>
            </section>
            <section>
              <h3>Tools</h3>
              <div class="help-tools">
                <button data-h="full">Full screen</button>
                ${T.notesUrl ? '<button data-h="notes">Open presenter view</button>' : ''}
                ${T.summary ? '<button data-h="export">Download results</button>' : ''}
                ${T.config && PulseCore.firstExtra(T.config) >= 0 ? `<button data-h="checkin">${inCheckin ? 'Back to the all-hands' : 'Go to the February check-in'}</button>` : ''}
                ${T.lock ? '<button data-h="lock">Lock this screen</button>' : ''}
              </div>
              <p class="help-note">The February check-in uses the same QR code. It sits after the finale, so <i>Next</i> never runs into it by accident.</p>
              <h3>Content check</h3>
              ${list == null ? '<p class="help-note">Available once the content is loaded.</p>'
                : !list.length ? '<p class="help-ok">✓ Everything is filled in.</p>'
                : `<p class="help-warn">${list.length} text${list.length === 1 ? '' : 's'} still contain a [placeholder] or XX:</p>
                   <ul class="help-ph">${list.slice(0, 40).map(x => `<li><b>${esc(x.where)}</b> ${esc(x.text)}</li>`).join('')}</ul>`}
            </section>
          </div>
        </div>`;
    }
    const api = {
      async open() { await render(); el.hidden = false; el.querySelector('.help-x').focus(); },
      close() { el.hidden = true; },
      toggle() { if (el.hidden) api.open(); else api.close(); },
      isOpen: () => !el.hidden,
      fullscreen: toggleFullscreen,
      openNotes() { if (T.notesUrl) window.open(T.notesUrl(), 'pulse-presenter-view', 'width=1280,height=820'); },
      download: () => downloadSummary(T),
    };
    el.addEventListener('click', e => {
      if (e.target === el) return api.close();
      const b = e.target.closest('[data-h]');
      if (!b) return;
      const h = b.dataset.h;
      if (h === 'close') api.close();
      else if (h === 'full') toggleFullscreen();
      else if (h === 'notes') api.openNotes();
      else if (h === 'export') api.download();
      else if (h === 'lock') T.lock();
      else if (h === 'checkin') {
        const s = getState() || {};
        T.act('goto', s.extra ? 0 : PulseCore.firstExtra(T.config));
        api.close();
      }
    });
    return api;
  }

  root.PulseHelp = { mount, summaryHtml, downloadSummary, toggleFullscreen, placeholders };
})(typeof self !== 'undefined' ? self : this);
