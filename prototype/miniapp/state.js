// State shared by the screens: the signed-in account, its plan and birth profile, and a few helpers.
import { api } from './api.js';

export const app = { me: null, plan: null, natal: null, pendingQuestion: '', birthMode: null, relations: null, go: () => {}, redirect: () => {}, back: () => {} };

export const $ = (selector, root = document) => root.querySelector(selector);
export const screenEl = (name) => document.querySelector(`[data-screen="${name}"]`);

export function setNote(name, text = '', ok = false) {
  const note = $('[data-note]', screenEl(name));
  if (!note) return;
  note.textContent = text;
  note.classList.toggle('ok', ok);
}

export const birth = () => app.me?.birthProfile ?? null;

export function visitorName() {
  const user = app.me?.user;
  return user?.displayName || user?.email?.split('@')[0] || 'Гость';
}

export async function refreshMe() {
  const { ok, data } = await api('/api/me');
  app.me = ok ? data : null;
  app.natal = null;
  if (!ok) { app.plan = null; return null; }
  await refreshPlan();
  return app.me;
}

export async function refreshPlan() {
  const { ok, data } = await api('/api/plan');
  app.plan = ok ? data : null;
  return app.plan;
}

export function planLine() {
  const plan = app.plan?.plan;
  return plan ? `${plan.label} · ${plan.dailyChatMessages} вопросов в день` : '';
}

// The natal chart of the account, calculated once per profile.
export async function loadNatal() {
  if (app.natal) return app.natal;
  if (!birth()) return null;
  const { ok, data } = await api('/api/natal/me');
  app.natal = ok ? data.natal : null;
  return app.natal;
}
