// Transport for the Node server: Server-Sent Events for live updates, JSON endpoints for actions.
(function (root) {
  function token() {
    let id = null;
    try { id = localStorage.getItem('mp-id'); } catch {}
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
      try { localStorage.setItem('mp-id', id); } catch {}
    }
    return id;
  }

  function player() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('mp-player') || 'null'); } catch {}
    if (!p) { p = PulseCore.makePlayer(); try { localStorage.setItem('mp-player', JSON.stringify(p)); } catch {} }
    return PulseCore.cleanPlayer(p);
  }

  root.ServerTransport = function (role) {
    const key = new URLSearchParams(location.search).get('key') || '';
    const id = token();
    const me = player();
    const T = {
      me,
      joinUrl: location.origin,
      canControl: !!key,
      controlHint: 'Add ?key=… (printed in the server console) to the URL to control the screen',
      qrHtml: () => '<img src="/qr.svg" alt="QR code to join">',
      subscribe(onState, onReact) {
        const connect = () => {
          const es = new EventSource(`/events?role=${role}&a=${me.a}&n=${me.n}&c=${me.c}`);
          es.onopen = () => T.onStatus && T.onStatus('');
          es.onmessage = e => {
            const s = JSON.parse(e.data);
            if (s.joinUrl) T.joinUrl = s.joinUrl;
            onState(s, { pop: s.pop });
          };
          if (onReact) es.addEventListener('react', e => onReact(JSON.parse(e.data).r));
          es.onerror = () => { T.onStatus && T.onStatus('Reconnecting…'); es.close(); setTimeout(connect, 2000); };
        };
        connect();
      },
      act(action, word) {
        const extra = word ? '&word=' + encodeURIComponent(word) : '';
        return fetch(`/api/host/${action}?key=${encodeURIComponent(key)}${extra}`, { method: 'POST' })
          .then(r => { if (r.status === 403 && T.onStatus) T.onStatus(T.controlHint); });
      },
      getState: () => fetch('/api/state?id=' + encodeURIComponent(id)).then(r => r.json()),
      async vote(index, option, word) {
        try {
          const r = await fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, index, option, word }) });
          return r.ok ? 'ok' : r.status === 409 ? 'moved' : 'error';
        } catch { return 'error'; }
      },
      async ask(text) {
        try {
          const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, text }) });
          return r.ok ? 'ok' : r.status === 429 ? 'limit' : r.status === 400 ? 'short' : 'error';
        } catch { return 'error'; }
      },
      async upvote(qid, on) {
        try { const r = await fetch('/api/upvote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, qid, on }) }); return r.ok ? 'ok' : 'error'; }
        catch { return 'error'; }
      },
      loadConfig: () => fetch('/api/config?key=' + encodeURIComponent(key)).then(r => (r.ok ? r.json() : null)).then(c => (T.config = c)).catch(() => null),
      summary: () => fetch('/api/summary?key=' + encodeURIComponent(key)).then(r => r.json()),
      react(r) {
        fetch('/api/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, r }) }).catch(() => {});
      },
    };
    return T;
  };
})(typeof self !== 'undefined' ? self : this);
