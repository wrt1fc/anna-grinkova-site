"""CPU-only CLI regression tests for the memory-smoke acceptance gate."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class MemorySmokeGateTests(unittest.TestCase):
    def run_gate(self, max_length=3584, allocated=6.8, reserved=7.5, argument='3584'):
        metadata = {
            'max_length': max_length, 'max_steps': 10,
            'processed_train_examples': 16, 'reject_truncation': True,
            'training_metrics': {'train_loss': 0.8},
            'peak_cuda_allocated_gib': allocated,
            'peak_cuda_reserved_gib': reserved,
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'metadata.json'
            path.write_text(json.dumps(metadata), encoding='utf-8')
            command = [sys.executable, str(Path(__file__).with_name('check-memory-smoke.py')), str(path)]
            if argument is not None:
                command.append(argument)
            return subprocess.run(command, capture_output=True, text=True, check=False)

    def test_new_length_is_explicit_and_legacy_default_is_preserved(self):
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['max_length'], 3584)
        self.assertNotEqual(self.run_gate(argument=None).returncode, 0)
        self.assertEqual(self.run_gate(max_length=3400, argument=None).returncode, 0)

    def test_new_length_does_not_relax_gpu_headroom(self):
        self.assertNotEqual(self.run_gate(allocated=9.0).returncode, 0)
        self.assertNotEqual(self.run_gate(reserved=9.6).returncode, 0)


if __name__ == '__main__':
    unittest.main()
