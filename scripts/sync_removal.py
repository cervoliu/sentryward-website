"""Import the experiment index without inferring missing measurements."""
import hashlib
import re

SCENARIOS = [('recorded', 'recorded input'), ('larger', 'larger input')]


def unavailable_status(text):
    if not text:
        return 'not_reported'
    if text == 'n/a':
        return 'not_applicable'
    if text.startswith(('not run', 'not rerun')):
        return 'not_run'
    raise ValueError('Unrecognized experiment field: ' + text)


def parse_removal(text):
    match = re.match(r'^(\d+) of (\d+)(?:\b|$)', text)
    if not match:
        return {'status': unavailable_status(text), 'note': text}
    removed, candidates = map(int, match.groups())
    if removed > candidates:
        raise ValueError('Removals exceed candidate sites')
    return {'status': 'measured', 'removable': removed, 'candidates': candidates, 'note': text}


def parse_performance(text):
    percent = re.match(r'^([+-]?\d+(?:\.\d+)?)%', text)
    unchanged = text.startswith('no measurable change')
    if not percent and not unchanged:
        return {'status': unavailable_status(text), 'note': text}
    # The source percentage is authoritative; do not recompute from rounded timings.
    result = {'status': 'no_measurable_change' if unchanged else 'measured',
              'runtime_change_percent': float(percent.group(1)) if percent else 0.0,
              'note': text}
    times = re.search(r'\(([\d.]+)\s*(?:→|vs)\s*([\d.]+)\s*µs\)', text)
    if not times:
        raise ValueError('Measured performance lacks before/after timings: ' + text)
    result['original_us'], result['reduced_us'] = map(float, times.groups())
    if min(result['original_us'], result['reduced_us']) <= 0:
        raise ValueError('Kernel timings must be positive')
    return result


def parse_sync_study(raw, source, known_names):
    text = raw.decode('utf-8')
    lines = [line for line in text.splitlines() if line.startswith('|')]
    if len(lines) < 3:
        raise ValueError('Missing synchronization experiment table')
    split = lambda line: [cell.strip() for cell in re.split(r'(?<!\\)\|', line.strip().strip('|'))]
    header = split(lines[0])
    required = ['Example', 'Sync Instructions'] + [prefix + ' (' + label + ')'
        for _, label in SCENARIOS for prefix in ['Removable', 'Performance Improvement']]
    if any(column not in header for column in required):
        raise ValueError('Synchronization table columns changed')
    records = []
    seen = set()
    for line in lines[2:]:
        cells = split(line)
        if len(cells) != len(header):
            raise ValueError('Malformed synchronization table row')
        row = dict(zip(header, cells))
        name = row['Example']
        if name in seen:
            raise ValueError('Duplicate kernel in synchronization table: ' + name)
        seen.add(name)
        if not any(row[column] for column in required[1:]):
            continue
        if name not in known_names:
            raise ValueError('Synchronization result has no matching verification record: ' + name)
        instructions = re.fullmatch(r'(\d+)(?: \((\d+) executed candidates\))?', row['Sync Instructions'])
        if not instructions:
            raise ValueError('Unrecognized synchronization instruction count: ' + name)
        record = {'name': name, 'static_sync_instructions': int(instructions.group(1)),
                  'sync_instructions_note': row['Sync Instructions']}
        for key, label in SCENARIOS:
            removal = parse_removal(row['Removable (' + label + ')'])
            performance = parse_performance(row['Performance Improvement (' + label + ')'])
            if performance['status'] in ('measured', 'no_measurable_change') and removal['status'] != 'measured':
                raise ValueError('Timing without a verified removal count: ' + name)
            if key == 'recorded' and removal['status'] == 'measured' and instructions.group(2) and int(instructions.group(2)) != removal['candidates']:
                raise ValueError('Recorded candidate counts disagree: ' + name)
            record[key] = {'removal': removal, 'performance': performance,
                           'rechecked_at_recorded_input': key == 'larger' and bool(re.search(r're-checked at the recorded input|unchanged: recorded input', removal['note']))}
        record['references'] = list(dict.fromkeys(re.findall(r'https://github\.com/wmdi/wasp_verification/issues/\d+', row['Removable (recorded input)'])))
        records.append(record)
    if not records:
        raise ValueError('No synchronization experiments found')
    methodology = [paragraph for paragraph in text.split('\n\n')
                   if paragraph.startswith(('**Synchronization columns.**', '**Larger-input columns.**'))]
    if len(methodology) != 2:
        raise ValueError('Missing experiment methodology')
    return {'schema': 'sentryward.sync-removal-study.v1',
            'source': dict(source, path='examples/index.md', sha256=hashlib.sha256(raw).hexdigest()),
            'device': 'NVIDIA B200', 'methodology': methodology, 'results': records}
