const pages = [...document.querySelectorAll('[data-page]')];
const navigation = [...document.querySelectorAll('[data-nav], [data-mobile-nav]')];
const dialog = document.getElementById('signup-dialog');
const authForm = document.getElementById('signup-form');
const emailInput = document.getElementById('signup-email');
const passwordInput = document.getElementById('signup-password');
const confirmInput = document.getElementById('signup-confirm');
const codeInput = document.getElementById('signup-code');
const formMessage = document.getElementById('form-message');
const passwordRules = document.getElementById('password-rules');
let authMode = 'login';
let challenge = null;
let currentUser = null;
let focusBeforeDialog = null;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, credentials: 'same-origin' });
  return { response, data: await response.json() };
}

function showRoute() {
  const hash = window.location.hash.replace('#', '');
  const page = ['day', 'week', 'account'].includes(hash) ? hash : 'home';
  if (hash && !['home', 'day', 'week', 'account', 'about'].includes(hash)) history.replaceState(null, '', '#home');
  for (const element of pages) element.hidden = element.dataset.page !== page;
  for (const element of navigation) {
    const navPage = element.dataset.nav || element.dataset.mobileNav;
    if (navPage === page || (hash === 'about' && navPage === 'about')) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  }
  document.title = { home: 'Анна Гринькова — пространство прогнозов', day: 'Карта дня — Анна Гринькова', week: 'Прогноз на неделю — Анна Гринькова', account: 'Личный кабинет — Анна Гринькова' }[page];
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (hash === 'about') requestAnimationFrame(() => document.getElementById('about').scrollIntoView({ behavior: 'smooth' }));
  if (page === 'account') refreshAccount();
}

const modes = {
  login: { title: 'Войти в кабинет', description: 'Введите email и пароль.', submit: 'Войти', fields: ['email', 'password'], switch: 'Создать аккаунт' },
  register: { title: 'Создать аккаунт', description: 'Придумайте пароль и подтвердите почту кодом.', submit: 'Получить код', fields: ['email', 'password', 'confirm'], switch: 'Уже есть аккаунт? Войти' },
  verify: { title: 'Подтвердить почту', description: 'Введите шестизначный код из письма. Он действует 10 минут.', submit: 'Подтвердить', fields: ['code'], switch: 'Вернуться ко входу' },
  'verify-existing': { title: 'Подтвердить почту', description: 'Введите шестизначный код из письма. Он действует 10 минут.', submit: 'Подтвердить', fields: ['code'], switch: 'Вернуться в кабинет' },
  'reset-request': { title: 'Сменить пароль', description: 'Отправим код на почту, привязанную к аккаунту.', submit: 'Получить код', fields: ['email'], switch: 'Вернуться ко входу' },
  'reset-confirm': { title: 'Новый пароль', description: 'Введите код из письма и придумайте новый пароль.', submit: 'Сохранить пароль', fields: ['code', 'password', 'confirm'], switch: 'Вернуться ко входу' },
};

function passwordChecks(value) {
  return {
    length: [...value].length >= 8 && [...value].length <= 128,
    uppercase: /\p{Lu}/u.test(value),
    digit: /\p{Nd}/u.test(value),
    special: /[^\p{L}\p{N}\s]/u.test(value),
  };
}

function updatePasswordRules() {
  const checks = passwordChecks(passwordInput.value);
  for (const item of passwordRules.querySelectorAll('[data-password-rule]')) {
    item.classList.toggle('met', checks[item.dataset.passwordRule]);
  }
  return Object.values(checks).every(Boolean);
}

function setAuthMode(mode) {
  authMode = mode;
  const config = modes[mode];
  document.getElementById('signup-title').textContent = config.title;
  document.getElementById('auth-description').textContent = config.description;
  document.getElementById('auth-submit').firstChild.textContent = `${config.submit} `;
  document.getElementById('auth-switch').textContent = config.switch;
  for (const field of ['email', 'password', 'confirm', 'code']) {
    const visible = config.fields.includes(field);
    document.getElementById(`${field}-field`).hidden = !visible;
    ({ email: emailInput, password: passwordInput, confirm: confirmInput, code: codeInput })[field].required = visible;
  }
  passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  const creatingPassword = mode === 'register' || mode === 'reset-confirm';
  passwordInput.minLength = creatingPassword ? 8 : 0;
  passwordRules.hidden = !creatingPassword;
  updatePasswordRules();
  document.getElementById('auth-forgot').hidden = mode !== 'login';
  document.getElementById('auth-resend').hidden = !['verify', 'verify-existing', 'reset-confirm'].includes(mode);
  formMessage.textContent = '';
}

function openSignup(event, mode = 'login') {
  if (mode === 'login' && currentUser && event.currentTarget.classList.contains('header-entry')) {
    window.location.hash = 'account';
    return;
  }
  focusBeforeDialog = event.currentTarget;
  dialog.hidden = false;
  document.body.classList.add('dialog-open');
  setAuthMode(mode);
  (modes[mode].fields.includes('email') ? emailInput : codeInput).focus();
}

function closeSignup() {
  dialog.hidden = true;
  document.body.classList.remove('dialog-open');
  authForm.reset();
  challenge = null;
  for (const toggle of document.querySelectorAll('[data-toggle-password]')) {
    document.getElementById(toggle.dataset.togglePassword).type = 'password';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', toggle.dataset.togglePassword === 'signup-confirm' ? 'Показать подтверждение пароля' : 'Показать пароль');
  }
  if (focusBeforeDialog) focusBeforeDialog.focus();
}

document.querySelectorAll('[data-open-signup]').forEach((button) => button.addEventListener('click', (event) => openSignup(event)));
document.querySelectorAll('[data-close-signup]').forEach((button) => button.addEventListener('click', closeSignup));
document.getElementById('auth-switch').addEventListener('click', () => {
  if (authMode === 'login') setAuthMode('register');
  else if (authMode === 'verify-existing') closeSignup();
  else setAuthMode('login');
});
document.getElementById('auth-forgot').addEventListener('click', () => {
  passwordInput.value = confirmInput.value = '';
  setAuthMode('reset-request');
});
document.querySelectorAll('[data-toggle-password]').forEach((toggle) => toggle.addEventListener('click', () => {
  const input = document.getElementById(toggle.dataset.togglePassword);
  const showing = input.type === 'password';
  input.type = showing ? 'text' : 'password';
  toggle.setAttribute('aria-pressed', String(showing));
  toggle.setAttribute('aria-label', `${showing ? 'Скрыть' : 'Показать'} ${input === confirmInput ? 'подтверждение пароля' : 'пароль'}`);
  input.focus();
}));
passwordInput.addEventListener('input', updatePasswordRules);
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeSignup(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.hidden) closeSignup();
  if (event.key !== 'Tab' || dialog.hidden) return;
  const focusable = [...dialog.querySelectorAll('button, input')].filter((element) => element.getClientRects().length);
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

async function sendRegistration() {
  if (!updatePasswordRules()) { formMessage.textContent = 'Пароль: от 8 символов, с заглавной буквой, цифрой и спецсимволом.'; return; }
  if (passwordInput.value !== confirmInput.value) { formMessage.textContent = 'Пароли не совпадают.'; return; }
  const { response, data } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: emailInput.value, password: passwordInput.value, confirmPassword: confirmInput.value }) });
  if (!response.ok) { formMessage.textContent = data.message || 'Не удалось отправить код.'; return; }
  challenge = data.challenge;
  setAuthMode('verify');
  formMessage.textContent = data.message;
  codeInput.focus();
}

async function requestReset() {
  const { response, data } = await api('/api/auth/reset/request', { method: 'POST', body: JSON.stringify({ email: emailInput.value }) });
  if (!response.ok) { formMessage.textContent = data.message || 'Не удалось отправить код.'; return; }
  if (data.challenge) challenge = data.challenge;
  setAuthMode('reset-confirm');
  formMessage.textContent = data.message;
  codeInput.focus();
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('auth-submit');
  button.disabled = true;
  formMessage.textContent = 'Проверяем данные…';
  try {
    if (authMode === 'register') { await sendRegistration(); return; }
    if (authMode === 'reset-request') { await requestReset(); return; }
    if (authMode === 'reset-confirm' && !updatePasswordRules()) { formMessage.textContent = 'Пароль: от 8 символов, с заглавной буквой, цифрой и спецсимволом.'; return; }
    if (authMode === 'reset-confirm' && passwordInput.value !== confirmInput.value) { formMessage.textContent = 'Пароли не совпадают.'; return; }
    const path = { login: '/api/auth/login', verify: '/api/auth/register/verify', 'verify-existing': '/api/auth/email/verify', 'reset-confirm': '/api/auth/reset/confirm' }[authMode];
    const body = authMode === 'login' ? { email: emailInput.value, password: passwordInput.value }
      : authMode === 'reset-confirm' ? { challenge, code: codeInput.value, password: passwordInput.value, confirmPassword: confirmInput.value }
        : { challenge, code: codeInput.value };
    const { response, data } = await api(path, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) { formMessage.textContent = data.message || 'Не удалось завершить действие.'; return; }
    if (authMode === 'reset-confirm') {
      passwordInput.value = confirmInput.value = codeInput.value = '';
      setAuthMode('login');
      formMessage.textContent = data.message;
      await refreshAccount();
    } else {
      closeSignup();
      window.location.hash = 'account';
      await refreshAccount();
    }
  } catch { formMessage.textContent = 'Сервис недоступен. Попробуйте позже.'; }
  finally { button.disabled = false; }
});

document.getElementById('auth-resend').addEventListener('click', async () => {
  formMessage.textContent = 'Отправляем код…';
  try {
    if (authMode === 'verify') await sendRegistration();
    else if (authMode === 'reset-confirm') await requestReset();
    else if (authMode === 'verify-existing') {
      const { response, data } = await api('/api/auth/email/request', { method: 'POST', body: '{}' });
      if (response.ok) challenge = data.challenge;
      formMessage.textContent = data.message || 'Не удалось отправить код.';
    }
  } catch { formMessage.textContent = 'Сервис недоступен. Попробуйте позже.'; }
});

function renderAccount(data) {
  currentUser = data?.user || null;
  document.getElementById('account-heading').textContent = currentUser ? 'Вы в кабинете' : 'Войдите в кабинет';
  document.getElementById('account-email').textContent = currentUser ? currentUser.email : 'Создайте аккаунт, чтобы подготовить профиль для персонального прогноза.';
  document.getElementById('account-login').hidden = !!currentUser;
  document.getElementById('account-logout').hidden = !currentUser;
  document.getElementById('birth-card').hidden = !currentUser;
  document.getElementById('account-change-password').hidden = !currentUser;
  document.getElementById('account-verify-email').hidden = !currentUser || currentUser.emailVerified;
  document.getElementById('email-status').textContent = currentUser
    ? currentUser.emailVerified ? 'Почта подтверждена.' : 'Почта ещё не подтверждена.'
    : 'Войдите, чтобы управлять аккаунтом.';
  if (currentUser && data.birthProfile) {
    const form = document.getElementById('birth-form');
    for (const key of ['birthDate', 'birthTime', 'birthPlace']) form.elements[key].value = data.birthProfile[key];
  }
}

async function refreshAccount() {
  try { const { response, data } = await api('/api/me'); renderAccount(response.ok ? data : null); }
  catch { renderAccount(null); }
}

document.getElementById('account-logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* refresh handles unavailable service */ }
  await refreshAccount();
});
document.getElementById('account-change-password').addEventListener('click', (event) => {
  openSignup(event, 'reset-request');
  emailInput.value = currentUser.email;
});
document.getElementById('account-verify-email').addEventListener('click', async (event) => {
  const message = document.getElementById('security-message');
  message.textContent = 'Отправляем код…';
  try {
    const { response, data } = await api('/api/auth/email/request', { method: 'POST', body: '{}' });
    if (!response.ok) { message.textContent = data.message || 'Не удалось отправить код.'; return; }
    openSignup(event, 'verify-existing');
    challenge = data.challenge;
    formMessage.textContent = data.message;
    message.textContent = '';
  } catch { message.textContent = 'Сервис недоступен. Попробуйте позже.'; }
});

document.getElementById('birth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('birth-message');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  message.textContent = 'Сохраняем…';
  try {
    const { response, data } = await api('/api/profile', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    message.textContent = response.ok ? 'Данные рождения сохранены.' : data.message || 'Не удалось сохранить данные.';
  } catch { message.textContent = 'Сервис недоступен. Попробуйте позже.'; }
  finally { button.disabled = false; }
});

window.addEventListener('hashchange', showRoute);
showRoute();
