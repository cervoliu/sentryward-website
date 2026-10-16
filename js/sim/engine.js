// SentryWard in the browser: sentryward.verify(ptx, input=...) without a reference, on sentryward-ptx compiled to
// WebAssembly (scripts/engine/build.sh; checked field by field against the native wheel). Nothing leaves the browser.
// Mirrors sentryward 0.1.0's api.verify and frontend/ptx_native._run_ptx around the native report; the result contract
// is results.js. A reference (equivalence) needs PyTorch to capture it, so it is not available here.
import { makeContract } from './results.js';

const RULES = await (await fetch(new URL('./result-categories.json', import.meta.url))).json();
export const { normalize, failure } = makeContract(RULES);

// wasm64 (memory64), threads (SharedArrayBuffer: a cross-origin-isolated page) and Wasm exceptions are all required
const MEM64 = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1]);   // a module with one 64-bit memory
export function support() {
  const memory64 = (() => { try { return WebAssembly.validate(MEM64); } catch { return false; } })();
  const threads = typeof SharedArrayBuffer === 'function' && self.crossOriginIsolated === true;
  return { ok: memory64 && threads, memory64, threads };
}

// The engine: sentryward-ptx.wasm, gzipped (27 MB -> 9 MB), fetched and compiled once per page; every run gets the
// compiled module. onLoad({loaded, total}) reports the download.
const WASM = new URL('./engine/sentryward-ptx.wasm.gz', import.meta.url);
let compiled = null;
export function engine(onLoad = () => {}) {
  return compiled ??= (async () => {
    const r = await fetch(WASM);
    if (!r.ok) throw new Error(`engine: ${r.status} ${r.statusText}`);
    const total = +r.headers.get('Content-Length') || 0;
    let loaded = 0;
    const count = new TransformStream({ transform(chunk, c) { loaded += chunk.length; onLoad({ loaded, total }); c.enqueue(chunk); } });
    const body = r.body.pipeThrough(count).pipeThrough(new DecompressionStream('gzip'));
    return WebAssembly.compileStreaming(new Response(body, { headers: { 'Content-Type': 'application/wasm' } }));
  })().catch(e => { compiled = null; throw e; });
}

const g = x => String(+x.toPrecision(6));                            // Python's format(x, 'g'), for the arguments
class InputError extends Error {}                                     // what api.verify reports as invalid_input

// verify({ptx, input}) -> the result object sentryward.verify() returns. onStage(stage) reports progress.
export async function verify({ ptx, input, timeoutSeconds = 600, onStage = () => {}, signal } = {}) {
  const started = performance.now(), seconds = () => (performance.now() - started) / 1000;
  let stage = 'input_validation';
  try {
    let config;
    try { config = JSON.parse(input); } catch (e) { throw new InputError(e.message); }
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new InputError('input must contain a JSON object');
    stage = 'kernel_verification';
    const remaining = timeoutSeconds - seconds();
    const args = ['--wellsync-timeout-seconds', g(remaining), '--sync-threads', '8', '--timeout-seconds', g(remaining)];
    const run = await native(ptx, input, args, remaining, onStage, signal);
    let result;
    if (run.timedOut) {
      result = normalize({ result: 'timeout', reason: 'time_budget', stage: 'kernel_verification', memory_analysis_complete: false,
        warnings_complete: false, resource: { kind: 'time', origin: 'configured_budget', limit: remaining, unit: 'seconds' } });
    } else result = report(run, remaining);
    result.elapsed_seconds = seconds();
    if (run.memory) result.browser = { memory_mib: run.memory / 1048576 };   // not in the native report: see worker.js
    if (result.elapsed_seconds > timeoutSeconds && result.result !== 'timeout') {
      result = normalize({ result: 'timeout', stage: 'result_processing',
        diagnostics: [{ code: 'invocation_time_budget_exceeded', stage: 'result_processing', details: { limit_seconds: timeoutSeconds } }],
        checks: result.checks || {}, partial_report: result });
    }
    return result;
  } catch (e) {
    if (e instanceof InputError) return failure('invalid_input', 'invalid_configuration', e.message, { stage });
    if (e?.name === 'AbortError') throw e;
    return failure('tool_failure', 'process_or_io_failure', e?.message || String(e), { stage });
  }
}

// _run_ptx after the process: the report on stdout, or what the exit says about the run
function report({ code, stdout, stderr }, wellsyncSeconds) {
  let result;
  try {
    result = JSON.parse(stdout);
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.result !== 'string') throw new Error('not a status object');
  } catch {
    if (code === 124 && stderr.split('\n').includes('SENTRYWARD_TIMEOUT wellsync')) {
      result = { result: 'timeout', timeout_scope: 'wellsync',
        resource: { kind: 'time', origin: 'configured_budget', limit: wellsyncSeconds, unit: 'seconds' },
        message: `WellSync exceeded its ${g(wellsyncSeconds)}-second budget` };
    } else result = { result: 'tool_failure', message: stderr.slice(-8192) || 'Native process produced no valid JSON report' };
    Object.assign(result, { schema: 'spverify.native-ptx-run/v1', implementation: 'cpp', memory_analysis_complete: false, warnings_complete: false });
  }
  if (code && ['race_free', 'potential_race', 'verified'].includes(String(result.result || '').replace(/^recovered_/, ''))) {
    result = { schema: 'spverify.native-ptx-run/v1', implementation: 'cpp', result: 'tool_failure',
      message: 'Process failed after emitting a successful report', partial_report: result,
      memory_analysis_complete: false, warnings_complete: false };
  }
  return normalize(result, 'kernel_verification');
}

async function native(ptx, input, args, limitSeconds, onStage, signal) {
  const module = await engine(p => onStage('engine.download', p));
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const stop = () => { clearTimeout(timer); w.terminate(); signal?.removeEventListener('abort', abort); };
    const timer = setTimeout(() => { stop(); resolve({ timedOut: true }); }, (limitSeconds + 5) * 1000);
    const abort = () => { stop(); reject(new DOMException('Stopped', 'AbortError')); };
    signal?.addEventListener('abort', abort);
    w.onmessage = ({ data }) => {
      if (data.type === 'stage') onStage(data.stage, data);
      else if (data.type === 'done') { stop(); resolve(data); }
    };
    w.onerror = e => { stop(); resolve({ code: -1, stdout: '', stderr: e.message || 'worker failed to start' }); };
    w.postMessage({ module, ptx, input, args });
  });
}

// ------------------------------------------------------------------------------- an input configuration from the PTX
// What the PTX says is filled in; what only the author knows is left null (a null is never run). As the notebook does.
export function ptxParams(text) {
  const m = text.match(/\.entry\s+([\w$.]+)\s*\(([\s\S]*?)\)/);
  if (!m) return { entry: null, params: [] };
  const params = m[2].split(',').map(x => x.trim()).filter(Boolean).map((p, i) => {
    const toks = p.split(/\s+/), last = toks[toks.length - 1], arr = last.match(/\[(\d+)\]$/);
    const ty = toks.find(t => /^\.([usbf]\d+|pred)$/.test(t));
    return { i, name: last.replace(/\[\d+\]$/, ''), type: ty ? ty.slice(1) : null, pointer: toks.includes('.ptr'), length: arr ? +arr[1] : null };
  });
  return { entry: m[1], params };
}

export function draftInput(text) {
  const { entry, params } = ptxParams(text);
  const tid = d => { const m = text.match(new RegExp(`\\.${d}\\s+(\\d+)(?:\\s*,\\s*(\\d+))?(?:\\s*,\\s*(\\d+))?`)); return m ? [+m[1], +(m[2] || 1), +(m[3] || 1)] : null; };
  const req = tid('reqntid'), mx = tid('maxntid');
  const cfg = { schema: 'spverify.kernel-input/v1', entry,
    launch: { grid_dim: null, block_dim: req || mx, cluster_dim: [1, 1, 1], dynamic_shared_bytes: 0 }, arguments: [], declarations: [] };
  const todo = [{ k: 'grid' }];                                      // what to fill in, rendered by the page in its language
  if (!(req || mx)) todo.push({ k: 'block' });
  else if (!req) todo.push({ k: 'block_maxntid', n: mx[0] });
  for (const { i, name, type, pointer, length } of params) {
    let short = name.includes('_param_') ? name.split('_param_').pop() : name;
    if (/^\d+$/.test(short)) short = `param_${short}`;
    if (pointer) cfg.declarations.push({ parameter: i, type: 'pointer', object: short, name: short });
    else if (type === 'b8' && length === 128) { cfg.declarations.push({ parameter: i, type: 'tensor_map', object: short, name: short }); todo.push({ k: 'tma', i, name: short }); }
    else if (type && length == null) { cfg.arguments.push({ parameter: i, type: type === 'pred' ? 'bool' : type, value: null }); todo.push({ k: 'scalar', i, name: short, type }); }
    else todo.push({ k: 'struct', i, name: short, type, length });
  }
  const entries = (text.match(/\.entry/g) || []).length;
  if (entries > 1) todo.push({ k: 'entries', n: entries, entry });
  const input = JSON.stringify(cfg, null, 2).replace(/\[\s+([-\d.,\s]*?|null)\s+\]/g, (_, x) => `[${x.split(/,\s*/).join(', ')}]`);   // [1, 1, 1] on one line
  return { input, todo };
}

// Where a configuration still has a null to fill in (a null pointer is a value)
export function nulls(cfg) {
  return [...Object.entries(cfg.launch || {}).filter(([, v]) => v === null).map(([k]) => `launch.${k}`),
    ...(cfg.arguments || []).filter(a => a.value === null && a.type !== 'pointer').map(a => `parameter ${a.parameter}`)];
}
