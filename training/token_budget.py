"""Fail before model loading if token truncation would discard training data."""
from collections.abc import Mapping


def sequence_length(tokenizer, row):
    encoded = tokenizer.apply_chat_template(
        row['prompt'] + row['completion'], tokenize=True, return_dict=False)
    ids = encoded['input_ids'] if isinstance(encoded, Mapping) else encoded
    if ids and isinstance(ids[0], list):
        if len(ids) != 1:
            raise ValueError('Unexpected token batch')
        ids = ids[0]
    if not isinstance(ids, (list, tuple)) or not ids or not all(isinstance(i, int) for i in ids):
        raise ValueError('Tokenizer did not return a token sequence')
    return len(ids)


def inspect_budget(tokenizer, rows, max_length, reserve=32):
    if max_length <= reserve or reserve < 0:
        raise ValueError('Invalid token budget')
    lengths = []
    violations = []
    for index, row in enumerate(rows):
        length = sequence_length(tokenizer, row)
        lengths.append(length)
        if length + reserve > max_length:
            violations.append({'id': row.get('id', str(index)), 'tokens': length})
    if not lengths:
        raise ValueError('Empty training split')
    return {'count': len(lengths), 'max_total': max(lengths), 'total': sum(lengths),
            'max_length': max_length, 'reserve': reserve, 'violations': violations}


def require_budget(report):
    for split, stats in report.items():
        if stats['violations']:
            raise ValueError(f"{split}: {len(stats['violations'])} examples exceed the "
                             f"{stats['max_length']}-token budget. Refusing to truncate answers "
                             "or silently discard examples; shorten their input context first.")
