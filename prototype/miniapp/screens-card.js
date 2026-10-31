// The five illustrated metaphor cards of the Moscow day, separate from the sky forecast.
import { api, formatDate } from './api.js';
import { $, app, birth, setNote } from './state.js';
import { prepareCardQuestion } from './screens-chat.js?v=4';
import { cardCopy } from './card-copy.js?v=1';
import { remember, savedPosition } from './daily-card-choice.js?v=1';

let current = null;
let generation = 0;
let controller = null;
let choosing = false;
const buttons = () => [...document.querySelectorAll('[data-day-card]')];

function valid(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(data?.date) && Number.isInteger(data.card?.number)
    && data.card.number >= 0 && data.card.number < 22
    && ['name', 'focus', 'action', 'question'].every((key) => typeof data.card[key] === 'string' && data.card[key].trim());
}

function showFace(open) {
  const stage = $('#card-reveal');
  stage.classList.toggle('is-open', open);
  stage.setAttribute('aria-pressed', String(open));
  stage.setAttribute('aria-label', current ? `${open ? 'Перевернуть' : 'Показать'} карту «${current.card.name}»` : 'Открыть мою карту дня');
}

async function paint(data, position, ticket, owner) {
  const path = `/assets/cards/illustrated/${String(data.card.number).padStart(2, '0')}.webp`;
  const preview = new Image(); preview.src = path;
  await preview.decode();
  if (ticket !== generation || owner !== app.me?.user?.id) return false;
  current = { ...data, position, owner: app.me.user.id };
  const deck = $('#card-deck');
  const before = deck.getBoundingClientRect();
  document.querySelector('[data-screen="card"]').classList.add('has-card');
  $('#card-reveal').hidden = false; $('#card-caption').hidden = false;
  const card = data.card;
  const image = $('#card-image');
  image.src = path;
  image.alt = `Метафорическая карта «${card.name}»`;
  const copy = cardCopy(card);
  $('#card-name').textContent = copy.title;
  $('#card-body').textContent = copy.body;
  $('#card-focus').textContent = `${card.focus.charAt(0).toUpperCase()}${card.focus.slice(1)}.`;
  $('#card-action').textContent = card.action;
  $('#card-question').textContent = card.question;
  $('#card-result').hidden = false;
  $('#card-empty').hidden = true;
  $('#card-personal').hidden = !!birth();
  $('#card-caption').textContent = `Твоя карта — «${card.name}»`;
  $('#card-date').textContent = formatDate(data.date);
  for (const button of buttons()) button.setAttribute('aria-pressed', String(Number(button.dataset.dayCard) === position));
  showFace(true);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const after = deck.getBoundingClientRect();
    if (before.width && after.width) deck.animate([
      { transform: `translate(${before.x-after.x}px, ${before.y-after.y}px) scale(${before.width/after.width})` },
      { transform: 'none' },
    ], { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  return true;
}

async function select(position, initial = false) {
  if (choosing) return;
  const owner = app.me?.user?.id;
  if (!owner) return;
  const ticket = ++generation;
  controller?.abort();
  controller = new AbortController();
  choosing = true;
  showFace(false);
  setNote('card');
  $('#card-deck').setAttribute('aria-busy', 'true');
  for (const button of [...buttons(), $('#card-open'), $('#card-reveal')]) button.disabled = true;
  try {
    const result = await api(`/api/forecast/card?draw=${position}`, { signal: controller.signal });
    if (ticket !== generation || owner !== app.me?.user?.id) return;
    if (!result.ok || !valid(result.data)) throw new Error('card_unavailable');
    $('#card-date').textContent = formatDate(result.data.date);
    if (initial) {
      const saved = savedPosition(owner, result.data.date);
      if (saved === null) return;
      if (saved !== position) {
        choosing = false;
        await select(saved);
        return;
      }
    }
    if (await paint(result.data, position, ticket, owner)) remember(owner, result.data.date, position);
  } catch (error) {
    if (error.name !== 'AbortError' && ticket === generation) {
      showFace(!!current);
      setNote('card', 'Карта пока не загрузилась. Нажми на неё ещё раз.');
    }
  } finally {
    if (ticket === generation) {
      choosing = false;
      $('#card-deck').setAttribute('aria-busy', 'false');
      for (const button of [...buttons(), $('#card-open'), $('#card-reveal')]) button.disabled = false;
    }
  }
}

export function resetCard() {
  generation += 1;
  controller?.abort();
  controller = null; current = null; choosing = false;
  app.dayCardContext = null;
  document.querySelector('[data-screen="card"]').classList.remove('has-card');
  $('#card-reveal').hidden = true; $('#card-caption').hidden = true;
  $('#card-result').hidden = true;
  $('#card-empty').hidden = false;
  $('#card-personal').hidden = true;
  $('#card-image').src = '/miniapp/assets/card-back-realistic.webp';
  $('#card-image').alt = '';
  $('#card-caption').textContent = 'Коснись карты, чтобы открыть её';
  showFace(false);
  $('#card-open').disabled = false; $('#card-reveal').disabled = false;
  $('#card-date').textContent = '';
  $('#card-deck').setAttribute('aria-busy', 'false');
  for (const button of buttons()) { button.disabled = false; button.setAttribute('aria-pressed', 'false'); }
}

export async function enterCard() {
  resetCard();
  await select(0, true);
}

export function bindCard() {
  $('#card-open').textContent = 'Выбрать из пяти карт';
  $('#card-open').addEventListener('click', () => { $('#card-deck').scrollIntoView({ block: 'center', behavior: 'smooth' }); buttons()[0].focus({ preventScroll: true }); });
  $('#card-reveal').addEventListener('click', () => {
    if (current) showFace(!$('#card-reveal').classList.contains('is-open'));
    else select(0);
  });
  for (const button of buttons()) button.addEventListener('click', () => select(Number(button.dataset.dayCard)));
  $('#card-discuss').addEventListener('click', () => {
    if (!current || choosing || current.owner !== app.me?.user?.id) return;
    if (!prepareCardQuestion(current)) setNote('card', 'Дождись текущего ответа Фортуны и попробуй ещё раз.');
  });
}
