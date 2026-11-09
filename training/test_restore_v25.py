"""Linux-only restoration tests with fake services; never touches real systemd."""
from pathlib import Path
import os
import shlex
import subprocess
import sys
import tempfile
import unittest
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


@unittest.skipIf(sys.platform == 'win32', 'Bash/systemd fixture runs on the Linux training server')
class RestoreTests(unittest.TestCase):
    def test_training_window_waits_for_the_site_to_start_listening(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'reports').mkdir()
            with socket.socket() as reservation:
                reservation.bind(('127.0.0.1', 0))
                port = reservation.getsockname()[1]

            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"status":"ok"}')

                def log_message(self, *_args):
                    pass

            server = []

            def start_later():
                time.sleep(0.8)
                instance = HTTPServer(('127.0.0.1', port), Handler)
                server.append(instance)
                instance.serve_forever()

            thread = threading.Thread(target=start_later, daemon=True)
            thread.start()
            source = Path(__file__).with_name('server').joinpath('repair-v25.sh').read_text()
            line = next(line for line in source.splitlines() if 'site-health-during-training.json' in line)
            command = line.replace('http://127.0.0.1:3000/', f'http://127.0.0.1:{port}/')
            try:
                result = subprocess.run(['bash', '-c', command], env=os.environ | {'ROOT': str(root)}, capture_output=True, text=True, timeout=35, check=False)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((root / 'reports/site-health-during-training.json').read_text(), '{"status":"ok"}')
            finally:
                thread.join(timeout=1)
                if server:
                    server[0].shutdown()
                    server[0].server_close()

    def test_transient_restart_failure_keeps_restore_pending_for_the_next_attempt(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            override = root / 'override.conf'
            pending = root / 'restore-needed'
            override.write_text('[Service]\nEnvironmentFile=/home/ubuntu/natal-training-v25-r2/serving-disabled.env\n')
            source = Path(__file__).with_name('server').joinpath('restore-v25-serving.sh').read_text()
            source = source.replace('OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v25.conf', 'OVERRIDE=' + shlex.quote(str(override)))
            source = source.replace('PENDING=/home/ubuntu/natal-training-v25-r2/reports/restore-needed', 'PENDING=' + shlex.quote(str(pending)))
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
