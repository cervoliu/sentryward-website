// Annotated input and output files for the homepage’s “How SentryWard works” section.
import { FILES } from './examples.mjs?v=20261016-cutlass';

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
    [[59], '<b>The compiler’s output, unchanged.</b> SentryWard reads the PTX directly, with nothing to write or annotate. Only the beginning and end of the file appear here; the <a href="https://github.com/gpu-verifier/sentryward/blob/main/corpus/cutlass__dense-gemm-f16-tma-1sm__sm_100a.ptx">full file</a> has 4,035 lines.'],
  ],
  input: [
    ['"entry"', '<b>Kernel entry:</b> the kernel to verify in the PTX file.'],
    ['"launch"', '<b>Launch configuration:</b> one block of 256 threads (eight warps), no cluster, and 227 KB of dynamic shared memory. A result covers every schedule of this launch.'],
    ['"arguments"', '<b>Input parameter specification:</b> M = 64, N = 128 and K = 128, a single output tile; alpha = 1 and beta = 0, so D is the plain product. Most of the omitted fields belong to the tile scheduler.'],
    ['"assumptions"', '<b>Model assumptions:</b> each documented in ASSUMPTIONS.md. The result lists every one, whether it was enabled and whether it was triggered.'],
  ],
  reference: [
    ['def reference', '<b>Reference function:</b> a plain Python function named reference, written with PyTorch. It runs as ordinary Python; SentryWard captures what it computes.'],
    ['return', '<b>Arguments:</b> derived from input.json through the binding; there is no separate input file.'],
  ],
  binding: [
    ['"left_inputs"', '<b>Input layouts:</b> every buffer the comparison reads, as laid out for the reference (left) and for the kernel (right); folded here.'],
    ['"outputs"', '<b>Output to compare:</b> D, a 64 × 128 tensor of 2-byte values. The kernel stores it column by column (right strides), PyTorch row by row (left strides).'],
    ['"output_value_semantics"', '<b>Value semantics:</b> values are compared as real numbers, not as floating point.'],
    ['"reference"', '<b>Reference arguments:</b> A and B, in order, two FP16 tensors read from the kernel’s input buffers.'],
  ],
  output: [
    ['"result"', '<b>Result:</b> one of 14 categories. verified means synchronization, memory and equivalence all passed; without a reference, a pass is race_free.'],
    ['"checks"', '<b>Per-check status:</b> passed, failed, incomplete, not_run or not_requested.'],
    ['"diagnostics"', '<b>Diagnostics:</b> the details of a failure, with its witness. This kernel has none.'],
    ['"warnings"', '<b>Warnings:</b> issues that do not fail a check. This run has 341,248, all duplicate TMA stores.'],
    ['"counts"', '<b>Analysis statistics:</b> 256 threads, 34,414 instructions, 234,124 events.'],
    ['"assumptions"', '<b>Assumptions:</b> each one, with whether it was enabled and triggered.'],
    ['"pipeline_elapsed_seconds"', '<b>Time and memory:</b> 7.9 seconds and 868 MiB at peak.'],
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
