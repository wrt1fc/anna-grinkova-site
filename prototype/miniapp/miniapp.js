// The «Фортуна» mini-app: routes, sign-in and registration, birth data, help and install screens.
import { api, formatDate } from './api.js';
import { $, app, birth, refreshMe, screenEl, setNote } from './state.js';
import { node } from './sheet.js';
import { pickCity, pickDate, pickTime } from './pickers.js';
import { bindInfo, enterDay, enterHome, enterNatal, enterWeek } from './screens-info.js';
import { bindChat, enterChat, resetChat } from './screens-chat.js';
import { bindPay, bindPeople, enterPay, enterPeople, enterPlan, enterProfile } from './screens-account.js';

const PUBLIC = new Set(['login', 'register', 'code', 'help', 'install']);
const AUTH_SCREENS = new Set(['login', 'register', 'code']);
const TAB_OF = { home: 'home', natal: 'home', day: 'home', week: 'home', install: 'home', chat: 'chat', profile: 'profile', people: 'profile', help: 'help' };
const SCREEN_NAMES = [...document.querySelectorAll('[data-screen]')].map((item) => item.dataset.screen);
const ENTER = { home: enterHome, natal: enterNatal, day: enterDay, week: enterWeek, chat: enterChat, plan: enterPlan, pay: enterPay,
  profile: enterProfile, people: enterPeople, birth: enterBirth, help: enterHelp };
const RESEND_SECONDS = 60;
const PASSWORD_RULE = /^(?=.*[a-zа-я])(?=.*[A-ZА-Я])(?=.*\d)(?=.*[^\p{L}\d]).{8,}$/u;
const FAQ = [
  ['Нужно ли платить за прогноз на день?', 'Нет, прогноз на день бесплатный.'],
  ['Это предсказание будущего?', 'Нет. Это разбор вашей карты и положения планет как повод для размышления. Мы не даём предсказаний и гарантий.'],
  ['Кто отвечает в чате?', 'Фортуна отвечает по методике Анны Гриньковой. Ответы носят информационный характер и не заменяют консультацию специалиста.'],
  ['Зачем время и город рождения?', 'От них зависят асцендент и дома карты. Без точного времени можно показать планеты и знаки, но не дома.'],
  ['Что с моими данными?', 'Данные нужны только для расчёта вашей карты. Подробности — в политике обработки персональных данных внизу главного экрана.'],
];

let nextScreen = null;
let challenge = null;
let registered = null;
let resendTimer = 0;
let installEvent = null;
let birthForm = { name: '', date: '', time: '', city: null, place: '' };

function currentName() { return /^#\/([a-z]+)/.exec(location.hash)?.[1] ?? ''; }

function show(name) {
  for (const section of document.querySelectorAll('[data-screen]')) section.hidden = section.dataset.screen !== name;
  const section = screenEl(name);
  const tab = TAB_OF[name];
  $('#tabbar').hidden = !section.classList.contains('has-nav');
  for (const link of document.querySelectorAll('[data-tab]')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  document.title = `${$('h1', section)?.textContent?.trim() || 'Фортуна'} — Фортуна`;
  window.scrollTo(0, 0);
  const heading = $('h1', section);
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}

async function render() {
  let name = currentName();
  if (!SCREEN_NAMES.includes(name)) name = app.me ? 'home' : 'login';
  if (!app.me && !PUBLIC.has(name)) { nextScreen = name; name = 'login'; }
  if (app.me && AUTH_SCREENS.has(name)) name = 'home';
  if (location.hash !== `#/${name}`) history.replaceState({ idx: history.state?.idx ?? 0 }, '', `#/${name}`);
  show(name);
  try { await ENTER[name]?.(); } catch { setNote(name, 'Не удалось загрузить данные. Проверьте связь.'); }
}

app.go = (name) => { history.pushState({ idx: (history.state?.idx ?? 0) + 1 }, '', `#/${name}`); render(); };
// A redirect replaces the current history entry, so the back button never returns to the screen that sent the visitor away.
app.redirect = (name) => { history.replaceState({ idx: history.state?.idx ?? 0 }, '', `#/${name}`); render(); };
app.back = () => { if ((history.state?.idx ?? 0) > 0) history.back(); else app.go(app.me ? 'home' : 'login'); };

function busy(form, on) { for (const button of form.querySelectorAll('button[type="submit"]')) button.disabled = on; }
const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

async function afterSignIn() {
  await refreshMe();
  resetChat();
  const target = nextScreen && nextScreen !== 'login' ? nextScreen : (birth() ? 'home' : 'birth');
  nextScreen = null;
  app.go(target);
}

function bindLogin() {
  $('#form-login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget, email = form.email.value.trim(), password = form.password.value;
    if (!emailOk(email)) { setNote('login', 'Укажите почту, например name@example.com.'); return; }
    if (!password) { setNote('login', 'Введите пароль.'); return; }
    setNote('login'); busy(form, true);
    try {
      const { ok, data } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      if (!ok) { setNote('login', data.message || 'Не удалось войти.'); return; }
      form.password.value = '';
      await afterSignIn();
    } catch { setNote('login', 'Сервис недоступен. Попробуйте позже.'); } finally { busy(form, false); }
  });
}

function tickResend() {
  clearInterval(resendTimer);
  let left = RESEND_SECONDS;
  const label = $('#code-timer');
  const paint = () => { label.textContent = left > 0 ? `Отправить код снова через 0:${String(left).padStart(2, '0')}` : ''; if (left <= 0) { clearInterval(resendTimer); resendButton(label); } };
  paint();
  resendTimer = setInterval(() => { left -= 1; paint(); }, 1000);
}

function resendButton(label) {
  const button = node('button', 'link-btn', 'Отправить код снова'); button.type = 'button';
  button.addEventListener('click', () => sendRegistration(registered, true));
  label.replaceChildren(button);
}

async function sendRegistration(values, resend = false) {
  const { ok, data } = await api('/api/auth/register', { method: 'POST', body: { email: values.email, password: values.password, confirmPassword: values.password, privacyConsent: true } });
  const target = resend ? 'code' : 'register';
  if (!ok) { setNote(target, data.message || 'Не удалось отправить код.'); return false; }
  challenge = data.challenge;
  registered = values;
  $('#code-email').textContent = values.email;
  setNote('code', resend ? 'Код отправлен ещё раз.' : '', true);
  tickResend();
  return true;
}

function bindRegister() {
  $('#form-register').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget, email = form.email.value.trim(), password = form.password.value;
    if (!emailOk(email)) { setNote('register', 'Укажите почту, например name@example.com.'); return; }
    if (!PASSWORD_RULE.test(password)) { setNote('register', 'Пароль: от 8 символов, с заглавной буквой, цифрой и спецсимволом.'); return; }
    if (!form.consent.checked) { setNote('register', 'Подтвердите согласие на обработку данных.'); return; }
    setNote('register'); busy(form, true);
    try { if (await sendRegistration({ email, password })) app.go('code'); }
    catch { setNote('register', 'Сервис недоступен. Попробуйте позже.'); } finally { busy(form, false); }
  });
  $('#code-change').addEventListener('click', () => app.go('register'));
}

function bindCode() {
  const cells = [...document.querySelectorAll('#code-cells input')];
  cells.forEach((cell, index) => {
    cell.addEventListener('input', () => {
      cell.value = cell.value.replace(/\D/g, '').slice(0, 1);
      if (cell.value && cells[index + 1]) cells[index + 1].focus();
    });
    cell.addEventListener('keydown', (event) => { if (event.key === 'Backspace' && !cell.value && cells[index - 1]) cells[index - 1].focus(); });
    cell.addEventListener('paste', (event) => {
      const digits = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, cells.length);
      if (!digits) return;
      event.preventDefault();
      cells.forEach((item, position) => { item.value = digits[position] ?? ''; });
      cells[Math.min(digits.length, cells.length - 1)].focus();
    });
  });
  $('#form-code').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const code = cells.map((cell) => cell.value).join('');
    if (code.length !== cells.length) { setNote('code', 'Введите все 6 цифр.'); return; }
    if (!challenge) { app.go('register'); return; }
    setNote('code'); busy(form, true);
    try {
      const { ok, data } = await api('/api/auth/register/verify', { method: 'POST', body: { challenge, code } });
      if (!ok) { setNote('code', data.message || 'Код не подошёл.'); return; }
      cells.forEach((cell) => { cell.value = ''; });
      clearInterval(resendTimer);
      await afterSignIn();
    } catch { setNote('code', 'Сервис недоступен. Попробуйте позже.'); } finally { busy(form, false); }
  });
}

function paintBirth() {
  const set = (id, text, placeholder) => { const node_ = $(`#${id} [data-value]`); node_.textContent = text || placeholder; node_.classList.toggle('is-empty', !text); };
  set('b-date', formatDate(birthForm.date), 'Выберите дату');
  set('b-time', birthForm.time, 'Выберите время');
  set('b-city', birthForm.place, 'Выберите город');
  $('#b-name').value = birthForm.name;
}

function enterBirth() {
  const person = app.birthMode === 'person';
  const profile = person ? null : birth();
  $('#t-birth').textContent = person ? 'Близкий человек' : 'Данные рождения';
  $('#b-relation-row').hidden = !person;
  if (person) {
    const select = $('#b-relation');
    const allowed = app.relations?.allowed ?? [];
    select.replaceChildren(...allowed.map((key) => { const option = node('option', '', app.relations.labels?.[key] ?? key); option.value = key; return option; }));
  }
  birthForm = { name: person ? '' : app.me?.user?.displayName ?? '', date: profile?.birthDate ?? '', time: profile?.birthTime ?? '',
    city: profile?.birthCityId ? { id: profile.birthCityId, name: profile.birthPlace } : null, place: profile?.birthPlace ?? '' };
  setNote('birth');
  paintBirth();
}

function bindBirth() {
  $('#b-name').addEventListener('input', (event) => { birthForm.name = event.target.value; });
  $('#b-date').addEventListener('click', () => pickDate({ value: birthForm.date, onPick: (value) => { birthForm.date = value; paintBirth(); } }));
  $('#b-time').addEventListener('click', () => pickTime({ value: birthForm.time, onPick: (value) => { birthForm.time = value; paintBirth(); } }));
  $('#b-city').addEventListener('click', () => pickCity({ onPick: (city) => { birthForm.city = city; birthForm.place = city.displayName ?? city.name; paintBirth(); } }));
  $('#form-birth').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget, person = app.birthMode === 'person';
    if (person && birthForm.name.trim().length < 2) { setNote('birth', 'Укажите имя близкого человека.'); return; }
    if (!birthForm.date || !birthForm.time || !birthForm.place) { setNote('birth', 'Выберите дату, время и город рождения.'); return; }
    setNote('birth'); busy(form, true);
    try {
      const stored = !person && birth() && !birthForm.city?.latitude ? birth() : null;
      const place = birthForm.city?.id ? { birthCityId: birthForm.city.id, birthPlace: birthForm.place }
        : { birthPlace: birthForm.place, birthLatitude: stored?.birthLatitude, birthLongitude: stored?.birthLongitude, birthTimeZone: stored?.birthTimeZone };
      const body = { birthDate: birthForm.date, birthTime: birthForm.time, ...place };
      if (person) {
        const { ok, data } = await api('/api/profiles', { method: 'POST', body: { ...body, relation: $('#b-relation').value, label: birthForm.name.trim() } });
        if (!ok) { setNote('birth', data.message || 'Не удалось сохранить.'); return; }
        app.birthMode = null; app.go('people'); return;
      }
      const name = birthForm.name.trim();
      if (name && name !== app.me.user.displayName) {
        const saved = await api('/api/me/name', { method: 'PUT', body: { name } });
        if (!saved.ok) { setNote('birth', saved.data.message || 'Проверьте имя.'); return; }
      }
      const { ok, data } = await api('/api/profile', { method: 'PUT', body });
      if (!ok) { setNote('birth', data.message || 'Проверьте дату, время и город рождения.'); return; }
      await refreshMe();
      app.go('natal');
    } catch { setNote('birth', 'Сервис недоступен. Попробуйте позже.'); } finally { busy(form, false); }
  });
}

function enterHelp() {
  const box = $('#faq');
  if (box.children.length) return;
  for (const [question, answer] of FAQ) {
    const item = node('details'), head = node('summary', '', question);
    item.append(head, node('p', '', answer));
    box.append(item);
  }
}

function bindShell() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-go], [data-back]');
    if (!target) return;
    event.preventDefault();
    if (target.hasAttribute('data-back')) { app.back(); return; }
    if (target.dataset.go === 'birth') app.birthMode = null;
    if (target.dataset.intro) { app.pendingQuestion = 'Расскажите, как вы работаете и с какими вопросами можно к вам прийти.'; }
    app.go(target.dataset.go);
  });
  $('#profile-out').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* the page still signs out locally */ }
    app.me = null; app.plan = null; app.natal = null; resetChat();
    app.go('login');
  });
  $('#home-bell').addEventListener('click', () => app.go('profile'));
  window.addEventListener('popstate', render);
  window.addEventListener('online', () => { $('#offline').hidden = true; });
  window.addEventListener('offline', () => { $('#offline').hidden = false; });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); installEvent = event; $('#install-now').hidden = false;
  });
  $('#install-now').addEventListener('click', async () => { await installEvent?.prompt(); installEvent = null; $('#install-now').hidden = true; });
}

bindLogin(); bindRegister(); bindCode(); bindBirth(); bindInfo(); bindChat(); bindPay(); bindPeople(); bindShell();
await refreshMe().catch(() => { $('#offline').hidden = false; });
render();
