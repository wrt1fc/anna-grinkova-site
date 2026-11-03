#!/bin/bash
# Bounded autonomous experiments. Never edits site.env or enables a candidate.
set -Eeuo pipefail
ROOT=${LEARNING_RUN_ROOT:-/home/ubuntu/learning-training-series-v12-r2}
BACKUP=/home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102
PY=/home/ubuntu/natal-bench/venv/bin/python
KNOWLEDGE=/home/ubuntu/natal-training-v4/knowledge
MAX_LENGTH=3400
exec 9>"$ROOT/reports/pipeline.lock"
flock -n 9 || exit 73
exec 8>/home/ubuntu/anna-training-gpu.lock
flock -n 8 || exit 73
STAGE=preflight
cleanup() {
 result=$?; trap - EXIT
 sudo -n systemctl start ollama || true
 if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi
 exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4
export CHAT_LEARNING_SIGNALS=1
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
test -s "$BACKUP/BACKUP_COMPLETE"
test "$(sha256sum /home/ubuntu/natal-training-v10/anna-v10/adapter_model.safetensors | cut -d' ' -f1)" = 99568d4c1cc1ef9669d565e058301e056b5b3e771e9f6a05fd76fdb43f48741f
test ! -e "$ROOT/reports/series-summary.json"
test "$(df --output=avail -BG "$ROOT" | tail -1 | tr -dc 0-9)" -ge 70
cd "$ROOT/eval-code"
stage token-preflight
USE_TORCH=0 "$PY" training/count-learning-tokens.py "$ROOT/data" "$ROOT/reports/token-counts.json" "$MAX_LENGTH" > "$ROOT/reports/token-preflight.log" 2>&1
stage memory-smoke-plan
USE_TORCH=0 "$PY" training/prepare-memory-smoke.py "$ROOT/data" "$ROOT/smoke-data" > "$ROOT/reports/memory-smoke-plan.json" 2>&1
stage baseline-learning
run_check node training/eval-learning.mjs anna-v10 "$ROOT/cards.jsonl" "$ROOT/reports/baseline-learning" > "$ROOT/reports/baseline-learning.log" 2>&1
stage baseline-fresh
run_check node training/eval-learning.mjs anna-v10 "$ROOT/holdout.jsonl" "$ROOT/reports/baseline-fresh" > "$ROOT/reports/baseline-fresh.log" 2>&1
stage baseline-natal
run_check node training/eval-natal.js anna-v10 "$ROOT/natal-plan.json" "$ROOT/reports/baseline-natal.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/baseline-natal.log" 2>&1
stage baseline-chat
run_check node training/eval-chat.js anna-v10 "$ROOT/reports/baseline-chat.md" > "$ROOT/reports/baseline-chat.log" 2>&1
stage backup-check
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-check.log" 2>&1
stage memory-smoke
sudo -n systemctl stop ollama
sleep 3
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" \
 --init-adapter /home/ubuntu/natal-training-v10/anna-v10 --max-steps 10 --lr 1e-5 --max-length "$MAX_LENGTH" \
 --reject-truncation --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1
"$PY" training/check-memory-smoke.py "$ROOT/smoke-adapter/anna-training.json" > "$ROOT/reports/memory-smoke-result.json"
for VERSION in v12 v13 v14; do
 ATTEMPT="$ROOT/attempt-$VERSION"
 test ! -e "$ATTEMPT"
 mkdir -p "$ATTEMPT/reports"
 cp -a "$ROOT/eval-code" "$ATTEMPT/eval-code"
 cp -a "$ROOT/data" "$ATTEMPT/data"
 cp "$ROOT/natal-plan.json" "$ATTEMPT/natal-plan.json"
 case "$VERSION" in v12) EPOCHS=2; LR=1e-5;; v13) EPOCHS=3; LR=1e-5;; v14) EPOCHS=2; LR=2e-5;; esac
 stage "$VERSION-training"
 sudo -n systemctl stop ollama
 sleep 3
 # Do not compete with another user's GPU process after unloading only Ollama.
 test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
 cd "$ATTEMPT/eval-code"
 "$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ATTEMPT/data" --out "$ATTEMPT/anna-$VERSION" \
  --init-adapter /home/ubuntu/natal-training-v10/anna-v10 --epochs "$EPOCHS" --lr "$LR" --max-length "$MAX_LENGTH" --reject-truncation --grad-accum 8 \
  --half-embedding --timing --eval-first --logging-steps 1 > "$ATTEMPT/reports/train.log" 2>&1
 stage "$VERSION-export-and-regression"
 bash training/server/export-eval.sh "$VERSION" "$KNOWLEDGE" natal-plan.json > "$ATTEMPT/reports/export.log" 2>&1
 test "$(cat "$ATTEMPT/reports/eval-natal-anna-$VERSION.exit")" -le 1
 test "$(cat "$ATTEMPT/reports/eval-chat-anna-$VERSION.exit")" -le 1
 stage "$VERSION-learning"
 run_check node training/eval-learning.mjs "anna-$VERSION" "$ROOT/cards.jsonl" "$ATTEMPT/reports/learning" > "$ATTEMPT/reports/learning.log" 2>&1
 stage "$VERSION-fresh"
 run_check node training/eval-learning.mjs "anna-$VERSION" "$ROOT/holdout.jsonl" "$ATTEMPT/reports/fresh" > "$ATTEMPT/reports/fresh.log" 2>&1
 stage "$VERSION-report"
 sha256sum "$ATTEMPT/anna-$VERSION-q8_0.gguf" "$ATTEMPT/anna-$VERSION/adapter_model.safetensors" > "$ATTEMPT/reports/candidate-sha256.txt"
 FINAL=no; if [ "$VERSION" = v14 ]; then FINAL=yes; fi
 node training/report-learning-series.mjs "$ROOT" "anna-$VERSION" "$FINAL" > "$ATTEMPT/reports/final-summary.log" 2>&1
 node -e 'const fs=require("fs");let r=JSON.parse(fs.readFileSync(process.argv[1]));process.exit(r.status==="CHECKS_COMPLETE_PASS"?0:1)' "$ATTEMPT/reports/decision.json" && break
done
stage final-integrity
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-final-check.log" 2>&1
test "$(sha256sum /home/ubuntu/natal-training-v10/anna-v10/adapter_model.safetensors | cut -d' ' -f1)" = 99568d4c1cc1ef9669d565e058301e056b5b3e771e9f6a05fd76fdb43f48741f
sudo -n systemctl start ollama
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
node -e 'const fs=require("fs");let r=JSON.parse(fs.readFileSync(process.argv[1]));console.log(r.status)' "$ROOT/reports/series-summary.json" > "$ROOT/reports/status.txt"
