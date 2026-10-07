const UNISENDER_ENDPOINT = 'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10_000;
const FROM_NAME = 'Анна Гринькова';

function letter(purpose, code) {
  const subject = purpose === 'reset' ? 'Код для смены пароля' : 'Код подтверждения почты';
  const text = purpose === 'reset'
    ? `Код для смены пароля: ${code}. Он действует 10 минут. Если вы не запрашивали смену пароля, проигнорируйте письмо.`
    : `Код подтверждения почты: ${code}. Он действует 10 минут. Если вы не создавали аккаунт, проигнорируйте письмо.`;
  return { subject, text };
}

// Unisender Go: servers in Russia, the main sender for Russian mailboxes.
export function createUnisenderGoMailer({ apiKey, fromEmail, fetchImpl = fetch }) {
  if (!apiKey || !fromEmail) return null;
  return {
    name: 'unisender',
    async sendCode({ to, purpose, code }) {
      const { subject, text } = letter(purpose, code);
      const response = await fetchImpl(UNISENDER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ message: {
          recipients: [{ email: to }], subject, body: { plaintext: text },
          from_email: fromEmail, from_name: FROM_NAME,
          skip_unsubscribe: 1, global_language: 'ru',
        } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Mail API HTTP ${response.status}`);
      const data = await response.json();
      if (data.status !== 'success' || !data.emails?.includes(to)) throw new Error('Mail API rejected recipient');
    },
  };
}

// Brevo (EU servers): sender for foreign mailboxes such as Gmail, Outlook and iCloud.
export function createBrevoMailer({ apiKey, fromEmail, fetchImpl = fetch }) {
  if (!apiKey || !fromEmail) return null;
  return {
    name: 'brevo',
    async sendCode({ to, purpose, code }) {
      const { subject, text } = letter(purpose, code);
      const response = await fetchImpl(BREVO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': apiKey },
        body: JSON.stringify({ sender: { email: fromEmail, name: FROM_NAME }, to: [{ email: to }], subject, textContent: text,
          tags: ['auth-code'] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Brevo HTTP ${response.status}`);
      const data = await response.json();
      if (!data.messageId) throw new Error('Brevo returned no message id');
    },
  };
}

// Russian mail services and national zones go through the Russian sender; everything else abroad.
const RUSSIAN_DOMAINS = new Set(['mail.ru', 'bk.ru', 'list.ru', 'inbox.ru', 'internet.ru', 'yandex.ru', 'ya.ru', 'yandex.com', 'yandex.by',
  'yandex.kz', 'rambler.ru', 'lenta.ru', 'autorambler.ru', 'ro.ru', 'myrambler.ru']);
const RUSSIAN_ZONES = /\.(ru|su|xn--p1ai|рф)$/i;
export function isRussianMailbox(email) {
  const domain = String(email).split('@').pop().toLowerCase();
  return RUSSIAN_DOMAINS.has(domain) || RUSSIAN_ZONES.test(domain);
}

// Picks the sender by mailbox. A failed foreign send is retried through the Russian sender, so a code still arrives.
// Russian mailboxes stay on Russian servers (152-ФЗ: no cross-border transfer) unless ruFallbackAbroad is switched on.
export function createMailRouter({ ru = null, intl = null, ruFallbackAbroad = false }) {
  if (!ru || !intl) return ru ?? intl;
  return {
    name: 'router',
    async sendCode(message) {
      const russian = isRussianMailbox(message.to);
      const [first, second] = russian ? [ru, ruFallbackAbroad ? intl : null] : [intl, ru];
      try {
        return await first.sendCode(message);
      } catch (error) {
        if (!second) throw error;
        console.warn(`Mail via ${first.name} failed (${error.message}); retrying via ${second.name}`);
        return second.sendCode(message);
      }
    },
  };
}
