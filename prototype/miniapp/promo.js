import { api } from './api.js';
import { $, app } from './state.js?v=4';

const dialog = () => $('#promo-dialog');
const redeemed = () => app.plan?.plan?.promoQuestion?.redeemed === true;
let pendingCode = '';

export function syncPromoButtons() {
  for (const button of document.querySelectorAll('[data-promo-open]')) button.hidden = redeemed();
}

function showPromo(code = '') {
  if (redeemed() || dialog().open) return false;
  $('#promo-form').hidden = false;
  $('#promo-code').value = code;
  $('#promo-submit').textContent = app.me ? 'Активировать' : 'Войти и активировать';
  $('#promo-close').textContent = 'Позже';
  $('#promo-status').textContent = '';
  dialog().showModal();
  return true;
}

async function redeem(code, onRedeemed) {
  const submit = $('#promo-submit');
  if (submit.disabled) return;
  const account = app.me?.user;
  submit.disabled = true;
  try {
    const { ok, status, data } = await api('/api/promo/redeem', { method: 'POST', body: { code } });
    if (app.me?.user !== account) return;
    if ((ok || data.error === 'promo_already_redeemed') && data.plan?.promoQuestion) {
      app.plan = { ...app.plan, plan: data.plan };
      syncPromoButtons();
      onRedeemed();
      $('#promo-form').hidden = true;
      $('#promo-close').textContent = 'Закрыть';
      if (dialog().open) $('#promo-close').focus();
      $('#promo-status').textContent = ok ? 'Добавлен 1 вопрос к Фортуне.' : data.message;
    } else {
      $('#promo-status').textContent = data.message || (status === 401
        ? 'Сессия истекла. Войди в аккаунт снова.' : 'Не удалось активировать промокод. Попробуй ещё раз.');
    }
  } catch {
    if (app.me?.user === account) $('#promo-status').textContent = 'Не удалось активировать промокод. Попробуй ещё раз.';
  } finally {
    submit.disabled = false;
  }
}

export function bindPromo(onRedeemed) {
  for (const button of document.querySelectorAll('[data-promo-open]')) button.addEventListener('click', () => showPromo());
  $('#promo-close').addEventListener('click', () => dialog().close());
  $('#promo-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = $('#promo-code').value.trim();
    if (!code) { $('#promo-status').textContent = 'Введи промокод.'; return; }
    if (app.me) return redeem(code, onRedeemed);
    pendingCode = code;
    dialog().close();
    app.go('login');
  });
  return () => {
    syncPromoButtons();
    if (!pendingCode || !app.me) return;
    const code = pendingCode;
    pendingCode = '';
    if (showPromo(code)) redeem(code, onRedeemed);
  };
}

export function showOpeningPromo() {
  syncPromoButtons();
  showPromo();
}
