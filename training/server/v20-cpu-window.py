"""Temporary CPU serving for a single-GPU training window; root only.
Never edits site.env, model selection, or persistent Ollama overrides.
"""
import json, pathlib, shlex, subprocess, sys, time, urllib.request

# Drop-ins from /etc and /run are merged by filename. This must sort after
# the site's existing anna.conf, otherwise its parallel=4 silently wins.
DROPIN = pathlib.Path('/run/systemd/system/ollama.service.d/zz-anna-v20-cpu.conf')
CONTENT = '[Service]\nEnvironment="CUDA_VISIBLE_DEVICES=-1"\nEnvironment="OLLAMA_NUM_PARALLEL=1"\nEnvironment="OLLAMA_KEEP_ALIVE=-1m"\nCPUAffinity=0 1 2 3 4 5 6 7 8 9\n'


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


def require_cpu_configuration():
    values = dict(item.split('=', 1) for item in shlex.split(run('systemctl', 'show', 'ollama', '--property=Environment', '--value')) if '=' in item)
    assert values.get('CUDA_VISIBLE_DEVICES') == '-1', 'Effective systemd configuration is not CPU-only'
    assert values.get('OLLAMA_NUM_PARALLEL') == '1', 'Effective systemd configuration overrides parallel=1'
    assert values.get('OLLAMA_KEEP_ALIVE') == '-1m', 'CPU model must remain resident during training'


def preload_cpu_model():
    # Model initialization has its own deadline; never spend the visitor's
    # unchanged 45-second answer budget loading weights/context from scratch.
    started = time.monotonic()
    payload = {'model': 'anna-v19', 'prompt': '', 'stream': False, 'keep_alive': -1, 'options': {'num_ctx': 8192}}
    request = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.load(response)
    assert result.get('done') is True and not result.get('response'), 'Expected preload without a generated answer'
    return {'preload_ms': round((time.monotonic() - started) * 1000), 'preload_response_empty': True}


def restore(restart_service=True):
    if DROPIN.exists():
        assert DROPIN.read_text() == CONTENT, 'Temporary override changed externally'
        DROPIN.unlink()
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart' if restart_service else 'start', 'ollama')
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
    restarting = False
    try:
        run('systemctl', 'daemon-reload')
        # Check the composed configuration before interrupting the live API.
        require_cpu_configuration()
        restarting = True
        run('systemctl', 'restart', 'ollama')
        ready()
        pid = run('systemctl', 'show', 'ollama', '--property=MainPID', '--value')
        env = pathlib.Path('/proc/' + pid + '/environ').read_bytes().split(b'\0')
        assert b'CUDA_VISIBLE_DEVICES=-1' in env and b'OLLAMA_NUM_PARALLEL=1' in env
        preload = preload_cpu_model()
        print(json.dumps({'serving': 'CPU', 'productionModel': 'anna-v19', 'temporaryOverride': True, **preload}))
    except Exception:
        restore(restart_service=restarting)
        raise


if __name__ == '__main__':
    {'enable': enable, 'restore': restore}[sys.argv[1]]()
