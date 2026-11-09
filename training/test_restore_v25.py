"""Linux-only restoration tests with fake services; never touches real systemd."""
from pathlib import Path
import os
import shlex
import subprocess
import sys
import tempfile
import unittest


@unittest.skipIf(sys.platform == 'win32', 'Bash/systemd fixture runs on the Linux training server')
class RestoreTests(unittest.TestCase):
    def test_transient_restart_failure_keeps_restore_pending_for_the_next_attempt(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            override = root / 'override.conf'
            pending = root / 'restore-needed'
            override.write_text('[Service]\nEnvironmentFile=/home/ubuntu/natal-training-v25-r1/serving-disabled.env\n')
            source = Path(__file__).with_name('server').joinpath('restore-v25-serving.sh').read_text()
            source = source.replace('OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v25.conf', 'OVERRIDE=' + shlex.quote(str(override)))
            source = source.replace('PENDING=/home/ubuntu/natal-training-v25-r1/reports/restore-needed', 'PENDING=' + shlex.quote(str(pending)))
            script = root / 'restore.sh'
            script.write_text(source)
            command = root / 'systemctl'
            command.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$FIXTURE_ROOT/actions"\n'
                               'if [ "$*" = "restart anna-site" ] && [ ! -e "$FIXTURE_ROOT/failed-once" ]; then\n'
                               '  touch "$FIXTURE_ROOT/failed-once"; exit 1\nfi\n')
            command.chmod(0o755)
            curl = root / 'curl'
            curl.write_text('#!/bin/sh\nexit 0\n')
            curl.chmod(0o755)
            env = os.environ | {'PATH': str(root) + os.pathsep + os.environ['PATH'], 'FIXTURE_ROOT': str(root)}
            first = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, check=False)
            self.assertNotEqual(first.returncode, 0)
            self.assertTrue(pending.exists())
            second = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, check=False)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertFalse(pending.exists())
            self.assertEqual((root / 'actions').read_text().count('restart anna-site'), 2)


if __name__ == '__main__':
    unittest.main()
