#!/bin/bash
# Idempotent cleanup for the explicitly authorized v26 GPU-only training window.
set -Eeuo pipefail
OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v26.conf
PENDING=/home/ubuntu/natal-training-v26-r1/reports/restore-needed
if [ -e "$OVERRIDE" ]; then
  grep -Fxq 'EnvironmentFile=/home/ubuntu/natal-training-v26-r1/serving-disabled.env' "$OVERRIDE"
  : > "$PENDING"
  rm -- "$OVERRIDE"
fi
systemctl start ollama
curl -fsS --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 25 --max-time 5 http://127.0.0.1:11434/api/tags > /dev/null
if [ -e "$PENDING" ]; then
  systemctl daemon-reload
  systemctl restart anna-site
  curl -fsS --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 25 --max-time 5 http://127.0.0.1:3000/api/health > /dev/null
  rm -- "$PENDING"
fi
