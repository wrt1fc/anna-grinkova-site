#!/bin/bash
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v26-r1
test "$(cat "$ROOT/reports/status.txt")" = PREPARED_NOT_STARTED
test ! -e "$ROOT/anna-v26/adapter_model.safetensors"
flock -n /home/ubuntu/anna-training-gpu.lock true
sudo -n systemd-run --unit=anna-v26-r1-training --uid=ubuntu --working-directory="$ROOT" --collect \
 --property=RuntimeMaxSec=21600 --property=TimeoutStopSec=120 --property=KillMode=control-group --property=Restart=no \
 --property=Nice=0 --property=MemoryHigh=10G --property=MemoryMax=14G \
 "--property=ExecStopPost=/usr/bin/sudo -n /bin/bash $ROOT/eval-code/training/server/restore-v26-serving.sh" \
 /bin/bash "$ROOT/eval-code/training/server/repair-v26.sh"
date -Is > "$ROOT/reports/launch-time.txt"
systemctl show anna-v26-r1-training.service -p ActiveState -p SubState -p MainPID -p InvocationID -p RuntimeMaxUSec
