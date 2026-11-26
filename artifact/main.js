// Entry point for the claude.ai test build: "#join" shows the phone view, anything else the presenter screen.
// Inside the simulator, window.SIM = { role: 'host' | 'phone', slot } picks the view instead, runs fully
// locally (no shared database), and the presenter exposes window.__sim for the simulator's control panel.
(function () {
  const app = document.getElementById('app');
  const SIM = window.SIM || null;
  const isPhone = SIM ? SIM.role === 'phone' : location.hash === '#join';
  if (!SIM) addEventListener('hashchange', () => location.reload());
  const config = window.PULSE_CONFIG;
  const T = ArtifactTransport(config, isPhone ? 'phone' : 'host', window.PULSE_JOIN_URL || '', SIM ? { local: true, slot: SIM.slot } : {});
  const qr = document.getElementById('qr-template');
  T.qrHtml = () => (qr ? qr.innerHTML : '<div style="color:#0b0b3b;font:600 13px/1.4 Inter,sans-serif;padding:8px">Open this page with #join on your phone</div>');
  if (SIM && !isPhone) T.joinLabel = 'Simulator: vote on the phones beside this screen';
  if (isPhone) mountJoin(app, T); else mountHost(app, T);

  if (SIM && !isPhone) {
    window.__sim = {
      act: (a, arg) => T.act(a, arg),
      goto: i => T.act('goto', i),
      simulate: (on, o) => T.simulate(on, o),
      simulating: () => T.simulating(),
      react: r => T.simReact(r),
      setTimer: sec => { config.timer = sec; config.questions.forEach(q => delete q.timer); },
      onState: cb => T.subscribe(cb),
      stages: () => PulseCore.steps(config).map((st, i) => ({ i, kind: st.kind, label: PulseCore.navLabel(config, st),
        title: st.kind === 'question' ? config.questions[st.qi].title : st.kind === 'slide' ? st.slide.title : '' })),
      reactions: config.reactions,
    };
  }
})();
