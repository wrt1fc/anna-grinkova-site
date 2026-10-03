const ENDPOINT = 'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json';

export function createUnisenderGoMailer({ apiKey, fromEmail, fetchImpl = fetch }) {
  if (!apiKey || !fromEmail) return null;
  return {
    async sendCode({ to, purpose, code }) {
      const subject = purpose === 'reset' ? 'Код для смены пароля' : 'Код подтверждения почты';
      const message = purpose === 'reset'
        ? `Код для смены пароля: ${code}. Он действует 10 минут. Если вы не запрашивали смену пароля, проигнорируйте письмо.`
        : `Код подтверждения почты: ${code}. Он действует 10 минут. Если вы не создавали аккаунт, проигнорируйте письмо.`;
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ message: {
          recipients: [{ email: to }], subject, body: { plaintext: message },
          from_email: fromEmail, from_name: 'Анна Гринькова',
          skip_unsubscribe: 1, global_language: 'ru',
        } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Mail API HTTP ${response.status}`);
      const data = await response.json();
      if (data.status !== 'success' || !data.emails?.includes(to)) throw new Error('Mail API rejected recipient');
    },
  };
}
