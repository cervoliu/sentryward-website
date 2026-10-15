import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readInputConfig } from '../js/kernel-inputs.mjs';

const snapshot = JSON.parse(await readFile(new URL('../data/kernel-verification-results.json', import.meta.url)));
const bundle = JSON.parse(await readFile(new URL('../data/kernel-input-configs.json', import.meta.url)));

test('every verification record has an exact, hash-matching input configuration', async () => {
  assert.deepEqual(new Set(Object.keys(bundle.inputs)), new Set(snapshot.results.map(row => row.files.input.sha256)));
  for (const row of snapshot.results) {
    const { config, content } = await readInputConfig(bundle, row.files.input);
    assert.equal(config.schema, 'spverify.kernel-input/v1');
    assert.equal(typeof config.entry, 'string');
    assert.ok(Array.isArray(config.launch.grid_dim));
    assert.equal(content, bundle.inputs[row.files.input.sha256]);
  }
});

test('missing or tampered inputs cannot be presented as the recorded configuration', async () => {
  const file = snapshot.results[0].files.input;
  await assert.rejects(readInputConfig({ ...bundle, inputs: {} }, file), /unavailable/);
  await assert.rejects(readInputConfig({ ...bundle, inputs: { [file.sha256]: bundle.inputs[file.sha256] + ' ' } }, file), /hash/);
  await assert.rejects(readInputConfig({ ...bundle, schema: 'unknown' }, file), /Invalid/);
});

test('zero launch memory, empty argument lists, and null arguments survive the import', async () => {
  const softmax = snapshot.results.find(row => row.name === 'tilelang-online-softmax');
  const { config } = await readInputConfig(bundle, softmax.files.input);
  assert.equal(config.launch.dynamic_shared_bytes, 0);
  assert.deepEqual(config.arguments, []);
  const withNull = Object.values(bundle.inputs).map(raw => JSON.parse(raw)).find(input => input.arguments.some(arg => arg.value === null));
  assert.ok(withNull, 'Pointer null values must remain explicit');
});

test('64-bit integer arguments are displayed without rounding', async () => {
  const [hash, raw] = Object.entries(bundle.inputs).find(([, raw]) => raw.includes('18446744073709551615'));
  const { config, content } = await readInputConfig(bundle, { sha256: hash });
  assert.ok(config.arguments.some(arg => arg.value === '18446744073709551615'));
  assert.equal(content, raw);
});
