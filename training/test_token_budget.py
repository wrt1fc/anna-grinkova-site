import unittest
from token_budget import inspect_budget, require_budget, sequence_length


class Tokenizer:
    def __init__(self, mapping=False):
        self.mapping = mapping

    def apply_chat_template(self, messages, **kwargs):
        result = [1] * sum(len(m['content']) for m in messages)
        return {'input_ids': result, 'attention_mask': [1] * len(result)} if self.mapping else result


def row(prompt, completion):
    return {'id': 'case', 'prompt': [{'role': 'user', 'content': 'x' * prompt}],
            'completion': [{'role': 'assistant', 'content': 'y' * completion}]}


class BudgetTests(unittest.TestCase):
    def test_full_answer_and_reserve_must_fit(self):
        report = inspect_budget(Tokenizer(), [row(3200, 168)], 3400)
        require_budget({'train': report})
        self.assertEqual(report['max_total'], 3368)

    def test_long_context_is_rejected_without_mutating_or_dropping_answer(self):
        sample = row(3300, 200)
        report = inspect_budget(Tokenizer(), [sample], 3400)
        with self.assertRaisesRegex(ValueError, 'Refusing to truncate'):
            require_budget({'train': report})
        self.assertEqual(sample['completion'][0]['content'], 'y' * 200)
        self.assertEqual(report['count'], 1)
        self.assertEqual(report['violations'], [{'id': 'case', 'tokens': 3500}])

    def test_mapping_return_is_counted_as_tokens_not_two_dictionary_keys(self):
        self.assertEqual(sequence_length(Tokenizer(mapping=True), row(3300, 200)), 3500)


if __name__ == '__main__':
    unittest.main()
