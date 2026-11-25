// State shared by the screens: the signed-in account, its plan and birth profile, and a few helpers.
import { api } from './api.js';

export const app = { me: null, plan: null, natal: null, pendingQuestion: '', birthMode: null, relations: null, go: () => {}, redirect: () => {}, back: () => {}, requireRegistration: () => {} };

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

export function planLine(plan = app.plan?.plan) {
  if (!plan) return '';
  const extra = plan.promoQuestion?.remainingQuestions ?? 0;
  if (plan.welcomeBonus?.active) {
    const remaining = plan.welcomeBonus.remainingQuestions + extra;
    const total = plan.welcomeBonus.totalQuestions + Number(!!plan.promoQuestion?.redeemed);
    return remaining > 0 ? `Бонус · осталось ${remaining} из ${total} вопросов` : 'Бонус использован · нужна подписка';
  }
  if (plan.unlimitedChat) return `${plan.label} · безлимитные вопросы`;
  const quota = plan.monthlyChatMessages || plan.dailyChatMessages;
  return `${plan.label} · ${quota} вопросов в ${plan.monthlyChatMessages ? 'месяц' : 'день'}${extra ? ' · 1 вопрос по промокоду' : ''}`;
}

// The natal chart of the account, calculated once per profile.
export async function loadNatal() {
  if (app.natal) return app.natal;
  if (!birth()) return null;
  const { ok, data } = await api('/api/natal/me');
  app.natal = ok ? data.natal : null;
  return app.natal;
}
