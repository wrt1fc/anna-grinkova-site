import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUnisenderGoMailer } from '../server/mail.js';

test('Unisender Go adapter sends a transactional code with server-side credentials', async () => {
  let called;
  const mailer = createUnisenderGoMailer({ apiKey: 'private-key', fromEmail: 'no-reply@example.com', fetchImpl: async (url, options) => {
    called = { url, options };
    return { ok: true, async json() { return { status: 'success', emails: ['anna@example.com'] }; } };
  } });
  await mailer.sendCode({ to: 'anna@example.com', purpose: 'registration', code: '123456' });
  assert.equal(called.url, 'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json');
  assert.equal(called.options.headers['X-API-KEY'], 'private-key');
  const body = JSON.parse(called.options.body);
  assert.equal(body.message.recipients[0].email, 'anna@example.com');
  assert.match(body.message.body.plaintext, /123456/);
  assert.equal(body.message.from_email, 'no-reply@example.com');
});
