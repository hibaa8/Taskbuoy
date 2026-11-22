import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { emptyState, createSession } from '../extension/engine.js';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean) }));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'release-assets');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'focus-coach-release-'));
const checks = [], errors = [];
let context, worker, dashboard, cameraPage;
// Keep the disposable Xvfb desktop active while testing actual OS idle detection.
const input = setInterval(() => { execFile('xdotool', ['mousemove', '15', '15'], () => {}); }, 10000);
async function waitUntil(fn, message, timeout = 75000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await new Promise(r => setTimeout(r, 500)); }
  throw Error(message);
}
function pass(name, detail = '') { checks.push({ name, status: 'passed', detail }); console.log(`PASS: ${name} ${detail}`); }
const state = () => worker.evaluate(async () => (await chrome.storage.local.get('state')).state);
const command = async (type, fields = {}) => {
  const result = await dashboard.evaluate(message => chrome.runtime.sendMessage(message), { type, ...fields });
  assert.equal(result.ok, true, result.error); return result.state;
};
const workHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Project proposal · example work page</title><style>body{margin:0;background:#faf9f4;color:#283b30;font:17px/1.7 system-ui}header{padding:22px 60px;border-bottom:1px solid #ddd}main{max-width:700px;margin:70px 0 0 100px}small{font-size:12px;color:#6b7a64;letter-spacing:2px}h1{font:48px Georgia;margin:15px 0 28px}h2{font:25px Georgia}p{color:#687561}.block{padding:20px 26px;background:white;border:1px solid #e2e5d9;border-radius:12px;margin:22px 0}input{accent-color:#315942}footer{margin-top:30px;font-size:12px;color:#8c9586}</style><header>WORKSPACE <small> / EXAMPLE PAGE</small></header><main><small>ONE THING AT A TIME</small><h1>Write the project proposal.</h1><p>A clear idea. A concrete next step. A little space to make progress.</p><div class="block"><h2>Today’s next steps</h2><p><input type="checkbox" checked> Outline the problem</p><p><input type="checkbox"> Describe the solution</p><p><input type="checkbox"> Define the first milestone</p></div><footer>Example workspace used to demonstrate the Taskbuoy extension.</footer></main></html>`;
const socialHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Example distracting page</title><style>body{margin:0;background:#f2f3f1;font:16px/1.6 system-ui;color:#37413b}header{background:white;padding:20px 60px;border-bottom:1px solid #ddd}main{width:640px;margin:50px 0 0 110px}.post{padding:26px;background:white;border:1px solid #dde2d8;border-radius:14px;margin:20px 0}h1{font:40px Georgia}.label{font-size:12px;color:#738168;letter-spacing:2px}.placeholder{height:115px;background:linear-gradient(120deg,#c7d5bd,#e9d8c1);border-radius:8px}small{color:#85907d}</style><header>EXAMPLE FEED <small>· Demo webpage, not part of Taskbuoy</small></header><main><p class="label">JUST ONE MORE SCROLL?</p><h1>Your intention can wait.<br>Or can it?</h1><div class="post"><div class="placeholder"></div><h3>A quick update from the internet</h3><p>This example page is marked distracting for the demo.</p></div></main></html>`;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: false, viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${resolve(root, 'extension')}`, `--load-extension=${resolve(root, 'extension')}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  context.on('page', page => page.on('pageerror', error => errors.push({ url: page.url(), message: error.message })));
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await context.route('https://*.focus.test/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('distraction.') ? socialHtml : workHtml }));
  const work = await context.newPage(); await work.goto('https://work.focus.test/');
  let distraction = await context.newPage(); await distraction.goto('https://distraction.focus.test/');
  dashboard = await context.newPage(); await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
  await dashboard.locator('#settings-form [name=domains]').fill('distraction.focus.test');
  await dashboard.locator('#settings-form [name=workDomains]').fill('work.focus.test');
  await dashboard.locator('#settings-form [name=graceSeconds]').selectOption('30');
  await dashboard.locator('#settings-form [name=mode]').selectOption('gentle');
  await dashboard.locator('#settings-form [name=sound]').uncheck();
  await dashboard.locator('#settings-form [name=escalation]').uncheck();
  await dashboard.locator('#settings-form button[type=submit]').click();
  await dashboard.locator('#saved').filter({ hasText: 'Saved' }).waitFor();
  assert.equal((await state()).settings.graceSeconds, 30);
  pass('Settings form and persistent rules');
  const workId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url === 'https://work.focus.test/').id);
  await dashboard.locator('#start-form [name=title]').fill('Demo · Write the project proposal');
  await dashboard.locator('#work-tab').selectOption(String(workId));
  // Unsaved settings must be offered before a session starts.
  await dashboard.locator('#settings-form [name=graceSeconds]').selectOption('60');
  await dashboard.locator('#start-form button[type=submit]').click();
  await dashboard.locator('#session-setup[open]').waitFor();
  assert.equal((await state()).session, null, 'Review must happen before the timer starts');
  assert.equal(await dashboard.locator('#setup-form [name=graceSeconds]').inputValue(), '60');
  await dashboard.locator('#setup-cancel').click();
  assert.equal((await state()).session, null);
  assert.equal((await state()).settings.graceSeconds, 30, 'Cancel must not save settings');
  await dashboard.locator('#start-form button[type=submit]').click();
  await dashboard.locator('#setup-form [name=domains]').fill('invalid.test/path');
  await dashboard.locator('#setup-confirm').click();
  await dashboard.locator('#setup-error:not([hidden])').waitFor();
  assert.equal((await state()).session, null);
  await dashboard.locator('#setup-form [name=domains]').fill('distraction.focus.test');
  await dashboard.locator('#setup-form [name=graceSeconds]').selectOption('30');
  await dashboard.locator('#setup-confirm').click();
  await waitUntil(async () => (await state()).session?.workTabId === workId, 'Session did not start');
  await waitUntil(async () => (await state()).session?.category === 'work', 'Work tab was not classified as work');
  await work.locator('focus-coach-widget').waitFor();
  assert.equal((await state()).session.rules.graceSeconds, 30);
  pass('Pre-session settings review, cancellation, validation, and immediate application');
  pass('Session form, work-tab activation, and content-script injection');
  const unmarked = await context.newPage(); await unmarked.goto('https://unmarked.focus.test/');
  await waitUntil(async () => (await state()).session?.category === 'work' && (await state()).session?.domain === 'unmarked.focus.test', 'Unmarked tab did not count as work');
  pass('Unmarked websites count as working'); await unmarked.close();
  const otherWindow = await worker.evaluate(() => chrome.windows.create({ url: 'https://unmarked.focus.test/other-window', focused: true }));
  await waitUntil(async () => (await state()).session?.domain === 'unmarked.focus.test' && (await state()).session?.category === 'work', 'Another Chrome window did not count as work');
  await worker.evaluate(id => chrome.windows.remove(id), otherWindow.id);
  await work.bringToFront();
  pass('Work classification follows another Chrome window');
  await distraction.bringToFront();
  await waitUntil(async () => (await state()).session?.category === 'distraction', 'Distraction not detected');
  await waitUntil(async () => (await state()).session?.interventions >= 1, 'No reminder after the real grace period');
  assert.equal(distraction.isClosed(), false);
  const notifications = await worker.evaluate(() => chrome.notifications.getAll());
  assert.ok(Object.hasOwn(notifications, 'fc-nudge'));
  await distraction.screenshot({ path: resolve(output, '02-distraction-reminder-1280x800.png') });
  pass('Real grace-period reminder and system notification API', 'Gentle mode preserved the tab.');
  await command('ALLOW');
  assert.equal((await state()).session.category, 'work');
  pass('Per-session work allowance overrides distraction');
  await command('BREAK'); assert.equal((await state()).session.category, 'break');
  await command('RESUME');
  pass('Break and resume');
  await command('END');
  await command('SETTINGS', { domains: 'distraction.focus.test', workDomains: 'work.focus.test', graceSeconds: 30, mode: 'automatic', closeDistractingTabs: true, sound: false, escalation: false });
  await command('START', { title: 'Demo · Return to my proposal', durationMinutes: 25, tabId: workId });
  await distraction.bringToFront();
  await waitUntil(async () => distraction.isClosed(), 'Automatic return did not close the active distracting tab');
  assert.equal(await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id), workId);
  pass('Automatic return activates work and closes the distracting tab');
  await command('END');
  await command('SETTINGS', { domains: 'distraction.focus.test', workDomains: '', graceSeconds: 30, mode: 'gentle', sound: true, escalation: false });
  await command('TEST_ALERTS');
  const audio = await worker.evaluate(async () => ({ contexts: await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }), result: await chrome.runtime.sendMessage({ target: 'audio', type: 'PLAY_CHIME' }) }));
  assert.equal(audio.result.ok, true, audio.result.error); assert.equal(audio.contexts.length, 1);
  pass('Offscreen chime playback', 'Playback promise resolved; physical speaker output is device-dependent.');
  await command('START', { title: 'Demo · Camera and completion check', durationMinutes: 1, tabId: workId });
  cameraPage = await context.newPage(); await cameraPage.goto(`chrome-extension://${id}/camera.html`);
  await cameraPage.locator('#camera-start').click();
  await waitUntil(async () => {
    const error = await cameraPage.locator('#camera-error').textContent();
    if (error) throw Error(`Camera error: ${error}`);
    return (await cameraPage.locator('#camera-calibrate').isEnabled());
  }, 'Camera models did not load', 60000);
  await waitUntil(async () => (await state()).camera?.status === 'calibrating', 'No camera inference sample', 15000);
  pass('Camera permission flow and both local vision models', 'Synthetic color-bar camera; calibration accuracy and human/phone detection accuracy are not measured.');
  await cameraPage.locator('#camera-stop').click();
  assert.equal(await cameraPage.locator('#camera-preview').evaluate(v => v.srcObject), null);
  await waitUntil(async () => (await state()).camera?.status === 'off', 'Camera did not stop');
  pass('Camera stop releases the stream');
  await cameraPage.close();
  await work.bringToFront();
  await waitUntil(async () => !(await state()).session, 'One-minute session did not complete', 90000);
  assert.equal((await state()).lastEvent.kind, 'complete');
  pass('Real session deadline and completion event');
  const popup = await context.newPage(); await popup.setViewportSize({ width: 400, height: 600 });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#start-form [name=title]').fill('Popup review');
  await popup.locator('#work-tab').selectOption(String(workId));
  await popup.locator('#start-form button[type=submit]').click();
  await popup.locator('#session-setup[open]').waitFor();
  assert.equal((await state()).session, null);
  await popup.locator('#setup-cancel').click(); await popup.close();
  pass('Popup requires a settings review and cancel leaves the timer stopped');
  const policy = await context.newPage(); await policy.goto(`chrome-extension://${id}/privacy.html`);
  assert.match(await policy.locator('footer').innerText(), /Provided by Hiba/);
  assert.doesNotMatch(await policy.locator('body').innerText(), /Altaf|@gmail\.com/); await policy.close();
  pass('Bundled privacy page opens and uses Hiba only');
  const resetPage = await context.newPage(); await resetPage.goto(`chrome-extension://${id}/reset.html`);
  const playerFrame = resetPage.frameLocator('iframe');
  const frameUrl = await resetPage.locator('iframe').getAttribute('src');
  assert.equal(new URL(frameUrl).origin, 'https://focus-coach-privacy-hiba.strollingpopcorn9.chatgpt.site');
  assert.deepEqual([...new URL(frameUrl).searchParams.keys()], ['v'], 'Only the selected video ID may leave the extension');
  if (process.env.FOCUS_LIVE_VIDEO === '1') {
    let playAttempted = false;
    try {
      await waitUntil(async () => {
        const status = await resetPage.locator('#video-status').getAttribute('data-state');
        const text = await resetPage.locator('#video-status').innerText();
        if (status === 'error') throw Error(text);
        if (!playAttempted && ['blocked', 'paused', 'waiting', 'ready'].includes(status)) {
          const playButton = playerFrame.locator('#play');
          if (await playButton.isVisible()) { await playButton.click(); playAttempted = true; }
        }
        return status === 'playing';
      }, 'Hosted YouTube player did not reach actual playback', 30000);
      pass('Live YouTube video reaches playback inside the extension reset panel');
    } catch (e) {
      const status = await resetPage.locator('#video-status').getAttribute('data-state');
      const text = await resetPage.locator('#video-status').innerText();
      // Never treat an unavailable remote video as verified playback.
      checks.push({ name: 'Live YouTube availability', status: 'unavailable', detail: e.message });
      console.log(`::warning::Live video could not play: ${e.message}`);
      await resetPage.screenshot({ path: resolve(output, 'video-unavailable.png') });
      assert.ok(['error', 'waiting', 'buffering', 'ready', 'blocked', 'paused'].includes(status));
      assert.ok(text.length > 0);
      assert.equal(await resetPage.locator('#video-link').getAttribute('href'), 'https://www.youtube.com/watch?v=wnHW6o8WMas');
      assert.ok(resetPage.url().startsWith('chrome-extension://'), 'A blocked video must never redirect the reset panel');
      pass('Unavailable video has a clear status, configurable URL, and explicit fallback without redirect');
      const direct = await context.newPage(); await direct.goto(frameUrl);
      await direct.waitForTimeout(12000);
      const statusText = await direct.locator('#player-status').innerText();
      const remoteText = await direct.frameLocator('iframe').locator('body').innerText().catch(() => 'No remote frame text available');
      console.log('VIDEO_DIAGNOSTIC: ' + JSON.stringify({ directStatus: statusText, embeddedStatus: text, youtubeText: remoteText.slice(0, 1200) }));
      await direct.screenshot({ path: resolve(output, 'video-direct-diagnostic.png') }); await direct.close();
    }
  }
  await resetPage.close();
  // Separate, explicitly synthetic data for store captures. It never touches a user profile.
  const demo = emptyState(); const now = Date.now();
  demo.settings.sound = false; demo.settings.escalation = false;
  demo.tasks = [{ id: 'demo-goal', title: 'Demo · Launch my project', remainingMinutes: 90, deadline: new Date(now + 3 * 86400000).toISOString().slice(0, 10) }];
  demo.history = [0, 1, 2].map((n) => {
    const start = now - (n + 1) * 50 * 60000;
    const s = createSession({ id: `demo-${n}`, title: ['Demo · Outline the proposal', 'Demo · Review research notes', 'Demo · Build the first prototype'][n], durationMinutes: 45, tab: { id: workId, url: 'https://work.focus.test/' }, rules: demo.settings, now: start });
    s.slices = [{ start, end: start + 25 * 60000, category: 'work', domain: 'work.focus.test' }, { start: start + 25 * 60000, end: start + 28 * 60000, category: 'distraction', domain: 'example-feed.test' }, { start: start + 28 * 60000, end: start + 33 * 60000, category: 'break', domain: '' }];
    s.finishedAt = start + 33 * 60000; s.finishReason = 'completed'; s.outcome = ['Finished the outline and next steps.', 'Collected the notes I need.', 'Built a working first version.'][n]; s.interventions = 1; return s;
  });
  await worker.evaluate(state => chrome.storage.local.set({ state }), demo);
  await dashboard.bringToFront(); await dashboard.reload();
  await dashboard.locator('#history-list .history-item').first().waitFor();
  await dashboard.screenshot({ path: resolve(output, '01-focus-dashboard-1280x800.png') });
  await dashboard.locator('#settings').scrollIntoViewIfNeeded();
  await dashboard.screenshot({ path: resolve(output, '03-focus-settings-1280x800.png') });
  await dashboard.evaluate(() => window.scrollTo(0, 0));
  await command('START', { title: 'Demo · Write the project proposal', durationMinutes: 25, tabId: workId });
  await work.bringToFront();
  // Let the preceding completion toast expire before opening the coach controls.
  await work.waitForTimeout(1000);
  await work.locator('focus-coach-widget').click();
  await work.screenshot({ path: resolve(output, '04-focus-side-coach-1280x800.png') });
  await command('END');
  assert.deepEqual(errors, [], `Browser UI exceptions: ${JSON.stringify(errors)}`);
  pass('Store screenshots rendered from the actual UI', '1280 × 800; synthetic demo profile only.');
} catch (error) {
  checks.push({ name: 'Release browser check', status: 'failed', detail: error.stack });
  for (const [name, page] of [['failure-dashboard', dashboard], ['failure-camera', cameraPage]]) if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, `${name}.png`) }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  clearInterval(input);
  await writeFile(resolve(output, 'browser-verification.json'), JSON.stringify({ at: new Date().toISOString(), checks, errors, limitations: ['Not a real macOS notification/speaker test.', 'Synthetic camera does not establish face, gaze, or phone detection accuracy.', 'External YouTube embedding and autoplay vary by network/browser.', 'Screenshots show demo data, not measured user outcomes.'] }, null, 2));
  if (context) await context.close();
  await rm(profile, { recursive: true, force: true });
}
