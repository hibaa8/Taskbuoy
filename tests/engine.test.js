import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, DEFAULT_SETTINGS, advance, classify, shouldNudge, totals, hostOf, normalizeDomain, matchesHost, slicesForDay, migrateState, parseVideoId, trendInsights } from '../extension/engine.js';

const ctx = { tabId: 1, url: 'https://work.example/task', focused: true, idle: 'active' };
const session = (now = 0) => createSession({ id: 'test', title: 'Ship a demo', durationMinutes: 25, tab: { id: 1, url: ctx.url }, rules: DEFAULT_SETTINGS, now });
test('host matching includes subdomains, never lookalike suffixes', () => {
  assert.equal(hostOf('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(hostOf('chrome://extensions'), '');
  assert.equal(normalizeDomain('https://www.Instagram.com'), 'instagram.com');
  assert.throws(() => normalizeDomain('youtube.com/watch'));
  assert.throws(() => normalizeDomain('chrome://extensions'));
  assert.equal(matchesHost('m.youtube.com', ['youtube.com']), true);
  assert.equal(matchesHost('notyoutube.com', ['youtube.com']), false);
  assert.equal(matchesHost('youtube.com.evil.example', ['youtube.com']), false);
});
test('classification defaults unmarked tabs to work while respecting distractions, breaks, and away', () => {
  const s = session();
  assert.equal(classify(s, ctx, 0), 'work');
  assert.equal(classify(s, { ...ctx, url: 'https://instagram.com' }, 0), 'distraction');
  assert.equal(classify(s, { ...ctx, tabId: 2 }, 0), 'work');
  assert.equal(classify(s, { ...ctx, tabId: 4, url: 'https://unlisted.example/' }, 0), 'work');
  assert.equal(classify(s, { ...ctx, focused: false }, 0), 'away');
  assert.equal(classify(s, { ...ctx, idle: 'locked' }, 0), 'away');
  s.allowedDomains.push('youtube.com');
  assert.equal(classify(s, { ...ctx, tabId: 3, url: 'https://youtube.com' }, 0), 'work');
  s.breakUntil = 1000;
  assert.equal(classify(s, { ...ctx, idle: 'locked' }, 100), 'break');
});
test('active Chrome internal pages count as work; missing observations remain unknown', () => {
  const s = session();
  assert.equal(classify(s, { ...ctx, tabId: 9, url: 'chrome://newtab/' }, 0), 'work');
  assert.equal(classify(s, { ...ctx, tabId: undefined, url: '' }, 0), 'unknown');
});
test('distraction allowance accumulates across sites, interrupted by work', () => {
  const s = session();
  s.category = 'distraction'; s.domain = 'youtube.com'; advance(s, 30000);
  s.category = 'work'; advance(s, 50000);
  s.category = 'distraction'; s.domain = 'instagram.com'; advance(s, 80000);
  assert.equal(s.distractionSinceNudge, 60000);
  assert.equal(shouldNudge(s, { ...ctx, url: 'https://instagram.com' }, 80000), true);
  assert.equal(shouldNudge(s, { ...ctx, focused: false, url: 'https://instagram.com' }, 80000), false);
  assert.deepEqual(totals(s.slices), { work: 20000, distraction: 60000, unknown: 0, away: 0, break: 0 });
});
test('time is not double counted on repeated or out-of-order calls', () => {
  const s = session(); advance(s, 30000); advance(s, 30000); advance(s, 20000); advance(s, 50000);
  assert.equal(totals(s.slices).work, 50000); assert.equal(s.slices.length, 1);
});
test('sleep and missed heartbeats become unknown rather than hours of work', () => {
  const s = session(); advance(s, 30000); advance(s, 600000);
  assert.equal(totals(s.slices).work, 30000); assert.equal(totals(s.slices).unknown, 570000);
});
test('session ending caps tracking and suppresses intervention', () => {
  const s = session(); s.endAt = 60000; s.category = 'distraction';
  advance(s, 40000); advance(s, 100000);
  assert.equal(totals(s.slices).distraction, 60000);
  assert.equal(shouldNudge(s, { ...ctx, url: 'https://instagram.com' }, 100000), false);
});
test('break expiry does not extend break into unknown time', () => {
  const s = session(); s.category = 'break'; s.breakUntil = 20000; advance(s, 30000);
  assert.equal(totals(s.slices).break, 20000); assert.equal(totals(s.slices).unknown, 10000);
});
test('daily summaries clip a session spanning local midnight', () => {
  const start = new Date(2026, 10, 20, 23, 59).getTime();
  const slices = [{ start, end: start + 120000, category: 'work', domain: 'work.example' }];
  assert.equal(totals(slicesForDay(slices, new Date(2026, 10, 20))).work, 60000);
  assert.equal(totals(slicesForDay(slices, new Date(2026, 10, 21))).work, 60000);
});
test('invalid sessions fail before tracking begins', () => {
  assert.throws(() => createSession({ title: '', durationMinutes: 25, tab: { url: ctx.url } }));
  assert.throws(() => createSession({ title: 'Work', durationMinutes: NaN, tab: { url: ctx.url } }));
  assert.throws(() => createSession({ title: 'Work', durationMinutes: 25, tab: { url: 'chrome://newtab' } }));
});
test('persistent work-site allowance applies across tabs and takes precedence', () => {
  const s = session(); s.rules.workDomains = ['youtube.com', 'github.com'];
  assert.equal(classify(s, { ...ctx, tabId: 4, url: 'https://youtube.com/watch' }, 0), 'work');
  assert.equal(classify(s, { ...ctx, tabId: 5, url: 'https://github.com/hibaa8' }, 0), 'work');
});
test('old saved sessions gain new settings without losing existing history', () => {
  const old = { version: 1, settings: { domains: ['example.com'], mode: 'automatic', graceSeconds: 120 }, session: session(), history: [{ id: 'old' }], tasks: [] };
  delete old.session.events;
  const migrated = migrateState(old);
  assert.equal(migrated.settings.graceSeconds, 120); assert.equal(migrated.settings.closeDistractingTabs, true);
  assert.equal(migrated.history[0].id, 'old'); assert.deepEqual(migrated.session.events, []);
});
test('video links accept verified YouTube formats but reject arbitrary embeds', () => {
  assert.equal(parseVideoId('https://www.youtube.com/watch?v=0NV1KdWRHck'), '0NV1KdWRHck');
  assert.equal(parseVideoId('https://youtu.be/0NV1KdWRHck?t=10'), '0NV1KdWRHck');
  assert.throws(() => parseVideoId('https://evil.example/embed/0NV1KdWRHck'));
  assert.throws(() => parseVideoId('javascript:alert(1)'));
});
test('trend summaries rank distracting time using actual recorded domains', () => {
  const insights = trendInsights([{ slices: [{ start: 0, end: 120000, category: 'distraction', domain: 'instagram.com' }, { start: 120000, end: 150000, category: 'work', domain: 'github.com' }] }]);
  assert.deepEqual(insights.sites, [['instagram.com', 120000]]); assert.match(insights.notes[0], /2 minutes/);
});

test('new installs and legacy default upgrade use the requested motivational video without replacing a custom video', () => {
  assert.equal(DEFAULT_SETTINGS.videoId, 'E9lAeMz1DaM');
  const legacy = migrateState({ version: 2, settings: { videoId: '0NV1KdWRHck' } });
  assert.equal(legacy.settings.videoId, 'E9lAeMz1DaM');
  const custom = migrateState({ version: 2, settings: { videoId: 'abcdefghijk' } });
  assert.equal(custom.settings.videoId, 'abcdefghijk');
  const intentionallyChosenOldVideo = migrateState({ version: 3, settings: { videoId: '0NV1KdWRHck' } });
  assert.equal(intentionallyChosenOldVideo.settings.videoId, '0NV1KdWRHck');
});
