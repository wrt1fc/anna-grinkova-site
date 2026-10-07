// Installs the web app shell. Kept separate from the page scripts so the UI work does not touch it.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => console.warn('Service worker not registered:', error.message));
  });
}

// Android/Chrome: keep the install prompt so the UI can offer «Установить приложение» at a good moment.
// iOS Safari has no prompt; the UI shows «Поделиться → На экран „Домой“» instead (see docs/codex-ui-tasks.md).
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.annaInstallPrompt = event;
  document.documentElement.dataset.installable = 'true';
});
window.addEventListener('appinstalled', () => {
  window.annaInstallPrompt = null;
  document.documentElement.dataset.installable = 'false';
});
document.documentElement.dataset.standalone = String(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
