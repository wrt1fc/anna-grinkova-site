import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_TONES, chatPrompt } from '../server/local-chat.js';

const base = { message: 'Что значит Луна в Раке?', history: [], forecast: { date: '2026-10-26', scope: 'general', subject: null } };

test('friendly humour is the default tone, including legacy normal requests', () => {
  assert.deepEqual(CHAT_TONES, ['playful']);
  const normal = JSON.parse(chatPrompt(base));
  assert.equal(normal.tone, 'playful');
  assert.ok(normal.toneInstruction.length > 0);
  assert.equal(JSON.parse(chatPrompt({ ...base, tone: 'normal' })).tone, 'playful');
  assert.equal('tone' in JSON.parse(chatPrompt({ ...base, tone: 'unknown' })), false);
  const playful = JSON.parse(chatPrompt({ ...base, tone: 'playful' }));
  assert.equal(playful.tone, 'playful');
  assert.match(playful.toneInstruction, /юмор|ирони/i);
  assert.doesNotMatch(playful.toneInstruction, /сиськ|мат\b/i);
});
