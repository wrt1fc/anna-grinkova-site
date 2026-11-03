"""CPU-only preflight. Reject truncation before reserving the server GPU."""
import json
import sys
from pathlib import Path
from transformers import AutoTokenizer
from token_budget import inspect_budget, require_budget

data, report = map(Path, sys.argv[1:3])
max_length = int(sys.argv[3]) if len(sys.argv) > 3 else 3400
tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen3.5-4B', local_files_only=True)
result = {}
for split in ('train', 'eval'):
    rows = [json.loads(line) for line in (data / (split + '.jsonl')).read_text().splitlines() if line.strip()]
    result[split] = inspect_budget(tokenizer, rows, max_length)
assert result['train']['count'] == 327, result
report.write_text(json.dumps(result, indent=2))
print(json.dumps({name: {k: v for k, v in stats.items() if k != 'violations'} | {'over_budget': len(stats['violations'])}
                  for name, stats in result.items()}))
require_budget(result)
