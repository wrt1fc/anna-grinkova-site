"""Regression tests for probe lifecycle; no server, GPU or service mutations."""
import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('cpu_window', pathlib.Path(__file__).parent / 'server/v20-cpu-window.py')
window = importlib.util.module_from_spec(spec)
spec.loader.exec_module(window)


class ProbeLifecycleTests(unittest.TestCase):
    def test_override_sorts_after_the_existing_anna_dropin(self):
        self.assertGreater(window.DROPIN.name, 'anna.conf')

    def test_effective_parallel_override_is_rejected_before_restart(self):
        with patch.object(window, 'run', return_value='CUDA_VISIBLE_DEVICES=-1 OLLAMA_NUM_PARALLEL=4'):
            with self.assertRaisesRegex(AssertionError, 'parallel=1'):
                window.require_cpu_configuration()
        with patch.object(window, 'run', return_value='CUDA_VISIBLE_DEVICES=-1 OLLAMA_NUM_PARALLEL=1'):
            window.require_cpu_configuration()

    def test_collected_transient_probe_does_not_abort(self):
        with patch.object(window, 'run', side_effect=[subprocess.CalledProcessError(5, ['systemctl', 'stop']), 'not-found']) as command:
            window.stop_probe()
        self.assertEqual(command.call_count, 2)

    def test_successfully_stopped_probe_needs_no_second_query(self):
        with patch.object(window, 'run', return_value='') as command:
            window.stop_probe()
        command.assert_called_once_with('systemctl', 'stop', 'anna-v20-cpu-probe')

    def test_other_stop_failures_are_not_swallowed(self):
        for code, state in [(1, None), (5, 'loaded')]:
            with self.subTest(code=code, state=state):
                with patch.object(window, 'run', side_effect=[subprocess.CalledProcessError(code, ['systemctl', 'stop']), state]):
                    with self.assertRaises(subprocess.CalledProcessError):
                        window.stop_probe()

    def test_probe_failure_cannot_write_override_or_restart_live_ollama(self):
        probe = MagicMock()
        probe.read_text.return_value = json.dumps({'rows': [{'model': 'anna-v19', 'groundedFallback': False}] * 5})
        override = MagicMock()
        override.exists.return_value = False
        with patch.object(window, 'DROPIN', override), patch.object(window.pathlib, 'Path', return_value=probe), patch.object(window, 'stop_probe', side_effect=RuntimeError('stop failed')), patch.object(window, 'run') as command:
            with self.assertRaisesRegex(RuntimeError, 'stop failed'):
                window.enable()
        override.write_text.assert_not_called()
        command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
