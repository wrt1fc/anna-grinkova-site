import { BRAND, COMMANDS, HELP, WELCOME, VPN_APP_URL } from './branding.js';
const API = 'https://api.telegram.org';

// A thin client of the Telegram Bot API. `fetchImpl` is replaceable, so tests never touch the network.
export function createTelegramBot({ token, publicUrl, fetchImpl = fetch }) {
  if (!token) return null;
  async function call(method, payload) {
    const multipart = payload instanceof FormData;
    const response = await fetchImpl(`${API}/bot${token}/${method}`, {
      method: 'POST', headers: multipart ? {} : { 'Content-Type': 'application/json' }, body: multipart ? payload : JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(`Telegram ${method}: ${body.description ?? response.status}`);
    return body.result;
  }
  const base = publicUrl.replace(/\/$/, '');
  const button = (text, screen = '') => ({ text, web_app: { url: screen ? `${base}/#/${screen}` : publicUrl } });
  const vpnButton = (screen = '') => ({ text: 'Подключение с VPN', web_app: { url: screen ? `${VPN_APP_URL}#/${screen}` : VPN_APP_URL } });
  const openApp = { inline_keyboard: [[button('Открыть приложение')], [vpnButton()], [button('Карта дня', 'card'), button('Прогноз на неделю', 'week')]] };
  function webhookReply(update) {
    const message = update?.message;
    if (!message?.chat || typeof message.text !== 'string' || (message.chat.type && message.chat.type !== 'private')) return null;
    const command = /^\/(\w+)(?:@\w+)?(?:\s|$)/.exec(message.text)?.[1] ?? 'start';
    const sections = {
      card: ['Твоя карта дня. Открой приложение и выбери карту.', 'Выбрать карту', 'card'],
      day: ['Посмотри, чему уделить внимание сегодня.', 'Прогноз на сегодня', 'day'],
      week: ['Выбери день в календаре или прочитай разбор недели.', 'Прогноз на неделю', 'week'],
      chat: ['Расскажи Фортуне, что тебя волнует. Разговор откроется внутри приложения.', 'Задать вопрос', 'chat'],
      profile: ['Твои данные рождения, аккаунт и подписка находятся в профиле приложения.', 'Открыть профиль', 'profile'],
    };
    const section = sections[command];
    return { method: 'sendMessage', chat_id: message.chat.id,
      text: section ? section[0] : command === 'help' ? HELP : WELCOME,
      reply_markup: section ? { inline_keyboard: [[button(section[1], section[2])], [vpnButton(section[2])]] } : openApp };
  }

  return {
    // Telegram executes this response itself; no outgoing connection from the site is needed.
    webhookReply,
    // One incoming update (the webhook body). Unknown updates are ignored: Telegram retries anything but a 200.
    async handleUpdate(update) {
      const reply = webhookReply(update);
      if (!reply) return 'ignored';
      const message = update.message;
      const command = /^\/(\w+)(?:@\w+)?(?:\s|$)/.exec(message.text)?.[1];
      const { method, ...payload } = reply;
      await call(method, payload);
      return command === 'help' ? 'help' : 'start';
    },
    // Run once after the token is set (scripts/telegram-setup.mjs): the webhook, the menu button and the command list.
    async configure({ webhookUrl, secret, profilePhoto = null }) {
      await call('setWebhook', { url: webhookUrl, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: false });
      await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть приложение', web_app: { url: publicUrl } } });
      await call('setMyCommands', { commands: COMMANDS });
      await call('setMyName', { name: BRAND.name });
      await call('setMyDescription', { description: BRAND.description });
      await call('setMyShortDescription', { short_description: BRAND.shortDescription });
      if (profilePhoto) {
        const form = new FormData();
        form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
        form.set('avatar', new Blob([profilePhoto], { type: 'image/png' }), 'fortuna.png');
        await call('setMyProfilePhoto', form);
      }
    },
  };
}
