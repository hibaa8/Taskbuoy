import { totals, slicesForDay, feedback, trendInsights, CATEGORIES } from './engine.js';
import { createSessionSetup } from './session-setup.js';

const $ = id => document.getElementById(id);
const dashboard = document.body.dataset.page === 'dashboard';
const labels = { work: 'Estimated work', distraction: 'Distracting browsing', unknown: 'Unclassified', away: 'Idle / outside Chrome', break: 'Planned break' };
let state;
let busy = false;
let settingsDirty = false;
const setup = createSessionSetup(async (session, settings) => {
  await send({ type: 'START', ...session, settings });
  settingsDirty = false;
  render(); loadSettings();
});
function el(tag, className = '', text = '') { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function duration(ms) { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m` : ms > 0 ? '<1m' : '0m'; }
function displayError(message) { $('error').textContent = message; $('error').hidden = !message; }
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error ?? 'Could not reach Taskbuoy. Reload the extension and try again.');
  state = result.state;
  return state;
}
async function action(message) {
  if (busy) return;
  busy = true;
  displayError('');
  try { await send(message); render(); }
  catch (error) { displayError(error.message); }
  finally { busy = false; }
}
function button(text, handler, className = 'secondary') {
  const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', handler); return b;
}
function renderSession() {
  const root = $('session'); root.replaceChildren();
  const s = state.session;
  $('start').hidden = !!s;
  if (!s) return;
  root.append(el('p', 'eyebrow', s.category === 'break' ? 'MAKE ROOM TO REST' : 'YOUR CURRENT INTENTION'));
  root.append(el('h2', 'session-title', s.title));
  const remaining = Math.max(0, s.endAt - Date.now());
  root.append(el('div', 'timer', `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor(remaining / 1000) % 60).padStart(2, '0')}`));
  const status = s.category === 'distraction'
    ? `Distracting browsing · approximately ${Math.max(0, Math.ceil((s.rules.graceSeconds * 1000 - s.distractionSinceNudge) / 1000))}s of allowance left`
    : s.category === 'break' ? `Break until ${new Date(s.breakUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Session ends at the original time.`
    : labels[s.category];
  root.append(el('p', 'session-status', status));
  const actions = el('div', 'session-actions');
  actions.append(button('Return to work ↗', () => action({ type: 'RETURN' }), 'primary'));
  actions.append(button(s.category === 'break' ? 'Resume now' : '5-minute break', () => action({ type: s.category === 'break' ? 'RESUME' : 'BREAK' })));
  root.append(actions);
  const links = el('div', 'session-links');
  if (dashboard) {
    links.append(el('p', 'small muted', 'Use the toolbar popup on a website to mark it as work or choose it as your new work tab.'));
  } else {
    links.append(button('Mark current website as work', () => action({ type: 'ALLOW' }), 'text-button'));
    links.append(button('Use current tab as work', () => action({ type: 'PIN' }), 'text-button'));
  }
  root.append(links);
  root.append(el('p', 'subtle-line', `Return destination: ${s.workHost} · ${s.rules.mode === 'automatic' ? 'Automatic return' : 'Gentle notifications'}`));
  if (state.camera && Date.now() - state.camera.at < 6000) root.append(el('p', 'small muted', `Camera: ${state.camera.detail || state.camera.status} · estimate`));
  root.append(button('Camera setup / stop', () => action({ type: 'OPEN_CAMERA' }), 'text-button'));
  root.append(button('End session', () => action({ type: 'END' }), 'text-button session-end'));
}
function allSlices() { return [...state.history.flatMap(s => s.slices), ...(state.session?.slices ?? [])]; }
function renderTotals() {
  const slices = allSlices();
  const today = totals(slicesForDay(slices));
  const target = $(dashboard ? 'stats' : 'mini-stats'); target.replaceChildren();
  const items = [['work', 'Estimated work'], ['distraction', 'Distracting'], ['break', 'Breaks']];
  for (const [key, label] of items) {
    const node = el('div');
    node.append(el(dashboard ? 'div' : 'strong', 'stat-value', duration(today[key])), el('div', 'stat-label', label));
    target.append(node);
  }
  if (!dashboard) return;
  const total = Object.values(today).reduce((a, b) => a + b, 0);
  $('time-bar').replaceChildren(); $('legend').replaceChildren();
  $('time-bar').setAttribute('aria-label', total ? CATEGORIES.map(c => `${labels[c]}: ${duration(today[c])}`).join(', ') : 'No tracked time today');
  for (const category of CATEGORIES) {
    const segment = el('span', category); segment.style.width = `${total ? today[category] / total * 100 : 0}%`; $('time-bar').append(segment);
    const item = el('span'); item.append(el('i', category), document.createTextNode(`${labels[category]} ${duration(today[category])}`)); $('legend').append(item);
  }
  $('feedback').textContent = feedback(today, state.history.filter(s => slicesForDay(s.slices).length));
  const insights = trendInsights([...state.history, ...(state.session ? [state.session] : [])]);
  $('trend-insights').replaceChildren(...insights.notes.map(note => el('li', '', note)));
  $('site-ranking').replaceChildren(...insights.sites.map(([site, ms]) => {
    const row = el('div', 'ranking'); row.append(el('span', '', site), el('span', '', duration(ms))); return row;
  }));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return { d, ms: totals(slicesForDay(slices, d)).work }; });
  const max = Math.max(60000, ...days.map(d => d.ms));
  $('week').replaceChildren();
  for (const { d, ms } of days) {
    const day = el('div', 'day'); day.append(el('span', '', duration(ms)));
    const track = el('div', 'day-track'); const fill = el('div', 'day-fill'); fill.style.height = `${ms / max * 100}%`; track.append(fill);
    day.append(track, el('span', '', d.toLocaleDateString([], { weekday: 'short' }))); $('week').append(day);
  }
}
function renderHistory() {
  if (!dashboard) return;
  const root = $('history-list'); root.replaceChildren();
  if (!state.history.length) root.append(el('p', 'empty', 'Your first session starts a new story. Finished sessions will appear here.'));
  for (const s of state.history) {
    const item = el('article', 'history-item');
    const summary = totals(s.slices);
    item.append(el('h3', '', s.title));
    item.append(el('p', 'small muted', `${new Date(s.start).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${s.finishReason} · ${duration(summary.work)} work · ${duration(summary.distraction)} distracting · ${s.interventions} nudges`));
    const form = el('form'); const label = el('label', '', 'What did you finish?');
    const input = el('input'); input.name = 'outcome'; input.value = s.outcome; input.maxLength = 1000; input.placeholder = 'A small step counts.'; label.append(input);
    const submit = el('button', 'secondary', 'Save reflection'); submit.type = 'submit';
    const result = el('span', 'small muted'); result.setAttribute('role', 'status');
    form.append(label, submit, result);
    form.addEventListener('submit', async event => { event.preventDefault(); await action({ type: 'OUTCOME', id: s.id, outcome: input.value }); });
    item.append(form); root.append(item);
  }
}
function renderTasks() {
  const picker = $('task-picker');
  const selected = picker.value;
  picker.replaceChildren(new Option('No linked goal', ''));
  for (const task of state.tasks.filter(t => t.remainingMinutes > 0)) picker.add(new Option(task.title, task.id));
  picker.value = selected;
  if (!dashboard) return;
  const root = $('task-list'); root.replaceChildren();
  if (!state.tasks.length) root.append(el('p', 'empty', 'A project, an assignment, something you care about. Give it a little space here.'));
  for (const task of state.tasks) {
    const item = el('article', 'task-item'); item.append(el('h3', '', task.title));
    let pacing = task.remainingMinutes === 0 ? 'Marked complete.' : `${task.remainingMinutes} minutes of estimated effort remaining.`;
    if (task.deadline && task.remainingMinutes > 0) {
      const [y, m, d] = task.deadline.split('-').map(Number);
      const today = new Date();
      const dayIndex = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      const days = Math.round((Date.UTC(y, m - 1, d) - dayIndex) / 86400000) + 1;
      pacing += days > 0 ? ` Aim for about ${Math.ceil(task.remainingMinutes / days)} min/day through ${new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' })}.` : ' Deadline passed; review the scope or date.';
    }
    item.append(el('p', '', pacing));
    const details = el('details'); details.append(el('summary', '', 'Update remaining effort'));
    const form = el('form');
    const row = el('div', 'form-row');
    const minutesLabel = el('label', '', 'Minutes remaining'); const minutes = el('input'); minutes.type = 'number'; minutes.min = '0'; minutes.max = '60000'; minutes.required = true; minutes.value = task.remainingMinutes; minutesLabel.append(minutes);
    const deadlineLabel = el('label', '', 'Deadline'); const deadline = el('input'); deadline.type = 'date'; deadline.value = task.deadline; deadlineLabel.append(deadline);
    row.append(minutesLabel, deadlineLabel);
    const actions = el('div', 'task-actions'); const submit = el('button', 'secondary', 'Update'); submit.type = 'submit';
    actions.append(submit, button('Remove', () => action({ type: 'DELETE_TASK', id: task.id }), 'text-button'));
    form.append(row, actions);
    form.addEventListener('submit', event => { event.preventDefault(); action({ type: 'TASK', id: task.id, title: task.title, remainingMinutes: minutes.value, deadline: deadline.value }); });
    details.append(form); item.append(details); root.append(item);
  }
}
function render() {
  $('notice').hidden = !state.notice; $('notice').textContent = state.notice ?? '';
  renderSession(); renderTotals(); renderHistory(); renderTasks();
  $('mode-summary').textContent = `${state.settings.mode === 'automatic' ? 'Automatically return' : 'Show a reminder'} after ${state.settings.graceSeconds}s of distracting browsing. ${state.settings.closeDistractingTabs ? 'Returning closes the active distracting tab.' : 'Tabs stay open.'} Work-site allowances apply across tabs.`;
}
async function populateTabs() {
  const selected = $('work-tab').value;
  const tabs = (await chrome.tabs.query({})).filter(t => /^https?:\/\//.test(t.url ?? ''));
  tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  $('work-tab').replaceChildren();
  for (const tab of tabs) $('work-tab').add(new Option(tab.title || new URL(tab.url).hostname, String(tab.id)));
  if (!tabs.length) $('work-tab').add(new Option('Open a website to use as your work tab', ''));
  else if (tabs.some(t => String(t.id) === selected)) $('work-tab').value = selected;
}
$('start-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const data = Object.fromEntries(new FormData(event.target));
  busy = true; displayError('');
  try {
    await send({ type: 'GET' });
    if (state.session) throw Error('Finish the current session before starting another.');
    let settings = state.settings;
    if (dashboard && settingsDirty) {
      const form = $('settings-form');
      settings = { ...settings, ...Object.fromEntries(new FormData(form)) };
      for (const name of ['closeDistractingTabs', 'sound', 'escalation']) settings[name] = form.elements[name].checked;
    }
    setup.open({ ...data, tabId: Number(data.tabId), taskId: data.taskId || null }, settings);
  } catch (e) { displayError(e.message); }
  finally { busy = false; }
});
$('task-picker').addEventListener('change', event => {
  const task = state.tasks.find(t => t.id === event.target.value);
  if (task) $('start-form').elements.title.value = task.title;
});
if (!dashboard) $('open-dashboard').addEventListener('click', () => chrome.runtime.openOptionsPage());
else {
  $('today-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  $('settings-form').addEventListener('input', () => { settingsDirty = true; $('saved').textContent = ''; });
  $('settings-form').addEventListener('change', () => { settingsDirty = true; $('saved').textContent = ''; });
  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
    for (const name of ['closeDistractingTabs', 'sound', 'escalation']) data[name] = event.target.elements[name].checked;
    await action({ type: 'SETTINGS', ...data });
    if (!$('error').textContent) { settingsDirty = false; $('saved').textContent = state.session ? 'Saved for your next session. Current session keeps its reviewed settings.' : 'Saved. Review these settings when you start your session.'; }
  });
  $('test-alerts').addEventListener('click', () => action({ type: 'TEST_ALERTS' }));
  $('open-camera').addEventListener('click', () => action({ type: 'OPEN_CAMERA' }));
  $('preview-reset').addEventListener('click', () => action({ type: 'OPEN_RESET' }));
  $('task-form').addEventListener('submit', async event => {
    event.preventDefault(); await action({ type: 'TASK', ...Object.fromEntries(new FormData(event.target)) });
    if (!$('error').textContent) event.target.reset();
  });
  $('export').addEventListener('click', async () => {
    try {
      await send({ type: 'GET' });
      const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = el('a'); link.href = url; link.download = 'taskbuoy-records.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { displayError(error.message); }
  });
  $('clear').addEventListener('click', async () => {
    if (confirm('Permanently delete all local sessions, goals, and settings? This cannot be undone.')) { await action({ type: 'CLEAR' }); loadSettings(); }
  });
}
function loadSettings() {
  if (!dashboard) return;
  const fields = $('settings-form').elements;
  fields.domains.value = state.settings.domains.join('\n'); fields.graceSeconds.value = String(state.settings.graceSeconds); fields.mode.value = state.settings.mode;
  fields.workDomains.value = state.settings.workDomains.join('\n');
  for (const name of ['closeDistractingTabs', 'sound', 'escalation']) fields[name].checked = state.settings[name];
  fields.escalationAfter.value = state.settings.escalationAfter;
  fields.cameraDelaySeconds.value = String(state.settings.cameraDelaySeconds);
  fields.videoUrl.value = `https://www.youtube.com/watch?v=${state.settings.videoId}`;
}
try {
  await send({ type: 'GET' }); await populateTabs(); render(); loadSettings();
  // Refresh only live elements, preserving partially written forms and reflections.
  setInterval(async () => {
    if (busy || document.hidden) return;
    try {
      const oldId = state.session?.id;
      await send({ type: 'GET' });
      if (oldId !== state.session?.id) { render(); await populateTabs(); }
      else { renderSession(); renderTotals(); }
      if (!settingsDirty) loadSettings();
    } catch (error) { displayError(error.message); }
  }, 5000);
} catch (error) { displayError(error.message); }
