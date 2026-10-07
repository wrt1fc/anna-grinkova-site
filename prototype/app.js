const pages = [...document.querySelectorAll('[data-page]')];
const navigation = [...document.querySelectorAll('[data-nav], [data-mobile-nav]')];
const dialog = document.getElementById('signup-dialog');
const signupForm = document.getElementById('signup-form');
const signupEmail = document.getElementById('signup-email');
const formMessage = document.getElementById('form-message');
const siteShell = document.querySelector('.site-shell');
let focusBeforeDialog = null;

const dailyCards = [
  {
    name: 'Сила', numeral: 'VIII', mark: '✧',
    preview: 'Сегодня может помочь спокойный, прямой разговор.',
    question: 'Что я хочу сказать без лишнего нажима?',
    title: 'Сила: говорите прямо, без нажима',
    reading: 'Если сегодня предстоит важный разговор, начните с того, что для вас действительно важно. Спокойный тон поможет не уйти в спор.',
    reflection: 'Где я могу выбрать мягкость и при этом остаться верной себе?',
    focus: 'Один честный разговор', action: 'Запишите мысль, которую давно откладывали.',
  },
  {
    name: 'Звезда', numeral: 'XVII', mark: '✴',
    preview: 'Вернитесь к идее, которую давно держите в голове.',
    question: 'Какой маленький шаг приблизит меня к ней?',
    title: 'Звезда: дайте идее форму',
    reading: 'Большой замысел легче сдвинуть с места, когда у него есть ближайшее действие. Выберите одну задачу, на которую хватит часа, и начните с неё.',
    reflection: 'Какая часть моего плана уже достаточно ясна, чтобы начать?',
    focus: 'Долгий план', action: 'Запишите один конкретный шаг и время для него.',
  },
  {
    name: 'Маг', numeral: 'I', mark: '✳',
    preview: 'Начните с того, что уже есть под рукой.',
    question: 'Что я могу сделать сегодня без подготовки?',
    title: 'Маг: начните с доступного',
    reading: 'Не обязательно собирать все условия перед стартом. Посмотрите на то, чем вы уже располагаете: время, знания, контакт или черновик. Этого может хватить для первого шага.',
    reflection: 'Какой ресурс я недооцениваю?',
    focus: 'Первый шаг', action: 'Сделайте небольшой черновик вместо долгой подготовки.',
  },
  {
    name: 'Умеренность', numeral: 'XIV', mark: '◒',
    preview: 'Проверьте свой темп, прежде чем брать новое.',
    question: 'Для чего мне стоит оставить свободное время?',
    title: 'Умеренность: оставьте запас времени',
    reading: 'Если день уже заполнен, новое обещание может создать лишнее напряжение. Прежде чем соглашаться, посмотрите, что можно перенести или упростить.',
    reflection: 'Где я могу снизить темп без чувства вины?',
    focus: 'Личные границы', action: 'Оставьте в расписании один свободный промежуток.',
  },
  {
    name: 'Колесо Фортуны', numeral: 'X', mark: '⊙',
    preview: 'Оставьте в планах место для поворота.',
    question: 'Что я смогу изменить, если обстоятельства сдвинутся?',
    title: 'Колесо Фортуны: держите план гибким',
    reading: 'Не всё зависит от точного расписания. Определите главное на сегодня, а второстепенные дела оставьте подвижными. Так будет проще ответить на неожиданные перемены.',
    reflection: 'Что сегодня важно сохранить, даже если план изменится?',
    focus: 'Гибкость', action: 'Выберите одно обязательное дело, остальное расставьте по приоритету.',
  },
];

const drawCards = [...document.querySelectorAll('[data-draw-card]')];
const drawIntro = document.getElementById('draw-intro');
const drawResult = document.getElementById('draw-result');
const drawStage = document.querySelector('.daily-draw-stage');
const drawStageNote = document.getElementById('draw-stage-note');
const drawReset = document.getElementById('draw-reset');
const drawStorageKey = 'daily-draw';

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function saveDailyCard(index) {
  try {
    if (index === null) localStorage.removeItem(drawStorageKey);
    else localStorage.setItem(drawStorageKey, JSON.stringify({ date: todayKey(), index }));
  } catch {}
}

function loadDailyCard() {
  try {
    const saved = JSON.parse(localStorage.getItem(drawStorageKey));
    return saved && saved.date === todayKey() ? saved.index : null;
  } catch {
    return null;
  }
}

function selectDailyCard(index) {
  const card = dailyCards[index];
  if (!card) return;
  drawStage.classList.add('has-selection');
  drawStageNote.textContent = 'Можно открыть другую карту';
  drawCards.forEach((button, buttonIndex) => {
    const selected = buttonIndex === index;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  drawIntro.hidden = true;
  drawResult.hidden = false;
  document.getElementById('draw-result-number').textContent = `${card.numeral} · ваша карта`;
  document.getElementById('draw-result-title').textContent = card.name;
  document.getElementById('draw-result-text').textContent = card.preview;
  document.getElementById('draw-result-question').textContent = card.question;
  document.getElementById('day-card-title').textContent = card.name;
  document.getElementById('day-card-mark').textContent = card.mark;
  document.getElementById('day-card-footer').textContent = `${card.numeral} · карта дня`;
  document.getElementById('day-reading-meta').textContent = `Карта «${card.name}»`;
  document.getElementById('day-reading-title').textContent = card.title;
  document.getElementById('day-reading-text').textContent = card.reading;
  document.getElementById('day-reading-question').textContent = card.reflection;
  document.getElementById('day-reading-focus').textContent = card.focus;
  document.getElementById('day-reading-action').textContent = card.action;
}

drawCards.forEach((button) => button.addEventListener('click', () => {
  const index = Number(button.dataset.drawCard);
  selectDailyCard(index);
  saveDailyCard(index);
}));
drawReset.addEventListener('click', () => {
  saveDailyCard(null);
  drawStage.classList.remove('has-selection');
  drawStageNote.textContent = 'Нажмите на карту, чтобы открыть её';
  drawCards.forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });
  drawResult.hidden = true;
  drawIntro.hidden = false;
  drawCards[0].focus();
});

function showRoute() {
  const hash = window.location.hash.replace('#', '');
  const page = hash === 'day' || hash === 'week' ? hash : 'home';

  for (const element of pages) element.hidden = element.dataset.page !== page;
  for (const element of navigation) {
    const navPage = element.dataset.nav || element.dataset.mobileNav;
    if (navPage === page || (page === 'home' && navPage === 'about' && hash === 'about')) {
      element.setAttribute('aria-current', 'page');
    } else {
      element.removeAttribute('aria-current');
    }
  }

  const titles = {
    home: 'Анна Гринькова — пространство прогнозов',
    day: 'Карта дня — Анна Гринькова',
    week: 'Прогноз на неделю — Анна Гринькова',
  };
  document.title = titles[page];
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (hash === 'about') {
    requestAnimationFrame(() => document.getElementById('about').scrollIntoView({ behavior: 'smooth' }));
  }
}

function openSignup(event) {
  focusBeforeDialog = event.currentTarget;
  dialog.hidden = false;
  siteShell.inert = true;
  document.body.classList.add('dialog-open');
  formMessage.textContent = '';
  signupEmail.focus();
}

function closeSignup() {
  dialog.hidden = true;
  siteShell.inert = false;
  document.body.classList.remove('dialog-open');
  if (focusBeforeDialog) focusBeforeDialog.focus();
}

document.querySelectorAll('[data-open-signup]').forEach((button) => button.addEventListener('click', openSignup));
document.querySelectorAll('[data-close-signup]').forEach((button) => button.addEventListener('click', closeSignup));
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeSignup();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.hidden) closeSignup();
  if (event.key !== 'Tab' || dialog.hidden) return;
  const focusable = [...dialog.querySelectorAll('button, input')];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  formMessage.textContent = 'Вход пока недоступен. Email не отправлен.';
  signupForm.reset();
});
window.addEventListener('hashchange', showRoute);
const savedCard = loadDailyCard();
if (savedCard !== null) selectDailyCard(savedCard);
showRoute();
