// One birth-data form (date, time or city part). `suffix` is added to every id, so a second copy of the form can live on another page.
window.initBirthDate = function initBirthDate(form, suffix = '') {
  const $ = (id) => form.querySelector(`[id="${id}${suffix}"]`);
  const dateDisplay = $('birth-date-display');
  const dateValue = $('birth-date-value');
  const dateToggle = $('birth-date-toggle');
  const calendar = $('birth-calendar');
  const monthSelect = $('birth-calendar-month');
  const yearSelect = $('birth-calendar-year');
  const dayGrid = $('birth-calendar-days');
  const today = new Date();
  const earliestYear = 1900;
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  let viewYear = today.getFullYear() - 25;
  let viewMonth = today.getMonth();

  function dateParts(value) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
    if (!match) return null;
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const candidate = new Date(year, month - 1, day);
    if (year < earliestYear || candidate.getFullYear() !== year ||
        candidate.getMonth() !== month - 1 || candidate.getDate() !== day ||
        candidate > today) return null;
    return { day, month, year, iso: `${year}-${match[2]}-${match[1]}` };
  }

  function setBirthDate(iso) {
    if (!iso) {
      dateDisplay.value = ''; dateValue.value = ''; dateDisplay.setCustomValidity('');
      viewYear = today.getFullYear() - 25;
      viewMonth = today.getMonth();
      renderCalendar();
      return;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!match) return;
    dateDisplay.value = `${match[3]}.${match[2]}.${match[1]}`;
    dateValue.value = iso;
    dateDisplay.setCustomValidity('');
    viewYear = Number(match[1]);
    viewMonth = Number(match[2]) - 1;
    renderCalendar();
  }

  function closeCalendar() {
    calendar.hidden = true;
    dateToggle.setAttribute('aria-expanded', 'false');
    dateDisplay.setAttribute('aria-expanded', 'false');
  }

  function openCalendar() {
    const chosen = dateParts(dateDisplay.value);
    if (chosen) { viewYear = chosen.year; viewMonth = chosen.month - 1; }
    renderCalendar();
    calendar.hidden = false;
    dateToggle.setAttribute('aria-expanded', 'true');
    dateDisplay.setAttribute('aria-expanded', 'true');
  }

  function renderCalendar() {
    monthSelect.value = String(viewMonth);
    yearSelect.value = String(viewYear);
    dayGrid.replaceChildren();
    const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    for (let i = 0; i < firstWeekday; i += 1) dayGrid.append(document.createElement('span'));
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const selected = dateParts(dateDisplay.value);
    for (let day = 1; day <= lastDay; day += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(day);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      }).format(new Date(viewYear, viewMonth, day)));
      button.disabled = new Date(viewYear, viewMonth, day) > today;
      const isSelected = !!selected && selected.year === viewYear &&
        selected.month === viewMonth + 1 && selected.day === day;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-selected', String(isSelected));
      button.addEventListener('click', () => {
        setBirthDate(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        closeCalendar();
        dateDisplay.focus();
      });
      dayGrid.append(button);
    }
    $('birth-calendar-prev').disabled = viewYear === earliestYear && viewMonth === 0;
    $('birth-calendar-next').disabled =
      viewYear === today.getFullYear() && viewMonth === today.getMonth();
  }

  // Cloned forms already contain the source form's options.
  monthSelect.replaceChildren();
  yearSelect.replaceChildren();
  months.forEach((name, index) => monthSelect.add(new Option(name, String(index))));
  for (let year = today.getFullYear(); year >= earliestYear; year -= 1) {
    yearSelect.add(new Option(String(year), String(year)));
  }
  renderCalendar();

  dateDisplay.addEventListener('input', () => {
    dateValue.value = dateParts(dateDisplay.value)?.iso || '';
    dateDisplay.setCustomValidity('');
    if (!calendar.hidden) renderCalendar();
  });
  dateDisplay.addEventListener('click', openCalendar);
  dateToggle.addEventListener('click', () => {
    if (!calendar.hidden) { closeCalendar(); return; }
    openCalendar();
  });
  $('birth-calendar-close').addEventListener('click', () => {
    closeCalendar();
    dateDisplay.focus();
  });
  $('birth-calendar-prev').addEventListener('click', () => {
    if (viewMonth === 0) { viewMonth = 11; viewYear -= 1; } else viewMonth -= 1;
    renderCalendar();
  });
  $('birth-calendar-next').addEventListener('click', () => {
    if (viewMonth === 11) { viewMonth = 0; viewYear += 1; } else viewMonth += 1;
    renderCalendar();
  });
  monthSelect.addEventListener('change', () => { viewMonth = Number(monthSelect.value); renderCalendar(); });
  yearSelect.addEventListener('change', () => { viewYear = Number(yearSelect.value); renderCalendar(); });
  document.addEventListener('pointerdown', (event) => {
    if (!form.querySelector('.birth-date-field').contains(event.target)) closeCalendar();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !calendar.hidden) { closeCalendar(); dateDisplay.focus(); }
  });

  const cityInput = $('birth-place');
  const cityIdInput = $('birth-city-id');
  const cityList = $('city-suggestions');
  let cityResults = [];
  let cityTimer;
  let cityRequest = 0;
  let activeCity = -1;

  function closeCities() {
    cityList.hidden = true;
    cityInput.setAttribute('aria-expanded', 'false');
    cityInput.removeAttribute('aria-activedescendant');
    activeCity = -1;
  }

  function renderCities() {
    cityList.replaceChildren();
    cityResults.forEach((city, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `city-option${suffix}-${index}`;
      option.className = 'city-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === activeCity));
      const name = document.createElement('strong');
      name.textContent = city.displayName || city.name;
      const location = document.createElement('span');
      const country = new Intl.DisplayNames(['ru'], { type: 'region' }).of(city.country) || city.country;
      const sameName = cityResults.filter((item) => item.name === city.name && item.country === city.country).length > 1;
      location.textContent = sameName && city.regionCode ? `${country} · регион ${city.regionCode}` : country;
      option.append(name, location);
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => chooseCity(index));
      cityList.append(option);
    });
    cityList.hidden = cityResults.length === 0;
    cityInput.setAttribute('aria-expanded', String(cityResults.length > 0));
  }

  function chooseCity(index) {
    const city = cityResults[index];
    if (!city) return;
    cityInput.value = city.displayName || city.name;
    cityIdInput.value = city.id;
    closeCities();
    cityInput.focus();
  }

  cityInput.addEventListener('input', () => {
    if (cityIdInput.value && !form.querySelector('.birth-manual').open) {
      for (const name of ['birthLatitude', 'birthLongitude', 'birthTimeZone']) {
        form.elements[name].value = '';
      }
    }
    cityIdInput.value = '';
    cityResults = [];
    closeCities();
    clearTimeout(cityTimer);
    const query = cityInput.value.trim();
    const request = ++cityRequest;
    if (query.length < 2) return;
    cityTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
        if (!response.ok) return;
        const data = await response.json();
        if (request !== cityRequest || cityInput.value.trim() !== query) return;
        cityResults = data.cities || [];
        renderCities();
      } catch { closeCities(); }
    }, 160);
  });
  cityInput.addEventListener('focus', () => { if (cityResults.length && !cityIdInput.value) renderCities(); });
  cityInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeCities(); return; }
    if (!cityResults.length || cityList.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeCity = (activeCity + cityResults.length + (event.key === 'ArrowDown' ? 1 : -1)) % cityResults.length;
      renderCities();
      cityInput.setAttribute('aria-activedescendant', `city-option${suffix}-${activeCity}`);
      cityList.children[activeCity].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && activeCity >= 0) {
      event.preventDefault();
      chooseCity(activeCity);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!form.querySelector('.city-field').contains(event.target)) closeCities();
  });
  cityInput.addEventListener('blur', () => { window.setTimeout(closeCities, 120); });
  form.addEventListener('reset', () => {
    closeCalendar(); closeCities(); clearTimeout(cityTimer);
    cityRequest++; cityResults = []; cityList.replaceChildren();
  });

  return {
    setDate: setBirthDate,
    validateDate() {
      dateValue.value = dateParts(dateDisplay.value)?.iso || '';
      dateDisplay.setCustomValidity(dateValue.value ? '' : 'Введите дату в формате ДД.ММ.ГГГГ.');
      return dateDisplay.reportValidity();
    },
  };

};
