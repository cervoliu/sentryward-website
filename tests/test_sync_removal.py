import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sync_removal', Path(__file__).resolve().parents[1] / 'scripts/sync_removal.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SyncImportTests(unittest.TestCase):
    def test_source_percent_is_not_recomputed_from_timings(self):
        result = module.parse_performance('-4.1% (3.46 → 3.29 µs); B200 output identical')
        self.assertEqual(result['runtime_change_percent'], -4.1)
        self.assertEqual(result['original_us'], 3.46)
        self.assertEqual(result['reduced_us'], 3.29)

    def test_no_measurable_change_is_not_inferred_from_times(self):
        result = module.parse_performance('no measurable change (0.19 vs 0.22 µs); B200 output identical')
        self.assertEqual(result['status'], 'no_measurable_change')
        self.assertEqual(result['runtime_change_percent'], 0)

    def test_slowdown_sign_and_missing_status(self):
        self.assertEqual(module.parse_performance('+2.5% (2.50 → 2.57 µs)')['runtime_change_percent'], 2.5)
        self.assertEqual(module.parse_performance('')['status'], 'not_reported')
        self.assertEqual(module.parse_performance('n/a')['status'], 'not_applicable')

    def test_measured_zero_and_unrun_counts(self):
        self.assertEqual(module.parse_removal('0 of 4 (#271)')['removable'], 0)
        self.assertEqual(module.parse_removal('not rerun: scheduler not rescaled')['status'], 'not_run')
        self.assertEqual(module.parse_removal('')['status'], 'not_reported')

    def test_source_format_changes_fail_closed(self):
        for value in ['4 of 2', 'roughly half']:
            with self.assertRaises(ValueError): module.parse_removal(value)
        for value in ['5% faster', 'about 10%']:
            with self.assertRaises(ValueError): module.parse_performance(value)


if __name__ == '__main__':
    unittest.main()
