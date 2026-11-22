import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPhoneModel } from '../extension/model-loader.js';
const base = new URL('../extension/models/', import.meta.url);
const fetchLocal = async url => {
  const data = await readFile(url);
  return { ok: true, json: async () => JSON.parse(data), arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
};
test('bundled phone model reconstructs and matches original SHA-256', async () => {
  const bytes = await loadPhoneModel(base, fetchLocal);
  assert.equal(bytes.length, 13836895); assert.equal(new TextDecoder().decode(bytes.subarray(4, 8)), 'TFL3');
});
test('corrupt model bytes fail integrity validation', async () => {
  await assert.rejects(loadPhoneModel(base, async url => {
    const result = await fetchLocal(url);
    if (url.pathname.endsWith('.part1.bin')) {
      const get = result.arrayBuffer; result.arrayBuffer = async () => { const bytes = new Uint8Array(await get()); bytes[100] ^= 1; return bytes.buffer; };
    }
    return result;
  }), /integrity check/);
});
test('missing model parts produce an actionable load error', async () => {
  await assert.rejects(loadPhoneModel(base, async url => url.pathname.endsWith('.bin') ? { ok: false } : fetchLocal(url)), /Could not load bundled model part/);
});
