// Live backend for the static website (GitHub Pages), built on Supabase.
// It offers the small db / room / user surface that ArtifactTransport already uses:
//   db.doc('live/state')      → table pulse_state (row 'main'), written via rpc pulse_set_state (needs the presenter key)
//   db.collection('votes')    → table pulse_votes, live through Postgres changes
//   db.doc('votes/<token>')   → rpc pulse_vote
//   room                      → a Supabase Realtime channel: broadcast for reactions, presence for "who is connected"
// Needs the supabase-js UMD build loaded first (global `supabase`).
(function (root) {
  root.SupabaseBackend = function ({ url, key, hostKey = '', roomName = 'pulse-room', presenceKey }) {
    const sb = root.supabase.createClient(url, key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });
    const fail = (code, e) => { const err = new Error((e && e.message) || code); err.code = code; throw err; };
    const voteDoc = r => ({ id: r.token, data: () => ({ epoch: r.epoch, answers: r.answers || {} }) });

    // If the realtime connection (a WebSocket) cannot be opened, for example on a network that blocks
    // WebSockets, fall back to polling so the screen and the votes keep flowing.
    function withFallback(channel, load, everyMs) {
      let live = false, timer = null;
      const startPolling = () => { if (!timer && !live) timer = setInterval(load, everyMs); };
      const stopPolling = () => { clearInterval(timer); timer = null; };
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') { live = true; stopPolling(); load(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { live = false; startPolling(); }
      });
      setTimeout(startPolling, 4000);
      load();
      return () => { stopPolling(); sb.removeChannel(channel); };
    }

    function stateRef() {
      return {
        onSnapshot(next, onError) {
          let lastAt = '';
          const deliver = (data, at) => { if (at && at === lastAt) return; lastAt = at || lastAt; next({ exists: !!data, data: () => data, metadata: { fromCache: false } }); };
          const load = async () => {
            const { data, error } = await sb.from('pulse_state').select('data,updated_at').eq('id', 'main').maybeSingle();
            if (error) { if (onError) onError({ code: 'unavailable', message: error.message }); return; }
            deliver(data && data.data, data && data.updated_at);
          };
          const ch = sb.channel('pulse-state-' + Math.random().toString(36).slice(2, 8))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pulse_state' }, p => {
              const row = p.new;
              if (row && row.id === 'main') deliver(row.data, row.updated_at);
            });
          return withFallback(ch, load, 2000);
        },
        async set(obj) {
          const { error } = await sb.rpc('pulse_set_state', { p_key: hostKey, p_data: obj });
          if (error) fail(error.code === '42501' ? 'invalid_argument' : 'unavailable', error);
        },
      };
    }

    const db = {
      doc(path) {
        if (path === 'live/state') return stateRef();
        if (path.startsWith('votes/')) {
          const token = path.slice(6);
          return {
            async set(body) {
              const { error } = await sb.rpc('pulse_vote', { p_token: token, p_epoch: String(body.epoch || ''), p_answers: body.answers || {} });
              if (error) fail('unavailable', error);
            },
          };
        }
        throw new TypeError('Unknown document ' + path);
      },
      collection(path) {
        if (path !== 'votes') throw new TypeError('Unknown collection ' + path);
        return {
          onSnapshot(next) {
            const known = new Map();   // token -> updated_at
            let first = true;
            const emit = changes => { if (changes.length || first) next({ docChanges: () => changes }); first = false; };
            const load = async () => {
              const { data, error } = await sb.from('pulse_votes').select('token,epoch,answers,updated_at').limit(2000);
              if (error || !data) return;
              const changes = [], seen = new Set();
              for (const r of data) {
                seen.add(r.token);
                if (known.get(r.token) === r.updated_at) continue;
                changes.push({ type: known.has(r.token) ? 'modified' : 'added', doc: voteDoc(r) });
                known.set(r.token, r.updated_at);
              }
              for (const id of [...known.keys()]) if (!seen.has(id)) { known.delete(id); changes.push({ type: 'removed', doc: { id, data: () => ({}) } }); }
              emit(changes);
            };
            const ch = sb.channel('pulse-votes-' + Math.random().toString(36).slice(2, 8))
              .on('postgres_changes', { event: '*', schema: 'public', table: 'pulse_votes' }, p => {
                if (p.eventType === 'DELETE') {
                  const id = p.old && p.old.token;
                  if (id && known.has(id)) { known.delete(id); emit([{ type: 'removed', doc: { id, data: () => ({}) } }]); }
                  return;
                }
                const r = p.new;
                if (known.get(r.token) === r.updated_at) return;
                const t = known.has(r.token) ? 'modified' : 'added';
                known.set(r.token, r.updated_at);
                emit([{ type: t, doc: voteDoc(r) }]);
              });
            return withFallback(ch, load, 1500);
          },
        };
      },
    };

    // ---- room: reactions (broadcast) + who is connected (presence) ----
    const ch = sb.channel(roomName, { config: { broadcast: { self: false }, presence: { key: presenceKey || Math.random().toString(36).slice(2) } } });
    const listeners = {}, peerSubs = [];
    let mine = null, joined = false;
    ch.on('broadcast', { event: 'react' }, ({ payload }) => (listeners.react || []).forEach(f => f({ topic: 'react', data: payload })));
    ch.on('presence', { event: 'sync' }, () => {
      const peers = Object.values(ch.presenceState()).flat().map(meta => ({ presence: meta }));
      peerSubs.forEach(f => f({ peers, joined: [], left: [], updated: [] }));
    });
    ch.subscribe(async status => { if (status === 'SUBSCRIBED') { joined = true; if (mine) await ch.track(mine); } });
    const room = {
      on(topic, fn) { (listeners[topic] ||= []).push(fn); return () => { listeners[topic] = listeners[topic].filter(x => x !== fn); }; },
      emit(topic, data) { return ch.send({ type: 'broadcast', event: topic, payload: data }).then(() => {}); },
      presence(obj) { mine = { ...(mine || {}), ...obj }; return joined ? ch.track(mine).then(() => {}) : Promise.resolve(); },
      onPeers(fn) { peerSubs.push(fn); return () => {}; },
    };

    const user = { canEdit: async () => !!hostKey };
    return { db, room, user };
  };
})(typeof self !== 'undefined' ? self : this);
