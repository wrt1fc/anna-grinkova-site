#!/bin/bash
# After train.sh: merges the adapter into the base model, converts it to GGUF (q8_0), registers it in Ollama as anna-<version>
# and runs the control checks (natal questions and the general chat set), writing reports into reports/.
# Usage: nohup bash eval-code/training/server/export-eval.sh <version> <knowledge-dir> <eval-plan.json> &
# Example: bash eval-code/training/server/export-eval.sh v5 /home/ubuntu/natal-training-v4/knowledge natal-plan-eval-v5.json
# Needs the free GPU only for the checks; Ollama is started here when it is not running.
# Optional: REPEAT_PENALTY=1.05 adds that value to the model file (Ollama's repeat_penalty) for this model.
set -Eeuo pipefail
VERSION=${1:?version, for example v5}
KNOWLEDGE=${2:?folder with Anna's materials}
PLAN=${3:?plan json with the natal check questions}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PY=${PY:-/home/ubuntu/natal-bench/venv/bin/python}
CONVERTER=${CONVERTER:-/home/ubuntu/natal-training-v4/converter}
export HF_HOME=${HF_HOME:-/home/ubuntu/natal-bench/hf} HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4
STATUS="$ROOT/reports/status.txt"
STAGE=start
trap 'printf "FAILED stage=%s code=%s %s\n" "$STAGE" "$?" "$(date -Is)" > "$STATUS"' ERR
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$1" "$(date -Is)" > "$STATUS"; }
cd "$ROOT/eval-code"

if [ ! -s "$ROOT/anna-$VERSION-q8_0.gguf" ]; then
  stage merge
  "$PY" training/merge_adapter.py --base Qwen/Qwen3.5-4B --adapter "$ROOT/anna-$VERSION" --out "$ROOT/merged-$VERSION"
  stage convert
  "$PY" "$CONVERTER/convert_hf_to_gguf.py" "$ROOT/merged-$VERSION" --outtype q8_0 --outfile "$ROOT/anna-$VERSION-q8_0.gguf"
fi

stage register
{
  printf 'FROM %s\nRENDERER qwen3.5\nPARSER qwen3.5\nPARAMETER temperature 0.25\nPARAMETER top_k 20\nPARAMETER top_p 0.95\n' "$ROOT/anna-$VERSION-q8_0.gguf"
  if [ -n "${REPEAT_PENALTY:-}" ]; then printf 'PARAMETER repeat_penalty %s\n' "$REPEAT_PENALTY"; fi
} > "$ROOT/Modelfile.$VERSION"
if ! systemctl is-active --quiet ollama; then sudo systemctl start ollama; fi
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:11434/api/tags > /dev/null && break; sleep 2; done
ollama create "anna-$VERSION" -f "$ROOT/Modelfile.$VERSION"

# A failed check (exit code 1) is a result, not an error: the report says which answers failed.
stage eval-natal
set +e
node training/eval-natal.js "anna-$VERSION" "$ROOT/$PLAN" "$ROOT/reports/eval-natal-anna-$VERSION.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/eval-natal-anna-$VERSION.log" 2>&1
printf '%s\n' "$?" > "$ROOT/reports/eval-natal-anna-$VERSION.exit"
stage eval-chat
node training/eval-chat.js "anna-$VERSION" "$ROOT/reports/eval-chat-anna-$VERSION.md" > "$ROOT/reports/eval-chat-anna-$VERSION.log" 2>&1
printf '%s\n' "$?" > "$ROOT/reports/eval-chat-anna-$VERSION.exit"
set -e
printf 'CHECKS_COMPLETE %s\n' "$(date -Is)" > "$STATUS"
