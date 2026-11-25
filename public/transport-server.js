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

  root.ServerTransport = function (role) {
    const key = new URLSearchParams(location.search).get('key') || '';
    const id = token();
    const T = {
      joinUrl: location.origin,
      canControl: !!key,
      controlHint: 'Add ?key=… (printed in the server console) to the URL to control the screen',
      qrHtml: () => '<img src="/qr.svg" alt="QR code to join">',
      subscribe(onState, onReact) {
        const connect = () => {
          const es = new EventSource('/events?role=' + role);
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
      react(r) {
        fetch('/api/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, r }) }).catch(() => {});
      },
    };
    return T;
  };
})(typeof self !== 'undefined' ? self : this);
