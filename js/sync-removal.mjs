export const SCENARIOS = { recorded: 'Recorded inputs', larger: 'Larger-input study' };
export const STATUS_LABELS = { not_reported: 'Not reported', not_run: 'Not run', not_applicable: 'Not applicable' };

export function validateStudy(study, names) {
  if (study?.schema !== 'sentryward.sync-removal-study.v1' || !Array.isArray(study.results) ||
      !/^[0-9a-f]{40}$/.test(study.source?.revision)) throw new Error('Invalid synchronization study.');
  const seen = new Set();
  for (const row of study.results) {
    if (!names.has(row.name) || seen.has(row.name)) throw new Error('Unmatched or duplicate study record.');
    seen.add(row.name);
    for (const scenario of Object.keys(SCENARIOS)) {
      const { removal, performance } = row[scenario] || {};
      if (!removal || !performance) throw new Error('Missing study scenario.');
      if (removal.status === 'measured') {
        if (!Number.isInteger(removal.removable) || !Number.isInteger(removal.candidates) ||
            removal.removable < 0 || removal.candidates < removal.removable) throw new Error('Invalid removal counts.');
      } else if (!Object.hasOwn(STATUS_LABELS, removal.status)) throw new Error('Unknown removal status.');
      if (['measured', 'no_measurable_change'].includes(performance.status)) {
        if (removal.status !== 'measured' || !Number.isFinite(performance.runtime_change_percent) ||
            !(performance.original_us > 0) || !(performance.reduced_us > 0) ||
            (performance.status === 'no_measurable_change' && performance.runtime_change_percent !== 0)) throw new Error('Invalid performance measurement.');
      } else if (!Object.hasOwn(STATUS_LABELS, performance.status)) throw new Error('Unknown performance status.');
    }
  }
  return study;
}

export function removalLabel(removal) {
  return removal?.status === 'measured' ? `${removal.removable} of ${removal.candidates}` : STATUS_LABELS[removal?.status] || 'Not reported';
}
export function runtimeReduction(performance) {
  return ['measured', 'no_measurable_change'].includes(performance?.status) ? (-performance.runtime_change_percent || 0) : null;
}
export function performanceLabel(performance) {
  if (performance?.status === 'no_measurable_change') return 'No measurable change';
  const reduction = runtimeReduction(performance);
  if (reduction === null) return STATUS_LABELS[performance?.status] || 'Not reported';
  if (reduction === 0) return '0.0% change';
  return `${Math.abs(reduction).toFixed(1)}% ${reduction > 0 ? 'lower' : 'higher'}`;
}
export function summarizeStudy(rows, scenario) {
  const results = rows.map(row => row.syncStudy?.[scenario]);
  const removals = results.filter(row => row?.removal.status === 'measured');
  const timings = results.map(row => runtimeReduction(row?.performance)).filter(value => value !== null);
  return {
    tested: removals.length,
    removable: removals.reduce((sum, row) => sum + row.removal.removable, 0),
    candidates: removals.reduce((sum, row) => sum + row.removal.candidates, 0),
    timed: timings.length,
    faster: timings.filter(value => value > 0).length,
    slower: timings.filter(value => value < 0).length,
    unchanged: timings.filter(value => value === 0).length,
  };
}
