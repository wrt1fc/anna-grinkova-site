// The same app in the Telegram host. URL data never authenticates an account.
let webApp = null;
let screen = 'home';

export function updateTelegramBack(name) {
  screen = name;
  if (!webApp) return;
  if (name === 'home') webApp.BackButton?.hide(); else webApp.BackButton?.show();
}

export function startTelegram(goBack) {
  const embedded = /(?:^|[&#?])tgWebApp(?:Data|Version|Platform)=/.test(location.hash + location.search);
  if (!embedded && !window.Telegram?.WebApp?.initData) return;
  const activate = () => {
    webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    document.documentElement.classList.add('telegram-miniapp');
    webApp.ready(); webApp.expand();
    webApp.setHeaderColor?.('#130d0b');
    webApp.setBackgroundColor?.('#130d0b');
    if (webApp.isVersionAtLeast?.('7.10')) webApp.setBottomBarColor?.('#130d0b');
    const safeArea = () => {
      const inset = webApp.contentSafeAreaInset ?? {};
      document.documentElement.style.setProperty('--telegram-top', `${Math.max(0, Number(inset.top) || 0)}px`);
      document.documentElement.style.setProperty('--telegram-bottom', `${Math.max(0, Number(inset.bottom) || 0)}px`);
    };
    safeArea();
    webApp.onEvent?.('contentSafeAreaChanged', safeArea);
    webApp.BackButton?.onClick(goBack);
    updateTelegramBack(screen);
    // Website checkout uses Prodamus; Telegram digital purchases require Stars.
    // Keep active subscriptions usable without sending new purchases outside Telegram.
    for (const name of ['plan', 'pay']) {
      document.getElementById(name === 'plan' ? 'plan-buy' : 'pay-submit')?.addEventListener('click', event => {
        event.preventDefault(); event.stopImmediatePropagation();
        const note = document.querySelector(`[data-screen="${name}"] [data-note]`);
        if (note) note.textContent = 'Покупка подписки внутри Telegram пока недоступна. Активная подписка продолжает действовать.';
      }, { capture: true });
    }
  };
  if (window.Telegram?.WebApp) { activate(); return; }
  // Let the SDK read Telegram's launch hash before the app router replaces it.
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, 5000);
    const sdk = document.createElement('script');
    sdk.src = 'https://telegram.org/js/telegram-web-app.js'; sdk.async = true;
    sdk.onload = () => { clearTimeout(timeout); activate(); resolve(); };
    sdk.onerror = () => { clearTimeout(timeout); resolve(); };
    document.head.append(sdk);
  });
}
