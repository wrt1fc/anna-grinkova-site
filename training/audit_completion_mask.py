"""CPU-only audit of TRL's prompt/completion boundary; no model or GPU load."""
import json
import sys
from pathlib import Path
from transformers import AutoTokenizer


def audit_row(tokenizer, row):
    kwargs = row.get('chat_template_kwargs', {})
    prompt = tokenizer.apply_chat_template(row['prompt'], tokenize=True, add_generation_prompt=True,
                                           return_dict=False, **kwargs)
    full = tokenizer.apply_chat_template(row['prompt'] + row['completion'], tokenize=True,
                                         return_dict=False, **kwargs)
    if isinstance(prompt, dict):
        prompt = prompt['input_ids']
    if isinstance(full, dict):
        full = full['input_ids']
    prefix = 0
    for a, b in zip(prompt, full):
        if a != b:
            break
        prefix += 1
    if prefix != len(prompt):
        raise ValueError(f"Prompt/completion prefix mismatch: {row.get('id')} ({prefix}/{len(prompt)})")
    if len(full) <= prefix:
        raise ValueError(f"Empty supervised completion: {row.get('id')}")
    return {'prompt_tokens': prefix, 'completion_tokens': len(full) - prefix}


def validate_prepared_labels(prepared, boundaries):
    if len(prepared) != len(boundaries):
        raise ValueError('Prepared dataset count changed')
    supervised = 0
    for row, boundary in zip(prepared, boundaries):
        ids, labels = row['input_ids'], row['labels']
        at = boundary['prompt_tokens']
        if len(ids) != len(labels) or len(ids) != at + boundary['completion_tokens']:
            raise ValueError('Prepared token sequence changed')
        if any(label != -100 for label in labels[:at]):
            raise ValueError('Prompt token contributes to loss')
        if labels[at:] != ids[at:]:
            raise ValueError('Completion loss mask changed')
        supervised += len(ids) - at
    return {'count': len(prepared), 'supervised_tokens': supervised, 'prompt_labels_masked': True}


def main():
    data, output = map(Path, sys.argv[1:3])
    tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen3.5-4B', local_files_only=True)
    report = {'status': 'PASS', 'completion_only_loss': True, 'splits': {}}
    for split in ('train', 'eval'):
        rows = [json.loads(line) for line in (data / (split + '.jsonl')).read_text().splitlines() if line.strip()]
        audit = [audit_row(tokenizer, row) for row in rows]
        if not audit:
            raise ValueError('Empty audit split')
        report['splits'][split] = {'count': len(audit), 'prefix_mismatches': 0,
                                  'min_completion_tokens': min(r['completion_tokens'] for r in audit),
                                  'supervised_tokens': sum(r['completion_tokens'] for r in audit)}
    output.write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
