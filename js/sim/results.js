// sentryward/results.py (0.1.0) in JavaScript: the public result contract applied to sentryward-ptx's JSON report,
// as sentryward.verify() applies it. A line-by-line port, checked against the Python on 20,004 generated reports.
// RULES is config/result-categories.json from the same sdist.

const REPORT_FIELDS = ['equivalence', 'value_analysis', 'scalar_fold', 'expression_export',
  'partial_report', 'native_result', 'partial_native_result', 'expression_diagnostic'];
const SUCCESS = new Set(['race_free', 'equivalent', 'verified', 'valid', 'extraction_complete',
  'semantic_complete', 'value_view_complete', 'expressions_ready',
  'reference_expressions_ready', 'ready', 'complete']);
const isDict = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const pop = (o, k, d) => { if (!has(o, k)) return d; const v = o[k]; delete o[k]; return v; };
const str = v => (typeof v === 'string' ? v : v === null || v === undefined ? 'None' : String(v));

export function makeContract(RULES) {
  const RESULTS = new Set(RULES.results), MAP = RULES.legacy;

  function category(status, reason = '', resource = null) {
    resource = resource || {};
    if (['time_budget', 'reference_capture_timeout'].includes(reason) || ['native_timeout', 'runner_timeout', 'wellsync_timeout'].includes(status)) return 'timeout';
    if (reason === 'rss_limit' || reason === 'native_pipeline_memory_limit_exceeded') return 'memory_budget_exceeded';
    if (status === 'representation_limit_exceeded' || reason === 'representation_limit_exceeded') return 'unsupported';
    if (reason === 'allocation_failed') return 'allocation_failed';
    if (['node_budget', 'iteration_budget', 'work_budget', 'alpha_normalization_context_budget',
      'alpha_normalization_node_budget', 'projection_memo_budget'].includes(reason) || reason.endsWith('_limit_exceeded')) return 'analysis_budget_exceeded';
    if (['inputs_changed_during_run', 'extraction_inputs_changed_during_run', 'unexpected_process_exit', 'invalid_native_result'].includes(reason) || reason.startsWith('process_error:')) return 'tool_failure';
    if (RESULTS.has(status)) return status;
    if (status === 'resource_limit') {
      return { configured_budget: 'memory_budget_exceeded', algorithm_budget: 'analysis_budget_exceeded',
        representation: 'unsupported', allocator: 'allocation_failed' }[resource.origin] || 'tool_failure';
    }
    return has(MAP, status) ? MAP[status] : 'tool_failure';
  }

  // Preserve every diagnostic and its evidence; never deduplicate by code.
  function diagnosticsOf(out, diagnostics, stage, result) {
    const converted = [];
    for (const original of diagnostics) {
      const d = { ...original };
      let code = str(has(d, 'code') ? d.code : 'diagnostic_code_missing');
      d.stage = d.stage || stage || 'pipeline';
      const evidence = has(d, 'details') ? d.details : {};
      const details = isDict(evidence) ? { ...evidence } : { evidence };
      for (const key of Object.keys(d)) if (!['code', 'stage', 'message', 'details'].includes(key)) details[key] = pop(d, key);
      code = has(RULES.diagnostic_codes, code) ? RULES.diagnostic_codes[code] : code;
      if (code === d.stage || ['memory_budget_exceeded', 'memory_limit_exceeded'].includes(code) || code.startsWith('semantic_ir.cta') || code.startsWith('source_ir.cta') || code.startsWith('value_ir.cta') || code === 'verification.memory') {
        if (result === 'memory_budget_exceeded') {
          if (['semantic_ir.cta', 'source_ir.cta', 'value_ir.cta'].some(p => code.startsWith(p)) || code === 'verification.memory') d.stage = code;
          code = 'process_memory_budget_exceeded';
        }
      }
      if (['rss_limit', 'native_pipeline_memory_limit_exceeded', 'memory_limit_exceeded'].includes(code)) code = 'process_memory_budget_exceeded';
      if (['semantic_ir.cta', 'source_ir.cta', 'value_ir.cta'].some(p => d.stage.startsWith(p))) {
        const i = d.stage.indexOf('.cta'), prefix = d.stage.slice(0, i), cta = d.stage.slice(i + 4);
        if (!has(details, 'cta_progress')) details.cta_progress = /^\d+$/.test(cta) ? parseInt(cta, 10) : cta;
        d.stage = { semantic_ir: 'value_view_construction', source_ir: 'event_view_construction', value_ir: 'value_view_construction' }[prefix];
      } else if (d.stage === 'verification.memory') d.stage = 'memory_check';
      if (code === 'process_memory_budget_exceeded') for (const key of ['resource', 'peak_rss_mib', 'rss_limit_mib', 'memory_limit_mib']) if (has(out, key) && !has(details, key)) details[key] = out[key];
      if (['total_definedness_not_proven', 'input_access_validity_not_proven'].includes(code)) for (const key of ['definedness', 'access_validity', 'equivalent_families']) if (has(out, key) && !has(details, key)) details[key] = out[key];
      if (code === 'prerequisite_check_not_passed') for (const key of ['prerequisite_status', 'prerequisite_result', 'prerequisite_diagnostics', 'blocked_stage']) if (has(out, key) && !has(details, key)) details[key] = out[key];
      d.code = code;
      if (Object.keys(details).length) d.details = details;
      converted.push(d);
    }
    for (const key of ['equivalence', 'value_analysis']) {
      const child = out[key];
      if (isDict(child)) for (const d of child.diagnostics || []) {
        if (d.code === 'prerequisite_check_not_passed') {
          d.details = d.details || {};
          Object.assign(d.details, { prerequisite_result: result, prerequisite_checks: out.checks || {}, prerequisite_diagnostics: converted });
        }
      }
    }
    return converted;
  }

  // Normalize only report metadata; do not traverse expression nodes or witnesses.
  function normalize(report, operation = null) {
    if (!isDict(report)) return failure('tool_failure', 'invalid_result_object', 'Expected a JSON object');
    const out = { ...report };
    if (has(out, 'result') && RESULTS.has(out.result) && !has(out, 'status') && has(out, 'diagnostics') && has(out, 'checks') && has(out, 'scope') && !has(out, 'reason') && !has(out, 'message')) {
      if (!RESULTS.has(out.result) || !Array.isArray(out.diagnostics)) return failure('tool_failure', 'invalid_result_contract', 'Unknown result or missing diagnostics');
      for (const key of REPORT_FIELDS) if (isDict(out[key]) && (has(out[key], 'status') || has(out[key], 'result'))) out[key] = normalize(out[key], key === 'equivalence' ? 'equivalence' : key);
      out.diagnostics = diagnosticsOf(out, out.diagnostics, has(out, 'stage') ? out.stage : 'pipeline', out.result);
      return out;
    }
    const status = str(pop(out, 'status', pop(out, 'result', 'internal_error')));
    let reason = str(pop(out, 'reason', '') || '');
    if (!reason) for (const key of ['rejection', 'error', 'diagnostic']) if (isDict(out[key]) && out[key].code) { reason = str(out[key].code); break; }
    const message = pop(out, 'message', null);
    if (has(out, 'numerical_status')) out.numerical_result = category(str(pop(out, 'numerical_status')));
    const stage = has(out, 'stage') ? out.stage : has(out, 'blocked_stage') ? out.blocked_stage : has(out, 'active_stage') ? out.active_stage : 'pipeline';
    let result = category(status, reason, out.resource);
    const raw = has(out, 'diagnostics') ? out.diagnostics : [];
    const diagnostics = Array.isArray(raw) ? raw.filter(isDict).map(d => ({ ...d })) : [];
    if (['invalid_source_ir', 'invalid_event_view', 'invalid_source'].includes(status) &&
        diagnostics.some(d => ['duplicate-barrier-initialization', 'barrier_initialized_multiple_times'].includes(d.code))) result = 'invalid_lifecycle';
    if (status === 'blocked' && reason === 'verification_prerequisite_not_satisfied') result = category(str(has(out, 'prerequisite_status') ? out.prerequisite_status : 'unsupported'));
    if (status === 'not_proven' && !reason) result = 'equivalence_not_proven';
    if (status === 'partial_scope_equivalent') { result = 'analysis_budget_exceeded'; reason = 'output_family_budget_exceeded'; }
    if (status === 'resource_limit' && result === 'tool_failure') reason = reason || 'unclassified_resource_limit';
    const checks = { ...(out.checks || {}) };
    const kernel = ['kernel_verification', 'verification'].includes(operation) || out.mode === 'verify';
    for (const key of ['synchronization', 'memory', 'equivalence']) if (!has(checks, key)) checks[key] = kernel && key !== 'equivalence' ? 'not_run' : 'not_requested';
    const verified = pop(out, 'verification_status', '');
    if (verified === 'race_free' || ['race_free', 'potential_race', 'memory_analysis_inconclusive'].includes(status)) {
      checks.synchronization = 'passed';
      checks.memory = status === 'potential_race' ? 'failed' : out.memory_analysis_complete ? 'passed' : 'incomplete';
    } else if (status === 'not_wellsynced') Object.assign(checks, { synchronization: 'failed', memory: 'not_run', equivalence: 'not_run' });
    else if (out.mode === 'verify' || has(out, 'verification_performed')) Object.assign(checks, { synchronization: 'incomplete', memory: 'not_run' });
    if (verified) out.verification_result = category(str(verified));
    for (const key of REPORT_FIELDS) if (isDict(out[key]) && (has(out[key], 'status') || has(out[key], 'result'))) out[key] = normalize(out[key], key === 'equivalence' ? 'equivalence' : key);
    if (operation === 'equivalence' || ['equivalent', 'not_proven', 'partial_scope_equivalent', 'translation_or_supported_fragment_blocked'].includes(status)) {
      checks.equivalence = result === 'verified' ? 'passed' : (['blocked', 'missing_reference', 'missing_input'].includes(status) || reason === 'verification_prerequisite_not_satisfied') ? 'not_run' : 'incomplete';
      // Equivalence requires equal domains and equal values on that domain;
      // total definedness is a separate property, not a success prerequisite.
      if (result === 'verified' && (out.definedness || {}).status === 'not_proven') diagnostics.push({ code: 'total_definedness_not_proven', stage: 'equivalence_check' });
      if (result === 'verified' && out.access_validity === 'not_proven') { result = 'equivalence_not_proven'; reason = 'input_access_validity_not_proven'; checks.equivalence = 'incomplete'; }
    }
    const eq = out.equivalence;
    if (isDict(eq) && has(eq, 'result')) {
      checks.equivalence = (eq.checks || {}).equivalence || 'not_run';
      if (checks.synchronization === 'passed' && checks.memory === 'passed' && ['race_free', 'verified'].includes(result)) {
        result = eq.result;
        diagnostics.push(...eq.diagnostics);
      }
    }
    if (reason || message || (!SUCCESS.has(status) && !diagnostics.length)) {
      const diagnostic = { code: reason || (result === 'memory_budget_exceeded' ? 'process_memory_budget_exceeded' : status), stage };
      for (const key of ['rejection', 'error', 'diagnostic']) if (isDict(out[key]) && out[key].code === diagnostic.code) Object.assign(diagnostic, out[key]);
      if (message) diagnostic.message = message;
      for (const key of ['location', 'path', 'resource', 'details']) if (has(out, key)) diagnostic[key] = out[key];
      if (!diagnostics.length || (reason && reason !== 'unsafe-lifecycle' && !diagnostics.some(d => d.code === diagnostic.code))) diagnostics.unshift(diagnostic);
    }
    for (const d of diagnostics) if (!has(d, 'stage')) d.stage = stage;
    if (diagnostics.some(d => ['unexpected_exception', 'active_thread_context_missing'].includes(d.code))) result = 'tool_failure';
    out.result = result;
    out.checks = checks;
    out.diagnostics = diagnosticsOf(out, diagnostics, stage, result);
    const scope = isDict(has(out, 'scope') ? out.scope : {}) ? { ...(out.scope || {}) } : { kind: out.scope };
    if (!has(scope, 'operation')) scope.operation = operation || (checks.synchronization !== 'not_requested' ? 'verification' : 'analysis');
    out.scope = scope;
    return out;
  }

  function failure(result, code, message, details = {}) {
    if (!RESULTS.has(result)) throw new Error('Unknown result category');
    return { result, diagnostics: [{ code, message: str(message), ...details }],
      checks: { synchronization: 'not_run', memory: 'not_run', equivalence: 'not_run' } };
  }

  return { normalize, failure, category };
}
