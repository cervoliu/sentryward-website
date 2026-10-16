import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FILES, RUNS } from '../js/examples.mjs';

const ptx = async name => (await readFile(new URL(`../js/sim/examples/${name}.ptx`, import.meta.url), 'utf8')).split('\n');
const old = await ptx('mml-280'), fixed = await ptx('mml-fixed');
const shown = lines => lines.filter(([n, text]) => n != null && !text.includes('…'));   // "…": a shortened line

test('the playground shows the lines of the PTX it runs', () => {
  for (const [n, text] of shown(RUNS['mml-280'].ptx)) assert.equal(text, old[n - 1], `PyTorch 2.8.0, line ${n}`);
  for (const [n, text] of shown(RUNS['mml-fixed'].ptx)) assert.equal(text, fixed[n - 1], `with the barrier, line ${n}`);
});

// The demo's PTX comes from gpu-verifier/sentryward, not this repository: check its line numbering.
test('the demo shows PTX lines in file order, with a gap wherever lines are omitted', () => {
  let last = 0;
  FILES.ptx.forEach(([n, text], i) => {
    if (n == null) return assert.equal(text, '…', `row ${i}`);
    assert.ok(n > last, `line ${n} after line ${last}`);
    if (n !== last + 1) assert.equal(FILES.ptx[i - 1]?.[0], null, `a gap before line ${n}`);
    last = n;
  });
});

test('the marks are the racing write and read, and the barrier between them', () => {
  const marks = id => Object.fromEntries(RUNS[id].ptx.filter(line => line[2]).map(([n, , kind]) => [kind, n]));
  assert.deepEqual(marks('mml-280'), { w: 470, r: 497 });
  assert.deepEqual(marks('mml-fixed'), { w: 470, ok: 473, r: 498 });
  assert.match(old[469], /^\s*st\.global\.f32\s/);
  assert.match(old[496], /^\s*ld\.global\.f32\s/);
  assert.match(fixed[472], /^\s*bar\.sync\s+0;/);
  assert.equal(fixed[497], old[496]);
});

test('the recorded runs carry their witnesses at the marked lines', () => {
  assert.equal(RUNS['mml-280'].result, 'potential_race');
  assert.deepEqual([RUNS['mml-280'].race.first.location.line, RUNS['mml-280'].race.second.location.line], [470, 497]);
  assert.equal(RUNS['mml-fixed'].result, 'verified');
  assert.equal(RUNS.tilelang.result, 'potential_race');
  assert.doesNotMatch(JSON.stringify({ FILES, RUNS }), /\/(raid|home|Users)\//, 'no build-machine paths');
});
