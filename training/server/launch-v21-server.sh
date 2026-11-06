#!/bin/bash
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v21-r1
test "$(cat "$ROOT/reports/status.txt")" = PREPARED_NOT_STARTED
! systemctl is-active --quiet anna-v21-training.service
test ! -e "$ROOT/anna-v21/adapter_model.safetensors"
test ! -e "$ROOT/anna-v21-q8_0.gguf"
flock -n /home/ubuntu/anna-training-gpu.lock true
sudo -n systemd-run --unit=anna-v21-training --uid=ubuntu --working-directory="$ROOT" --collect \
 --setenv=ANNA_TRAINING_ROOT="$ROOT" --setenv=ANNA_TRAINING_UNIT=anna-v21-training.service \
 --setenv=ANNA_TRAINING_SERVING_MODE=offline \
 --property=RuntimeMaxSec=21600 --property=TimeoutStopSec=120 --property=KillMode=control-group --property=Restart=no \
 --property=Nice=10 --property=MemoryHigh=7G --property=MemoryMax=8G --property=CPUAffinity=6-9 \
 "--property=ExecStopPost=/usr/bin/sudo -n /usr/bin/systemctl start ollama" \
 /bin/bash "$ROOT/eval-code/training/server/repair-v21.sh"
date -Is > "$ROOT/reports/launch-time.txt"
systemctl show anna-v21-training.service -p ActiveState -p SubState -p MainPID -p InvocationID -p RuntimeMaxUSec -p ExecMainStartTimestamp
