import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateStudy, removalLabel, performanceLabel, runtimeReduction, summarizeStudy } from '../js/sync-removal.mjs';
import { filterRows } from '../js/results-model.mjs';

const snapshot = JSON.parse(await readFile(new URL('../data/kernel-verification-results.json', import.meta.url)));
const study = JSON.parse(await readFile(new URL('../data/sync-removal-results.json', import.meta.url)));
const byName = new Map(study.results.map(row => [row.name, row]));
const rows = snapshot.results.map(row => ({ ...row, syncStudy: byName.get(row.name) }));
const kernel = name => rows.find(row => row.name === name);

test('all imported experiments match exact verification identifiers', () => {
  assert.equal(validateStudy(study, new Set(snapshot.results.map(row => row.name))), study);
  assert.ok(study.results.length > 0);
  assert.throws(() => validateStudy(study, new Set()));
  assert.throws(() => validateStudy({ ...study, results: [study.results[0], study.results[0]] }, new Set(rows.map(row => row.name))));
});

test('measured zero, missing data, not run, and not applicable remain distinct', () => {
  const zero = kernel('pytorch__aten_WeightNorm__sm_100a').syncStudy.recorded;
  assert.equal(removalLabel(zero.removal), '0 of 4');
  assert.equal(performanceLabel(zero.performance), 'Not applicable');
  assert.equal(removalLabel(undefined), 'Not reported');
  assert.equal(runtimeReduction(undefined), null);
  const stopped = kernel('tritongluon-07-persistence').syncStudy.recorded;
  assert.equal(removalLabel(stopped.removal), 'Not run');
});

test('slowdowns and no measurable change preserve the reported interpretation', () => {
  const slow = kernel('tilelang-online-softmax').syncStudy.recorded.performance;
  assert.equal(performanceLabel(slow), '2.5% higher');
  assert.equal(runtimeReduction(slow), -2.5);
  const unchanged = kernel('tirx-basic-rmsnorm').syncStudy.recorded.performance;
  assert.notEqual(unchanged.original_us, unchanged.reduced_us);
  assert.equal(performanceLabel(unchanged), 'No measurable change');
  assert.equal(runtimeReduction(unchanged), 0);
});

test('scenario selection uses separate counts and timings', () => {
  const row = kernel('cutlass__block-scaled-gemm-mixed-8-bit__sm_100a');
  assert.equal(removalLabel(row.syncStudy.recorded.removal), '20 of 50');
  assert.equal(removalLabel(row.syncStudy.larger.removal), '19 of 52');
  assert.equal(performanceLabel(row.syncStudy.recorded.performance), '13.4% lower');
  assert.equal(performanceLabel(row.syncStudy.larger.performance), '6.7% lower');
  assert.equal(kernel('tilelang-online-softmax').syncStudy.larger.rechecked_at_recorded_input, true);
});

test('availability filter includes measured zero and excludes unrun experiments', () => {
  for (const scenario of ['recorded', 'larger']) {
    const filtered = filterRows(rows, { withStudy: true, scenario });
    assert.equal(filtered.length, summarizeStudy(rows, scenario).tested);
    assert.ok(filtered.every(row => row.syncStudy[scenario].removal.status === 'measured'));
  }
  assert.ok(filterRows(rows, { withStudy: true }).some(row => row.syncStudy.recorded.removal.removable === 0));
});

test('performance sorting puts unmeasured results after slowdowns', () => {
  const sorted = filterRows(rows, { sort: 'improvement' });
  const metrics = sorted.map(row => runtimeReduction(row.syncStudy?.recorded.performance));
  const measured = metrics.filter(value => value !== null);
  assert.deepEqual(measured, [...measured].sort((a, b) => b - a));
  assert.ok(metrics.slice(measured.length).every(value => value === null));
  assert.equal(summarizeStudy(sorted, 'recorded').timed, measured.length);
});
