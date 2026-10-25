// Payment links and access come from authenticated API responses, never from URL return parameters.
(() => {
  const route = document.getElementById('route-subscription');
  const links = [...route.querySelectorAll('[data-subscribe-id]')];
  const status = document.getElementById('subscription-status');
  const login = document.getElementById('subscription-login');
  const check = document.getElementById('subscription-check');
  const entry = document.getElementById('account-subscription-status');
  const current = document.getElementById('subscription-current-title');
  const currentNote = document.getElementById('subscription-current-note');
  const email = document.getElementById('subscription-email');
  const accountNote = document.getElementById('subscription-account-note');
  let user = null, request = null, generation = 0, ready = false, lastLoaded = 0;
  const active = () => !route.hidden || !document.getElementById('route-account').hidden;
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

  function clearLinks(busy = false) {
    ready = false;
    for (const link of links) {
      link.href = '/podpiska#subscription-account';
      link.removeAttribute('target');
      if (busy || user) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
    }
  }
  function guest() {
    request?.abort(); request = null; generation++; lastLoaded = 0;
    clearLinks(); status.textContent = '';
    current.textContent = 'Бесплатный доступ после входа';
    currentNote.textContent = 'Карта дня и прогноз на неделю доступны всем. После входа — 5 сообщений помощнику в день.';
    entry.textContent = '60 сообщений в день · от 990 ₽ за 30 дней';
    email.textContent = 'Войдите, чтобы оформить подписку';
    accountNote.textContent = 'Подписка привяжется к вашему аккаунту. Укажите ту же почту в платёжной форме.';
    login.hidden = false; check.hidden = true;
  }
  function renderPlan(plan) {
    if (!plan || typeof plan.label !== 'string' || !Number.isInteger(plan.dailyChatMessages)) throw new Error('invalid_plan');
    const paid = plan.id !== 'free';
    const until = Number(plan.expiresAt);
    const period = paid && Number.isFinite(until) && until > 0 ? ` до ${date.format(until)}` : '';
    current.textContent = paid ? `${plan.label} активна${period}` : 'Сейчас у вас бесплатный доступ';
    currentNote.textContent = paid
      ? `${plan.dailyChatMessages} сообщений помощнику в день. ${plan.id === 'subscription' ? 'Оплата добавит выбранный срок к действующей подписке.' : 'После оплаты будет доступна подписка на выбранный срок.'}`
      : `Карта дня, прогноз на неделю и ${plan.dailyChatMessages} сообщений помощнику в день остаются доступны бесплатно.`;
    entry.textContent = paid ? `${plan.label}${period} · ${plan.dailyChatMessages} сообщений в день` : `Сейчас: бесплатный доступ · ${plan.dailyChatMessages} сообщений в день`;
    return paid;
  }
  function paymentUrl(item) {
    const url = new URL(item.payUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'payform.ru' || url.username || url.password
      || url.searchParams.get('customer_email') !== user.email) throw new Error('invalid_payment_link');
    return url.href;
  }
  async function refresh(force = false) {
    if (!user || !active() || (request && !force) || (!force && Date.now() - lastLoaded < 5000)) return;
    request?.abort(); const controller = new AbortController(); request = controller;
    const turn = ++generation; const owner = user.id;
    const timeout = setTimeout(() => controller.abort(), 15000);
    clearLinks(true); check.disabled = true; status.textContent = 'Проверяем подписку…';
    try {
      const options = { credentials: 'same-origin', cache: 'no-store', signal: controller.signal };
      const responses = await Promise.all([fetch('/api/billing/subscription', options), fetch('/api/billing/subscription-links', options)]);
      if (responses.some(r => r.status === 401)) { if (turn === generation) { user = null; guest(); window.refreshAccount?.(); } return; }
      // Keep the real plan visible even if the payment provider is temporarily unavailable.
      if (!responses[0].ok) throw new Error('subscription_unavailable');
      const state = await responses[0].json();
      if (turn !== generation || user?.id !== owner) return;
      const paid = renderPlan(state.plan);
      if (!responses[1].ok) throw new Error('links_unavailable');
      const catalog = await responses[1].json();
      if (turn !== generation || user?.id !== owner) return;
      const offered = links.map(link => {
        const item = catalog.links?.find(item => item.id === link.dataset.subscribeId);
        if (!item || !Number.isFinite(item.priceRub) || item.priceRub <= 0 || ![30, 90].includes(item.periodDays)) throw new Error('invalid_catalog');
        return { link, item, url: paymentUrl(item) };
      });
      for (const { link, item, url } of offered) {
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.removeAttribute('aria-disabled');
        link.closest('.subscription-period').querySelector('.subscription-price').textContent = `${item.priceRub} ₽`;
      }
      ready = true; lastLoaded = Date.now(); status.textContent = paid ? 'Подписка активна. Доступ обновлён.' : '';
    } catch (error) {
      if (turn !== generation) return;
      clearLinks(); status.textContent = 'Не удалось загрузить оплату. Попробуйте проверить ещё раз.';
    } finally {
      clearTimeout(timeout);
      if (turn === generation) { request = null; check.disabled = false; }
    }
  }
  for (const link of links) link.addEventListener('click', event => {
    if (ready && user) return;
    event.preventDefault();
    if (!user) login.click();
    else { status.textContent = request ? 'Подождите, загружаем оплату…' : 'Оплата сейчас недоступна. Нажмите «Проверить подписку и оплату».'; status.focus(); }
  });
  check.addEventListener('click', () => refresh(true));
  document.addEventListener('anna-account-state', event => {
    const next = event.detail.signedIn ? { id: event.detail.userId, email: event.detail.email } : null;
    if (next?.id !== user?.id) { user = next; guest(); }
    user = next;
    if (!user) { guest(); return; }
    email.textContent = user.email;
    accountNote.textContent = 'В форме оплаты используйте эту же почту — так подписка появится в вашем кабинете.';
    login.hidden = true; check.hidden = false;
    refresh();
  });
  document.addEventListener('anna-route', () => refresh());
  window.addEventListener('focus', () => refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  guest();
  // A fast /api/me response may arrive before this deferred script is downloaded.
  if (document.body.dataset.signedIn === 'true') window.refreshAccount?.();
})();
