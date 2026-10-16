// The home page's film, files and playground. The film's chapter buttons seek the video. The files are one kernel's
// inputs and output, annotated. In the playground, SentryWard checks a kernel in the browser (js/sim: sentryward-ptx
// compiled to WebAssembly); nothing is uploaded. The PyTorch examples run live, the TileLang example replays the
// team's recorded run, and a browser that cannot run the verifier replays the recorded runs.
import { FILES, RUNS } from './examples.mjs';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => n.toLocaleString('en-US');

// ------------------------------------------------------------------------------------------- syntax colouring
function hlPTX(s) {
  if (s === '…') return '<span class="gap">⋯</span>';
  const ci = s.indexOf('//'), code = ci < 0 ? s : s.slice(0, ci), com = ci < 0 ? '' : s.slice(ci);
  let first = true;
  const body = code.replace(/(\$L__\w+:?)|(@!?%p\d+)|(%[A-Za-z_]\w*)|(\.?[A-Za-z_][\w.:]*)|([^$@%.A-Za-z_]+|[$@%.])/g, (m, lab, pred, reg, word, other) => {
    if (other !== undefined) return esc(other);
    if (lab) return `<span class="lb">${esc(lab)}</span>`;
    if (pred) return `<span class="pr">${esc(pred)}</span>`;
    if (reg) return `<span class="rg">${esc(reg)}</span>`;
    const head = first; first = false;
    return word[0] === '.' ? `<span class="d">${esc(word)}</span>` : head ? `<span class="op">${esc(word)}</span>` : esc(word);
  });
  return body + (com ? `<span class="c">${esc(com)}</span>` : '');
}
const hlJSON = s => esc(s).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g,
  (m, str, colon, kw, num) => (str ? (colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`) : kw ? `<span class="kw">${kw}</span>` : `<span class="nm">${num}</span>`));
const hlPy = s => esc(s).replace(/(#.*$)|\b(def|return|from|import)\b/gm, (m, c, kw) => (c ? `<span class="c">${c}</span>` : `<span class="op">${kw}</span>`));

// ------------------------------------------------------------------------------------------- the film
function film() {
  const video = $('overview-video'); if (!video) return;
  const chapters = [...document.querySelectorAll('#overview-chapters button')];
  chapters.forEach(b => b.addEventListener('click', () => { video.currentTime = +b.dataset.t; video.play().catch(() => {}); }));
  video.addEventListener('timeupdate', () => {                     // the chapter playing
    const now = chapters.filter(b => +b.dataset.t <= video.currentTime + 0.05).pop();
    chapters.forEach(b => (b === now && video.currentTime > 0 ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  });
}

// ------------------------------------------------------------------------------------------- the files
// Notes point at lines: PTX line numbers, or the first line containing a JSON key (with its whole block).
const NOTES = {
  ptx: [
    [[11], '<b>PTX for Blackwell, exactly as the compiler emitted it.</b> Kernels written in CUDA C++, CUTLASS, Triton or TileLang all reach this form; SentryWard reads these instructions directly, with no IR to write and nothing to annotate.'],
    [[13], '<b>The kernel to verify.</b> A PTX file can hold several entries; input.json names this one. (Its mangled name is shortened here.)'],
    [[14, 15, 16, 17, 18, 19, 20, 21, 22, 23], '<b>Ten parameters: five pointers and five scalars.</b> The PTX gives only their types; input.json says what each one is.'],
    [[473], '<b>The barrier PyTorch 2.9.0 added.</b> Without it, as in PyTorch 2.8.0, the read at line 498 may see the gradient before thread 0 has written it at line 470. Run both versions in the playground below.'],
  ],
  input: [
    ['"entry"', '<b>Which kernel</b> in the PTX file (name shortened here).'],
    ['"launch"', '<b>One launch:</b> one block of 128 threads, no cluster, no dynamic shared memory. A result covers every schedule of this launch.'],
    ['"arguments"', '<b>Values for the scalars:</b> nframe = 1, dim = 8 classes, margin = 1.0. weights is a null pointer, so there are no class weights.'],
    ['"declarations"', '<b>What each parameter is.</b> Every pointer becomes a symbolic object (gradInput, gradOutput, input, target): no tensor data goes in, so no test data decides the result.'],
    ['"shape_arrays"', '<b>Fixed, read-only contents</b> for an array the kernel indexes with: target holds class 5, for the whole run.'],
    ['"assumptions"', '<b>Assumptions about the hardware model,</b> each documented in ASSUMPTIONS.md. The result lists every one, whether it was enabled and whether it was triggered.'],
    ['"branch_decisions"', '<b>A branch on tensor data, decided explicitly.</b> Such branches are off by default; this scenario takes the one where every margin is violated, and the result records the decision.'],
  ],
  reference: [
    ['def reference', '<b>A plain Python function named reference,</b> written with PyTorch. It runs as ordinary Python; SentryWard captures what it computes.'],
    ['return', '<b>No separate input file:</b> its arguments are derived from input.json, through the binding.'],
  ],
  binding: [
    ['"left_inputs"', '<b>Folded here:</b> the layout of every buffer the comparison reads, and (in checker_context) a predicate that states the authorized branch.'],
    ['"outputs"', '<b>The output to compare:</b> gradInput, a 1 × 8 tensor of 4-byte values, in the kernel and in the reference.'],
    ['"output_value_semantics"', '<b>Real arithmetic:</b> values are compared as real numbers, not as floating point.'],
    ['"reference"', '<b>The reference’s arguments, in order:</b> three tensors read from kernel buffers, and margin from kernel parameter 8.'],
  ],
  output: [
    ['"result"', '<b>One of 14 result categories.</b> verified means synchronization, memory and equivalence all passed; without a reference, a pass is race_free.'],
    ['"checks"', '<b>Each check on its own:</b> passed, failed, incomplete, not_run or not_requested.'],
    ['"diagnostics"', '<b>The details of a failure,</b> with its witness, would be here. This kernel has none.'],
    ['"counts"', '<b>The size of what was checked:</b> 128 threads, 814 instructions, 1,628 events.'],
    ['"pipeline_elapsed_seconds"', '<b>0.04 seconds</b> and 118 MiB at peak, for this kernel. The TileLang GEMM in the playground took 21 seconds.'],
  ],
};
const FILE_TABS = [['ptx', 'kernel.ptx', 'required'], ['input', 'input.json', 'required'], ['reference', 'reference.py', 'for equivalence'],
  ['binding', 'reference_binding.json', 'for equivalence'], ['output', 'output.json', 'what comes back']];

function files() {
  const host = $('files'); if (!host) return;
  const tabs = $('ftabs'), code = $('fcode'), notes = $('fnotes'), cmd = $('fcmd');
  tabs.innerHTML = FILE_TABS.map(([k, name, role]) => `<button role="tab" data-f="${k}"><b>${name}</b><span>${role}</span></button>`).join('');
  const show = key => {
    [...tabs.children, ...cmd.querySelectorAll('button')].forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === key)));
    const raw = key === 'ptx' ? FILES.ptx.map(l => l[1]) : FILES[key].split('\n');
    const lines = key === 'ptx' ? FILES.ptx.map(([n, s]) => [n, hlPTX(s)]) : raw.map((s, i) => [i + 1, key === 'reference' ? hlPy(s) : hlJSON(s)]);
    // each note's lines: PTX line numbers, or a JSON key's line through the end of its block
    const spans = NOTES[key].map(([at]) => {
      if (Array.isArray(at)) return at.map(n => lines.findIndex(l => l[0] === n)).filter(i => i >= 0);
      const i = raw.findIndex(s => s.includes(at)); if (i < 0) return [];
      const ind = raw[i].match(/^\s*/)[0].length, open = /[[{]$/.test(raw[i].trim());
      let j = i; if (open) while (j + 1 < raw.length && !(raw[j + 1].match(/^\s*/)[0].length === ind && /^\s*[\]}]/.test(raw[j + 1]))) j++;
      return Array.from({ length: (open ? j + 1 : j) - i + 1 }, (_, k) => i + k);
    });
    const markAt = new Map(spans.map((s, k) => [s[0], k + 1]));
    code.innerHTML = lines.map(([n, h], i) => `<span class="l" data-i="${i}">${markAt.has(i) ? `<button class="mk" data-k="${markAt.get(i)}" aria-label="note ${markAt.get(i)}">${markAt.get(i)}</button>` : ''}<span class="n">${n ?? ''}</span>${h || ' '}</span>`).join('');
    notes.innerHTML = NOTES[key].map(([, html], k) => `<li data-k="${k + 1}" tabindex="0">${html}</li>`).join('');
    const light = k => {
      code.querySelectorAll('.l.hl').forEach(n => n.classList.remove('hl'));
      notes.querySelectorAll('li').forEach(li => li.classList.toggle('on', +li.dataset.k === k));
      (spans[k - 1] || []).forEach(i => code.querySelector(`.l[data-i="${i}"]`)?.classList.add('hl'));
    };
    const reveal = k => { const first = code.querySelector(`.l[data-i="${spans[k - 1]?.[0]}"]`); if (first && (first.offsetTop < code.scrollTop || first.offsetTop > code.scrollTop + code.clientHeight - 40)) code.scrollTo({ top: first.offsetTop - 60, behavior: reduced ? 'auto' : 'smooth' }); };
    notes.querySelectorAll('li').forEach(li => {
      const k = +li.dataset.k, go = () => { light(k); reveal(k); };
      li.addEventListener('mouseenter', go); li.addEventListener('focus', go); li.addEventListener('click', go);
    });
    code.querySelectorAll('.mk').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.k; light(k); notes.querySelector(`li[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }));
    code.scrollTop = 0; light(0);
  };
  [...tabs.children, ...cmd.querySelectorAll('button')].forEach(b => b.addEventListener('click', () => show(b.dataset.f)));
  show('ptx');
}

// ------------------------------------------------------------------------------------------- the playground
const REFERENCE = '<code>pip install "sentryward[reference]"</code>';
const RUN_UI = {
  'mml-280': {
    tab: 'PyTorch 2.8.0', ref: false, live: 'mml-280',
    tags: { w: 'thread 0 · write · gradInput[5]', r: 'thread 5 · read · gradInput[5]' },
    note: 'Thread 0 writes the gradient of the target class (5) at line 470; thread 5, which owns that entry, reads it at line 497 to scale it. No barrier orders the two. PyTorch 2.9.0 adds one, independently; the team reproduced the wrong output on a B200.',
  },
  'mml-fixed': {
    tab: 'PyTorch, with the barrier', ref: true, live: 'mml-fixed',
    liveNote: `With bar.sync at line 473, the read at line 498 comes after the write at line 470 in every schedule. Equivalence to the PyTorch reference needs PyTorch, which a browser does not run: with the reference, the team’s recorded run is <b>verified</b>, and ${REFERENCE} reruns it.`,
    tags: { w: 'thread 0 · write', ok: 'orders the write before the read', r: 'read · after the barrier' },
    note: 'With bar.sync at line 473, the read at line 498 comes after the write at line 470 in every schedule, and the outputs equal the PyTorch reference, in real arithmetic.',
  },
  'tilelang': {
    tab: 'TileLang GEMM', ref: false,
    tags: { w: 'cp.async · write · 16 B · tile k + 2', r: 'tcgen05.mma · read · 32 B' },
    note: 'The copy of tile k + 2 (cp.async, line 882) writes 16 bytes of the shared buffer that the tensor core may still be reading (tcgen05.mma, line 541). Reported upstream (tile-ai/tilelang#3424); not reproduced on a B200.',
  },
};
const GOOD = new Set(['verified', 'race_free']);
const n0 = v => (v == null ? '—' : fmt(v));
const eq = r => (r.checks.equivalence || 'not_run').replace(/_/g, ' ');          // not run, not requested, incomplete …
const STEPS = [
  ['I · Specialize', r => `${n0(r.counts.threads)} threads · ${n0(r.counts.instructions)} instructions`],
  ['II · Two views', r => `${n0(r.counts.events)} events · ${n0(r.counts.edges)} edges`],
  ['III · Well-synchronization', r => r.checks.synchronization || '—'],
  ['IV · Races and lifetimes', r => `${n0(r.counts.memory_accesses)} memory accesses · ${r.raceCount ? `${r.raceCount} race` : 'no race'}`],
  ['V · Memory elimination', r => (['passed', 'failed'].includes(r.checks.equivalence) ? 'passed' : eq(r))],   // the expression check ran: memory was eliminated
  ['VI · Expression check', r => (r.checks.equivalence === 'passed' ? 'equal to the reference' : eq(r))],
];
// the step a result stops at (-1: none), and each step's state; without a reference, V and VI do not run
const failStep = r => { const c = r.checks || {}; return c.synchronization === 'failed' ? 2 : c.memory === 'failed' ? 3 : c.equivalence === 'incomplete' ? 4 : c.equivalence === 'failed' ? 5 : GOOD.has(r.result) ? -1 : r.result === 'potential_race' ? 3 : 0; };
const stepClass = (r, k) => { const f = failStep(r); return f >= 0 && k > f ? 'skip' : k === f ? 'fail' : k >= 4 && ['not_requested', 'not_run'].includes(r.checks?.equivalence) ? 'skip' : 'pass'; };
// what sentryward-ptx reports as it goes (js/sim/worker.js), as the step it is in
const STAGE_STEP = { 'frontend.execution': 0, 'frontend.cta_complete': 0, 'source.frontend_ready': 1, 'source.after_recovery': 1, 'event.ready': 1,
  'trace.ready': 2, 'hb.initial': 2, 'hb.after_waits': 2, 'hb.certified': 3, 'hb.memory_order': 3 };
const TODO = t => ({
  grid: '<code>launch.grid_dim</code>: the grid you launch, as [x, y, z]',
  block: '<code>launch.block_dim</code>: threads per block, as [x, y, z]',
  block_maxntid: `<code>launch.block_dim</code>: drafted from <code>.maxntid ${t.n}</code>; keep it only if you launch that many threads`,
  scalar: `parameter ${t.i} (<code>${esc(t.name)}</code>, ${esc(t.type)}): its value`,
  tma: `parameter ${t.i} (<code>${esc(t.name)}</code>) is a TMA descriptor: add its layout under <code>tma_descriptors</code>`,
  struct: `parameter ${t.i} (<code>${esc(t.name)}</code>) is a ${t.length}-byte parameter: describe it by hand`,
  entries: `the PTX has ${t.n} entries; the draft is for the first (<code>${esc(t.entry)}</code>)`,
}[t.k]);
// 64-bit WebAssembly memory, which the engine needs: without it (Safari), the examples replay their recorded runs
const MEM64 = (() => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1])); } catch { return false; } })();
const summary = o => JSON.stringify({ result: o.result, checks: o.checks, diagnostics: o.diagnostics, races: o.races, counts: o.counts }, null, 2);

// Threads need a cross-origin-isolated page. GitHub Pages cannot send the headers that make one, so sw.js adds them;
// it is registered the first time Run needs it, and the page reloads once under it, back at the playground, where the
// run starts by itself (your files are kept in this tab's session storage across the reload, if they fit).
const AFTER = 'sentryward-run-after-reload', TRIED = 'sentryward-isolation-tried';
const session = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); return true; } catch { return false; } },
  drop: k => { try { sessionStorage.removeItem(k); } catch { /* storage blocked */ } },
};
const within = (promise, ms) => Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new Error('timeout')), ms))]);
async function isolate(pending) {
  if (!('serviceWorker' in navigator) || session.get(TRIED) || !session.set(TRIED, '1')) return false;   // once a session
  try {                                                             // where workers are blocked, these may never settle
    await within(navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)), 10000);
    await within(navigator.serviceWorker.ready, 10000);
  } catch { return false; }
  if (!session.set(AFTER, JSON.stringify(pending))) session.set(AFTER, JSON.stringify({ id: pending.id }));
  location.hash = 'playground';
  location.reload();
  return true;
}

function playground() {
  const host = $('pg'); if (!host) return;
  const exBar = $('pg-ex'), ptx = $('pg-ptx'), inp = $('pg-in'), ref = $('pg-ref'), ftabs = $('pg-tabs'), steps = $('pg-steps'), run = $('pg-run'), ver = $('pg-verdict'), json = $('pg-json'), status = $('pg-status'), cmd = $('pg-cmd'), arc = $('pg-arc');
  const file = $('pg-file'), mine = $('pg-mine');
  const runs = { ...RUNS }, uis = { ...RUN_UI }, ids = Object.keys(uis);
  const tabsHtml = () => Object.keys(uis).map(id => `<button role="tab" data-id="${id}">${uis[id].tab}</button>`).join('');
  exBar.innerHTML = tabsHtml();
  steps.innerHTML = STEPS.map(([name]) => `<li><i></i><span class="s">${name}</span><span class="d"></span></li>`).join('');
  let cur = ids[0], timer = null, ctrl = null, sim = null;
  const engine = () => (sim ??= import('./sim/engine.js').catch(e => { sim = null; throw e; }));   // loaded on first use
  const runLabel = run.innerHTML;
  const PANES = { ptx, in: inp, ref };
  const ftab = t => { Object.entries(PANES).forEach(([k, n]) => { n.hidden = k !== t; }); [...ftabs.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t))); };
  ftabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => ftab(b.dataset.t)));
  const lineEl = n => ptx.querySelector(`.l[data-n="${n}"]`);
  const scrollTo = (n, flash) => { const e = lineEl(n); if (!e) return; ptx.scrollTo({ top: e.offsetTop - ptx.clientHeight / 2 + 40, behavior: reduced ? 'auto' : 'smooth' }); if (flash) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); } };
  const mark = (r, kind) => r.ptx.find(l => l[2] === kind) || [null];
  const frame2 = r => {                                             // the write and the read in view together, when they fit
    if (!lineEl(mark(r, 'w')[0]) || !lineEl(mark(r, 'r')[0])) return;
    const a = lineEl(mark(r, 'w')[0]).offsetTop, b = lineEl(mark(r, 'r')[0]).offsetTop, top = Math.min(a, b), span = Math.abs(a - b) + 20;
    ptx.scrollTo({ top: span < ptx.clientHeight - 24 ? top + span / 2 - ptx.clientHeight / 2 : top - 40, behavior: reduced ? 'auto' : 'smooth' });
  };
  const drawArc = r => {
    const a = lineEl(mark(r, 'w')[0]), b = lineEl(mark(r, 'r')[0]), ok = mark(r, 'ok')[0] && mark(r, 'ok'); if (!a || !b) return;
    const ya = a.offsetTop + 10, yb = b.offsetTop + 10, x = 56, raced = !GOOD.has(r.result), [y0, y1] = ya < yb ? [ya, yb] : [yb, ya];
    arc.setAttribute('height', ptx.scrollHeight);
    arc.innerHTML = `<path d="M${x},${y0} C${x - 14},${y0} ${x - 14},${y1} ${x},${y1}" fill="none" stroke="var(--${raced ? 'bad' : 'hb'})" stroke-width="2"${raced ? ' stroke-dasharray="4 4"' : ''}/>`
      + `<circle cx="${x}" cy="${ya}" r="3" fill="var(--bad)"/><circle cx="${x}" cy="${yb}" r="3" fill="var(--hb)"/>`
      + (ok ? `<circle cx="${x - 10.5}" cy="${lineEl(ok[0]).offsetTop + 10}" r="3.4" fill="var(--good)"/>` : '');
  };
  const idle = html => { ver.className = 'pg-verdict'; ver.innerHTML = `<p class="pg-idle">${html}</p>`; };
  const resetSteps = () => [...steps.children].forEach(li => { li.className = ''; li.querySelector('.d').textContent = ''; });
  const timing = r => `${r.seconds == null ? '' : `${r.seconds < 1 ? r.seconds.toFixed(2) : r.seconds.toFixed(1)} s`}${r.rssMiB ? ` · ${fmt(Math.round(r.rssMiB))} MiB peak` : ''}`;
  const setStatus = (left, right = '') => { status.innerHTML = `<span>${left}</span><span>${right}</span>`; };
  const unsupported = () => 'This browser cannot run the verifier: it needs WebAssembly with 64-bit memory and threads (a recent Chrome, Edge or Firefox). <code>pip install sentryward</code> runs the same check.';
  const refNote = () => `Equivalence to <code>reference.py</code> needs PyTorch, which a browser does not run: here SentryWard checks synchronization and memory; ${REFERENCE} checks the reference too.`;
  function select(id) {
    if (ctrl) ctrl.abort();
    cur = id; clearTimeout(timer); const r = runs[id], ui = uis[id];
    [...exBar.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    ptx.innerHTML = r.ptx.map(([n, s]) => `<span class="l"${n ? ` data-n="${n}"` : ''}><span class="n">${n ?? ''}</span>${hlPTX(s) || ' '}</span>`).join('');
    ptx.appendChild(arc); arc.innerHTML = '';
    inp.innerHTML = hlJSON(r.input); ref.innerHTML = ui.ref ? hlPy(ui.refText || FILES.reference) : '';
    inp.contentEditable = ui.editable ? 'plaintext-only' : 'false'; inp.spellcheck = false;
    ftabs.querySelector('[data-t="ref"]').hidden = !ui.ref; ftab('ptx');
    cmd.innerHTML = `<span class="p">$</span> sentryward ${esc(ui.own ? r.kernel : 'kernel.ptx')} --input input.json${ui.ref && !ui.editable ? ' --reference reference.py' : ''} &gt; output.json<span class="c"># ${esc(r.kernel)}</span>`;
    resetSteps();
    if (ui.editable) {
      const todo = ui.todo?.length ? `<br>Drafted <b>input.json</b> from the PTX (the input.json tab is editable). Fill in:</p><ul class="pg-todo">${ui.todo.map(t => `<li>${TODO(t)}</li>`).join('')}</ul><p class="pg-idle">` : '';
      idle(`Press Run: SentryWard checks your PTX here, in this browser. Nothing is uploaded.${todo}${ui.ref ? `<br>${refNote()}` : ''}`);
    } else idle(ui.live && MEM64 ? 'Press Run: SentryWard checks this kernel now, in your browser.' : 'Press Run to replay the recorded result.');
    json.textContent = ''; json.parentElement.hidden = true; run.disabled = false;
    if (ui.editable) setStatus('your PTX, checked in this browser: nothing is uploaded');
    else if (ui.own) setStatus('your run, read in this browser: nothing was uploaded', timing(r));
    else if (ui.live && MEM64) setStatus('press Run: it runs here, in your browser', `recorded run: ${timing(r)}`);
    else setStatus(`replays the team’s recorded run: examples/${r.kernel}/output.json`, `recorded run: ${timing(r)}`);
    requestAnimationFrame(() => { const w = lineEl(mark(r, 'w')[0]); ptx.scrollTop = w ? Math.max(0, w.offsetTop - 140) : 0; });
  }
  function finish(r, ui) {
    json.parentElement.hidden = false; json.innerHTML = hlJSON(r.output);
    ftab('ptx');
    r.ptx.filter(l => l[2]).forEach(([n, , kind]) => { const e = lineEl(n); e.classList.add(`m${kind}`); e.insertAdjacentHTML('beforeend', `<span class="tg ${kind}">${ui.tags[kind]}</span>`); });
    drawArc(r);
    if (GOOD.has(r.result)) {
      ver.className = 'pg-verdict good';
      ver.innerHTML = `<span class="verdict v-eq">${esc(r.result)}</span><p>${ui.note}</p>`;
      frame2(r);
      return;
    }
    if (!r.race) {                                                  // a finding without a race witness, or an analysis that stopped
      ver.className = 'pg-verdict bad';
      ver.innerHTML = `<span class="verdict v-bad">${esc(r.result)}</span><p>${ui.note}</p>`;
      return;
    }
    const x = r.race, side = (a, kind) => {
      const n = mark(r, kind)[0], loc = a.location || {}, alt = r.sites?.[kind] || [];
      const where = n ? `PTX line ${n}` : esc(`${String(loc.file || '').split('/').pop()}:${loc.line ?? '?'}`) + (alt.length ? ` · ${alt.length} PTX lines` : '');
      return `<button data-n="${n ?? alt.join(',')}"><b class="${kind}">${esc(a.mode)}</b> · thread ${esc(a.actor)} · ${where} · ${esc(a.bytes)} B · event ${esc(a.event)}</button>`;
    };
    const where = x.region.address_space === 'global' ? `global · ${esc(x.region.allocation)}` : 'shared memory';
    ver.className = 'pg-verdict bad';
    ver.innerHTML = `<span class="verdict v-bad">${esc(r.result)}</span><div class="wit"><div class="reg">${where} · bytes [${x.region.offset}, ${x.region.offset + x.region.bytes})</div>${side(x.first, 'w')}${side(x.second, 'r')}</div><p>${ui.note}</p>`;
    ver.querySelectorAll('button[data-n]').forEach(b => { let i = 0; const ns = b.dataset.n.split(',').filter(Boolean); b.addEventListener('click', () => ns.length && scrollTo(+ns[i++ % ns.length], true)); });
    frame2(r);
  }
  const settle = (r, ui) => { [...steps.children].forEach((li, k) => { li.className = stepClass(r, k); li.querySelector('.d').textContent = STEPS[k][1](r); }); finish(r, ui); };
  function replay(r, ui) {                                         // a recorded result, step by step
    const pace = reduced ? 0 : r.seconds > 5 ? 520 : 300;
    run.disabled = true; let k = 0;
    resetSteps(); idle('replaying…');
    const step = () => {
      const li = steps.children[k];
      li.className = stepClass(r, k);
      li.querySelector('.d').textContent = STEPS[k][1](r);
      if (++k < STEPS.length) { steps.children[k].className = 'on'; timer = setTimeout(step, pace); } else { finish(r, ui); run.disabled = false; }
    };
    steps.children[0].className = 'on'; timer = setTimeout(step, pace);
  }
  // a live run: sentryward-ptx in WebAssembly (js/sim), the steps following what it reports. The result, or null if stopped
  async function live(S, ptxText, inputText) {
    ctrl = new AbortController();
    run.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>Stop';
    resetSteps(); steps.children[0].className = 'on';
    idle('checking, in this browser…');
    const t0 = performance.now(); let what = '', at = 0;
    const tick = setInterval(() => setStatus('running in this browser: nothing is uploaded', `${what}${((performance.now() - t0) / 1000).toFixed(1)} s`), 100);
    const onStage = (s, d) => {
      if (s === 'engine.download') {
        const mb = v => (v / 1048576).toFixed(1);
        what = d.total && d.loaded < d.total ? `loading the verifier ${mb(d.loaded)} / ${mb(d.total)} MB, once · ` : '';
        return;
      }
      what = '';
      const k = STAGE_STEP[s]; if (k == null) return;
      if (s === 'frontend.cta_complete') steps.children[0].querySelector('.d').textContent = `CTA ${d.cta} done`;
      for (; at < k; at++) steps.children[at].className = 'pass';   // provisional: settle() sets every step from the result
      steps.children[k].className = 'on';
    };
    try { return await S.verify({ ptx: ptxText, input: inputText, onStage, signal: ctrl.signal }); }
    catch (e) { if (e?.name !== 'AbortError') throw e; resetSteps(); idle('Stopped.'); setStatus('stopped'); return null; }
    finally { clearInterval(tick); ctrl = null; run.innerHTML = runLabel; }
  }
  async function runLive(id) {
    const r = runs[id], ui = uis[id];
    let S;
    try { S = await engine(); } catch { S = null; }
    const can = S?.support();
    if (!can?.ok) {
      if (can?.memory64 && !can.threads) {                         // only isolation is missing: reload once under sw.js
        idle('Preparing the verifier: the page reloads once, then the run starts.');
        if (await isolate(ui.editable ? { id, ptx: r.ptxText, ptxName: r.kernel, inp: inp.textContent, ref: ui.refText } : { id })) return;
      }
      if (ui.editable) idle(unsupported()); else { replay(r, ui); setStatus('this browser cannot run the verifier: the recorded run, replayed', `recorded run: ${timing(r)}`); }
      return;
    }
    let ptxText, inputText;
    if (ui.editable) {
      ptxText = r.ptxText; inputText = inp.textContent;
      let cfg;
      try { cfg = JSON.parse(inputText); } catch (e) { ftab('in'); idle(`input.json is not valid JSON: ${esc(e.message)}`); return; }
      const left = cfg && typeof cfg === 'object' ? S.nulls(cfg) : [];
      if (left.length) { ftab('in'); idle(`Fill in ${left.map(x => `<code>${esc(x)}</code>`).join(', ')} in input.json first: the input.json tab is editable.`); return; }
    } else {
      [ptxText, inputText] = await Promise.all(['ptx', 'input.json'].map(x => fetch(new URL(`./sim/examples/${ui.live}.${x}`, import.meta.url)).then(f => f.text())));
    }
    let res;
    try { res = await live(S, ptxText, inputText); }
    catch (e) { idle(`The verifier stopped with an error: ${esc(e?.message || e)}`); return; }
    if (!res) return;
    if (ui.editable) {
      adopt({ ptx: ptxText, ptxName: r.kernel, inp: inputText, ref: ui.refText, out: res, live: true, todo: ui.todo });
      settle(runs.yours, uis.yours);
      setStatus('your PTX, checked in this browser just now: nothing was uploaded', timing(runs.yours));
      return;
    }
    // an example: the recorded excerpt and its marks, the result computed now
    const now = { ...r, result: res.result, checks: res.checks, counts: res.counts || r.counts, seconds: res.elapsed_seconds, rssMiB: res.peak_rss_mib || res.browser?.memory_mib,
      raceCount: res.race_count ?? (res.races || []).length, race: (res.races || [])[0] || null, output: summary(res) };
    settle(now, res.result === r.result ? ui : { ...ui, note: ui.liveNote || ui.note });
    setStatus('computed just now, in this browser: nothing was uploaded', timing(now));
  }
  run.addEventListener('click', () => {
    if (ctrl) { ctrl.abort(); return; }
    const ui = uis[cur];
    if (ui.live && MEM64 || ui.editable) runLive(cur); else replay(runs[cur], ui);
  });
  const bind = () => exBar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => select(b.dataset.id)));
  bind(); select(cur);
  // your own files, read in the browser, never uploaded: a PTX (input.json and reference.py optional) is checked here;
  // an output.json that sentryward printed elsewhere is shown as is
  function adopt(got) {
    const o = got.out, race = (o.races || [])[0], lines = (got.ptx || '').split('\n'), W = race?.first, R = race?.second;
    // a witness location is a PTX line, or a source line that the PTX's .file/.loc line info maps to one or more PTX lines
    const srcFiles = {}, MEM = /^\s*(@!?%p\d+\s+)?(ld|st|cp|atom|red|tcgen05|wgmma|mma)\b/;
    lines.forEach(t => { const m = t.match(/^\s*\.file\s+(\d+)\s+"([^"]+)"/); if (m) srcFiles[m[1]] = m[2]; });
    const sites = a => {
      const loc = a?.location; if (!loc || !got.ptx) return [];
      if (/\.ptx$/i.test(loc.file || '')) return loc.line <= lines.length ? [loc.line] : [];
      const base = String(loc.file).split('/').pop(), fids = Object.keys(srcFiles).filter(k => srcFiles[k] === loc.file || srcFiles[k].split('/').pop() === base), out = [];
      lines.forEach((t, i) => {
        const m = t.match(/^\s*\.loc\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (!m || !fids.includes(m[1]) || +m[2] !== loc.line || (loc.column != null && +m[3] !== loc.column)) return;
        let j = i + 1; while (j < lines.length && j < i + 12 && !/^\s*\.loc\b/.test(lines[j]) && !MEM.test(lines[j])) j++;
        out.push(MEM.test(lines[j] || '') ? j + 1 : i + 1);       // the access the .loc introduces, else the .loc itself
      });
      return out;
    };
    const sw = sites(W), sr = sites(R), marks = {};
    if (sw.length === 1) marks[sw[0]] = 'w'; if (sr.length === 1) marks[sr[0]] = 'r';
    const tags = race ? { w: `${esc(W.mode)} · thread ${esc(W.actor)}`, r: `${esc(R.mode)} · thread ${esc(R.actor)}` } : {};
    const diag = (o.diagnostics || [])[0];
    const note = (GOOD.has(o.result) ? (o.result === 'verified' ? 'Synchronization, memory and equivalence to the reference all passed, for every schedule of this launch.' : 'Synchronization and memory checks passed for every schedule of this launch; no reference was given, so equivalence was not checked.')
      : diag ? esc(diag.message || diag.code) : 'See output.json for the details.')
      + (got.live && o.result === 'allocation_failed' ? ' A browser gives WebAssembly at most 16 GB, and this kernel needs more: <code>pip install sentryward</code> checks it natively.' : '')
      + (got.live && got.ref ? ` ${refNote()}` : '');
    runs.yours = { kernel: got.ptxName || 'kernel.ptx', ptxText: got.ptx, ptx: got.ptx ? lines.map((t, i) => (marks[i + 1] ? [i + 1, t, marks[i + 1]] : [i + 1, t])) : [[null, '(open kernel.ptx too, to see the lines)']],
      input: got.inp || '{ … }', output: summary(o),
      result: o.result, checks: o.checks || {}, counts: o.counts || {}, seconds: got.live ? o.elapsed_seconds : o.pipeline_elapsed_seconds, rssMiB: o.peak_rss_mib || o.browser?.memory_mib, raceCount: o.race_count || (o.races || []).length, race, sites: { w: sw, r: sr } };
    uis.yours = { tab: got.live ? esc(got.ptxName || 'kernel.ptx') : 'Your run', own: true, editable: !!got.live, ref: !!got.ref, refText: got.ref, todo: got.todo, tags, note };
    exBar.innerHTML = tabsHtml(); bind(); select('yours');
  }
  // your PTX, ready to run: its input.json as given, or drafted from the PTX (what is left to fill in: todo)
  async function yours(got) {
    let S = null;
    try { S = await engine(); } catch { /* shown below */ }
    let todo = got.todo || null;
    if (!got.inp && S) { const d = S.draftInput(got.ptx); got.inp = d.input; todo = d.todo; }
    runs.yours = { kernel: got.ptxName, ptxText: got.ptx, ptx: got.ptx.split('\n').map((t, i) => [i + 1, t]), input: got.inp || '{ … }', checks: {}, counts: {} };
    uis.yours = { tab: esc(got.ptxName || 'kernel.ptx'), own: true, editable: true, ref: !!got.ref, refText: got.ref, todo, tags: {}, note: '' };
    exBar.innerHTML = tabsHtml(); bind(); select('yours');
    return S;
  }
  const open = async list => {
    const got = {};
    for (const f of list) {
      const text = await f.text();
      if (/\.ptx$/i.test(f.name) || /^\s*(\/\/|\.version)/m.test(text) && !/^\s*[{[]/.test(text)) { got.ptx = text; got.ptxName = f.name; continue; }
      if (/\.py$/i.test(f.name)) { got.ref = text; continue; }
      try { const j = JSON.parse(text); if (j.result && j.checks) got.out = j; else if (j.launch) got.inp = text; } catch { /* not JSON */ }
    }
    if (got.out) { adopt(got); run.click(); return; }             // a result printed elsewhere: replayed as is
    if (!got.ptx) { idle('Add a kernel.ptx, and its input.json if you have one.'); return; }
    const S = await yours(got);
    if (!S || !S.support().memory64) idle(unsupported());
    else if (uis.yours.todo?.length) ftab('in');
  };
  mine.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { open([...file.files]); file.value = ''; });
  host.addEventListener('dragover', e => { e.preventDefault(); host.classList.add('drop'); });
  host.addEventListener('dragleave', () => host.classList.remove('drop'));
  host.addEventListener('drop', e => { e.preventDefault(); host.classList.remove('drop'); open([...e.dataTransfer.files]); });
  // back from the reload that isolated the page: the run that asked for it
  let pending = null;
  try { pending = JSON.parse(session.get(AFTER) || 'null'); } catch { /* ignore */ }
  session.drop(AFTER);
  if (pending && self.crossOriginIsolated) {
    const ready = pending.ptx ? yours(pending).then(() => true) : Promise.resolve(!!uis[pending.id] && (select(pending.id), true));
    ready.then(ok => (ok ? run.click() : idle('Add your files again: they were too large to keep across the reload.')));
  }
}

film(); files(); playground();
// a link to a section (#playground): the browser scrolls before the code panes above it are filled in, which then
// pushes the section down. For the first seconds, follow it whenever the page's height changes, until the reader scrolls
const target = location.hash && document.getElementById(location.hash.slice(1));
if (target) {
  let reader = false;
  for (const e of ['wheel', 'touchstart', 'keydown', 'mousedown']) addEventListener(e, () => { reader = true; }, { once: true, passive: true });
  const follow = new ResizeObserver(() => { if (!reader) target.scrollIntoView(); });
  follow.observe(document.body);
  setTimeout(() => follow.disconnect(), 5000);
}
