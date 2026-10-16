// Annotated input and output files for the homepage’s “How SentryWard works” section.
import { FILES } from './examples.mjs';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// ------------------------------------------------------------------------------------------- the files
// Notes point at lines: PTX line numbers, or the first line containing a JSON key (with its whole block).
const NOTES = {
  ptx: [
    [[11], '<b>PTX for Blackwell, exactly as the compiler emitted it.</b> Kernels written in CUDA C++, CUTLASS, Triton or TileLang all reach this form; SentryWard reads these instructions directly, with no IR to write and nothing to annotate.'],
    [[13], '<b>The kernel to verify.</b> A PTX file can hold several entries; input.json names this one. (Its mangled name is shortened here.)'],
    [[14, 15, 16, 17, 18, 19, 20, 21, 22, 23], '<b>Ten parameters: five pointers and five scalars.</b> The PTX gives only their types; input.json says what each one is.'],
    [[473], '<b>The barrier PyTorch 2.9.0 added.</b> Without it, as in PyTorch 2.8.0, the read at line 498 may see the gradient before thread 0 has written it at line 470.'],
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
    ['"pipeline_elapsed_seconds"', '<b>0.04 seconds</b> and 118 MiB at peak, for this kernel.'],
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

files();
// Keep section links aligned while the annotated files fill in, until the reader scrolls.
const target = location.hash && document.getElementById(location.hash.slice(1));
if (target) {
  let reader = false;
  for (const e of ['wheel', 'touchstart', 'keydown', 'mousedown']) addEventListener(e, () => { reader = true; }, { once: true, passive: true });
  const follow = new ResizeObserver(() => { if (!reader) target.scrollIntoView(); });
  follow.observe(document.body);
  setTimeout(() => follow.disconnect(), 5000);
}
