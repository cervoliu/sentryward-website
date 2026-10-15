"""Bundle exact input.json bytes, keyed by the verification snapshot's SHA-256."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import PurePosixPath
import re


def collect_inputs(rows, read_bytes):
    files = {}
    for row in rows:
        source = row['files']['input']
        path = PurePosixPath(source['path'])
        if len(path.parts) < 3 or path.is_absolute() or '..' in path.parts or path.parts[0] != 'examples' or path.name != 'input.json':
            raise ValueError('Invalid input path: {}'.format(path))
        digest = source['sha256']
        if not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('Invalid input hash for {}'.format(path))
        files[digest] = str(path)

    def load(item):
        digest, path = item
        raw = read_bytes(path)
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError('Input hash mismatch for {}. Use --input-root with the analyzed workspace.'.format(path))
        content = raw.decode('utf-8')
        config = json.loads(content)
        if not isinstance(config, dict) or config.get('schema') != 'spverify.kernel-input/v1':
            raise ValueError('Unsupported input schema for {}'.format(path))
        return digest, content

    # Preserve the source bytes, including whitespace, so consumers can verify hashes.
    with ThreadPoolExecutor(max_workers=6) as pool:
        return {'schema': 'sentryward.kernel-inputs.v1', 'inputs': dict(pool.map(load, files.items()))}
