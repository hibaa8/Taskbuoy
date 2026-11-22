(() => {
  if (globalThis.__focusCoachInstalled) return;
  globalThis.__focusCoachInstalled = true;
  // Replace orphaned UI left behind when an unpacked extension is reloaded.
  document.querySelectorAll('focus-coach-widget').forEach(node => node.remove());
  const host = document.createElement('focus-coach-widget');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial!important;position:fixed!important;right:18px!important;bottom:24px!important;z-index:2147483647!important;display:block!important;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;color:#252b49!important;color-scheme:light!important}
    *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #b87921;outline-offset:3px}
    .chip{display:flex;align-items:center;gap:9px;border:1px solid #c2c6ea;background:#f6f6ff;color:#292e51;box-shadow:0 4px 24px #15163825;border-radius:40px;padding:10px 15px;min-height:44px;font-weight:600}
    .eye{font-size:18px}.dot{width:7px;height:7px;background:#6863c5;border-radius:50%}.warn{background:#fff0df;border-color:#d79c65}.warn .dot{background:#b95e2b}.card,.toast{width:min(320px,calc(100vw - 36px));background:#ffffff;border:1px solid #d8dcef;box-shadow:0 8px 40px #17193630;border-radius:15px;padding:18px;margin-bottom:10px}.toast{border-color:#c07b42;background:#fff8e9}
    h2{font-size:18px;line-height:1.3;margin:0 0 8px;font-weight:650}p{margin:0 0 12px;overflow-wrap:anywhere}.sub{font-size:11px;color:#646b8a}.clock{font-size:36px;font-variant-numeric:tabular-nums;letter-spacing:-1px;margin:5px 0}.row{display:flex;gap:8px;margin-top:10px}.row button{flex:1}.main,.secondary{border-radius:8px;padding:9px 10px;border:1px solid #cdd1e9;background:#f1f2fc;color:#42417d;font-size:12px}.main{background:#4846a3;color:white;border-color:#4846a3}.link{background:none;border:0;color:#4846a3;text-decoration:underline;padding:5px 0;font-size:11px;text-underline-offset:3px;display:block}.heading{display:flex;align-items:start;justify-content:space-between;gap:8px}.close{background:none;border:0;font-size:20px;color:#686f8b;padding:0 3px}.badge{font-size:10px;text-transform:uppercase;letter-spacing:.9px;color:#62658b;margin-bottom:9px}.toast[hidden],.card[hidden],.chip[hidden]{display:none}.status{font-weight:600}.error{color:#954e2d;font-size:11px;margin:8px 0}.allowance{height:5px;background:#eee8d7;border-radius:4px;overflow:hidden;margin:7px 0 12px}.fill{height:100%;background:#c08445;width:0} @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  `;
  const element = (tag, cls = '', text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const wrap = element('div');
  const toast = element('section', 'toast'); toast.hidden = true; toast.setAttribute('role', 'alert');
  const toastTitle = element('h2'), toastMessage = element('p'), toastActions = element('div', 'row');
  const card = element('section', 'card'); card.hidden = true; card.setAttribute('aria-label', 'Taskbuoy controls');
  const heading = element('div', 'heading'); const headingText = element('div', 'badge', 'TASKBUOY · MONITORING ON');
  const collapse = element('button', 'close', '×'); collapse.type = 'button'; collapse.setAttribute('aria-label', 'Collapse Taskbuoy'); collapse.onclick = () => { card.hidden = true; chip.setAttribute('aria-expanded', 'false'); };
  heading.append(headingText, collapse);
  const title = element('h2'), timer = element('div', 'clock'), status = element('p', 'status');
  const progress = element('div', 'allowance'), fill = element('div', 'fill'); progress.append(fill);
  const camera = element('p', 'sub'), error = element('p', 'error'); error.setAttribute('role', 'status');
  const actions = element('div', 'row'), links = element('div');
  const chip = element('button', 'chip'); chip.type = 'button'; chip.setAttribute('aria-label', 'Taskbuoy monitoring status and timer'); chip.setAttribute('aria-expanded', 'false');
  const eye = element('span', 'eye', '◉'), dot = element('span', 'dot'), chipText = element('span');
  chip.append(eye, dot, chipText); chip.onclick = () => { card.hidden = !card.hidden; chip.setAttribute('aria-expanded', String(!card.hidden)); };
  const btn = (text, type, cls = 'secondary') => {
    const b = element('button', cls, text); b.type = 'button'; b.onclick = () => request(type); return b;
  };
  const back = btn('Return to work', 'RETURN', 'main'), rest = btn('5-min break', 'BREAK'); actions.append(back, rest);
  links.append(btn('This website is work', 'ALLOW', 'link'), btn('Camera setup / stop', 'OPEN_CAMERA', 'link'), btn('Dashboard', 'OPEN_DASHBOARD', 'link'));
  card.append(heading, title, timer, status, progress, camera, actions, links, error);
  toastActions.append(btn('Go back to work', 'RETURN', 'main'), btn('Take a break', 'BREAK'));
  const dismiss = element('button', 'link', 'Dismiss this reminder'); dismiss.onclick = () => { toast.hidden = true; };
  toast.append(toastTitle, toastMessage, toastActions, dismiss);
  wrap.append(toast, card, chip); shadow.append(style, wrap); document.documentElement.append(host);
  let data = null, lastEvent = null, receivedAt = Date.now(), toastUntil = 0, inFlight = false;
  function clock(ms) { const sec = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
  function render() {
    if (!data) return;
    const s = data.session;
    chip.hidden = !s;
    if (!s) card.hidden = true;
    if (toastUntil && Date.now() > toastUntil) toast.hidden = true;
    if (!s) return;
    const ms = s.endAt - Date.now();
    const onBreak = s.breakUntil > Date.now();
    const distracting = data.isActiveTab && s.category === 'distraction' && !onBreak;
    const since = s.distractionSinceNudge + (distracting ? Math.min(6000, Date.now() - receivedAt) : 0);
    const left = Math.max(0, s.graceSeconds * 1000 - since);
    const cameraWarn = data.camera && !['off', 'ready', 'calibrating', 'error', 'phone-visible'].includes(data.camera.status);
    chip.classList.toggle('warn', distracting || cameraWarn);
    chipText.textContent = `${clock(ms)} · ${onBreak ? 'Break' : distracting ? `Return in ${clock(left)}` : 'Coach on'}`;
    title.textContent = s.title; timer.textContent = clock(ms);
    status.textContent = onBreak ? 'Planned break · reminders paused' : distracting ? `Distracting website · return in ${clock(left)}` : data.isActiveTab && s.category === 'work' ? 'Working · not marked as distracting' : 'Browsing monitored · other activity';
    progress.hidden = !distracting;
    fill.style.width = `${Math.min(100, since / (s.graceSeconds * 1000) * 100)}%`;
    camera.textContent = data.camera && data.camera.status !== 'off' ? `Camera: ${data.camera.detail || data.camera.status} · estimate` : 'Browser tracking on · camera off';
    error.textContent = data.notice || '';
    back.textContent = distracting && data.closeDistractingTabs ? 'Close & return' : 'Return to work';
    rest.textContent = onBreak ? 'Resume now' : '5-min break'; rest.onclick = () => request(onBreak ? 'RESUME' : 'BREAK');
  }
  function receive(next) {
    if (data?.session?.id !== next.session?.id) { toast.hidden = true; toastUntil = 0; card.hidden = true; }
    data = next; receivedAt = Date.now();
    if (data.event && data.event.id !== lastEvent && data.isActiveTab) {
      lastEvent = data.event.id; toastUntil = Date.now() + 20000;
      toastTitle.textContent = data.event.kind === 'complete' ? 'Time is up' : data.event.kind === 'camera' ? 'Stay focused' : 'Go back to work';
      toastMessage.textContent = data.event.message; toast.hidden = false;
      toastActions.hidden = !data.session;
    }
    render();
  }
  async function request(type = 'WIDGET_GET') {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await chrome.runtime.sendMessage({ type });
      if (!result?.ok) throw Error(result?.error || 'Could not reach the coach.');
      if (result.widget) receive(result.widget);
      if (['RETURN', 'BREAK', 'RESUME', 'ALLOW'].includes(type)) toast.hidden = true;
    } catch (e) {
      if (!chrome.runtime?.id) { host.remove(); clearInterval(tick); clearInterval(poll); }
      else error.textContent = e.message;
    } finally { inFlight = false; }
  }
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'FC_STATE') receive(message); });
  const tick = setInterval(render, 1000);
  const poll = setInterval(() => { if (document.visibilityState === 'visible' && document.hasFocus() && data?.session) request(); }, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') request(); });
  window.addEventListener('focus', () => request());
  request();
})();
