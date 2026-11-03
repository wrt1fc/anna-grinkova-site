"""CPU-only preflight. Reject truncation before reserving the server GPU."""
import json
import sys
from collections.abc import Mapping
from pathlib import Path
from transformers import AutoTokenizer

data, report = map(Path, sys.argv[1:3])
tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen3.5-4B', local_files_only=True)
result = {}
for split in ('train', 'eval'):
    rows = [json.loads(line) for line in (data / (split + '.jsonl')).read_text().splitlines() if line.strip()]
    sizes = []
    for row in rows:
        encoded = tokenizer.apply_chat_template(row['prompt'] + row['completion'], tokenize=True, return_dict=False)
        ids = encoded['input_ids'] if isinstance(encoded, Mapping) else encoded
        if ids and isinstance(ids[0], list):
            assert len(ids) == 1, 'Unexpected batch'
            ids = ids[0]
        assert len(ids) > 100, 'Not a token sequence; preflight cannot be trusted'
        sizes.append(len(ids))
    result[split] = {'count': len(rows), 'max_total': max(sizes), 'total': sum(sizes)}
assert result['train']['count'] == 327, result
assert max(row['max_total'] for row in result.values()) + 32 <= 4608, result
report.write_text(json.dumps(result, indent=2))
print(json.dumps(result))
