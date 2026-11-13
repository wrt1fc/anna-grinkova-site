#!/bin/bash
# Called by the pipeline while holding the GPU lock, or by the locked stop-post wrapper.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v30-r1
OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v30.conf
LEASE="$ROOT/reports/lease-owned"
PENDING="$ROOT/reports/restore-needed"
test -f "$LEASE" || exit 0
if [ -e "$OVERRIDE" ]; then
  grep -Fxq "EnvironmentFile=$ROOT/serving-disabled.env" "$OVERRIDE"
  : > "$PENDING"
  rm -- "$OVERRIDE"
fi
systemctl start ollama
curl -fsS --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 25 --max-time 5 http://127.0.0.1:11434/api/tags > /dev/null
if [ -e "$PENDING" ]; then
  systemctl daemon-reload
  systemctl restart anna-site
  curl -fsS --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 25 --max-time 5 http://127.0.0.1:3000/api/health > /dev/null
fi
# Health alone cannot prove which model the running process selected.
pid=$(systemctl show anna-site -p MainPID --value)
test "$pid" -gt 1
tr '\0' '\n' < "/proc/$pid/environ" | grep -Fx 'CHAT_LOCAL_MODEL=anna-v27' > /dev/null
rm -f -- "$PENDING"
rm -- "$LEASE"
