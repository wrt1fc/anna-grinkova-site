#!/bin/bash
# Stop-post must not restore another job's window when this review never obtained its lease.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v26-serving-r1
test -f "$ROOT/reports/lease-owned" || exit 0
exec 8>/home/ubuntu/anna-training-gpu.lock
flock -n 8 || { printf 'FAILED stage=restore-pending-gpu-lock\n' > "$ROOT/reports/status.txt"; exit 75; }
test -f "$ROOT/reports/lease-owned" || exit 0
/bin/bash /home/ubuntu/natal-training-v26-r2/eval-code/training/server/restore-v26-serving.sh
rm -- "$ROOT/reports/lease-owned"
