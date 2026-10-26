import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_TONES, chatPrompt } from '../server/local-chat.js';

const base = { message: 'Что значит Луна в Раке?', history: [], forecast: { date: '2026-10-26', scope: 'general', subject: null } };

test('the tone is added to the request only when the visitor chose it', () => {
  assert.deepEqual(CHAT_TONES, ['playful']);
  const normal = JSON.parse(chatPrompt(base));
  assert.equal('tone' in normal, false);
  assert.equal('toneInstruction' in normal, false);
  assert.equal('tone' in JSON.parse(chatPrompt({ ...base, tone: 'normal' })), false);
  assert.equal('tone' in JSON.parse(chatPrompt({ ...base, tone: 'unknown' })), false);
  const playful = JSON.parse(chatPrompt({ ...base, tone: 'playful' }));
  assert.equal(playful.tone, 'playful');
  assert.match(playful.toneInstruction, /юмор|ирони/i);
  assert.doesNotMatch(playful.toneInstruction, /сиськ|мат\b/i);
});
