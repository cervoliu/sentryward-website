import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadResults, RESULTS_URL, embeddedStudy, sourceFileURL, loadInputConfig } from '../js/results-source.mjs';
import { validateResults, summarize, filterRows, analysisSeconds, formatSeconds } from '../js/results-model.mjs';
import { performanceLabel } from '../js/sync-removal.mjs';

const catalog = JSON.parse(await readFile(new URL('./fixtures/live-results.json', import.meta.url)));
const response = data => ({ ok: true, json: async () => structuredClone(data) });

test('each load requests main without a saved snapshot or browser cache', async () => {
  const calls = [];
  const newer = structuredClone(catalog);
  const row = newer.results.find(row => row.result === 'timeout');
  row.result = 'verified';
  newer.counts.timeout--;
  delete newer.counts.timeout;
  newer.counts.verified++;
  const fetcher = async (...args) => { calls.push(args); return response(calls.length === 1 ? catalog : newer); };
  const first = await loadResults(fetcher);
  const second = await loadResults(fetcher);
  assert.equal(second.counts.verified, first.counts.verified + 1);
  assert.deepEqual(calls, [[RESULTS_URL, { cache: 'no-store' }], [RESULTS_URL, { cache: 'no-store' }]]);
});

test('network, HTTP, malformed JSON, and count failures do not fall back to stale data', async () => {
  for (const fetcher of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 404 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }),
    async () => response({ ...catalog, counts: {} }),
  ]) {
    let calls = 0;
    await assert.rejects(loadResults(async (...args) => { calls++; return fetcher(...args); }));
    assert.equal(calls, 1);
  }
});

test('catalog accepts sparse records without inventing checks or analysis times', () => {
  const sparse = structuredClone(catalog);
  sparse.results.forEach(row => { delete row.analysis_time_seconds; delete row.analysis_time_source; });
  assert.equal(validateResults(sparse), sparse);
  assert.ok(sparse.results.every(row => row.checks === undefined && analysisSeconds(row) === null));
  assert.throws(() => validateResults({ ...catalog, results: [...catalog.results, catalog.results[0]] }));
  assert.throws(() => validateResults({ ...catalog, schema: 'unknown' }));
  assert.equal(summarize(catalog.results).inconclusive, 2);
  assert.equal(filterRows(catalog.results, { verdict: 'equivalence_not_proven', group: 'inconclusive' }).length, 1);
});

test('both synchronization scenarios come from the live records', () => {
  const study = embeddedStudy(catalog);
  const row = study.results.find(row => row.name === 'tirx-basic-rmsnorm');
  assert.equal(row.recorded.removal.removable, 2);
  assert.equal(row.larger.removal.removable, 1);
  assert.equal(performanceLabel(row.recorded.performance), 'No measurable change');
  assert.equal(performanceLabel(row.larger.performance), '0.9% faster');
  assert.equal(embeddedStudy({ ...catalog, synchronization_removal_study: undefined }), null);
  const invalid = structuredClone(catalog);
  invalid.results.find(row => row.synchronization_removal).synchronization_removal.recorded.removal.removable = 999;
  assert.throws(() => embeddedStudy(invalid));
});

test('input configurations load from the public source and verify hashes when provided', async () => {
  const file = { path: 'examples/kernel/input.json' };
  const content = JSON.stringify({ schema: 'spverify.kernel-input/v1', launch: { grid_dim: [1, 1, 1] } });
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return { ok: true, text: async () => content }; };
  const result = await loadInputConfig(file, fetcher);
  assert.equal(result.content, content);
  assert.deepEqual(result.config.launch.grid_dim, [1, 1, 1]);
  assert.deepEqual(calls[0], ['https://raw.githubusercontent.com/gpu-verifier/sentryward/main/examples/kernel/input.json', { cache: 'no-store' }]);
  await assert.rejects(loadInputConfig({ ...file, sha256: '0'.repeat(64) }, fetcher));
  await assert.rejects(loadInputConfig(file, async () => ({ ok: false, status: 404 })));
});

test('source file links stay within the configured repository', () => {
  assert.equal(sourceFileURL('examples/kernel/input.json'), 'https://github.com/gpu-verifier/sentryward/blob/main/examples/kernel/input.json');
  for (const path of ['', '../secret', '/examples/input.json', 'examples/../input.json', 'https://example.com/input.json', 'examples/a?x', 'examples/a#x']) {
    assert.throws(() => sourceFileURL(path));
  }
});

test('live analysis times are loaded, formatted, and sorted without elapsed_seconds', async () => {
  const loaded = await loadResults(async () => response(catalog));
  assert.ok(loaded.results.every(row => row.elapsed_seconds === undefined));
  for (const row of loaded.results) {
    assert.equal(analysisSeconds(row), row.analysis_time_seconds);
    assert.notEqual(formatSeconds(analysisSeconds(row)), 'Not recorded');
    assert.deepEqual(row.analysis_time_source, catalog.results.find(source => source.name === row.name).analysis_time_source);
  }
  const sorted = filterRows(loaded.results, { sort: 'time' });
  assert.deepEqual(sorted.map(analysisSeconds), loaded.results.map(row => row.analysis_time_seconds).sort((a, b) => b - a));
  assert.equal(formatSeconds(analysisSeconds(sorted.find(row => row.result === 'timeout'))), '8.3 min');
});

test('analysis time prefers the live field and distinguishes zero from absent values', () => {
  const rows = [
    { name: 'a', result: 'verified', analysis_time_seconds: 0, elapsed_seconds: 999 },
    { name: 'b', result: 'verified', analysis_time_seconds: 0.125 },
    { name: 'c', result: 'timeout', analysis_time_seconds: 120 },
    { name: 'd', result: 'verified', elapsed_seconds: 30 },
    { name: 'e', result: 'unsupported' },
    { name: 'f', result: 'unsupported', analysis_time_seconds: null, elapsed_seconds: 50 },
  ];
  assert.deepEqual(filterRows(rows, { sort: 'time' }).map(row => row.name), ['c', 'd', 'b', 'a', 'e', 'f']);
  assert.deepEqual(rows.map(row => formatSeconds(analysisSeconds(row))), ['0.00 s', '0.13 s', '2.0 min', '30.0 s', 'Not recorded', 'Not recorded']);
  for (const value of [-1, '12', NaN, Infinity]) {
    assert.equal(analysisSeconds({ analysis_time_seconds: value }), null);
  }
});
