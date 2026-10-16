import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FILES, RUNS } from '../js/examples.mjs';

const read = name => readFile(new URL(`../js/sim/examples/${name}`, import.meta.url), 'utf8');
const cutlass = (await read('cutlass.ptx')).split('\n'), cutlassInput = JSON.parse(await read('cutlass.input.json'));
const tilelang = (await read('tilelang.ptx')).split('\n'), tilelangInput = JSON.parse(await read('tilelang.input.json'));
const shown = lines => lines.filter(([n, text]) => n != null && !text.includes('…'));   // "…": a shortened line

test('the homepage and the demo show the lines of the CUTLASS PTX the demo runs', () => {
  for (const [n, text] of shown(FILES.ptx)) assert.equal(text, cutlass[n - 1], `line ${n}`);
  assert.ok(FILES.input.includes(`"entry": "${cutlassInput.entry}"`), 'input.json names the entry the demo runs');
});

test('the PTX excerpt is in file order, with a gap wherever lines are omitted', () => {
  let last = 0;
  FILES.ptx.forEach(([n, text], i) => {
    if (n == null) return assert.equal(text, '…', `row ${i}`);
    assert.ok(n > last, `line ${n} after line ${last}`);
    if (n !== last + 1) assert.equal(FILES.ptx[i - 1]?.[0], null, `a gap before line ${n}`);
    last = n;
  });
});

test('the demo shows the lines of the TileLang PTX it runs', () => {
  for (const [n, text] of shown(RUNS.tilelang.ptx)) assert.equal(text, tilelang[n - 1], `line ${n}`);
  assert.ok(tilelang.some(line => /^(\.visible\s+)?\.entry\s/.test(line) && line.includes(` ${tilelangInput.entry}(`)), 'the PTX has the entry input.json names');
});

test('the TileLang marks are the racing write and read', () => {
  const marks = Object.fromEntries(RUNS.tilelang.ptx.filter(line => line[2]).map(([n, , kind]) => [kind, n]));
  assert.deepEqual(marks, { w: 882, r: 541 });
});

test('the recorded runs carry their results', () => {
  assert.equal(RUNS.cutlass.kernel, 'cutlass__dense-gemm-f16-tma-1sm__sm_100a');
  assert.equal(RUNS.cutlass.result, 'verified');
  assert.equal(RUNS.cutlass.raceCount, 0);
  assert.equal(RUNS.tilelang.result, 'potential_race');
  assert.doesNotMatch(JSON.stringify({ FILES, RUNS }), /\/(raid|home|Users)\//, 'no build-machine paths');
});
