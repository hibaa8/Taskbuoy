// Packaged UI only; session configuration is validated and saved atomically by START.
export function createSessionSetup(onConfirm) {
  const dialog = document.createElement('dialog');
  dialog.id = 'session-setup';
  dialog.className = 'setup-dialog';
  dialog.setAttribute('aria-labelledby', 'setup-title');
  dialog.innerHTML = `
    <form id="setup-form">
      <p class="eyebrow">BEFORE YOU BEGIN</p><h2 id="setup-title">Set up this focus session</h2>
      <p id="setup-intention"></p>
      <p class="muted">Review these settings before the timer starts. They apply to this session and become your defaults for the next one.</p>
      <label>Distracting websites<textarea name="domains" rows="3" placeholder="youtube.com, instagram.com"></textarea></label>
      <label>Approved work websites<textarea name="workDomains" rows="2" placeholder="github.com, docs.google.com"></textarea></label>
      <p class="small muted">Unmarked Chrome tabs count as work. Work allowances take priority. Other desktop apps are not tracked.</p>
      <div class="form-row"><label>Grace period<select name="graceSeconds"><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></label>
      <label>When distracted<select name="mode"><option value="gentle">Gentle reminder</option><option value="automatic">Automatic return</option></select></label></div>
      <label class="checkbox"><input type="checkbox" name="closeDistractingTabs">Close the active distracting tab when returning</label>
      <label class="checkbox"><input type="checkbox" name="sound">Play reminder and completion chimes</label>
      <label class="checkbox"><input type="checkbox" name="escalation">Open a motivational video after repeated reminders</label>
      <details><summary>Video and optional camera settings</summary>
        <label>Motivational YouTube video<input name="videoUrl" type="url" required></label>
        <label>Reminders before a video reset<input name="escalationAfter" type="number" min="2" max="10" required></label>
        <label>Camera cue delay<select name="cameraDelaySeconds"><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option></select></label>
        <p class="small muted">Camera access remains off until you separately enable it. Playback connects to the hosted video player and YouTube; it starts muted when allowed.</p>
      </details>
      <p id="setup-error" class="notice error" role="alert" hidden></p>
      <div class="setup-actions"><button id="setup-cancel" class="secondary" type="button">Cancel</button><button id="setup-confirm" class="primary" type="submit">Save & start session</button></div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const cancel = dialog.querySelector('#setup-cancel');
  const confirm = dialog.querySelector('#setup-confirm');
  const error = dialog.querySelector('#setup-error');
  let pending = null, submitting = false;
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submitting || !pending) return;
    submitting = true; confirm.disabled = true; cancel.disabled = true; error.hidden = true;
    const settings = Object.fromEntries(new FormData(form));
    for (const key of ['closeDistractingTabs', 'sound', 'escalation']) settings[key] = form.elements[key].checked;
    try { await onConfirm(pending, settings); pending = null; dialog.close(); }
    catch (e) { error.textContent = e.message; error.hidden = false; }
    finally { submitting = false; confirm.disabled = false; cancel.disabled = false; }
  });
  return {
    open(session, settings) {
      pending = session; error.hidden = true;
      dialog.querySelector('#setup-intention').textContent = `Your intention: ${session.title}`;
      for (const name of ['domains', 'workDomains']) form.elements[name].value = Array.isArray(settings[name]) ? settings[name].join('\n') : settings[name];
      for (const name of ['graceSeconds', 'mode', 'escalationAfter', 'cameraDelaySeconds']) form.elements[name].value = String(settings[name]);
      for (const name of ['closeDistractingTabs', 'sound', 'escalation']) form.elements[name].checked = !!settings[name];
      form.elements.videoUrl.value = settings.videoUrl || `https://www.youtube.com/watch?v=${settings.videoId}`;
      dialog.showModal();
    }
  };
}
