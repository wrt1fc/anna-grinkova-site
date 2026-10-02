const pages = [...document.querySelectorAll('[data-page]')];
const navigation = [...document.querySelectorAll('[data-nav], [data-mobile-nav]')];
const dialog = document.getElementById('signup-dialog');
const signupForm = document.getElementById('signup-form');
const signupEmail = document.getElementById('signup-email');
const formMessage = document.getElementById('form-message');
let focusBeforeDialog = null;

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
  document.body.classList.add('dialog-open');
  formMessage.textContent = '';
  signupEmail.focus();
}

function closeSignup() {
  dialog.hidden = true;
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
showRoute();
