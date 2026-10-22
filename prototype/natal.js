// The natal chart page: a copy of the birth form, the request to /api/natal and the result (wheel, planets, texts).
(() => {
  const SUFFIX = '-natal';
  const slot = document.getElementById('natal-form-slot');
  const source = document.getElementById('birth-form');
  if (!slot || !source) return;

  const message = (text) => { statusLine.textContent = text; };
  const statusLine = document.createElement('p');
  statusLine.className = 'form-status natal-status';
  statusLine.setAttribute('role', 'status');

  // The form of the account page is copied, so the date, time and city pickers look and work the same here.
  const form = source.cloneNode(true);
  form.id = 'natal-form';
  for (const node of form.querySelectorAll('[id]')) node.id += SUFFIX;
  for (const attribute of ['for', 'aria-controls', 'aria-labelledby']) {
    for (const node of form.querySelectorAll(`[${attribute}]`)) node.setAttribute(attribute, node.getAttribute(attribute) + SUFFIX);
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.innerHTML = 'Рассчитать карту <span aria-hidden="true">↗</span>';
  const unknown = document.createElement('label');
  unknown.className = 'natal-unknown';
  unknown.innerHTML = '<input type="checkbox" name="timeUnknown" /> <span>Не знаю время рождения</span>';
  form.querySelector('.birth-manual').after(unknown);
  submit.before(statusLine);
  slot.append(form);

  const dateControls = window.initBirthDate(form, SUFFIX);
  const timeControls = window.initBirthTime(form, SUFFIX);
  const timeInput = form.querySelector(`[id="birth-time-display${SUFFIX}"]`);
  const timeToggle = form.querySelector(`[id="birth-time-toggle${SUFFIX}"]`);
  const unknownBox = unknown.querySelector('input');
  unknownBox.addEventListener('change', () => {
    timeInput.required = !unknownBox.checked;
    timeInput.disabled = unknownBox.checked;
    timeToggle.disabled = unknownBox.checked;
    if (unknownBox.checked) timeControls.setTime('');
  });

  // Before the calculation the right side shows the empty wheel: signs and equal houses, no planets.
  window.drawNatalWheel(document.getElementById('natal-wheel-empty'), { empty: true, planets: [], aspects: [], cusps: Array.from({ length: 12 }, (_, i) => i * 30),
    angles: { asc: { longitude: 0, sign: 'Овен' }, mc: { longitude: 270, sign: 'Козерог' } } });

  const result = document.getElementById('natal-result');
  const SECTION_TAG = { sun: 'Солнце', moon: 'Луна', asc: 'Асцендент', venus: 'Венера', mars: 'Марс', mc: 'MC' };
  const text = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = content;
    return node;
  };
  const placement = (planet) => `${planet.degree}° ${planet.sign}`;

  function renderBigThree(natal) {
    const list = document.getElementById('natal-big-three');
    list.replaceChildren();
    const items = [['Солнце', natal.planets.find((p) => p.key === 'sun').sign], ['Луна', natal.planets.find((p) => p.key === 'moon').sign]];
    if (natal.angles) items.push(['Асцендент', natal.angles.asc.sign]);
    for (const [label, sign] of items) {
      const item = document.createElement('li');
      item.append(text('span', 'natal-chip-label', label), text('strong', '', sign));
      list.append(item);
    }
  }

  function renderTable(natal) {
    const body = document.querySelector('#natal-table tbody');
    body.replaceChildren();
    const rows = natal.planets.map((p) => [p.name + (p.retrograde ? ' (R)' : ''), placement(p), p.house ? String(p.house) : '—']);
    if (natal.angles) {
      rows.push(['Асцендент', placement(natal.angles.asc), '1']);
      rows.push(['MC', placement(natal.angles.mc), '10']);
    }
    for (const cells of rows) {
      const row = document.createElement('tr');
      cells.forEach((cell, index) => row.append(text(index === 0 ? 'th' : 'td', '', cell)));
      row.firstChild.scope = 'row';
      body.append(row);
    }
    document.getElementById('natal-no-time').hidden = natal.timeKnown;
  }

  function renderSections(natal) {
    const box = document.getElementById('natal-sections');
    box.replaceChildren();
    for (const section of natal.sections) {
      const card = document.createElement('article');
      card.className = 'natal-card';
      const tag = [SECTION_TAG[section.key], section.sign + (section.house && !['asc', 'mc'].includes(section.key) ? `, ${section.house} дом` : '')].join(' · ');
      card.append(text('span', 'natal-card-tag', tag), text('h3', '', section.title), text('p', 'natal-card-lead', section.lead), text('p', 'natal-card-text', section.text));
      box.append(card);
    }
  }

  function renderAspects(natal) {
    const list = document.getElementById('natal-aspects');
    list.replaceChildren();
    document.getElementById('natal-aspects-box').hidden = natal.aspects.length === 0;
    document.getElementById('natal-aspects-lead').textContent = natal.aspectsLead;
    for (const aspect of natal.aspects) {
      const item = document.createElement('li');
      item.append(text('strong', '', `${aspect.firstName} — ${aspect.secondName}`), text('span', '', `${aspect.meaning} (орб ${aspect.orb}°)`));
      list.append(item);
    }
  }

  function renderMoney(natal) {
    const box = document.getElementById('natal-money');
    box.hidden = !natal.money;
    if (!natal.money) return;
    const list = document.getElementById('natal-money-list');
    list.replaceChildren();
    for (const line of [natal.money.secondHouse, ...natal.money.rulers, natal.money.mc, natal.money.elements, natal.money.strategy]) {
      if (line) list.append(text('li', '', line));
    }
  }

  function render(natal, { own = false } = {}) {
    renderBigThree(natal);
    renderTable(natal);
    renderSections(natal);
    renderAspects(natal);
    renderMoney(natal);
    document.getElementById('natal-note').textContent = natal.note;
    document.getElementById('natal-save-link').hidden = own || document.body.dataset.signedIn === 'true';
    window.drawNatalWheel(document.getElementById('natal-wheel'), natal);
    result.hidden = false;
    result.classList.remove('is-fresh');
    void result.offsetWidth; // restarts the entrance animation
    result.classList.add('is-fresh');
    result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!dateControls.validateDate()) return;
    if (!unknownBox.checked && !timeControls.validateTime()) return;
    submit.disabled = true;
    message('Считаем карту…');
    try {
      const values = Object.fromEntries(new FormData(form));
      values.timeUnknown = unknownBox.checked;
      if (unknownBox.checked) values.birthTime = '12:00';
      const response = await fetch('/api/natal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) {
        message(data.message || 'Проверьте дату, время и город рождения.');
        if (data.error === 'birth_time_ambiguous') form.querySelector('.birth-manual').open = true;
        return;
      }
      message('');
      render(data.natal);
    } catch { message('Сервис недоступен. Попробуйте позже.'); }
    finally { submit.disabled = false; }
  });

  // A signed-in account with saved birth data sees its own chart at once.
  let ownLoaded = false;
  document.addEventListener('anna-route', async (event) => {
    if (event.detail.page !== 'natal' || ownLoaded || document.body.dataset.signedIn !== 'true') return;
    try {
      const response = await fetch('/api/natal/me', { credentials: 'same-origin' });
      if (!response.ok) return;
      ownLoaded = true;
      render((await response.json()).natal, { own: true });
    } catch { /* the form stays available */ }
  });
})();
