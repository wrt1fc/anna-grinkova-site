#!/bin/bash
# Final production-protocol review, after the immutable training pipeline has finished.
# Reuses the tested v26 maintenance-window restore helper; never selects the candidate on the site.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v26-serving-r1
TRAIN=/home/ubuntu/natal-training-v26-r2
SOURCE=${1:?verified production release directory}
[[ "$SOURCE" =~ ^/opt/anna-releases/chat-[a-f0-9]{7,40}$ ]]
test -s "$SOURCE/SOURCE_COMMIT"
test -d "$ROOT/reports"
test "$(cat "$ROOT/reports/status.txt")" = PREPARED_NOT_STARTED
exec 8>/home/ubuntu/anna-training-gpu.lock; flock -n 8 || exit 73
grep -q '^CHECKS_COMPLETE_REVIEW_REQUIRED ' "$TRAIN/reports/status.txt"
OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v26.conf
RESTORE="$TRAIN/eval-code/training/server/restore-v26-serving.sh"
test ! -e "$OVERRIDE"
test ! -e "$ROOT/reports/candidate-development.json"
state=$(systemctl show anna-v26-r2-training.service --value -p ActiveState 2>/dev/null || true)
case "$state" in inactive|failed|'') ;; *) exit 75 ;; esac
: > "$ROOT/reports/lease-owned"
STAGE=preflight
restore_owned() {
  test -f "$ROOT/reports/lease-owned" || return 0
  sudo -n /bin/bash "$RESTORE" || return
  rm -- "$ROOT/reports/lease-owned"
}
cleanup() {
  result=$?; trap - EXIT
  restore_owned >> "$ROOT/reports/serving-restore.log" 2>&1 || result=75
  if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
cp "$SOURCE/SOURCE_COMMIT" "$ROOT/source-commit.txt"
cp "$TRAIN/"{cards.jsonl,regression.jsonl,natal-plan.json,methodics.json} "$ROOT/"
node "$SOURCE/training/review-controls-v26.mjs" "$TRAIN/holdout.jsonl" "$ROOT/holdout.jsonl"
ln -s "$SOURCE" "$ROOT/eval-code"
cd "$ROOT"
sha256sum cards.jsonl holdout.jsonl holdout.jsonl.revision.json regression.jsonl natal-plan.json methodics.json source-commit.txt > input-sha256.txt
(cd "$SOURCE"; find server config training -type f -print0 | sort -z | xargs -0 sha256sum) > "$ROOT/source-sha256.txt"
sha256sum -c "$TRAIN/reports/parent-before.sha256" > "$ROOT/reports/parent-integrity.log"
sha256sum -c "$TRAIN/reports/candidate-sha256.txt" > "$ROOT/reports/candidate-integrity.log"
stage isolated-serving-review
sudo -n install -m 644 "$TRAIN/runtime-disable.conf" "$OVERRIDE"
sudo -n systemctl daemon-reload
sudo -n systemctl restart anna-site
curl -fsS --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 5 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health-during-review.json"
sudo -n systemctl start ollama
curl -fsS --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 5 http://127.0.0.1:11434/api/tags > "$ROOT/reports/ollama-tags.json"
export CHAT_MODEL_PROTOCOL=19 CHAT_FACT_GUARD=1 CHAT_LEARNING_SIGNALS=0 ANNA_CHART_FOCUS=26
export ANNA_TRAINING_PROMPT_VERSION=18 ANNA_REFERENCE_KNOWLEDGE=19 ANNA_EVAL_DATE=2026-11-09
export ANNA_METHODICS_FILE="$ROOT/methodics.json" ANNA_METHODICS_SHA256=16089c6fb654a2e81c451094b5d85eda65d6692002dcbf281a1ea90f918de06e
cd "$SOURCE"
for pair in 'anna-v19 parent' 'anna-v26 candidate'; do
  read -r model prefix <<< "$pair"
  for set in 'holdout fresh' 'regression exposed'; do
    read -r input label <<< "$set"
    stage "$prefix-$label"
    run_check node training/eval-serving.mjs "$model" "$ROOT/$input.jsonl" "$ROOT/reports/$prefix-$label" > "$ROOT/reports/$prefix-$label.log" 2>&1
  done
  stage "$prefix-chat"
  run_check node training/eval-chat.js "$model" "$ROOT/reports/$prefix-chat.md" > "$ROOT/reports/$prefix-chat.log" 2>&1
  stage "$prefix-natal"
  run_check node training/eval-natal.js "$model" "$ROOT/natal-plan.json" "$ROOT/reports/$prefix-natal.md" --knowledge /home/ubuntu/natal-training-v4/knowledge > "$ROOT/reports/$prefix-natal.log" 2>&1
done
stage candidate-development
run_check node training/eval-serving.mjs anna-v26 "$ROOT/cards.jsonl" "$ROOT/reports/candidate-development" > "$ROOT/reports/candidate-development.log" 2>&1
stage integrity
(cd "$ROOT"; sha256sum -c input-sha256.txt) > "$ROOT/reports/input-integrity.log"
sha256sum -c "$ROOT/source-sha256.txt" > "$ROOT/reports/source-integrity.log"
sha256sum -c "$TRAIN/reports/parent-before.sha256" >> "$ROOT/reports/parent-integrity.log"
node training/report-serving-v26.mjs "$ROOT" > "$ROOT/reports/summary.log" 2>&1
restore_owned >> "$ROOT/reports/serving-restore.log" 2>&1
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
curl -fsS --max-time 20 https://xn--80axddamoif3i.xn--p1ai/api/health > "$ROOT/reports/public-health.json"
printf 'SERVING_CHECKS_COMPLETE_REVIEW_REQUIRED %s\n' "$(date -Is)" > "$ROOT/reports/status.txt"
