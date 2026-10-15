import hashlib
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('kernel_inputs', Path(__file__).resolve().parents[1] / 'scripts/kernel_inputs.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KernelInputImportTests(unittest.TestCase):
    def row(self, raw, path='examples/kernel/input.json'):
        return {'files': {'input': {'path': path, 'sha256': hashlib.sha256(raw).hexdigest()}}}

    def test_preserves_original_bytes_including_whitespace(self):
        raw = b'{ "schema": "spverify.kernel-input/v1", "arguments": [{"value": null}] }\n'
        row = self.row(raw)
        bundle = module.collect_inputs([row], lambda path: raw)
        self.assertEqual(bundle['inputs'][row['files']['input']['sha256']].encode(), raw)

    def test_mismatched_bytes_fail_before_publication(self):
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            module.collect_inputs([self.row(b'old')], lambda path: b'new')

    def test_unsupported_inputs_are_rejected(self):
        raw = b'{"schema":"unknown"}'
        with self.assertRaisesRegex(ValueError, 'schema'):
            module.collect_inputs([self.row(raw)], lambda path: raw)

    def test_paths_cannot_escape_the_input_directory(self):
        for path in ['', '../outside/input.json', '/examples/kernel/input.json', 'examples/../../input.json', 'docs/input.json']:
            with self.assertRaisesRegex(ValueError, 'path'):
                module.collect_inputs([self.row(b'{}', path)], lambda path: self.fail('Must not read invalid paths'))


if __name__ == '__main__':
    unittest.main()
