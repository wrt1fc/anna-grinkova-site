const timeField = document.querySelector('.birth-time-field');
const timeDisplay = document.getElementById('birth-time-display');
const timeValue = document.getElementById('birth-time-value');
const timeToggle = document.getElementById('birth-time-toggle');
const timePicker = document.getElementById('birth-time-picker');
const timeHours = document.getElementById('birth-time-hours');
const timeMinutes = document.getElementById('birth-time-minutes');
const timeConfirm = document.getElementById('birth-time-confirm');
let chosenHour = null;
let chosenMinute = null;

function parsedTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? { hour: match[1], minute: match[2] } : null;
}

function syncTime() {
  const valid = parsedTime(timeDisplay.value);
  timeValue.value = valid ? `${valid.hour}:${valid.minute}` : '';
  timeDisplay.setCustomValidity('');
}

function setTime(value) {
  const valid = parsedTime(value || '');
  timeDisplay.value = valid ? `${valid.hour}:${valid.minute}` : '';
  chosenHour = valid?.hour ?? null;
  chosenMinute = valid?.minute ?? null;
  syncTime();
  refreshTimeChoices();
}

function refreshTimeChoices() {
  for (const [list, value] of [[timeHours, chosenHour], [timeMinutes, chosenMinute]]) {
    for (const option of list.children) {
      const selected = option.dataset.value === value;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', String(selected));
    }
  }
  timeConfirm.disabled = chosenHour === null || chosenMinute === null;
}

function closeTimePicker(restoreFocus = false) {
  timePicker.hidden = true;
  timeToggle.setAttribute('aria-expanded', 'false');
  timeDisplay.setAttribute('aria-expanded', 'false');
  if (restoreFocus) timeDisplay.focus();
}

function openTimePicker() {
  const valid = parsedTime(timeDisplay.value);
  chosenHour = valid?.hour ?? null;
  chosenMinute = valid?.minute ?? null;
  refreshTimeChoices();
  timePicker.hidden = false;
  timeToggle.setAttribute('aria-expanded', 'true');
  timeDisplay.setAttribute('aria-expanded', 'true');
  for (const list of [timeHours, timeMinutes]) {
    const selected = list.querySelector('.is-selected');
    if (selected) selected.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
}

function addTimeChoices(list, count, kind) {
  for (let index = 0; index < count; index += 1) {
    const value = String(index).padStart(2, '0');
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'birth-time-option';
    option.dataset.value = value;
    option.textContent = value;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-label', `${value} ${kind}`);
    option.setAttribute('aria-selected', 'false');
    option.addEventListener('click', () => {
      if (kind === 'часов') chosenHour = value;
      else chosenMinute = value;
      refreshTimeChoices();
    });
    list.append(option);
  }
}

addTimeChoices(timeHours, 24, 'часов');
addTimeChoices(timeMinutes, 60, 'минут');
refreshTimeChoices();

timeDisplay.addEventListener('input', syncTime);
timeDisplay.addEventListener('blur', () => {
  const digits = timeDisplay.value.replace(/\D/g, '');
  if (digits.length === 4 && !parsedTime(timeDisplay.value)) {
    const candidate = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    if (parsedTime(candidate)) timeDisplay.value = candidate;
  }
  syncTime();
});
timeToggle.addEventListener('click', () => {
  if (timePicker.hidden) openTimePicker();
  else closeTimePicker();
});
document.getElementById('birth-time-close').addEventListener('click', () => closeTimePicker(true));
timeConfirm.addEventListener('click', () => {
  if (timeConfirm.disabled) return;
  setTime(`${chosenHour}:${chosenMinute}`);
  closeTimePicker(true);
});
document.addEventListener('pointerdown', (event) => {
  if (!timeField.contains(event.target)) closeTimePicker();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !timePicker.hidden) closeTimePicker(true);
});

window.birthTimeControls = {
  setTime,
  validateTime() {
    syncTime();
    timeDisplay.setCustomValidity(timeValue.value ? '' : 'Введите время в формате ЧЧ:ММ.');
    return timeDisplay.reportValidity();
  },
};
