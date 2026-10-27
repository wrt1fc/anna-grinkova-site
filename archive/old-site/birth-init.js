// The birth form of the account page: its date and time pickers. The natal chart page makes its own copy (natal.js).
(() => {
  const form = document.getElementById('birth-form');
  if (!form) return;
  window.birthControls = window.initBirthDate(form);
  window.birthTimeControls = window.initBirthTime(form);
})();
