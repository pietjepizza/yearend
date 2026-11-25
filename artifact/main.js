// Entry point for the claude.ai test build: "#join" shows the phone view, anything else the presenter screen.
(function () {
  const app = document.getElementById('app');
  const isPhone = location.hash === '#join';
  addEventListener('hashchange', () => location.reload());
  const T = ArtifactTransport(window.PULSE_CONFIG, isPhone ? 'phone' : 'host', window.PULSE_JOIN_URL || '');
  const qr = document.getElementById('qr-template');
  T.qrHtml = () => (qr ? qr.innerHTML : '<div style="color:#0b0b3b;font:600 13px/1.4 Inter,sans-serif;padding:8px">Open this page with #join on your phone</div>');
  if (isPhone) mountJoin(app, T); else mountHost(app, T);
})();
