// Reading by request (/rasklad): the person asks a question, names one of five closed cards and gets an interpretation.
// Guests see the shared set of cards and may open one to see its name; the question and interpretation need an account.
// Relies on other scripts loaded before this one: app.js (tarotNumerals, tarotArt, refreshAccount), chat.js (readEvents).
(() => {
  const route = document.getElementById('route-reading');
  if (!route) return;
  const byId = (id) => document.getElementById(id);
  const el = {
    ask: byId('rd-ask'), result: byId('rd-result'), kicker: byId('rd-kicker'), title: byId('rd-title'), lead: byId('rd-lead'),
    form: byId('rd-form'), question: byId('rd-question'), count: byId('rd-count'), submit: byId('rd-submit'), submitLabel: byId('rd-submit-label'),
    stream: byId('rd-stream'), notice: byId('rd-notice'), guest: byId('rd-guest'), guestCard: byId('rd-guest-card'), deckNote: byId('rd-deck-note'),
    art: byId('rd-result-art'), caption: byId('rd-result-caption'), resultQuestion: byId('rd-result-question'), answer: byId('rd-answer'),
    again: byId('rd-again'),
    cards: [...document.querySelectorAll('[data-rd-card]')], nums: [...document.querySelectorAll('[data-rd-num]')],
  };
  const TEXT = {
    kicker: 'Таро и астропсихология',
    resultKicker: 'Расклад по запросу',
    title: 'Расклад по запросу.',
    leadUser: 'Задайте вопрос, выберите номер карты — и откройте трактовку.',
    leadGuest: 'Общий набор карт дня. Откройте карту, чтобы увидеть название.',
    idle: 'Открыть карту',
    busy: 'Открываем карту…',
    needInput: 'Напишите вопрос и выберите номер карты.',
    failed: 'Не удалось получить трактовку. Попытка не списана.',
    limit: 'Лимит раскладов на сегодня исчерпан. Новые откроются завтра — или выберите другой тариф.',
    guestFailed: 'Не удалось открыть карту. Попробуйте ещё раз.',
  };
  let signedIn = false;
  let selected = null;
  let busy = false;
  let controller = null;
  let lastQuestion = '';

  const isSignedIn = () => document.body.dataset.signedIn === 'true';
  const clear = (node) => { while (node.firstChild) node.firstChild.remove(); };
  const paragraph = (text) => { const node = document.createElement('p'); node.textContent = text; return node; };

  // ---- Cards and numbers ----
  function paintSelection() {
    el.cards.forEach((card, index) => card.setAttribute('aria-pressed', String(index === selected)));
    el.nums.forEach((num, index) => num.setAttribute('aria-pressed', String(index === selected)));
  }

  function closeGuestCard() {
    el.cards.forEach((card) => { card.classList.remove('is-open'); card.style.removeProperty('--rd-art'); });
    el.guestCard.hidden = true;
    el.guestCard.textContent = '';
  }

  // A guest opens a card of the shared set to see its name.
  async function openGuestCard(index) {
    const turn = (controller = new AbortController());
    try {
      const response = await fetch(`/api/forecast/card?draw=${index}`, { credentials: 'same-origin', signal: turn.signal });
      const data = await response.json();
      if (!response.ok || turn !== controller) throw new Error('card');
      closeGuestCard();
      el.cards[index].classList.add('is-open');
      el.cards[index].style.setProperty('--rd-art', tarotArt(data.tarot.number));
      el.guestCard.textContent = `Карта «${data.tarot.name}»`;
      el.guestCard.hidden = false;
    } catch (error) {
      if (error.name === 'AbortError') return;
      el.guestCard.textContent = TEXT.guestFailed;
      el.guestCard.hidden = false;
    }
  }

  function select(index) {
    if (busy) return;
    selected = index;
    paintSelection();
    clearNotice();
    if (!signedIn) openGuestCard(index);
  }

  // ---- Messages ----
  function clearNotice() {
    el.notice.hidden = true;
    el.notice.className = 'rd-notice';
    clear(el.notice);
  }

  function notice(kind, text, action) {
    clearNotice();
    el.notice.classList.add(`is-${kind}`);
    el.notice.append(paragraph(text));
    if (action) el.notice.append(action);
    el.notice.hidden = false;
  }

  function retryButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rd-retry';
    button.textContent = 'Повторить';
    button.addEventListener('click', () => ask());
    return button;
  }

  function tariffLink() {
    const link = document.createElement('a');
    link.className = 'rd-link';
    link.href = '/kabinet';
    link.textContent = 'Сменить тариф';
    return link;
  }

  // Telephone numbers of the help lines become call links; the text itself comes from the server.
  function crisisNotice(text) {
    clearNotice();
    el.notice.classList.add('is-crisis');
    const body = document.createElement('p');
    let last = 0;
    for (const match of text.matchAll(/8 800 [\d-]+|(?<![\d-])112(?![\d-])/g)) {
      body.append(text.slice(last, match.index));
      const link = document.createElement('a');
      link.href = `tel:${match[0].replace(/\D/g, '')}`;
      link.textContent = match[0];
      body.append(link);
      last = match.index + match[0].length;
    }
    body.append(text.slice(last));
    el.notice.append(body);
    el.notice.hidden = false;
  }

  function showFailure(response, data) {
    if (data.crisis) return crisisNotice(data.answer);
    if (response.status === 401) { window.refreshAccount?.(); return notice('error', data.message); }
    if (data.error === 'tarot_daily_limit') return notice('limit', TEXT.limit, tariffLink());
    if (data.error === 'invalid_tarot_reading') return notice('error', data.message);
    return notice('error', data.error === 'tarot_unavailable' ? TEXT.failed : data.message || TEXT.failed, retryButton());
  }

  // ---- Asking ----
  function setBusy(on) {
    busy = on;
    el.submit.disabled = on;
    el.submit.setAttribute('aria-busy', String(on));
    el.submitLabel.textContent = on ? TEXT.busy : TEXT.idle;
    el.question.readOnly = on;
    if (!on) { el.stream.hidden = true; el.stream.textContent = ''; }
  }

  async function ask() {
    if (busy) return;
    const question = el.question.value.trim();
    clearNotice();
    if (!question || selected === null) { notice('hint', TEXT.needInput); return; }
    lastQuestion = question;
    setBusy(true);
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
        if (event === 'delta') { el.stream.hidden = false; el.stream.textContent += data.text; }
        else if (event === 'done') final = data;
        else if (event === 'error') throw new Error(data.message || TEXT.failed);
      }
      if (!final) throw new Error(TEXT.failed);
      if (final.crisis) crisisNotice(final.answer);
      else showResult(final);
    } catch (error) {
      if (error.name === 'AbortError' || turn !== controller) return;
      notice('error', TEXT.failed, retryButton());
    } finally {
      if (turn === controller) setBusy(false);
    }
  }

  // ---- Result ----
  function showResult({ answer, card }) {
    route.style.setProperty('--rd-art', tarotArt(card.number));
    route.classList.add('is-result');
    el.kicker.textContent = TEXT.resultKicker;
    el.title.textContent = `${card.name}.`;
    el.lead.hidden = true;
    el.art.setAttribute('aria-label', `Карта «${card.name}»`);
    el.caption.textContent = `${tarotNumerals[card.number]} · карта дня`;
    el.resultQuestion.textContent = lastQuestion;
    clear(el.answer);
    answer.split(/\n\s*\n|\n/).map((part) => part.trim()).filter(Boolean).forEach((part) => el.answer.append(paragraph(part)));
    el.ask.hidden = true;
    el.result.hidden = false;
    el.title.tabIndex = -1;
    el.title.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function showAsk({ focus = false } = {}) {
    controller?.abort();
    controller = null;
    setBusy(false);
    route.classList.remove('is-result');
    route.style.removeProperty('--rd-art');
    el.kicker.textContent = TEXT.kicker;
    el.title.textContent = TEXT.title;
    el.lead.hidden = false;
    el.result.hidden = true;
    el.ask.hidden = false;
    el.question.value = '';
    el.count.textContent = '0 / 300';
    selected = null;
    paintSelection();
    closeGuestCard();
    clearNotice();
    applyAccount();
    if (focus && signedIn) el.question.focus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // The form for an account, the shared deck with a sign-in prompt for a guest.
  function applyAccount() {
    signedIn = isSignedIn();
    el.ask.dataset.mode = signedIn ? 'user' : 'guest';
    el.form.hidden = !signedIn;
    el.guest.hidden = signedIn;
    el.lead.textContent = signedIn ? TEXT.leadUser : TEXT.leadGuest;
    el.deckNote.hidden = !signedIn;
    if (signedIn) closeGuestCard();
  }

  el.cards.forEach((card, index) => card.addEventListener('click', () => select(index)));
  el.nums.forEach((num, index) => num.addEventListener('click', () => select(index)));
  el.question.addEventListener('input', () => { el.count.textContent = `${el.question.value.length} / ${el.question.maxLength}`; });
  el.form.addEventListener('submit', (event) => { event.preventDefault(); ask(); });
  el.again.addEventListener('click', () => showAsk({ focus: true }));
  document.addEventListener('anna-account-state', () => { if (!busy && !route.hidden && el.result.hidden) applyAccount(); });
  document.addEventListener('anna-route', (event) => {
    if (event.detail.page === 'reading') showAsk();
    else if (controller) { controller.abort(); controller = null; setBusy(false); }
  });
  applyAccount();
  if (!route.hidden) showAsk();
})();
