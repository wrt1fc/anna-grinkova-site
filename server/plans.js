import planConfig from '../config/plans.json' with { type: 'json' };

// maxPeople counts the account owner too: "partner" is the owner plus one, "family" the owner plus two.
export const PLANS = planConfig.plans;
export const DEFAULT_PLAN = planConfig.default;
export const RELATION_LABELS = planConfig.relationLabels;

export function planFor(name) { return PLANS[name] ?? PLANS[DEFAULT_PLAN]; }
export function extraProfileLimit(name) { return planFor(name).maxPeople - 1; }
export function isPlan(name) { return Object.hasOwn(PLANS, name); }

export function publicPlan(name) {
  const plan = planFor(name);
  return { id: Object.hasOwn(PLANS, name) ? name : DEFAULT_PLAN, label: plan.label, maxPeople: plan.maxPeople,
    dailyChatMessages: plan.dailyChatMessages, relations: plan.relations };
}
