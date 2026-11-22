// Optional DOM smoke checks: npm install --no-save linkedom && node tests/ui-check.mjs
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as engine from '../extension/engine.js';
const require = createRequire(import.meta.url);
const { parseHTML } = require(require.resolve('linkedom', { paths: [process.env.FOCUS_UI_MODULES, process.cwd()].filter(Boolean) }));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../extension');
const base = engine.emptyState();
function context(document, chrome, extra = {}) {
  return vm.createContext({ document, chrome, console, Date, URL, Blob, Option: function(text, value) { const node = document.createElement('option'); node.textContent = text; node.value = value; return node; }, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, engine, ...extra });
}
// The DOM shim adds browser-native select and form APIs missing from linkedom.
function shim(document) {
  for (const form of document.querySelectorAll('form')) Object.defineProperty(form, 'elements', { get() { return Object.fromEntries([...this.querySelectorAll('[name]')].map(e => [e.name, e])); } });
  for (const select of document.querySelectorAll('select')) {
    Object.defineProperty(select, 'value', { configurable: true, get() { return [...this.querySelectorAll('option')].find(o => o.hasAttribute('selected'))?.value ?? this.querySelector('option')?.value ?? ''; }, set(value) { for (const o of this.querySelectorAll('option')) o.toggleAttribute('selected', o.value === value); } });
    select.add = node => select.append(node);
  }
}
for (const file of ['dashboard.html', 'popup.html']) {
  const { document } = parseHTML(await readFile(resolve(root, file), 'utf8')); shim(document);
  const state = structuredClone(base);
  state.tasks.push({ id: 'task', title: 'Vaylo demo', remainingMinutes: 60, deadline: '' });
  const chrome = { runtime: { sendMessage: async () => ({ ok: true, state }), openOptionsPage() {} }, tabs: { query: async () => [{ id: 1, url: 'https://work.example/', title: 'Work tab', active: true }] } };
  const source = (await readFile(resolve(root, 'app.js'), 'utf8')).replace(/^import .*;$/gm, '') + '\n';
  const bindings = 'const {totals,slicesForDay,feedback,trendInsights,CATEGORIES}=engine; ';
  await vm.runInContext(`(async()=>{${bindings}${(await readFile(resolve(root, 'session-setup.js'), 'utf8')).replace('export function', 'function')}${source}\n})()`, context(document, chrome));
  assert.equal(document.getElementById('error').textContent, '', `${file}: no initialization error`);
  assert.match(document.getElementById('work-tab').textContent, /Work tab/);
  if (file === 'dashboard.html') {
    assert.equal(document.querySelector('[name=videoUrl]').value, 'https://www.youtube.com/watch?v=0NV1KdWRHck');
    assert.equal(document.querySelector('[name=closeDistractingTabs]').checked, true);
    assert.ok(document.getElementById('trend-insights').textContent.length > 0);
  }
  console.log(`PASS: ${file} initializes and renders settings, goals, and work tabs.`);
}
const { document, window } = parseHTML('<!doctype html><html><body><h1>Test website</h1></body></html>');
document.hasFocus = () => true;
Object.defineProperty(document, 'visibilityState', { value: 'visible' });
let shadow, listener;
const attach = window.Element.prototype.attachShadow;
window.Element.prototype.attachShadow = function(options) { shadow = attach.call(this, options); return shadow; };
const session = engine.createSession({ id: 's', title: 'Finish the demo', durationMinutes: 25, tab: { id: 1, url: 'https://work.example' }, rules: base.settings, now: Date.now() });
session.category = 'distraction';
const chrome = { runtime: { id: 'test', sendMessage: async () => ({ ok: true, widget: { session, isActiveTab: true, camera: null, closeDistractingTabs: true } }), onMessage: { addListener(fn) { listener = fn; } } } };
vm.runInContext(await readFile(resolve(root, 'coach-widget.js'), 'utf8'), context(document, chrome, { window }));
await new Promise(resolve => setImmediate(resolve));
assert.ok(shadow); assert.match(shadow.querySelector('.chip').textContent, /Return in/); assert.match(shadow.querySelector('.card').textContent, /Close & return/);
listener({ type: 'FC_STATE', session, isActiveTab: true, event: { id: 'nudge', kind: 'browser', at: Date.now(), message: 'Go back to work' } });
assert.equal(shadow.querySelector('.toast').hidden, false); assert.match(shadow.querySelector('.toast').textContent, /Go back to work/);
assert.equal(document.querySelectorAll('focus-coach-widget').length, 1);
console.log('PASS: side widget renders, counts down, and displays an in-page nudge.');

listener({ type: 'FC_STATE', session: { ...session, id: 'next-session' }, isActiveTab: true, event: null });
assert.equal(shadow.querySelector('.toast').hidden, true);
console.log('PASS: a new session clears the previous session reminder.');
