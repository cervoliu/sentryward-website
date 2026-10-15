// Configurations are keyed by the hash of the exact analyzed input.json bytes.
export async function readInputConfig(bundle, file) {
  if (bundle?.schema !== 'sentryward.kernel-inputs.v1' || !/^[0-9a-f]{64}$/.test(file?.sha256)) {
    throw new Error('Invalid input configuration bundle or record.');
  }
  const content = bundle.inputs?.[file.sha256];
  if (typeof content !== 'string') throw new Error('Recorded input configuration is unavailable.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== file.sha256) throw new Error('Input configuration does not match the recorded hash.');
  const config = JSON.parse(content, (key, value, context) => {
    // Keep large integer arguments exact; older browsers can still read the raw JSON.
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return context?.source ?? 'See full JSON for the exact integer';
    }
    return value;
  });
  if (config?.schema !== 'spverify.kernel-input/v1') throw new Error('Unsupported input configuration.');
  return { config, content };
}
