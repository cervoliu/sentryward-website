// Runs sentryward-ptx (WebAssembly, built by scripts/engine/build.sh) once, then is thrown away: {module, ptx, input, args}
// in (module: the engine, compiled once by engine.js), progress and {type: 'done', code, stdout, stderr} out.
// A dedicated worker, so that stopping a run is terminate().
import SentryWard from './engine/sentryward-ptx.js';

onmessage = async ({ data: { module, ptx, input, args } }) => {
  let stdout = '', mod = null;
  // memory: the WebAssembly heap at the end, which only grows, so its peak (the native report's RSS reads 0 here)
  const tail = [], done = (code, extra = '') => postMessage({ type: 'done', code, stdout, stderr: tail.join('\n') + extra, memory: mod?.HEAPU8?.length ?? null });
  const err = line => {
    const sp = line.indexOf(' '), tag = line.slice(0, sp);
    if (tag === 'SENTRYWARD_PROFILE') return;                      // timing snapshots: hundreds per run, unused here
    if (tag === 'SENTRYWARD_IR_SIZE' || tag === 'SENTRYWARD_FRONTEND') {
      try { const d = JSON.parse(line.slice(sp + 1)); postMessage({ type: 'stage', stage: d.stage || `frontend.${d.event}`, cta: d.cta }); } catch { /* a truncated line */ }
      return;
    }
    tail.push(line); if (tail.length > 400) tail.shift();
    postMessage({ type: 'log', line });
  };
  try {
    mod = await SentryWard({
      instantiateWasm: (imports, ready) => { WebAssembly.instantiate(module, imports).then(i => ready(i, module)); return {}; },
      print: line => { stdout += line + '\n'; },
      printErr: err,
      onExit: code => done(code),
      onAbort: what => done(-1, `\naborted: ${what}`),
    });
    mod.FS.mkdir('/w');
    mod.FS.writeFile('/w/kernel.ptx', ptx);
    mod.FS.writeFile('/w/input.json', input);
    mod.callMain(['--ptx', '/w/kernel.ptx', '--config', '/w/input.json', ...args]);
  } catch (e) {
    if (e?.name === 'ExitStatus') return;                            // exit() inside main: onExit has reported it
    done(-1, `\n${e?.stack || e}`);
  }
};
