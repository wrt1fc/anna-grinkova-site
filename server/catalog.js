const DAY = 24 * 60 * 60 * 1000;

export const PLANS = Object.freeze({
  day: Object.freeze({ id: 'day', title: 'День', description: 'Полный прогноз на день', features: ['day'], durationMs: DAY }),
  week: Object.freeze({ id: 'week', title: 'Неделя', description: 'Прогнозы на день и неделю', features: ['day', 'week'], durationMs: 7 * DAY }),
});

export function publicPlans(prices = {}) {
  return Object.values(PLANS).map(({ id, title, description, features, durationMs }) => ({
    id, title, description, features, durationDays: durationMs / DAY,
    priceKopeks: Number.isSafeInteger(prices[id]) && prices[id] > 0 ? prices[id] : null,
  }));
}
