"""No GPU/model. Regression tests for completion-only training boundaries."""
import unittest
from audit_completion_mask import audit_row, validate_prepared_labels


class Tokenizer:
    def apply_chat_template(self, messages, *, tokenize, return_dict,
                            add_generation_prompt=False, enable_thinking=True):
        if add_generation_prompt:
            return [10, 20, 30] if enable_thinking else [10, 20]
        return [10, 20, 40, 50]


class CompletionMaskTest(unittest.TestCase):
    def test_open_thinking_prefix_is_rejected_and_non_thinking_is_accepted(self):
        row = {'id': 'example', 'prompt': [{}], 'completion': [{}]}
        with self.assertRaisesRegex(ValueError, 'prefix mismatch'):
            audit_row(Tokenizer(), row)
        row['chat_template_kwargs'] = {'enable_thinking': False}
        self.assertEqual(audit_row(Tokenizer(), row), {'prompt_tokens': 2, 'completion_tokens': 2})

    def test_prompt_loss_and_missing_completion_loss_fail_closed(self):
        boundaries = [{'prompt_tokens': 2, 'completion_tokens': 2}]
        good = [{'input_ids': [10, 20, 40, 50], 'labels': [-100, -100, 40, 50]}]
        self.assertTrue(validate_prepared_labels(good, boundaries)['prompt_labels_masked'])
        with self.assertRaisesRegex(ValueError, 'Prompt token'):
            validate_prepared_labels([{'input_ids': [10, 20, 40, 50], 'labels': [10, -100, 40, 50]}], boundaries)
        with self.assertRaisesRegex(ValueError, 'Completion loss'):
            validate_prepared_labels([{'input_ids': [10, 20, 40, 50], 'labels': [-100, -100, -100, 50]}], boundaries)


if __name__ == '__main__':
    unittest.main()
