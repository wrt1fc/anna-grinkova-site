import planConfig from '../config/plans.json' with { type: 'json' };
import { moscowDate } from './daily-forecast.js';

// maxPeople counts the account owner too: "partner" is the owner plus one, "family" the owner plus two.
export const PLANS = planConfig.plans;
export const DEFAULT_PLAN = planConfig.default;
export const RELATION_LABELS = planConfig.relationLabels;

export function planFor(name) { return PLANS[name] ?? PLANS[DEFAULT_PLAN]; }
export function extraProfileLimit(name) { return planFor(name).maxPeople - 1; }
export function isPlan(name) { return Object.hasOwn(PLANS, name); }

export function publicPlan(name, user = null) {
  const plan = planFor(name);
  return { id: Object.hasOwn(PLANS, name) ? name : DEFAULT_PLAN, label: plan.label, maxPeople: plan.maxPeople,
    dailyChatMessages: user?.chatUnlimited === true ? null : plan.dailyChatMessages,
    ...(plan.monthlyChatMessages ? { monthlyChatMessages: plan.monthlyChatMessages, chatQuotaPeriod: 'month' } : {}),
    ...(user?.chatUnlimited === true ? { unlimitedChat: true } : {}),
    dailyTarotReadings: plan.dailyTarotReadings, relations: plan.relations };
}

export async function accountPlan(store, name, user) {
  const month = moscowDate().slice(0, 7);
  const monthly = planFor(name).monthlyChatMessages;
  const used = monthly ? await store.monthlyChatQuotaUsed(`chat:${user.id}`, month) : 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1) - 3 * 3600000);
  return { ...publicPlan(name, user), ...(monthly ? { chatUsage: { used, limit: monthly, remaining: Math.max(0, monthly - used), resetsAt: next.toISOString() } } : {}), welcomeBonus: { ...await store.welcomeBonus(user.id),
    active: name === DEFAULT_PLAN && user.chatUnlimited !== true } };
}
