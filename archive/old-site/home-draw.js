// The card block of the home page for a signed-in account: five own cards, a question, one card chosen, the reading in place.
// For a guest the block keeps working as before (app.js opens a card of the shared set) and gets a prompt to register.
// Relies on scripts that run in the same page: app.js (tarotNumerals, refreshAccount, the guest flow), chat.js (readEvents).
(() => {
  const draw = document.querySelector('.daily-draw');
  const stage = document.querySelector('.daily-draw-stage');
  if (!draw || !stage) return;
  const byId = (id) => document.getElementById(id);
  const cards = [...document.querySelectorAll('[data-draw-card]')];
  const el = {
    kicker: document.querySelector('.daily-draw-kicker'), note: byId('draw-stage-note'), intro: byId('draw-intro'), ask: byId('draw-ask'),
    result: byId('draw-result'), reading: byId('dr-title').parentElement, form: byId('draw-form'), question: byId('draw-question'),
    count: byId('draw-count'), submit: byId('draw-submit'), label: byId('draw-submit-label'), notice: byId('draw-notice'),
    title: byId('dr-title'), asked: byId('dr-question'), answer: byId('dr-answer'), again: byId('dr-again'),
  };
  const TEXT = {
    kickerUser: 'Ваши пять карт на сегодня', kickerGuest: 'Карта дня',
    noteUser: 'Эти пять карт только ваши. Завтра будут другие.', noteGuest: 'Откройте метафорическую карту и найдите свой смысл в её образе.',
    noteOpened: 'Можно открыть другую карту', idle: 'Открыть карту', busy: 'Открываем карту…',
    failed: 'Не удалось получить трактовку. Попытка не списана.',
    limit: 'Лимит разборов на сегодня исчерпан. Новые откроются завтра — или выберите другой тариф.',
  };
  const MIN_QUESTION = 10;
  let selected = null;
  let busy = false;
  let controller = null;
  let lastQuestion = '';

  const signedIn = () => document.body.dataset.signedIn === 'true';
  const clear = (node) => { while (node.firstChild) node.firstChild.remove(); };
  const paragraph = (text) => { const node = document.createElement('p'); node.textContent = text; return node; };
  const opened = () => !el.reading.hidden;

  function paintSelection() {
    cards.forEach((card, index) => card.setAttribute('aria-pressed', String(index === selected)));
  }

  function refreshSubmit() {
    el.submit.disabled = busy || selected === null || el.question.value.trim().length < MIN_QUESTION;
  }

  function clearNotice() { el.notice.hidden = true; el.notice.className = 'draw-notice'; clear(el.notice); }
  function notice(kind, text, action) {
    clearNotice();
    el.notice.classList.add(`is-${kind}`);
    el.notice.append(paragraph(text));
    if (action) el.notice.append(action);
    el.notice.hidden = false;
  }
  function link(text, href) { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; }
  function retryButton() {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Повторить';
    button.addEventListener('click', () => ask());
    return button;
  }
  // Telephone numbers of the help lines become call links; the text itself comes from the server.
  function crisisNotice(text) {
    clearNotice();
    el.notice.classList.add('is-crisis');
    const body = document.createElement('p');
    let last = 0;
    for (const match of text.matchAll(/8 800 [\d-]+|(?<![\d-])112(?![\d-])/g)) {
      body.append(text.slice(last, match.index));
      body.append(link(match[0], `tel:${match[0].replace(/\D/g, '')}`));
      last = match.index + match[0].length;
    }
    body.append(text.slice(last));
    el.notice.append(body);
    el.notice.hidden = false;
  }
  function showFailure(response, data) {
    if (data.crisis) return crisisNotice(data.answer);
    if (response.status === 401) { window.refreshAccount?.(); return notice('error', data.message); }
    if (data.error === 'tarot_daily_limit') return notice('limit', TEXT.limit, link('Сменить тариф', '/kabinet'));
    if (data.error === 'invalid_tarot_reading') return notice('error', data.message);
    return notice('error', data.error === 'tarot_unavailable' ? TEXT.failed : data.message || TEXT.failed, retryButton());
  }

  function setBusy(on) {
    busy = on;
    el.question.readOnly = on;
    el.submit.setAttribute('aria-busy', String(on));
    el.label.textContent = on ? TEXT.busy : TEXT.idle;
    refreshSubmit();
  }

  // The state of the block follows the account: the form for an account, the shared deck with a prompt for a guest.
  function applyAccount() {
    const user = signedIn();
    draw.dataset.mode = user ? 'user' : 'guest';
    if (opened() || !el.result.hidden) return;
    el.kicker.textContent = user ? TEXT.kickerUser : TEXT.kickerGuest;
    el.note.textContent = user ? TEXT.noteUser : TEXT.noteGuest;
    el.intro.hidden = user;
    el.ask.hidden = !user;
    if (!user) { selected = null; paintSelection(); }
  }

  function showAsk({ pick = null } = {}) {
    controller?.abort();
    controller = null;
    setBusy(false);
    el.reading.hidden = true;
    el.result.hidden = true;
    stage.classList.remove('has-selection');
    cards.forEach((card) => card.classList.remove('is-selected', 'is-revealing'));
    selected = pick;
    paintSelection();
    clearNotice();
    el.intro.hidden = signedIn();
    el.ask.hidden = !signedIn();
    el.kicker.textContent = signedIn() ? TEXT.kickerUser : TEXT.kickerGuest;
    el.note.textContent = signedIn() ? TEXT.noteUser : TEXT.noteGuest;
    refreshSubmit();
  }

  async function ask() {
    if (busy) return;
    const question = el.question.value.trim();
    clearNotice();
    if (selected === null || question.length < MIN_QUESTION) return;
    lastQuestion = question;
    setBusy(true);
    el.note.textContent = TEXT.busy;
    const turn = (controller = new AbortController());
    try {
      const response = await fetch('/api/tarot/reading', {
        method: 'POST', credentials: 'same-origin', signal: turn.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ question, draw: selected }),
      });
      // Errors before the answer starts (sign-in, limit, validation, crisis) come back as plain JSON.
      if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
        showFailure(response, await response.json());
        return;
      }
      let final = null;
      for await (const { event, data } of readEvents(response)) {
        if (turn !== controller) return;
        if (event === 'done') final = data;
        else if (event === 'error') throw new Error(data.message || TEXT.failed);
      }
      if (!final) throw new Error(TEXT.failed);
      if (final.crisis) crisisNotice(final.answer);
      else showResult(final);
    } catch (error) {
      if (error.name === 'AbortError' || turn !== controller) return;
      notice('error', TEXT.failed, retryButton());
    } finally {
      if (turn === controller) { setBusy(false); if (!opened()) el.note.textContent = TEXT.noteUser; }
    }
  }

  // The chosen card turns over in the fan, the reading takes the place of the form.
  function showResult({ answer, card }) {
    const numeral = tarotNumerals[card.number];
    const button = cards[selected];
    button.querySelector('.draw-card-roman').textContent = numeral;
    button.querySelector('.draw-card-name').textContent = card.name;
    button.style.setProperty('--tarot-art', tarotArt(card.number));
    stage.classList.add('has-selection');
    cards.forEach((item, index) => {
      item.classList.toggle('is-selected', index === selected);
      item.setAttribute('aria-pressed', String(index === selected));
    });
    el.kicker.textContent = `${numeral} · ваша карта дня`;
    el.title.textContent = `${card.name}.`;
    el.asked.textContent = lastQuestion;
    clear(el.answer);
    answer.split(/\n\s*\n|\n/).map((part) => part.trim()).filter(Boolean).forEach((part) => el.answer.append(paragraph(part)));
    el.note.textContent = TEXT.noteOpened;
    el.ask.hidden = true;
    el.intro.hidden = true;
    el.reading.hidden = false;
    el.title.tabIndex = -1;
    el.title.focus({ preventScroll: true });
  }

  // In an account a click on a card chooses it (the guest flow of app.js is stopped before it sees the click).
  stage.addEventListener('click', (event) => {
    const button = event.target.closest('[data-draw-card]');
    if (!button || !signedIn()) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    if (busy) return;
    const index = Number(button.dataset.drawCard);
    if (opened()) { showAsk({ pick: index }); el.question.value = lastQuestion; el.count.textContent = `${lastQuestion.length} / 300`; refreshSubmit(); return; }
    selected = index;
    paintSelection();
    clearNotice();
    refreshSubmit();
  }, true);

  el.question.addEventListener('input', () => { el.count.textContent = `${el.question.value.length} / ${el.question.maxLength}`; refreshSubmit(); });
  el.form.addEventListener('submit', (event) => { event.preventDefault(); ask(); });
  el.again.addEventListener('click', () => { showAsk(); el.question.value = ''; el.count.textContent = '0 / 300'; refreshSubmit(); el.question.focus(); });
  document.addEventListener('anna-account-state', () => { if (!busy) applyAccount(); });
  document.addEventListener('anna-route', (event) => {
    if (event.detail?.page !== 'home' && controller) { controller.abort(); controller = null; setBusy(false); }
  });
  applyAccount();
})();
