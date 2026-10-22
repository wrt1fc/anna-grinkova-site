const API = 'https://api.telegram.org';
const WELCOME = 'Здравствуйте! Здесь карта дня, прогноз на неделю и вопросы Анне. Откройте приложение кнопкой ниже.';
const COMMANDS = [
  { command: 'start', description: 'Открыть приложение' },
  { command: 'help', description: 'Что здесь можно сделать' },
];
const HELP = 'Карта дня и прогноз на неделю открываются в приложении. Вопрос Анне и личный кабинет — там же, после входа.';

// A thin client of the Telegram Bot API. `fetchImpl` is replaceable, so tests never touch the network.
export function createTelegramBot({ token, publicUrl, fetchImpl = fetch }) {
  if (!token) return null;
  async function call(method, payload) {
    const response = await fetchImpl(`${API}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(`Telegram ${method}: ${body.description ?? response.status}`);
    return body.result;
  }
  const openApp = { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: publicUrl } }]] };

  return {
    // One incoming update (the webhook body). Unknown updates are ignored: Telegram retries anything but a 200.
    async handleUpdate(update) {
      const message = update?.message;
      if (!message?.chat || typeof message.text !== 'string') return 'ignored';
      const command = /^\/(\w+)(?:@\w+)?(?:\s|$)/.exec(message.text)?.[1];
      if (command === 'help') await call('sendMessage', { chat_id: message.chat.id, text: HELP, reply_markup: openApp });
      else await call('sendMessage', { chat_id: message.chat.id, text: WELCOME, reply_markup: openApp });
      return command === 'help' ? 'help' : 'start';
    },
    // Run once after the token is set (scripts/telegram-setup.mjs): the webhook, the menu button and the command list.
    async configure({ webhookUrl, secret }) {
      await call('setWebhook', { url: webhookUrl, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
      await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: publicUrl } } });
      await call('setMyCommands', { commands: COMMANDS });
    },
  };
}
