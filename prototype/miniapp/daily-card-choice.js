// Shared by the card screen and the chat. Choices belong to an account and a server Moscow date.
const storageKey = (owner) => `fortuna:day-card:${owner}`;
export function remember(owner, date, position) {
  try { localStorage.setItem(storageKey(owner), JSON.stringify({ date, position })); } catch { /* unavailable storage */ }
}
export function savedPosition(owner, date) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(owner)));
    return saved?.date === date && Number.isInteger(saved.position) && saved.position >= 0 && saved.position < 5 ? saved.position : null;
  } catch { return null; }
}
