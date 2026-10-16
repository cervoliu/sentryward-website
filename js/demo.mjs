// The demo page: SentryWard checks a kernel in the browser (js/sim: sentryward-ptx compiled to WebAssembly); nothing
// is uploaded. Both examples run live; the CUTLASS one shows the homepage's files (FILES). A browser that cannot run
// the verifier replays the team's recorded runs.
import { FILES, RUNS } from './examples.mjs?v=20261016-problems';

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

// ------------------------------------------------------------------------------------------- the demo
const REFERENCE = '<code>pip install "sentryward[reference]"</code>';
const EXAMPLE = kernel => `https://github.com/gpu-verifier/sentryward/tree/main/examples/${encodeURIComponent(kernel)}`;   // the example in SentryWard's repository
const RUN_UI = {
  'cutlass': {
    tab: 'GEMM (CUTLASS)', ref: true, live: 'cutlass',
    tags: {},
    liveNote: `Synchronization and memory checks pass in every schedule of this launch. With its PyTorch reference, which needs ${REFERENCE}, the recorded run is <b>verified</b>.`,
    note: 'Synchronization, memory and equivalence to the PyTorch reference pass in every schedule of this launch.',
  },
  'tilelang': {
    tab: 'GEMM (TileLang)', ref: false, live: 'tilelang',
    tags: { w: 'cp.async · write · 16 B · tile k + 2', r: 'tcgen05.mma · read · 32 B' },
    note: 'The copy at line 882 may overwrite a shared-memory buffer that the tensor core is still reading at line 541. Reported to TileLang (tile-ai/tilelang#3424); not reproduced on a B200.',
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
// 64-bit WebAssembly memory, which the engine needs: without it (Safari), the examples replay their recorded runs
const MEM64 = (() => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1])); } catch { return false; } })();
const summary = o => JSON.stringify({ result: o.result, checks: o.checks, diagnostics: o.diagnostics, races: o.races, counts: o.counts }, null, 2);
// an example's source paths from the build machine, shortened as in the recorded runs: …/tl_templates/cuda/copy.h
const shortPaths = o => JSON.parse(JSON.stringify(o), (k, v) => (k === 'file' && typeof v === 'string' && v.startsWith('/') ? `…/${v.split('/').slice(-3).join('/')}` : v));

// Threads need a cross-origin-isolated page. GitHub Pages cannot send the headers that make one, so sw.js adds them;
// it is registered the first time Run needs it, and the page reloads once under it, back at the demo, where the
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
  location.hash = 'interactive-demo';
  location.reload();
  return true;
}

function demo() {
  const host = $('pg'); if (!host) return;
  const exBar = $('pg-ex'), ptx = $('pg-ptx'), inp = $('pg-in'), ref = $('pg-ref'), ftabs = $('pg-tabs'), steps = $('pg-steps'), run = $('pg-run'), ver = $('pg-verdict'), json = $('pg-json'), status = $('pg-status'), cmd = $('pg-cmd'), arc = $('pg-arc');
  const file = $('pg-file'), mine = $('pg-mine'), more = $('pg-more'), menu = $('pg-menu'), replayItem = $('pg-replay');
  const runs = { ...RUNS, cutlass: { ...RUNS.cutlass, ptx: FILES.ptx, input: FILES.input, reference: FILES.reference } };
  const uis = { ...RUN_UI }, ids = Object.keys(uis);
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
  const problem = html => { ver.className = 'pg-verdict problem'; ver.innerHTML = `<p>${html}</p>`; };   // what stops a run
  const resetSteps = () => [...steps.children].forEach(li => { li.className = ''; li.querySelector('.d').textContent = ''; });
  const timing = r => `${r.seconds == null ? '' : `${r.seconds < 1 ? r.seconds.toFixed(2) : r.seconds.toFixed(1)} s`}${r.rssMiB ? ` · ${fmt(Math.round(r.rssMiB))} MiB peak` : ''}`;
  const setStatus = (left, right = '') => { status.innerHTML = `<span>${left}</span><span>${right}</span>`; };
  const unsupported = () => 'This browser cannot run the verifier, which needs a recent Chrome, Edge or Firefox. <code>pip install sentryward</code> runs the same check.';
  const refNote = () => `The browser checks synchronization and memory only; ${REFERENCE} also checks <code>reference.py</code>.`;
  function select(id) {
    if (ctrl) ctrl.abort();
    cur = id; clearTimeout(timer); const r = runs[id], ui = uis[id];
    [...exBar.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    ptx.innerHTML = r.ptx.map(([n, s]) => `<span class="l"${n ? ` data-n="${n}"` : ''}><span class="n">${n ?? ''}</span>${hlPTX(s) || ' '}</span>`).join('');
    ptx.appendChild(arc); arc.innerHTML = '';
    inp.innerHTML = hlJSON(r.input); ref.innerHTML = ui.ref ? hlPy(ui.refText || r.reference) : '';
    inp.contentEditable = ui.editable ? 'plaintext-only' : 'false'; inp.spellcheck = false;
    ftabs.querySelector('[data-t="ref"]').hidden = !ui.ref; ftab('ptx');
    cmd.innerHTML = `<span class="p">$</span> sentryward ${esc(ui.own ? r.kernel : 'kernel.ptx')} --input input.json${ui.ref && !ui.editable ? ' --reference reference.py' : ''} &gt; output.json<span class="c"># ${ui.own ? esc(r.kernel) : `<a href="${EXAMPLE(r.kernel)}">${esc(r.kernel)}</a>`}</span>`;
    resetSteps();
    if (ui.editable) {
      idle(`Press Run to check your PTX.${ui.ref ? `<br>${refNote()}` : ''}`);
    } else idle(ui.live && MEM64 ? 'Press Run to check this kernel.' : 'Press Run to replay the recorded result.');
    json.textContent = ''; json.parentElement.hidden = true; run.disabled = false; more.disabled = false; more.hidden = !!ui.own; closeMenu();
    if (ui.editable) setStatus('your PTX');
    else if (ui.own) setStatus('your run', timing(r));
    else if (ui.live && MEM64) setStatus('runs in this browser', `recorded run: ${timing(r)}`);
    else setStatus('replays the recorded run', `recorded run: ${timing(r)}`);
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
    run.disabled = true; more.disabled = true; let k = 0;
    resetSteps(); idle('replaying…');
    const step = () => {
      const li = steps.children[k];
      li.className = stepClass(r, k);
      li.querySelector('.d').textContent = STEPS[k][1](r);
      if (++k < STEPS.length) { steps.children[k].className = 'on'; timer = setTimeout(step, pace); } else { finish(r, ui); run.disabled = false; more.disabled = false; }
    };
    steps.children[0].className = 'on'; timer = setTimeout(step, pace);
  }
  // a live run: sentryward-ptx in WebAssembly (js/sim), the steps following what it reports. The result, or null if stopped
  async function live(S, ptxText, inputText) {
    ctrl = new AbortController(); more.disabled = true;
    run.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>Stop';
    resetSteps(); steps.children[0].className = 'on';
    idle('Checking…');
    const t0 = performance.now(); let what = '', at = 0;
    const tick = setInterval(() => setStatus('running in this browser', `${what}${((performance.now() - t0) / 1000).toFixed(1)} s`), 100);
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
    finally { clearInterval(tick); ctrl = null; run.innerHTML = runLabel; more.disabled = false; }
  }
  async function runLive(id) {
    const r = runs[id], ui = uis[id];
    let S;
    try { S = await engine(); } catch { S = null; }
    const can = S?.support();
    if (!can?.ok) {
      if (can?.memory64 && !can.threads) {                         // only isolation is missing: reload once under sw.js
        idle('The page reloads once to enable threads, then the run starts.');
        if (await isolate(ui.editable ? { id, ptx: r.ptxText, ptxName: r.kernel, inp: inp.textContent, ref: ui.refText } : { id })) return;
      }
      if (ui.editable) problem(unsupported()); else { replay(r, ui); setStatus('recorded run, replayed: this browser cannot run the verifier', `recorded run: ${timing(r)}`); }
      return;
    }
    let ptxText, inputText;
    if (ui.editable) {
      ptxText = r.ptxText; inputText = inp.textContent;
      let cfg;
      try { cfg = JSON.parse(inputText); } catch (e) { ftab('in'); problem(`input.json is not valid JSON: ${esc(e.message)}`); return; }
      const left = cfg && typeof cfg === 'object' ? S.nulls(cfg) : [];
      if (left.length) { ftab('in'); problem(`Fill in ${left.map(x => `<code>${esc(x)}</code>`).join(', ')} in input.json first.`); return; }
    } else {
      [ptxText, inputText] = await Promise.all(['ptx', 'input.json'].map(x => fetch(new URL(`./sim/examples/${ui.live}.${x}`, import.meta.url)).then(f => f.text())));
    }
    let res;
    try { res = await live(S, ptxText, inputText); }
    catch (e) { problem(`The verifier stopped with an error: ${esc(e?.message || e)}`); return; }
    if (!res) return;
    if (ui.editable) {
      adopt({ ptx: ptxText, ptxName: r.kernel, inp: inputText, ref: ui.refText, out: res, live: true });
      settle(runs.yours, uis.yours);
      setStatus('your PTX, checked in this browser', timing(runs.yours));
      return;
    }
    // an example: the recorded excerpt and its marks, the result computed now
    const now = { ...r, result: res.result, checks: res.checks, counts: res.counts || r.counts, seconds: res.elapsed_seconds, rssMiB: res.peak_rss_mib || res.browser?.memory_mib,
      raceCount: res.race_count ?? (res.races || []).length, race: shortPaths((res.races || [])[0] || null), output: summary(shortPaths(res)) };
    settle(now, res.result === r.result ? ui : { ...ui, note: ui.liveNote || ui.note });
    setStatus('checked in this browser', timing(now));
  }
  // Run's menu: replay the recorded run instead, where a live run needs more memory than the device has
  function closeMenu() { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  more.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) replayItem.focus(); });
  replayItem.addEventListener('click', () => { closeMenu(); more.focus(); const r = runs[cur]; replay(r, uis[cur]); setStatus('replays the recorded run', `recorded run: ${timing(r)}`); });
  addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); more.focus(); } });
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
    const note = (GOOD.has(o.result) ? (o.result === 'verified' ? 'Synchronization, memory and equivalence to the reference all passed, for every schedule of this launch.' : 'Synchronization and memory checks passed for every schedule of this launch.')
      : diag ? esc(diag.message || diag.code) : 'See output.json for the details.')
      + (got.live && o.result === 'allocation_failed' ? ' A browser gives WebAssembly at most 16 GB, and this kernel needs more: <code>pip install sentryward</code> checks it natively.' : '')
      + (got.live && got.ref ? ` ${refNote()}` : '');
    runs.yours = { kernel: got.ptxName || 'kernel.ptx', ptxText: got.ptx, ptx: got.ptx ? lines.map((t, i) => (marks[i + 1] ? [i + 1, t, marks[i + 1]] : [i + 1, t])) : [[null, '(open kernel.ptx too, to see the lines)']],
      input: got.inp || '{ … }', output: summary(o),
      result: o.result, checks: o.checks || {}, counts: o.counts || {}, seconds: got.live ? o.elapsed_seconds : o.pipeline_elapsed_seconds, rssMiB: o.peak_rss_mib || o.browser?.memory_mib, raceCount: o.race_count || (o.races || []).length, race, sites: { w: sw, r: sr } };
    uis.yours = { tab: got.live ? esc(got.ptxName || 'kernel.ptx') : 'Your run', own: true, editable: !!got.live, ref: !!got.ref, refText: got.ref, tags, note };
    exBar.innerHTML = tabsHtml(); bind(); select('yours');
  }
  // your PTX and its input.json, ready to run
  async function yours(got) {
    let S = null;
    try { S = await engine(); } catch { /* shown below */ }
    runs.yours = { kernel: got.ptxName, ptxText: got.ptx, ptx: got.ptx.split('\n').map((t, i) => [i + 1, t]), input: got.inp, checks: {}, counts: {} };
    uis.yours = { tab: esc(got.ptxName || 'kernel.ptx'), own: true, editable: true, ref: !!got.ref, refText: got.ref, tags: {}, note: '' };
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
    if (!got.ptx || !got.inp) { select(cur); problem('Add both files: the kernel’s PTX and its input.json.'); return; }   // the current tab, reset
    const S = await yours(got);
    if (!S || !S.support().memory64) problem(unsupported());
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
    ready.then(ok => (ok ? run.click() : problem('Add your files again: they were too large to keep across the reload.')));
  }
}

demo();
// a link to #interactive-demo, as after the reload that enables threads: its panes fill in after the browser has scrolled,
// which moves it. For the first seconds, follow it whenever the page's height changes, until the reader scrolls
const target = location.hash && document.getElementById(location.hash.slice(1));
if (target) {
  let reader = false;
  for (const e of ['wheel', 'touchstart', 'keydown', 'mousedown']) addEventListener(e, () => { reader = true; }, { once: true, passive: true });
  const follow = new ResizeObserver(() => { if (!reader) target.scrollIntoView(); });
  follow.observe(document.body);
  setTimeout(() => follow.disconnect(), 5000);
}
