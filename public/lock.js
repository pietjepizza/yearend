// Private content for the public website: the presentation itself is not in the pages.
// - The presenter screen (and the simulator) ask for the presenter key once, then load the full content
//   from Supabase (rpc pulse_get_content). A ?key=… in the address is taken and removed from the address bar.
// - Phones load only the poll questions, with the join code that the QR code on the big screen carries
//   (#j=…, rpc pulse_get_phone). Without it they are asked to scan the code.
(function (root) {
  const KEY = 'pulse-key', JOIN = 'pulse-join';
  const store = {
    get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch { return null; } },
    set(k, v, remember) { try { sessionStorage.setItem(k, v); if (remember) localStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {} },
  };
  async function rpc(url, anon, fn, args) {
    let r;
    try {
      r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    } catch { const e = new Error('offline'); e.offline = true; throw e; }
    const body = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((body && body.message) || 'error ' + r.status); e.denied = !!(body && body.code === '42501'); throw e; }
    if (!body || typeof body !== 'object' || !body.config) { const e = new Error('No content has been uploaded yet'); e.empty = true; throw e; }
    return body;
  }
  const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const STYLE = `<style>
    .lk { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(900px 600px at 15% -10%, #1b129e, transparent 60%), #07062f; color: #fff; font: 16px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .lk-card { width: min(440px, 100%); background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); border-radius: 20px; padding: 28px; box-shadow: 0 30px 80px rgba(0,0,20,.5); }
    .lk-ico { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: rgba(95,184,255,.16); color: #5fb8ff; margin-bottom: 14px; }
    .lk-ico svg { width: 26px; height: 26px; }
    .lk h1 { margin: 0 0 6px; font: 700 24px 'Space Grotesk', Inter, sans-serif; }
    .lk p { margin: 0 0 16px; color: rgba(255,255,255,.75); }
    .lk label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    .lk input[type=password] { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.25); color: #fff; font: 16px Inter, sans-serif; }
    .lk input[type=password]:focus { outline: 2px solid #5fb8ff; outline-offset: 1px; }
    .lk-check { display: flex; align-items: center; gap: 8px; margin: 12px 0 18px; font-size: 14px; color: rgba(255,255,255,.8); }
    .lk-check input { width: 18px; height: 18px; accent-color: #5fb8ff; }
    .lk button { width: 100%; padding: 13px; border: 0; border-radius: 12px; background: #3b6fff; color: #fff; font: 700 16px 'Space Grotesk', Inter, sans-serif; cursor: pointer; }
    .lk button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .lk button:disabled { opacity: .6; }
    .lk-err { min-height: 1.5em; margin: 10px 0 0; color: #ffc400; font-size: 14px; }
    .lk-foot { margin: 16px 0 0; font-size: 13px; color: rgba(255,255,255,.55); }
  </style>`;

  // Presenter: resolves with { key, data } once the right key is in.
  function presenter({ url, anon, el, what = 'presenter screen' }) {
    const params = new URLSearchParams(location.search);
    let fromUrl = params.get('key');
    if (fromUrl) {
      params.delete('key');
      history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    }
    const saved = fromUrl || store.get(KEY);
    return new Promise(resolve => {
      const tryKey = async (key, remember, quiet) => {
        try {
          const data = await rpc(url, anon, 'pulse_get_content', { p_key: key });
          store.set(KEY, key, remember);
          resolve({ key, data });
          return true;
        } catch (e) {
          if (e.denied) store.del(KEY);
          if (!quiet || !e.denied) show(e.denied ? 'That key is not right. Try again.' : e.empty ? 'No content has been uploaded yet.' : 'Could not reach the server. Check the connection and try again.');
          else show('');
          return false;
        }
      };
      function show(msg) {
        if (!el.querySelector('.lk')) {
          el.innerHTML = STYLE + `<main class="lk"><form class="lk-card" id="lkForm" autocomplete="off">
            <div class="lk-ico">${LOCK_SVG}</div>
            <h1>Private presentation</h1>
            <p>Enter the presenter key to open the ${what}. You only need to do this once on this computer.</p>
            <label for="lkKey">Presenter key</label>
            <input type="password" id="lkKey" autocomplete="current-password" spellcheck="false">
            <label class="lk-check"><input type="checkbox" id="lkRemember" checked> Remember on this computer</label>
            <button id="lkGo">Open</button>
            <p class="lk-err" id="lkErr" role="alert"></p>
            <p class="lk-foot">Joining from your phone? Scan the QR code on the big screen instead.</p>
          </form></main>`;
          el.querySelector('#lkForm').onsubmit = async e => {
            e.preventDefault();
            const k = el.querySelector('#lkKey').value.trim();
            if (!k) return;
            el.querySelector('#lkGo').disabled = true;
            await tryKey(k, el.querySelector('#lkRemember').checked, false);
            const go = el.querySelector('#lkGo'); if (go) go.disabled = false;
          };
        }
        const err = el.querySelector('#lkErr'); if (err) err.textContent = msg;
        const inp = el.querySelector('#lkKey'); if (inp) inp.focus();
      }
      if (saved) tryKey(saved, true, true); else show('');
    });
  }

  // Phone: resolves with the poll content once the join code from the QR code works.
  function phone({ url, anon, el }) {
    const m = location.hash.match(/[#&]j=([A-Za-z0-9_-]{6,64})/);
    if (m) { store.set(JOIN, m[1], true); history.replaceState(null, '', location.pathname + location.search); }
    const code = (m && m[1]) || store.get(JOIN);
    const scan = msg => {
      addEventListener('hashchange', () => { if (/[#&]j=/.test(location.hash)) location.reload(); });
      el.innerHTML = STYLE + `<main class="lk"><div class="lk-card"><div class="lk-ico">${LOCK_SVG}</div>
        <h1>Scan to join</h1><p>${msg}</p><p class="lk-foot">The QR code is on the big screen in the room.</p></div></main>`;
    };
    return new Promise(resolve => {
      if (!code) return scan('Scan the QR code on the big screen with your phone camera to join.');
      rpc(url, anon, 'pulse_get_phone', { p_code: code }).then(resolve).catch(e => {
        if (e.denied) { store.del(JOIN); scan('This link has expired. Scan the QR code on the big screen again.'); }
        else scan('Could not reach the server. Check your connection, then reload this page.');
      });
    });
  }

  const forget = () => { store.del(KEY); location.reload(); };
  root.PulseLock = { presenter, phone, forget };
})(typeof self !== 'undefined' ? self : this);
