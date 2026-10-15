#!/usr/bin/env python3
"""Refresh the published snapshot using gh's existing repository access."""
import argparse
import base64
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from sync_removal import parse_sync_study
from kernel_inputs import collect_inputs

REPOSITORY = 'wmdi/wasp_verification'
SOURCE_PATH = 'docs/kernel-verification-results.json'
ROOT = Path(__file__).resolve().parents[1]


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path]))


def refresh(ref, input_root=None):
    # Resolve once, then fetch that immutable revision rather than a moving branch.
    commit = api('repos/{}/commits/{}'.format(REPOSITORY, ref))
    revision = commit['sha']
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Invalid source commit')
    content = api('repos/{}/contents/{}?ref={}'.format(REPOSITORY, SOURCE_PATH, revision))
    if content.get('encoding') != 'base64':
        raise ValueError('Unsupported GitHub content encoding')
    raw = base64.b64decode(content['content'])
    data = json.loads(raw)
    if data.get('schema') != 'sentryward.kernel-results-snapshot.v1':
        raise ValueError('Unsupported snapshot schema')
    rows = data.get('results')
    if not isinstance(rows, list) or not rows:
        raise ValueError('Snapshot has no records')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', data.get('snapshot_date', '')):
        raise ValueError('Missing snapshot date')
    if not re.fullmatch(r'[0-9a-f]{40}', data.get('worktree_base', '')):
        raise ValueError('Missing verifier workspace revision')
    if any(not isinstance(row.get('name'), str) or not row['name'] or
           not isinstance(row.get('result'), str) or not isinstance(row.get('checks'), dict)
           for row in rows):
        raise ValueError('Invalid kernel record')
    if len({row['name'] for row in rows}) != len(rows):
        raise ValueError('Duplicate kernel identifiers')
    counts = dict(collections.Counter(row['result'] for row in rows))
    if counts != data.get('counts'):
        raise ValueError('Snapshot counts do not match records')
    metadata = {
        'repository': REPOSITORY,
        'path': SOURCE_PATH,
        'revision': revision,
        'sha256': hashlib.sha256(raw).hexdigest(),
        'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    index = api('repos/{}/contents/examples/index.md?ref={}'.format(REPOSITORY, revision))
    if index.get('encoding') != 'base64':
        raise ValueError('Unsupported synchronization index encoding')
    study = parse_sync_study(base64.b64decode(index['content']), {
        'repository': REPOSITORY, 'revision': revision,
        'published_at': commit['commit']['committer']['date'],
    }, {row['name'] for row in rows})
    def read_input(path):
        if input_root is not None:
            resolved = (input_root / path).resolve()
            if input_root not in resolved.parents:
                raise ValueError('Input path leaves the analyzed workspace')
            return resolved.read_bytes()
        content = api('repos/{}/contents/{}?ref={}'.format(REPOSITORY, path, revision))
        if content.get('encoding') != 'base64':
            raise ValueError('Unsupported input content encoding')
        return base64.b64decode(content['content'])

    inputs = collect_inputs(rows, read_input)
    directory = ROOT / 'data'
    directory.mkdir(exist_ok=True)
    for name, payload in [('kernel-verification-results.json', raw),
                          ('verification-source.json', (json.dumps(metadata, indent=2) + '\n').encode()),
                          ('kernel-input-configs.json', (json.dumps(inputs, indent=2, ensure_ascii=False) + '\n').encode()),
                          ('sync-removal-results.json', (json.dumps(study, indent=2, ensure_ascii=False) + '\n').encode())]:
        with tempfile.NamedTemporaryFile(dir=str(directory), delete=False) as temp:
            temp.write(payload)
            pending = Path(temp.name)
        pending.replace(directory / name)
    print('Updated {} records from {} at {}'.format(len(rows), REPOSITORY, revision))
    print('Imported {} synchronization study records.'.format(len(study['results'])))
    print('Bundled {} exact input configurations.'.format(len(inputs['inputs'])))
    print('Snapshot: {}. Review the data diff before committing and publishing.'.format(data['snapshot_date']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='main', help='Source branch or commit (default: main)')
    parser.add_argument('--input-root', type=Path, help='Analyzed source workspace, if inputs differ from the publishing revision')
    args = parser.parse_args()
    try:
        refresh(args.ref, args.input_root.resolve() if args.input_root else None)
    except (subprocess.CalledProcessError, OSError, ValueError, KeyError) as error:
        parser.exit(1, 'Snapshot update failed: {}\n'.format(error))
