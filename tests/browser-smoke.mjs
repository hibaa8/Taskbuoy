// Optional integration check, deliberately separate from the dependency-free test suite.
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean) }));
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '../extension');
const profile = await mkdtemp(resolve(tmpdir(), 'focus-coach-smoke-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    channel: 'chromium', headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('https://*.focus.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Test work</title><h1>Work in progress</h1>' }));
  const work = await context.newPage(); await work.goto('https://work.focus.test/');
  const distraction = await context.newPage(); await distraction.goto('https://distraction.focus.test/');
  const dashboard = await context.newPage(); await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
  await dashboard.locator('#settings-form [name=domains]').fill('distraction.focus.test');
  await dashboard.locator('#settings-form [name=graceSeconds]').selectOption('30');
  await dashboard.locator('#settings-form [name=mode]').selectOption('automatic');
  await dashboard.locator('#settings-form button[type=submit]').click();
  await dashboard.locator('#saved').filter({ hasText: 'Saved' }).waitFor();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url === 'https://work.focus.test/').id);
  await dashboard.locator('#start-form [name=title]').fill('Test the core focus loop');
  await dashboard.locator('#work-tab').selectOption(String(tabId));
  await dashboard.locator('#start-form button[type=submit]').click();
  await dashboard.locator('#session-setup[open]').waitFor();
  await dashboard.locator('#setup-confirm').click();
  await dashboard.locator('#session .timer').waitFor();
  assert.equal(await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id), tabId);
  await distraction.bringToFront();
  // No UI polling here: the actual alarms must perform the return.
  await new Promise(resolve => setTimeout(resolve, 35000));
  const active = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  assert.equal(active, tabId, 'Automatic return should activate the work tab after the grace period');
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('state')).state);
  assert.ok(stored.session.interventions >= 1);
  await dashboard.bringToFront();
  await dashboard.getByRole('button', { name: 'End session', exact: true }).click();
  await dashboard.locator('#history-list .history-item').waitFor();
  assert.deepEqual(errors, [], 'No UI exceptions');
  console.log('PASS: settings, session form, alarm-driven return, and session history.');
} finally {
  if (context) await context.close();
  await rm(profile, { recursive: true, force: true });
}
