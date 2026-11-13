#!/bin/bash
# A failed preflight must never restore another job's GPU window.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v30-r1
test -f "$ROOT/reports/lease-owned" || exit 0
exec 8>/home/ubuntu/anna-training-gpu.lock
flock -n 8 || { printf 'FAILED stage=restore-pending-gpu-lock\n' > "$ROOT/reports/status.txt"; exit 75; }
test -f "$ROOT/reports/lease-owned" || exit 0
/bin/bash "$ROOT/eval-code/training/server/restore-v30-serving.sh"
