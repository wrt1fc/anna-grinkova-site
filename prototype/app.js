const pages = [...document.querySelectorAll('[data-page]')];
const navigation = [...document.querySelectorAll('[data-nav], [data-mobile-nav]')];
const dialog = document.getElementById('signup-dialog');
const authForm = document.getElementById('signup-form');
const emailInput = document.getElementById('signup-email');
const passwordInput = document.getElementById('signup-password');
const formMessage = document.getElementById('form-message');
let focusBeforeDialog = null;
let authMode = 'login';

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, credentials: 'same-origin' });
  return { response, data: await response.json() };
}

function showRoute() {
  const hash = window.location.hash.replace('#', '');
  const page = ['day', 'week', 'plans', 'account'].includes(hash) ? hash : 'home';
  for (const element of pages) element.hidden = element.dataset.page !== page;
  for (const element of navigation) {
    const navPage = element.dataset.nav || element.dataset.mobileNav;
    if (navPage === page || (hash === 'about' && navPage === 'about')) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  }
  document.title = { home: 'Анна Гринькова — пространство прогнозов', day: 'Карта дня — Анна Гринькова', week: 'Прогноз на неделю — Анна Гринькова', plans: 'Варианты доступа — Анна Гринькова', account: 'Личный кабинет — Анна Гринькова' }[page];
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (hash === 'about') requestAnimationFrame(() => document.getElementById('about').scrollIntoView({ behavior: 'smooth' }));
  if (page === 'account') refreshAccount();
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === 'register';
  document.getElementById('signup-title').textContent = register ? 'Создать аккаунт' : 'Войти в кабинет';
  document.getElementById('auth-description').textContent = register ? 'Сохраните профиль, чтобы позже получать персональные прогнозы.' : 'Войдите, чтобы увидеть профиль и доступ к прогнозам.';
  document.getElementById('auth-submit').firstChild.textContent = register ? 'Создать аккаунт ' : 'Войти ';
  document.getElementById('auth-switch').textContent = register ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт';
  passwordInput.autocomplete = register ? 'new-password' : 'current-password';
  formMessage.textContent = '';
}

function openSignup(event) {
  focusBeforeDialog = event.currentTarget;
  dialog.hidden = false;
  document.body.classList.add('dialog-open');
  setAuthMode('login');
  emailInput.focus();
}

function closeSignup() {
  dialog.hidden = true;
  document.body.classList.remove('dialog-open');
  authForm.reset();
  if (focusBeforeDialog) focusBeforeDialog.focus();
}

document.querySelectorAll('[data-open-signup]').forEach((button) => button.addEventListener('click', openSignup));
document.querySelectorAll('[data-close-signup]').forEach((button) => button.addEventListener('click', closeSignup));
document.getElementById('auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeSignup(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.hidden) closeSignup();
  if (event.key !== 'Tab' || dialog.hidden) return;
  const focusable = [...dialog.querySelectorAll('button, input')];
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('auth-submit');
  button.disabled = true;
  formMessage.textContent = 'Проверяем данные…';
  try {
    const { response, data } = await api(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }) });
    if (!response.ok) { formMessage.textContent = data.message || 'Не удалось войти. Проверьте данные.'; return; }
    closeSignup();
    window.location.hash = 'account';
    refreshAccount();
  } catch { formMessage.textContent = 'Сервис недоступен. Попробуйте позже.'; }
  finally { button.disabled = false; }
});

function renderAccount(data) {
  const user = data?.user;
  document.getElementById('account-heading').textContent = user ? 'Вы в кабинете' : 'Войдите в кабинет';
  document.getElementById('account-email').textContent = user ? user.email : 'Создайте аккаунт, чтобы подготовить профиль для персонального прогноза.';
  document.getElementById('account-login').hidden = !!user;
  document.getElementById('account-logout').hidden = !user;
  document.getElementById('birth-card').hidden = !user;
  if (user && data.birthProfile) {
    const form = document.getElementById('birth-form');
    for (const key of ['birthDate', 'birthTime', 'birthPlace']) form.elements[key].value = data.birthProfile[key];
  }
  const container = document.getElementById('account-access');
  container.replaceChildren();
  if (!user) { const p = document.createElement('p'); p.textContent = 'Для просмотра доступа войдите в кабинет.'; container.append(p); return; }
  for (const feature of ['day', 'week']) {
    const right = data.entitlements.find((item) => item.feature === feature);
    const row = document.createElement('p'); row.className = 'access-row';
    const title = document.createElement('strong'); title.textContent = feature === 'day' ? 'Прогноз на день' : 'Прогноз на неделю';
    const state = document.createElement('span'); state.textContent = right ? `Доступ до ${new Date(right.endsAt).toLocaleDateString('ru-RU')}` : 'Нет доступа';
    row.append(title, state); container.append(row);
  }
  const note = document.createElement('p'); note.className = 'account-small-note';
  note.textContent = 'Персональные прогнозы ещё разрабатываются. Активный доступ пока не открывает текст прогноза.';
  container.append(note);
}

async function refreshAccount() {
  try { const { response, data } = await api('/api/me'); renderAccount(response.ok ? data : null); }
  catch { renderAccount(null); }
}

document.getElementById('account-logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* refresh handles unavailable service */ }
  await refreshAccount();
});

document.getElementById('birth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('birth-message');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  message.textContent = 'Сохраняем…';
  try {
    const profile = Object.fromEntries(new FormData(form));
    const { response, data } = await api('/api/profile', { method: 'PUT', body: JSON.stringify(profile) });
    message.textContent = response.ok ? 'Данные рождения сохранены.' : data.message || 'Не удалось сохранить данные.';
  } catch { message.textContent = 'Сервис недоступен. Попробуйте позже.'; }
  finally { button.disabled = false; }
});

async function renderPlans() {
  const list = document.getElementById('plans-list');
  try {
    const { data } = await api('/api/plans');
    for (const plan of data.plans) {
      const card = document.createElement('article'); card.className = 'plan-card';
      const tag = document.createElement('span'); tag.className = 'subtle-tag'; tag.textContent = plan.id === 'day' ? 'Первый запуск' : 'Следующий этап';
      const title = document.createElement('h2'); title.textContent = plan.title;
      const description = document.createElement('p'); description.textContent = plan.description;
      const terms = document.createElement('p'); terms.className = 'plan-terms'; terms.textContent = `Доступ на ${plan.durationDays} ${plan.durationDays === 1 ? 'день' : 'дней'}`;
      const price = document.createElement('p'); price.className = 'plan-price'; price.textContent = plan.priceKopeks ? `${(plan.priceKopeks / 100).toLocaleString('ru-RU')} ₽` : 'Цена появится позже';
      const link = document.createElement('a'); link.className = 'inline-action'; link.href = '#account'; link.textContent = 'Перейти в кабинет ↗';
      card.append(tag, title, description, terms, price, link); list.append(card);
    }
  } catch { const p = document.createElement('p'); p.textContent = 'Не удалось загрузить варианты доступа.'; list.append(p); }
}

window.addEventListener('hashchange', showRoute);
showRoute();
renderPlans();
