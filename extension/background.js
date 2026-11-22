import { emptyState, migrateState, createSession, advance, classify, shouldNudge, normalizeDomain, hostOf, matchesHost, parseVideoId } from './engine.js';
import { isCameraConcern } from './vision-signals.js';

let queue = Promise.resolve();
function enqueue(job) {
  const result = queue.then(job);
  queue = result.catch(error => console.error('Taskbuoy:', error));
  return result;
}
async function load() { return migrateState((await chrome.storage.local.get('state')).state); }
async function save(state) { await chrome.storage.local.set({ state }); }
async function context() {
  const win = await chrome.windows.getLastFocused();
  const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
  return { tabId: tabs[0]?.id, url: tabs[0]?.url ?? '', focused: win.focused === true, idle: await chrome.idle.queryState(60) };
}
async function notify(id, title, message, buttons = []) {
  try {
    await chrome.notifications.create(id, { type: 'basic', iconUrl: 'icon.png', title, message, buttons, priority: 1 });
  } catch (error) { console.warn('Notification unavailable:', error.message); }
}
function widgetState(state, tabId) {
  const s = state.session;
  const cam = state.camera && Date.now() - state.camera.at < 6000 ? state.camera : null;
  const sessionEvent = s?.events?.at(-1);
  const last = state.lastEvent && (!sessionEvent || state.lastEvent.at >= sessionEvent.at) ? state.lastEvent : sessionEvent;
  return {
    session: s ? { id: s.id, title: s.title, endAt: s.endAt, cursor: s.cursor, category: s.category,
      graceSeconds: s.rules.graceSeconds, distractionSinceNudge: s.distractionSinceNudge,
      breakUntil: s.breakUntil, workHost: s.workHost, workTabId: s.workTabId, interventions: s.interventions } : null,
    isActiveTab: tabId === state.activeTabId,
    camera: cam ? { status: cam.status, detail: cam.detail } : null,
    event: last && Date.now() - last.at < 30000 ? last : null,
    notice: state.notice,
    closeDistractingTabs: s?.rules.closeDistractingTabs ?? state.settings.closeDistractingTabs
  };
}
async function publish(state) {
  // Background tabs receive a fresh snapshot when activated; avoid waking all of them per camera sample.
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.allSettled(tabs.filter(t => hostOf(t.url)).map(t => chrome.tabs.sendMessage?.(t.id, { type: 'FC_STATE', ...widgetState(state, t.id) })));
}
async function chime(state) {
  if (!(state.session?.rules.sound ?? state.settings.sound) || !chrome.offscreen) return;
  try {
    if (!await chrome.offscreen.hasDocument()) await chrome.offscreen.createDocument({ url: 'audio.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play a short focus reminder or session-completion chime.' });
    const response = await chrome.runtime.sendMessage({ target: 'audio', type: 'PLAY_CHIME' });
    if (!response?.ok) throw Error(response?.error || 'No audio response');
  } catch {
    state.notice = 'Sound could not play. Use “Test alerts” in Settings, and check Chrome’s audio output. On-page alerts will still appear.';
  }
}
async function openReset(state) {
  const s = state.session;
  if (state.resetWindowId != null) {
    try { await chrome.windows.update(state.resetWindowId, { focused: true }); return; } catch { state.resetWindowId = null; }
  }
  const win = await chrome.windows.create({ url: chrome.runtime.getURL('reset.html'), type: 'popup', width: 800, height: 700, focused: true });
  state.resetWindowId = win.id;
}
async function nudge(state, kind, detail) {
  const s = state.session;
  s.interventions += 1;
  s.ignoredNudges = (s.ignoredNudges ?? 0) + 1;
  s.recoveryStart = null;
  const event = { id: crypto.randomUUID(), at: Date.now(), kind, message: detail };
  s.events ??= []; s.events.push(event); s.events = s.events.slice(-100);
  await notify('fc-nudge', kind === 'browser' ? 'Go back to work' : 'Stay focused', detail, [{ title: 'Return to work' }, { title: '5-minute break' }]);
  await chime(state);
  await publish(state);
  let escalated = false;
  if (s.rules.escalation && s.ignoredNudges >= s.rules.escalationAfter && Date.now() - (s.lastEscalationAt ?? 0) > 300000) {
    s.lastEscalationAt = Date.now();
    await openReset(state);
    escalated = true;
  }
  return { escalated };
}
function archive(state, now, reason) {
  const s = state.session;
  s.finishedAt = Math.min(now, s.endAt);
  s.finishReason = reason;
  state.history.unshift(s);
  // Bound storage by retaining the latest 200 sessions.
  state.history = state.history.slice(0, 200);
  state.session = null;
}
async function returnToWork(state, { closeSource = false, sourceTabId = null } = {}) {
  const s = state.session;
  if (!s) return;
  try {
    const tab = await chrome.tabs.get(s.workTabId);
    // Never activate a work tab that has since navigated to a different site.
    if (hostOf(tab.url) !== s.workHost) throw new Error('Work tab changed');
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    state.notice = '';
    if (closeSource && sourceTabId != null && sourceTabId !== s.workTabId) {
      const source = await chrome.tabs.get(sourceTabId).catch(() => null);
      const host = hostOf(source?.url);
      // Close only the specific distracting tab after the destination was activated successfully.
      if (host && matchesHost(host, s.rules.domains) && !matchesHost(host, [...s.allowedDomains, ...(s.rules.workDomains ?? [])])) {
        try { await chrome.tabs.remove(sourceTabId); } catch { state.notice = 'Returned to work, but Chrome could not close the distracting tab.'; }
      }
    }
  } catch {
    state.notice = 'Your work tab was closed or changed websites. Open your work and select “Use current tab as work.”';
    await notify('fc-missing', 'Choose your work tab again', state.notice);
  }
}
async function schedule(state) {
  await chrome.alarms.clear('fc-deadline');
  if (!state.session) {
    await chrome.alarms.clear('fc-tick');
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  if (!await chrome.alarms.get('fc-tick')) await chrome.alarms.create('fc-tick', { periodInMinutes: 0.5 });
  const s = state.session;
  const now = Date.now();
  let due = s.endAt;
  if (s.breakUntil > now) due = Math.min(due, s.breakUntil);
  if (s.category === 'distraction') due = Math.min(due, now + Math.max(0, s.rules.graceSeconds * 1000 - s.distractionSinceNudge));
  await chrome.alarms.create('fc-deadline', { when: Math.max(now + 30000, due) });
  await chrome.action.setBadgeBackgroundColor({ color: s.category === 'distraction' ? '#a85634' : '#34604d' });
  await chrome.action.setBadgeText({ text: s.category === 'distraction' ? '!' : String(Math.max(1, Math.ceil((s.endAt - now) / 60000))) });
}
async function reconcile(state) {
  if (!state.session) return;
  const now = Date.now();
  const s = state.session;
  advance(s, now);
  const ctx = await context();
  state.activeTabId = ctx.tabId;
  if (now >= s.endAt) {
    await chime(state);
    archive(state, now, 'completed');
    state.lastEvent = { id: crypto.randomUUID(), at: now, kind: 'complete', message: 'Time is up. Nice work showing up—record what you finished.' };
    await notify('fc-complete', 'Your focus session is complete', `How did “${s.title}” go? Open your dashboard to record what you finished.`);
  } else {
    s.category = classify(s, ctx, now);
    s.domain = ['work', 'distraction', 'unknown'].includes(s.category) ? hostOf(ctx.url) : '';
    if (shouldNudge(s, ctx, now)) {
      s.distractionSinceNudge = 0;
      const { escalated } = await nudge(state, 'browser', `Go back to work. You planned to: ${s.title}`);
      if (s.rules.mode === 'automatic') {
        await returnToWork(state, { closeSource: s.rules.closeDistractingTabs, sourceTabId: ctx.tabId });
        const after = await context();
        state.activeTabId = after.tabId;
        s.category = classify(s, after, Date.now());
        s.domain = hostOf(after.url);
        if (escalated && state.resetWindowId != null) await chrome.windows.update(state.resetWindowId, { focused: true });
      }
    }
    const cameraConcern = state.camera && now - state.camera.at < 6000 && isCameraConcern(state.camera.status);
    if (s.category === 'work' && !cameraConcern) {
      s.recoveryStart ??= now;
      if (now - s.recoveryStart >= 30000) s.ignoredNudges = 0;
    } else s.recoveryStart = null;
  }
}
function validatedSettings(message, current) {
      const graceSeconds = Number(message.graceSeconds);
      if (!Number.isFinite(graceSeconds) || graceSeconds < 30 || graceSeconds > 600) throw new Error('Set a grace period between 30 and 600 seconds.');
      if (!['gentle', 'automatic'].includes(message.mode)) throw new Error('Choose a valid intervention mode.');
      const domains = [...new Set(String(message.domains ?? current.domains.join('\n')).split(/[\n,]+/).filter(v => v.trim()).map(normalizeDomain))];
      if (domains.length > 100) throw new Error('Choose up to 100 distracting domains.');
      const workDomains = [...new Set(String(message.workDomains ?? current.workDomains.join('\n')).split(/[\n,]+/).filter(v => v.trim()).map(normalizeDomain))];
      if (workDomains.length > 100) throw new Error('Choose up to 100 work domains.');
      const escalationAfter = Number(message.escalationAfter ?? current.escalationAfter);
      const cameraDelaySeconds = Number(message.cameraDelaySeconds ?? current.cameraDelaySeconds);
      if (!Number.isInteger(escalationAfter) || escalationAfter < 2 || escalationAfter > 10) throw Error('Escalation must be between 2 and 10 reminders.');
      if (![10, 15, 30, 60].includes(cameraDelaySeconds)) throw Error('Choose a valid camera reminder delay.');
      return { ...current, graceSeconds, domains, workDomains, mode: message.mode,
        closeDistractingTabs: message.closeDistractingTabs ?? current.closeDistractingTabs,
        sound: message.sound ?? current.sound, escalation: message.escalation ?? current.escalation,
        escalationAfter, cameraDelaySeconds,
        videoId: parseVideoId(message.videoUrl || current.videoId) };
}

async function mutate(message) {
  const state = await load();
  await reconcile(state);
  // Persist elapsed time even when the requested form action fails validation.
  await save(state);
  const now = Date.now();
  const s = state.session;
  switch (message.type) {
    case 'GET': break;
    case 'WIDGET_GET': break;
    case 'START': {
      if (s) throw new Error('Finish the current session before starting another.');
      const ctx = await context();
      const tab = await chrome.tabs.get(message.tabId ?? ctx.tabId);
      const rules = message.settings ? validatedSettings(message.settings, state.settings) : state.settings;
      const nextSession = createSession({ id: crypto.randomUUID(), title: message.title, durationMinutes: Number(message.durationMinutes), tab, rules, now, taskId: message.taskId });
      state.settings = rules;
      state.session = nextSession;
      state.notice = '';
      state.lastEvent = null;
      await returnToWork(state);
      const after = await context();
      state.session.category = classify(state.session, after, Date.now());
      state.session.domain = hostOf(after.url);
      break;
    }
    case 'END':
      if (s) archive(state, now, 'ended early');
      break;
    case 'BREAK':
      if (!s) throw new Error('Start a session first.');
      s.breakUntil = Math.min(now + 5 * 60000, s.endAt);
      s.category = 'break'; s.domain = '';
      break;
    case 'RESUME':
      if (s) { s.breakUntil = 0; const ctx = await context(); s.category = classify(s, ctx, now); s.domain = hostOf(ctx.url); }
      break;
    case 'RETURN': {
      const ctx = await context();
      await returnToWork(state, { closeSource: s?.rules.closeDistractingTabs, sourceTabId: ctx.tabId });
      break;
    }
    case 'OPEN_CAMERA': {
      const url = chrome.runtime.getURL('camera.html');
      const existing = (await chrome.tabs.query({})).find(t => t.url === url);
      if (existing) { await chrome.tabs.update(existing.id, { active: true }); await chrome.windows.update(existing.windowId, { focused: true }); }
      else await chrome.tabs.create({ url });
      break;
    }
    case 'OPEN_DASHBOARD': await chrome.runtime.openOptionsPage(); break;
    case 'OPEN_RESET': await openReset(state); break;
    case 'TEST_ALERTS': {
      state.activeTabId = (await context()).tabId;
      await notify('fc-test', 'Go back to work', 'Taskbuoy test notification. Your on-page coach also shows focus nudges.');
      state.lastEvent = { id: crypto.randomUUID(), at: now, kind: 'test', message: 'Go back to work · test alert' };
      await chime(state);
      const level = await chrome.notifications.getPermissionLevel?.();
      state.notice = level === 'denied' ? 'System notifications are disabled. Enable Chrome notifications in your operating system. On-page alerts remain available.' : 'Test alert sent. If you heard nothing, check Chrome’s sound output. On-page alerts also appear on regular websites.';
      break;
    }
    case 'CAMERA_SAMPLE': {
      const statuses = ['ready', 'looking-down', 'head-down', 'looking-away', 'no-face', 'phone-down', 'phone-visible', 'off', 'error', 'calibrating'];
      if (!statuses.includes(message.status)) throw Error('Invalid camera observation.');
      const downCues = ['looking-down', 'head-down', 'phone-down'];
      const same = (state.camera?.status === message.status || (downCues.includes(state.camera?.status) && downCues.includes(message.status))) && now - state.camera.at < 6000;
      state.camera = { status: message.status, detail: String(message.detail ?? '').slice(0, 160), at: now, since: same ? state.camera.since : now };
      if (s && message.sessionId === s.id && s.breakUntil <= now && isCameraConcern(message.status)) {
        const elapsed = now - state.camera.since;
        if (elapsed >= s.rules.cameraDelaySeconds * 1000 && now - (s.lastCameraNudgeAt ?? 0) >= 60000) {
          s.lastCameraNudgeAt = now;
          await nudge(state, 'camera', `Stay focused. ${state.camera.detail} This is a camera estimate; take a break if you need one.`);
        }
      }
      break;
    }
    case 'PIN': {
      if (!s) throw new Error('Start a session first.');
      const ctx = await context();
      const host = hostOf(ctx.url);
      if (!host) throw new Error('Choose a regular website as your work tab.');
      s.workTabId = ctx.tabId; s.workHost = host; s.category = 'work'; s.domain = host;
      state.notice = '';
      break;
    }
    case 'ALLOW': {
      if (!s) throw new Error('Start a session first.');
      const ctx = await context();
      const host = hostOf(ctx.url);
      if (!host) throw new Error('Open the website you want to mark as work.');
      if (!s.allowedDomains.includes(host)) s.allowedDomains.push(host);
      s.category = classify(s, ctx, now); s.domain = host;
      break;
    }
    case 'SETTINGS': {
      state.settings = validatedSettings(message, state.settings);
      break;
    }
    case 'OUTCOME': {
      const session = state.history.find(item => item.id === message.id);
      if (!session) throw new Error('Session not found.');
      session.outcome = String(message.outcome).trim().slice(0, 1000);
      break;
    }
    case 'TASK': {
      const title = String(message.title ?? '').trim();
      const remainingMinutes = Number(message.remainingMinutes);
      if (!title || !Number.isFinite(remainingMinutes) || remainingMinutes < 0 || remainingMinutes > 60000) throw new Error('Enter a goal and a valid remaining effort in minutes.');
      if (message.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(message.deadline)) throw new Error('Choose a valid deadline.');
      if (message.id) {
        const task = state.tasks.find(t => t.id === message.id);
        if (!task) throw new Error('Goal not found.');
        Object.assign(task, { title: title.slice(0, 160), remainingMinutes, deadline: message.deadline || '' });
      } else state.tasks.push({ id: crypto.randomUUID(), title: title.slice(0, 160), remainingMinutes, deadline: message.deadline || '' });
      break;
    }
    case 'DELETE_TASK': state.tasks = state.tasks.filter(t => t.id !== message.id); break;
    case 'CLEAR': {
      if (s) throw new Error('End your session before deleting your records.');
      const fresh = emptyState();
      Object.assign(state, fresh);
      break;
    }
    default: throw new Error('Unknown action.');
  }
  await save(state);
  await schedule(state);
  await publish(state);
  return state;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.target === 'audio') return;
  const isCamera = sender.url === chrome.runtime.getURL('camera.html');
  const isWeb = !!hostOf(sender.url ?? sender.tab?.url);
  const allowed = ['WIDGET_GET', 'RETURN', 'ALLOW', 'BREAK', 'RESUME', 'OPEN_CAMERA', 'OPEN_DASHBOARD'];
  if ((message.type === 'CAMERA_SAMPLE' && !isCamera) || (isWeb && !allowed.includes(message.type))) {
    respond({ ok: false, error: 'This action is only available in the extension.' }); return;
  }
  enqueue(() => mutate(message)).then(state => respond(isWeb ? { ok: true, widget: widgetState(state, sender.tab?.id) } : { ok: true, state }), error => respond({ ok: false, error: error.message }));
  return true;
});
function refresh() { enqueue(async () => { const state = await load(); await reconcile(state); await save(state); await schedule(state); await publish(state); }); }
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === 'complete') refresh(); });
chrome.tabs.onRemoved.addListener(refresh);
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.onStateChanged.addListener(refresh);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name.startsWith('fc-')) refresh(); });
chrome.runtime.onInstalled.addListener(() => {
  chrome.idle.setDetectionInterval(60);
  // Content scripts also need to be attached to tabs that were open during the upgrade.
  chrome.tabs.query({}).then(tabs => Promise.allSettled(tabs.filter(t => hostOf(t.url)).map(t => chrome.scripting?.executeScript({ target: { tabId: t.id }, files: ['coach-widget.js'] }))));
  refresh();
});
chrome.runtime.onStartup.addListener(() => enqueue(async () => {
  const state = await load();
  if (state.session) {
    // Browser tab IDs and the unobserved period cannot safely survive a restart.
    advance(state.session, Date.now());
    archive(state, Date.now(), 'browser restarted');
    state.notice = 'Your previous session ended when Chrome restarted. Start a new session to choose your work tab again.';
  }
  await save(state); await schedule(state);
}));
chrome.notifications.onClicked.addListener(id => {
  if (id === 'fc-nudge') enqueue(() => mutate({ type: 'RETURN' }));
  else chrome.runtime.openOptionsPage();
});
chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id === 'fc-nudge') enqueue(() => mutate({ type: index === 0 ? 'RETURN' : 'BREAK' }));
});
