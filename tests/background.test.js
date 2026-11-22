import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../extension/engine.js';

function event() { const listeners = []; return { addListener(fn) { listeners.push(fn); }, listeners }; }
const events = {
  message: event(), installed: event(), startup: event(), activated: event(), updated: event(), removed: event(), focused: event(), idle: event(), alarm: event(), clicked: event(), button: event()
};
let now = 1800000000000;
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
let stored = emptyState();
let activeId = 1, focused = true, idle = 'active';
const initialTabs = [[1, { id: 1, windowId: 1, url: 'https://work.example/task' }], [2, { id: 2, windowId: 1, url: 'https://instagram.com/' }], [3, { id: 3, windowId: 1, url: 'https://youtube.com/' }]];
const tabs = new Map(structuredClone(initialTabs));
const notices = [], alarms = new Map();
let audioPlays = 0, openedResets = 0;
globalThis.chrome = {
  storage: { local: { get: async () => ({ state: structuredClone(stored) }), set: async ({ state }) => { stored = structuredClone(state); } } },
  windows: { getLastFocused: async () => ({ id: 1, focused }), update: async () => { focused = true; }, create: async () => { openedResets++; return { id: 5 }; }, onFocusChanged: events.focused },
  tabs: {
    query: async options => options.active ? [tabs.get(activeId)] : [...tabs.values()], get: async id => { if (!tabs.has(id)) throw Error('No tab'); return tabs.get(id); },
    update: async (id, options) => { if (!tabs.has(id)) throw Error('No tab'); if (options.active) activeId = id; return tabs.get(id); },
    remove: async id => { tabs.delete(id); }, sendMessage: async () => {}, create: async ({url}) => { const tab = { id: 6, windowId: 1, url }; tabs.set(6, tab); return tab; },
    onActivated: events.activated, onUpdated: events.updated, onRemoved: events.removed
  },
  idle: { queryState: async () => idle, setDetectionInterval() {}, onStateChanged: events.idle },
  alarms: { clear: async name => alarms.delete(name), get: async name => alarms.get(name), create: async (name, options) => alarms.set(name, options), onAlarm: events.alarm },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  notifications: { create: async (id, options) => notices.push({ id, ...options }), onClicked: events.clicked, onButtonClicked: events.button },
  offscreen: { hasDocument: async () => true, createDocument: async () => {} },
  runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, sendMessage: async () => { audioPlays++; return { ok: true }; }, onMessage: events.message, onInstalled: events.installed, onStartup: events.startup, openOptionsPage: async () => {} }
};
await import('../extension/background.js');
function send(type, fields = {}) {
  return new Promise(resolve => events.message.listeners[0]({ type, ...fields }, { id: chrome.runtime.id }, resolve));
}
async function ok(type, fields) { const result = await send(type, fields); assert.equal(result.ok, true, result.error); return result.state; }
function reset() { stored = emptyState(); activeId = 1; focused = true; idle = 'active'; notices.length = 0; alarms.clear(); tabs.clear(); audioPlays = 0; openedResets = 0; for (const [id, tab] of structuredClone(initialTabs)) tabs.set(id, tab); }

test('gentle mode sends one nudge after cumulative allowance and preserves the browsing tab', async () => {
  reset(); await ok('START', { title: 'Ship demo', durationMinutes: 25, tabId: 1 });
  now += 10000; activeId = 2; await ok('GET');
  now += 30000; activeId = 3; await ok('GET');
  now += 30000; const state = await ok('GET');
  assert.equal(state.session.interventions, 1); assert.equal(activeId, 3); assert.equal(notices.filter(n => n.id === 'fc-nudge').length, 1);
  await ok('GET'); assert.equal(notices.filter(n => n.id === 'fc-nudge').length, 1);
  assert.equal(state.session.distractionSinceNudge, 0);
});
test('automatic mode activates work and closes only the active distracting tab', async () => {
  reset(); await ok('SETTINGS', { domains: 'instagram.com', graceSeconds: 30, mode: 'automatic' });
  await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  activeId = 2; await ok('GET'); now += 31000; const state = await ok('GET');
  assert.equal(activeId, 1); assert.equal(tabs.size, 2); assert.ok(tabs.has(3)); assert.equal(state.session.category, 'work'); assert.equal(state.session.interventions, 1);
});
test('closed work tab produces an actionable notice, never changes an unrelated tab', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  const work = tabs.get(1); tabs.delete(1); activeId = 2;
  const state = await ok('RETURN'); assert.match(state.notice, /closed or changed/); assert.equal(activeId, 2);
  tabs.set(1, work);
});
test('break suppresses interventions and allowance survives the break', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  activeId = 2; await ok('GET'); now += 30000; await ok('BREAK');
  now += 30000; const state = await ok('GET');
  assert.equal(state.session.category, 'break'); assert.equal(state.session.interventions, 0); assert.equal(state.session.distractionSinceNudge, 30000);
  await ok('RESUME'); now += 30000; await ok('GET'); assert.equal(stored.session.interventions, 1);
});
test('allowing a website applies only to this session; new sessions retain settings', async () => {
  reset(); await ok('START', { title: 'Lecture', durationMinutes: 25, tabId: 1 });
  activeId = 3; const state = await ok('ALLOW'); assert.equal(state.session.category, 'work');
  await ok('END'); await ok('START', { title: 'Homework', durationMinutes: 25, tabId: 1 });
  assert.deepEqual(stored.session.allowedDomains, []);
});
test('completion archives time once and cancels alarms', async () => {
  reset(); await ok('START', { title: 'Quick work', durationMinutes: 1, tabId: 1 });
  now += 30000; await ok('GET'); now += 31000; await ok('GET');
  assert.equal(stored.session, null); assert.equal(stored.history.length, 1); assert.equal(alarms.size, 0);
  await ok('GET'); assert.equal(stored.history.length, 1);
  await ok('OUTCOME', { id: stored.history[0].id, outcome: 'Finished the outline.' }); assert.equal(stored.history[0].outcome, 'Finished the outline.');
});
test('validation errors preserve reconciliation and simultaneous requests serialize', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  now += 10000;
  const invalid = await send('SETTINGS', { domains: 'instagram.com', graceSeconds: 0, mode: 'gentle' });
  assert.equal(invalid.ok, false); assert.equal(stored.session.cursor, now);
  const results = await Promise.all([send('END'), send('START', { title: 'Next', durationMinutes: 25, tabId: 1 })]);
  assert.ok(results.every(r => r.ok)); assert.equal(stored.history.length, 1); assert.equal(stored.session.title, 'Next');
});
test('a session started from dashboard activates the selected work tab', async () => {
  reset(); activeId = 2;
  await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  assert.equal(activeId, 1); assert.equal(stored.session.category, 'work');
});
test('tasks support effort updates and completion independently of sessions', async () => {
  reset(); await ok('TASK', { title: 'Demo', remainingMinutes: '120', deadline: '2026-12-01' });
  const id = stored.tasks[0].id;
  await ok('TASK', { id, title: 'Demo', remainingMinutes: '0', deadline: '2026-12-01' });
  assert.equal(stored.tasks[0].remainingMinutes, 0);
  await ok('DELETE_TASK', { id }); assert.equal(stored.tasks.length, 0);
});
test('restart archives stale session instead of reusing invalid tab IDs', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 }); now += 120000;
  events.startup.listeners[0](); await ok('GET');
  assert.equal(stored.session, null); assert.equal(stored.history[0].finishReason, 'browser restarted'); assert.match(stored.notice, /restarted/);
});
test('delete requires ending an active session', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  assert.equal((await send('CLEAR')).ok, false); await ok('END'); await ok('CLEAR');
  assert.deepEqual(stored, emptyState());
});
test('manual return leaves an approved work site open even if also in distraction list', async () => {
  reset(); await ok('SETTINGS', { domains: 'youtube.com', workDomains: 'youtube.com', graceSeconds: 30, mode: 'automatic' });
  await ok('START', { title: 'Lecture', durationMinutes: 25, tabId: 1 }); activeId = 3;
  await ok('RETURN'); assert.ok(tabs.has(3)); assert.equal(activeId, 1);
});
test('missing destination prevents source tab closure', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  tabs.delete(1); activeId = 2; await ok('RETURN'); assert.ok(tabs.has(2));
});
test('closing can be disabled and chime is played at completion', async () => {
  reset(); await ok('SETTINGS', { domains: 'instagram.com', graceSeconds: 30, mode: 'automatic', closeDistractingTabs: false });
  await ok('START', { title: 'Work', durationMinutes: 1, tabId: 1 });
  activeId = 2; await ok('GET'); now += 31000; await ok('GET'); assert.ok(tabs.has(2)); assert.equal(audioPlays, 1);
  now += 30000; await ok('GET'); assert.equal(audioPlays, 2); assert.equal(stored.lastEvent.kind, 'complete');
});
function cameraSample(status, detail = status) {
  return new Promise(resolve => events.message.listeners[0]({ type: 'CAMERA_SAMPLE', status, detail, sessionId: stored.session?.id }, { id: chrome.runtime.id, url: chrome.runtime.getURL('camera.html') }, resolve));
}
test('camera cues require sustained observations and do not relabel browsing time', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  for (let i = 0; i < 16; i++) { now += 1000; assert.equal((await cameraSample('looking-down')).ok, true); }
  assert.equal(stored.session.interventions, 1); assert.equal(stored.session.category, 'work'); assert.equal(stored.session.events[0].kind, 'camera');
  await cameraSample('looking-down'); assert.equal(stored.session.interventions, 1);
});
test('stale camera samples cannot accumulate a sustained cue or bypass breaks', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  await cameraSample('phone-visible'); now += 20000; await cameraSample('phone-visible');
  assert.equal(stored.session.interventions, 0);
  await ok('BREAK'); for (let i = 0; i < 20; i++) { now += 1000; await cameraSample('phone-visible'); }
  assert.equal(stored.session.interventions, 0);
});
test('repeated ignored reminders open one motivational reset with cooldown', async () => {
  reset(); await ok('SETTINGS', { domains: 'instagram.com', graceSeconds: 30, mode: 'gentle', escalationAfter: 2 });
  await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 }); activeId = 2; await ok('GET');
  now += 31000; await ok('GET'); now += 31000; await ok('GET'); assert.equal(openedResets, 1);
  now += 31000; await ok('GET'); assert.equal(openedResets, 1);
});
test('web content receives only widget state and cannot read records or send camera cues', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  const sender = { id: chrome.runtime.id, url: 'https://work.example/task', tab: tabs.get(1) };
  const request = type => new Promise(resolve => events.message.listeners[0]({ type }, sender, resolve));
  const widget = await request('WIDGET_GET'); assert.equal(widget.ok, true); assert.ok(widget.widget); assert.equal(widget.state, undefined);
  assert.equal((await request('GET')).ok, false); assert.equal((await request('CLEAR')).ok, false); assert.equal((await request('CAMERA_SAMPLE')).ok, false);
});
test('unmarked tabs accumulate work time without a distracting-site nudge', async () => {
  reset(); await ok('START', { title: 'Work', durationMinutes: 25, tabId: 1 });
  tabs.set(4, { id: 4, windowId: 1, url: 'https://unlisted.example/' }); activeId = 4;
  await ok('GET'); now += 30000; const state = await ok('GET');
  assert.equal(state.session.category, 'work');
  assert.equal(state.session.interventions, 0);
  assert.ok(state.session.slices.some(slice => slice.domain === 'unlisted.example' && slice.category === 'work' && slice.end - slice.start === 30000));
  focused = false; assert.equal((await ok('GET')).session.category, 'away');
});

test('reviewed session settings are saved and used atomically at START', async () => {
  reset();
  const settings = { domains: 'instagram.com', workDomains: 'youtube.com', graceSeconds: 180, mode: 'automatic', sound: false, closeDistractingTabs: false, escalation: false };
  const state = await ok('START', { title: 'Reviewed session', durationMinutes: 25, tabId: 1, settings });
  assert.equal(state.session.rules.graceSeconds, 180);
  assert.equal(state.session.rules.mode, 'automatic');
  assert.equal(state.session.rules.sound, false);
  assert.deepEqual(state.session.rules.workDomains, ['youtube.com']);
  assert.deepEqual(state.settings, state.session.rules);
  await ok('SETTINGS', { ...settings, graceSeconds: 30, mode: 'gentle' });
  assert.equal(stored.session.rules.graceSeconds, 180, 'running rules remain the reviewed snapshot');
});
test('invalid reviewed settings or session leave defaults unchanged and do not start', async () => {
  reset(); const original = structuredClone(stored.settings);
  const invalid = await send('START', { title: 'Review', durationMinutes: 25, tabId: 1, settings: { domains: 'instagram.com', graceSeconds: 1, mode: 'gentle' } });
  assert.equal(invalid.ok, false); assert.equal(stored.session, null); assert.deepEqual(stored.settings, original);
  const missingTitle = await send('START', { title: '', durationMinutes: 25, tabId: 1, settings: { domains: 'instagram.com', graceSeconds: 180, mode: 'automatic' } });
  assert.equal(missingTitle.ok, false); assert.equal(stored.session, null); assert.deepEqual(stored.settings, original);
});
