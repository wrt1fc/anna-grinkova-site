#!/bin/bash
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v31-r1
test "$(cat "$ROOT/reports/status.txt")" = PREPARED_NOT_STARTED
test ! -e "$ROOT/anna-v31/adapter_model.safetensors"
test ! -e "$ROOT/reports/lease-owned"
test ! -e "$ROOT/reports/restore-needed"
test ! -e /run/systemd/system/anna-site.service.d/90-training-v31.conf
test -d "$ROOT/eval-code" && test ! -L "$ROOT/eval-code"
flock -n /home/ubuntu/anna-training-gpu.lock true
sudo -n systemd-run --unit=anna-v31-r1-training --uid=ubuntu --working-directory="$ROOT" --collect \
 --property=RuntimeMaxSec=21600 --property=TimeoutStopSec=120 --property=KillMode=control-group --property=Restart=no \
 --property=Nice=0 --property=MemoryHigh=10G --property=MemoryMax=14G \
 "--property=ExecStopPost=/usr/bin/sudo -n /bin/bash $ROOT/eval-code/training/server/restore-v31-stop.sh" \
 /bin/bash "$ROOT/eval-code/training/server/repair-v31.sh"
date -Is > "$ROOT/reports/launch-time.txt"
systemctl show anna-v31-r1-training.service -p ActiveState -p SubState -p MainPID -p InvocationID -p RuntimeMaxUSec
