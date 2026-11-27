// Entry point for the bundled app.
// - claude.ai test build: "#join" shows the phone view, anything else the presenter screen; the content is inlined.
// - Simulator: window.SIM = { role: 'host' | 'phone', slot, config } picks the view, runs fully locally, and the
//   presenter exposes window.__sim for the simulator's control panel.
// - Public website (window.PULSE_LIVE): the content is NOT in the page. The presenter screen asks for the presenter
//   key and loads the content from Supabase; phones load the poll questions with the join code from the QR code.
// "#notes" on a presenter page opens the presenter view (speaker notes, next screen, controls) instead.
(function () {
  const app = document.getElementById('app');
  const SIM = window.SIM || null;
  const LIVE = window.PULSE_LIVE || null;   // { url, key, role }: the static website talking to Supabase
  const isPhone = SIM ? SIM.role === 'phone' : LIVE && LIVE.role ? LIVE.role === 'phone' : location.hash === '#join';
  const isNotes = !isPhone && location.hash === '#notes';
  if (!SIM && !LIVE) addEventListener('hashchange', () => location.reload());

  function start(config, extra = {}) {
    let opts = {};
    if (SIM) opts = { local: true, slot: SIM.slot };
    else if (LIVE && window.SupabaseBackend) {
      opts = {
        backend: SupabaseBackend({ url: LIVE.url, key: LIVE.key, hostKey: isPhone ? '' : extra.key || '' }),
        controlHint: 'This screen is view only',
        noSim: new URLSearchParams(location.search).get('sim') !== '1',
      };
    }
    const T = ArtifactTransport(config, isPhone ? 'phone' : 'host', extra.joinUrl || window.PULSE_JOIN_URL || '', opts);
    const tpl = document.getElementById('qr-template');
    const qr = extra.qr || (tpl ? tpl.innerHTML : '');
    T.qrHtml = () => qr || '<div style="color:#0b0b3b;font:600 13px/1.4 Inter,sans-serif;padding:8px">Open this page with #join on your phone</div>';
    if (extra.lock) T.lock = extra.lock;
    if (!isPhone && !SIM) T.notesUrl = () => location.pathname + location.search + '#notes';
    if (SIM && !isPhone) T.joinLabel = SIM.label || 'Simulator: vote on the phones beside this screen';
    if (isPhone) mountJoin(app, T);
    else if (isNotes) mountNotes(app, T);
    else mountHost(app, T);

    if (SIM && !isPhone) {
      window.__sim = {
        act: (a, arg) => T.act(a, arg),
        goto: i => T.act('goto', i),
        simulate: (on, o) => T.simulate(on, o),
        simulating: () => T.simulating(),
        react: r => T.simReact(r),
        setTimer: sec => { config.timer = sec; config.questions.forEach(q => delete q.timer); },
        onState: cb => T.subscribe(cb),
        stages: () => PulseCore.steps(config).map((st, i) => ({ i, kind: st.kind, label: PulseCore.navLabel(config, st), extra: st.extra,
          title: st.kind === 'question' ? config.questions[st.qi].title : st.kind === 'slide' ? st.slide.title : '' })),
        reactions: config.reactions,
      };
    }
  }

  const inline = (SIM && SIM.config) || window.PULSE_CONFIG;
  if (inline) start(inline);
  else if (LIVE && window.PulseLock) {
    if (isPhone) PulseLock.phone({ url: LIVE.url, anon: LIVE.key, el: app }).then(data => start(data.config));
    else PulseLock.presenter({ url: LIVE.url, anon: LIVE.key, el: app, what: isNotes ? 'presenter view' : 'presenter screen' })
      .then(({ key, data }) => start(data.config, { key, qr: data.qr, joinUrl: data.joinUrl, lock: PulseLock.forget }));
  }
})();
