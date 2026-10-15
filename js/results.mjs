import { VERDICTS, libraryOf, displayName, validateSnapshot, summarize, filterRows, resultLabel, formatSeconds, formatMemory } from './results-model.mjs';

import { SCENARIOS, validateStudy, removalLabel, performanceLabel, runtimeReduction, summarizeStudy } from './sync-removal.mjs';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 200;
const repository = 'https://github.com/wmdi/wasp_verification';
let snapshot, source, stats, rows, study, studyAvailable = false, state, openedKernel = null;
const number = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'Not recorded';
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
};
const link = (text, href, className = '') => {
  const a = el('a', className, text);
  a.href = href;
  return a;
};
const appendText = (parent, text, className = '') => parent.append(el('p', className, text));
const dateLabel = value => new Date(value + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const tone = verdict => Object.hasOwn(VERDICTS, verdict) ? `tone-${verdict}` : '';
function badge(verdict) {
  const node = el('span', `verdict-badge ${tone(verdict)}`);
  node.title = verdict;
  node.textContent = resultLabel(verdict);
  return node;
}
function check(status) {
  const symbols = { passed: '✓', failed: '!', incomplete: '◐', not_run: '—', not_requested: '—' };
  const node = el('span', `check check-${Object.hasOwn(symbols, status) ? status : 'unknown'}`);
  const symbol = el('span', '', symbols[status] || '—');
  symbol.setAttribute('aria-hidden', 'true');
  const label = status ? status.replace(/_/g, ' ') : 'not recorded';
  node.append(symbol, document.createTextNode(` ${label.charAt(0).toUpperCase() + label.slice(1)}`));
  return node;
}
function readState() {
  const params = new URLSearchParams(location.search);
  const libraries = new Set(rows.map(row => libraryOf(row.name)));
  const group = params.get('group') || '';
  return {
    search: params.get('q') || '',
    library: libraries.has(params.get('library')) ? params.get('library') : '',
    verdict: stats.counts[params.get('result')] ? params.get('result') : '',
    group: ['verified', 'findings', 'inconclusive', 'other'].includes(group) ? group : '',
    sort: ['name', 'time', 'memory', 'result', 'removable', 'improvement'].includes(params.get('sort')) ? params.get('sort') : 'name',
    scenario: params.get('input') === 'larger' ? 'larger' : 'recorded',
    withStudy: studyAvailable && params.get('study') === 'available',
    page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
  };
}
function pageURL(kernel = null) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  for (const [param, value] of Object.entries({ q: state.search, library: state.library, result: state.verdict, group: state.group, input: state.scenario === 'larger' ? 'larger' : '', study: state.withStudy ? 'available' : '', sort: state.sort !== 'name' ? state.sort : '', page: state.page > 1 ? state.page : '', kernel })) {
    if (value) url.searchParams.set(param, value);
  }
  return url;
}
function syncURL() { history.replaceState(null, '', pageURL(openedKernel)); }
function setFilter(changes) {
  Object.assign(state, changes, { page: 1 });
  render();
  syncURL();
}
function resetFilters() { setFilter({ search: '', library: '', verdict: '', group: '', sort: 'name', withStudy: false }); }

function renderOverview() {
  const groups = [
    ['', 'All', stats.total],
    ['verified', 'Verified', stats.verified],
    ['findings', 'Reported findings', stats.findings],
    ['inconclusive', 'Inconclusive', stats.inconclusive],
  ];
  if (stats.other) groups.push(['other', 'Other', stats.other]);
  for (const [group, title, count] of groups) {
    const button = el('button', 'result-group');
    button.type = 'button';
    button.dataset.group = group;
    button.append(document.createTextNode(title + ' '), el('span', 'group-count', number(count)));
    button.addEventListener('click', () => setFilter({ group, verdict: '' }));
    $('result-groups').append(button);
  }
  const keys = [...Object.keys(VERDICTS), ...Object.keys(stats.counts).filter(key => !Object.hasOwn(VERDICTS, key))];
  for (const verdict of keys) {
    const count = stats.counts[verdict];
    if (!count) continue;
    const option = el('option', '', `${resultLabel(verdict)} (${count})`);
    option.value = verdict;
    $('verdict').append(option);
  }
  for (const library of [...new Set(rows.map(row => libraryOf(row.name)))].sort()) {
    const option = el('option', '', library);
    option.value = library;
    $('library').append(option);
  }
}


function renderStudySummary(filtered) {
  $('with-study').checked = state.withStudy;
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario)));
  const summary = $('study-summary');
  summary.replaceChildren();
  if (!studyAvailable) {
    appendText(summary, 'Synchronization study unavailable. Reload to try again; verification results remain available.');
    return;
  }
  const totals = summarizeStudy(filtered, state.scenario);
  const counts = el('p');
  counts.append(el('strong', '', `${number(totals.removable)} of ${number(totals.candidates)}`), document.createTextNode(` candidate sites removable · ${totals.tested} ${totals.tested === 1 ? 'kernel' : 'kernels'} with counts`));
  const timing = el('p');
  timing.append(el('strong', '', `${totals.faster} lower · ${totals.slower} higher · ${totals.unchanged} unchanged`), document.createTextNode(` kernel runtimes · ${totals.timed} timed ${totals.timed === 1 ? 'kernel' : 'kernels'}`));
  summary.append(counts, timing);
  $('study-scope').textContent = state.scenario === 'larger'
    ? 'Historical study; includes original-shape rechecks. Counts and timings may cover different kernels. Removals apply only to the tested input.'
    : 'Historical study. Counts and timings may cover different kernels. Removals apply only to the tested input.';
}
function studyCells(row, tr) {
  const sample = row.syncStudy?.[state.scenario];
  const removalCell = el('td', 'study-cell');
  const perfCell = el('td', 'study-cell');
  if (!studyAvailable) {
    removalCell.append(el('span', 'metric-missing', 'Unavailable'));
    perfCell.append(el('span', 'metric-missing', 'Unavailable'));
  } else {
    removalCell.append(el('span', sample?.removal.status === 'measured' ? 'removal-count' : 'metric-missing', removalLabel(sample?.removal)));
    if (sample?.removal.status === 'measured') removalCell.append(el('small', '', 'candidate sites'));
    const reduction = runtimeReduction(sample?.performance);
    perfCell.append(el('span', reduction === null ? 'metric-missing' : reduction > 0 ? 'perf-lower' : reduction < 0 ? 'perf-higher' : 'perf-unchanged', performanceLabel(sample?.performance)));
    if (reduction !== null) {
      const p = sample.performance;
      perfCell.append(el('small', '', `${p.original_us.toFixed(2)} → ${p.reduced_us.toFixed(2)} µs`));
    }
    if (sample?.rechecked_at_recorded_input) removalCell.append(el('small', 'scope-tag', 'Original-shape recheck'));
  }
  tr.append(removalCell, perfCell);
}

function render() {
  $('search').value = state.search;
  $('library').value = state.library;
  $('verdict').value = state.verdict;
  $('sort').value = state.sort;
  document.querySelectorAll('.result-group').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.group === state.group && !state.verdict));
  });
  const filtered = filterRows(rows, state);
  renderStudySummary(filtered);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const offset = (state.page - 1) * PAGE_SIZE;
  const fragment = document.createDocumentFragment();
  for (const row of filtered.slice(offset, offset + PAGE_SIZE)) {
    const tr = el('tr');
    const nameCell = el('td');
    const name = link(displayName(row.name), pageURL(row.name), 'kernel-name');
    name.title = row.name;
    name.setAttribute('aria-label', `${row.name}: open kernel details`);
    name.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', pageURL(row.name));
      showDetail(row);
    });
    const meta = el('div', 'kernel-meta');
    meta.append(el('span', 'library-tag', libraryOf(row.name)));
    const architecture = row.name.match(/(?:__sm_|\.compute_)(\d+[a-z]?)$/)?.[1];
    if (architecture) meta.append(el('span', '', `sm_${architecture}`));
    if (row.analysis_scope) meta.append(el('span', 'scope-tag', 'Conditional scope'));
    nameCell.append(name, meta);
    const resultCell = el('td');
    resultCell.append(badge(row.result));
    tr.append(nameCell, resultCell);
    studyCells(row, tr);
    tr.append(el('td', 'numeric', formatSeconds(row.elapsed_seconds)));
    fragment.append(tr);
  }
  $('kernel-rows').replaceChildren(fragment);
  const groupLabel = state.group ? ` · ${state.group === 'findings' ? 'reported findings' : state.group}` : '';
  $('result-count').textContent = `${number(filtered.length)} of ${number(rows.length)} configurations${groupLabel}`;
  $('page-info').textContent = filtered.length ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, filtered.length)} · Page ${state.page} of ${pages}` : '0 configurations';
  $('previous').disabled = state.page === 1;
  $('next').disabled = state.page >= pages;
  $('empty-state').hidden = filtered.length > 0;
  document.querySelector('.table-scroll').hidden = !filtered.length;
}

function rawSection(parent, title, object) {
  const details = el('details');
  const pre = el('pre', '', JSON.stringify(object, null, 2));
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', title);
  details.append(el('summary', '', title), pre);
  parent.append(details);
}
function fact(parent, title, value) {
  const item = el('div');
  item.append(el('dt', '', title), el('dd', '', value));
  parent.append(item);
}

function studyDetail(body, row) {
  body.append(el('h3', '', 'Synchronization removal & kernel performance'));
  if (!studyAvailable || !row.syncStudy) {
    appendText(body, studyAvailable ? 'No synchronization-removal experiment is recorded for this kernel. This does not mean that zero sites are removable.' : 'The synchronization study could not be loaded.', 'detail-note');
    return;
  }
  appendText(body, 'Historical, input-specific experiments. These counts and B200 timings are separate from the verification run above; changing the input shape can invalidate a removal.', 'detail-note');
  appendText(body, `Static synchronization statements in the analyzed entry: ${row.syncStudy.static_sync_instructions}.`);
  for (const [key, title] of Object.entries(SCENARIOS)) {
    const sample = row.syncStudy[key];
    const section = el('section', 'study-detail-scenario');
    section.append(el('h4', '', title + (sample.rechecked_at_recorded_input ? ' · original-shape recheck' : '')));
    const facts = el('dl', 'record-facts');
    fact(facts, 'Removable / executed candidate sites', removalLabel(sample.removal));
    fact(facts, 'B200 kernel runtime', performanceLabel(sample.performance));
    if (runtimeReduction(sample.performance) !== null) {
      fact(facts, 'Original kernel', `${sample.performance.original_us.toFixed(2)} µs`);
      fact(facts, 'Reduced kernel', `${sample.performance.reduced_us.toFixed(2)} µs`);
    }
    section.append(facts);
    if (sample.removal.note) appendText(section, sample.removal.note.replace(/\[#\d+\]\(https:\/\/github\.com\/wmdi\/wasp_verification\/issues\/\d+\)/g, '').replace(/\(\s*,?\s*\)/g, '').trim(), 'study-source-note');
    if (sample.performance.note) appendText(section, `Reported timing: ${sample.performance.note}`, 'study-source-note');
    body.append(section);
  }
  const references = el('p', 'study-references');
  for (const reference of row.syncStudy.references) {
    if (/^https:\/\/github\.com\/wmdi\/wasp_verification\/issues\/\d+$/.test(reference)) references.append(link(`Experiment #${reference.split('/').pop()} ↗`, reference));
  }
  body.append(references);
  rawSection(body, 'Complete synchronization study record', row.syncStudy);
}

function showDetail(row) {
  openedKernel = row.name;
  const body = $('detail-body');
  body.replaceChildren();
  const heading = el('h2', '', displayName(row.name));
  heading.id = 'detail-title';
  body.append(el('span', 'library-tag', libraryOf(row.name)), heading, el('p', 'detail-identifier', row.name));
  const actions = el('div', 'detail-actions');
  actions.append(badge(row.result), link('Permalink ↗', pageURL(row.name)));
  body.append(actions);
  if (row.analysis_scope) appendText(body, 'Conditional analysis: this result applies only to the configured branch decisions below.', 'data-notice');
  const grid = el('div', 'check-grid');
  for (const [key, label] of [['synchronization', 'Synchronization'], ['memory', 'Memory'], ['equivalence', 'Equivalence']]) {
    const card = el('div', 'check-card');
    card.append(el('strong', '', label), check(row.checks[key]));
    grid.append(card);
  }
  body.append(grid);
  const facts = el('dl', 'record-facts');
  fact(facts, 'Elapsed time', formatSeconds(row.elapsed_seconds));
  fact(facts, 'Native peak memory (RSS)', formatMemory(row.native_peak_rss_mib));
  fact(facts, 'Recorded warnings', `${number(row.warning_count)} · ${row.warnings_complete === true ? 'collection complete' : row.warnings_complete === false ? 'collection incomplete' : 'completion not recorded'}`);
  fact(facts, 'Memory analysis', row.memory_analysis_complete === true ? 'Complete' : row.memory_analysis_complete === false ? 'Incomplete' : 'Not recorded');
  fact(facts, 'Run identifier (UTC)', row.run || 'Not recorded');
  fact(facts, 'Snapshot', dateLabel(snapshot.snapshot_date));
  body.append(facts);
  studyDetail(body, row);
  if (row.recorded_followup?.analysis || row.recorded_followup?.upstream_references) {
    body.append(el('h3', '', 'Recorded follow-up'));
    if (row.recorded_followup.analysis) appendText(body, row.recorded_followup.analysis.replace(/<br\s*\/?\s*>/gi, '\n\n'), 'followup');
    for (const reference of (row.recorded_followup.upstream_references || '').split(';').map(s => s.trim()).filter(Boolean)) {
      try {
        const url = new URL(reference);
        if (url.protocol === 'https:') {
          const p = el('p');
          p.append(link(reference, url.href));
          p.style.overflowWrap = 'anywhere';
          body.append(p);
        }
      } catch { /* Retain non-URL reference text in the complete record. */ }
    }
  }
  if (row.diagnostics?.length) {
    body.append(el('h3', '', 'Diagnostics'));
    const list = el('ul', 'diagnostic-list');
    for (const item of row.diagnostics) {
      const li = el('li');
      li.append(el('code', '', item.code), el('span', '', `${item.stage} · ${number(item.count)} recorded`));
      list.append(li);
    }
    body.append(list);
  } else appendText(body, 'No diagnostics are listed in this record. Check the completion status before interpreting their absence.', 'detail-note');
  if (row.analysis_scope) rawSection(body, 'Configured analysis scope', row.analysis_scope);
  if (row.equivalence) {
    body.append(el('h3', '', 'Reference equivalence'));
    appendText(body, `Recorded equivalence outcome: ${resultLabel(row.equivalence.result)}. The overall stage outcomes above are reported separately.`);
    if (row.equivalence.equivalence_contract) appendText(body, `Contract: ${row.equivalence.equivalence_contract}`);
    if (row.equivalence.definedness) {
      const definition = row.equivalence.definedness;
      appendText(body, `Definedness: ${definition.status}. Proved families: ${number(definition.proved_families)}; partial-equivalence families: ${number(definition.partial_equivalence_families)}.`);
    }
    rawSection(body, 'Full equivalence record', row.equivalence);
  }
  if (row.budgets) rawSection(body, 'Configured resource budgets', row.budgets);
  if (row.additional_completed_run) rawSection(body, 'Additional completed run', row.additional_completed_run);
  body.append(el('h3', '', 'Source files & recorded hashes'));
  appendText(body, `Repository access is required. Links use the snapshot publishing revision. ${snapshot.uncommitted_changes ? 'The analyzed workspace had local changes, so linked files may differ from the recorded hashes.' : 'Compare the recorded hashes when reproducing a result.'}`, 'detail-note');
  const files = el('ul', 'evidence-list');
  for (const [kind, file] of Object.entries(row.files || {})) {
    const item = el('li');
    if (typeof file.path !== 'string') continue;
    const path = file.path.split('/').map(encodeURIComponent).join('/');
    item.append(link(`${kind.replace(/_/g, ' ')} ↗`, `${repository}/blob/${source.revision}/${path}`), el('small', '', file.path), el('small', '', `SHA-256: ${file.sha256 || 'not recorded'}`));
    files.append(item);
  }
  body.append(files);
  const { syncStudy, ...verificationRecord } = row;
  rawSection(body, 'Complete JSON record', verificationRecord);
  const dialog = $('kernel-detail');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  $('close-detail').focus();
}

function updateProvenance() {
  $('snapshot-date').textContent = `Snapshot · ${dateLabel(snapshot.snapshot_date)}`;
  $('corpus-meta').textContent = `${number(rows.length)} configurations · ${new Set(rows.map(r => libraryOf(r.name))).size} libraries · ${stats.conditional} conditional analyses`;
  $('conditional-note').textContent = `${stats.conditional} records specify configured branch scenarios. Their verdicts apply only to those scenarios. Records are marked “Conditional scope”; open one to inspect every recorded decision.`;
  const provenance = $('provenance');
  const p = el('p');
  p.append(document.createTextNode('Source snapshot: '), link(`${source.repository} @ ${source.revision.slice(0, 7)}`, `${repository}/blob/${source.revision}/docs/kernel-verification-results.json`));
  provenance.append(p);
  appendText(provenance, `Verifier workspace base: ${snapshot.worktree_base}. ${snapshot.uncommitted_changes ? 'The snapshot records uncommitted changes; the base commit alone does not reproduce the analyzed workspace.' : 'The snapshot reports no uncommitted changes.'}`);
  appendText(provenance, `Snapshot SHA-256: ${source.sha256}`);
  provenance.lastChild.style.overflowWrap = 'anywhere';
}

async function init() {
  try {
    const responses = await Promise.all(['../data/kernel-verification-results.json', '../data/verification-source.json'].map(path => fetch(path)));
    if (responses.some(response => !response.ok)) throw new Error('Snapshot unavailable.');
    const [data, provenance] = await Promise.all(responses.map(response => response.json()));
    snapshot = validateSnapshot(data);
    source = provenance;
    if (!/^[0-9a-f]{40}$/.test(source.revision) || !/^[0-9a-f]{64}$/.test(source.sha256)) throw new Error('Invalid source provenance.');

    rows = snapshot.results;
    try {
      const response = await fetch('../data/sync-removal-results.json');
      if (!response.ok) throw new Error('Synchronization study unavailable.');
      study = validateStudy(await response.json(), new Set(rows.map(row => row.name)));
      const studies = new Map(study.results.map(row => [row.name, row]));
      rows = rows.map(row => ({ ...row, syncStudy: studies.get(row.name) }));
      studyAvailable = true;
      $('study-provenance').append(document.createTextNode('Experiment index: '), link(`${study.source.repository} @ ${study.source.revision.slice(0, 7)}`, `${repository}/blob/${study.source.revision}/examples/index.md`), document.createTextNode(`. Published ${study.source.published_at.slice(0, 10)}. Source repository access is required.`));
    } catch (error) {
      $('with-study').disabled = true;
      console.warn('Synchronization study:', error);
    }
    stats = summarize(rows);
    state = readState();
    renderOverview();
    updateProvenance();
    render();
    $('load-state').hidden = true;
    $('overview').hidden = false;
    $('explorer').hidden = false;
    const selected = rows.find(row => row.name === new URLSearchParams(location.search).get('kernel'));
    if (selected) showDetail(selected);
    document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => setFilter({ scenario: button.dataset.scenario })));
    $('with-study').addEventListener('change', () => setFilter({ withStudy: $('with-study').checked }));
    $('filters').addEventListener('submit', event => event.preventDefault());
    $('search').addEventListener('input', () => setFilter({ search: $('search').value }));
    $('library').addEventListener('change', () => setFilter({ library: $('library').value }));
    $('verdict').addEventListener('change', () => setFilter({ verdict: $('verdict').value, group: '' }));
    $('sort').addEventListener('change', () => setFilter({ sort: $('sort').value }));
    $('clear-filters').addEventListener('click', resetFilters);
    $('empty-reset').addEventListener('click', resetFilters);
    for (const [id, offset] of [['previous', -1], ['next', 1]]) {
      $(id).addEventListener('click', () => { state.page += offset; render(); syncURL(); $('explorer').scrollIntoView({ block: 'start' }); });
    }
    $('close-detail').addEventListener('click', () => $('kernel-detail').close());
    $('kernel-detail').addEventListener('close', () => { openedKernel = null; syncURL(); });
    window.addEventListener('popstate', () => {
      state = readState();
      render();
      const selected = rows.find(row => row.name === new URLSearchParams(location.search).get('kernel'));
      if (selected) showDetail(selected);
      else if ($('kernel-detail').open) $('kernel-detail').close();
    });
  } catch (error) {
    $('snapshot-date').textContent = 'Snapshot unavailable';
    $('load-state').textContent = 'The database could not be loaded. Reload this page to try again, or download the JSON snapshot above.';
    $('load-state').className = 'data-notice';
    $('load-state').setAttribute('role', 'alert');
    console.error('Verification database:', error);
  }
}
init();
