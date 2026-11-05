"""Temporary CPU serving for a single-GPU training window; root only.
Never edits site.env, model selection, or persistent Ollama overrides.
"""
import json, pathlib, subprocess, sys, time, urllib.request

DROPIN = pathlib.Path('/run/systemd/system/ollama.service.d/80-anna-v20-cpu.conf')
CONTENT = '[Service]\nEnvironment="CUDA_VISIBLE_DEVICES=-1"\nEnvironment="OLLAMA_NUM_PARALLEL=1"\nCPUAffinity=0 1 2 3 4 5\n'


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def ready():
    for _ in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.5)
    raise RuntimeError('Ollama API did not recover')


def stop_probe():
    try:
        run('systemctl', 'stop', 'anna-v20-cpu-probe')
    except subprocess.CalledProcessError as error:
        # Transient units can be garbage-collected after the earlier probe was
        # stopped. Only that confirmed absence is harmless; don't hide failures.
        if error.returncode != 5 or run('systemctl', 'show', 'anna-v20-cpu-probe', '--property=LoadState', '--value') != 'not-found':
            raise


def restore():
    if DROPIN.exists():
        assert DROPIN.read_text() == CONTENT, 'Temporary override changed externally'
        DROPIN.unlink()
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart', 'ollama')
    else:
        run('systemctl', 'start', 'ollama')
    ready()
    print(json.dumps({'serving': 'GPU_AVAILABLE', 'temporaryOverride': False}))


def enable():
    assert not DROPIN.exists(), 'CPU window already exists; do not duplicate'
    # A previously measured CPU-only probe must have completed before switching.
    probe = json.loads(pathlib.Path('/home/ubuntu/anna-v20-cpu-probe.json').read_text())
    assert len(probe['rows']) == 5 and all(row['model'] == 'anna-v19' and not row['groundedFallback'] for row in probe['rows'])
    # Finish probe cleanup before touching the live Ollama configuration.
    stop_probe()
    DROPIN.parent.mkdir(parents=True, exist_ok=True)
    DROPIN.write_text(CONTENT)
    try:
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart', 'ollama')
        ready()
        pid = run('systemctl', 'show', 'ollama', '--property=MainPID', '--value')
        env = pathlib.Path('/proc/' + pid + '/environ').read_bytes().split(b'\0')
        assert b'CUDA_VISIBLE_DEVICES=-1' in env and b'OLLAMA_NUM_PARALLEL=1' in env
        print(json.dumps({'serving': 'CPU', 'productionModel': 'anna-v19', 'temporaryOverride': True}))
    except Exception:
        restore()
        raise


if __name__ == '__main__':
    {'enable': enable, 'restore': restore}[sys.argv[1]]()
