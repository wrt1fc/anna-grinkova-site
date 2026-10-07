import { parseBirthInput } from '../birth-input.js';
import { RELATION_LABELS, extraProfileLimit, planFor, publicPlan } from '../plans.js';

const PROFILE_PATH = /^\/api\/profiles\/(\d{1,12})$/;
// Labels reach the model prompt, so they stay short plain names: letters, digits, spaces, dots, hyphens.
const LABEL_PATTERN = /^[\p{L}\p{M}\d][\p{L}\p{M}\d .'-]{0,39}$/u;

// Profiles past the plan limit (after a downgrade) stay stored but cannot be used.
export async function profilesWithAccess(store, userId) {
  const limit = extraProfileLimit(await store.getPlan(userId));
  return (await store.listChartProfiles(userId)).map((profile, index) => ({ ...profile, locked: index >= limit }));
}

function parseProfileBody(body, plan) {
  if (!planFor(plan).relations.includes(body.relation)) {
    return { ok: false, status: 400, data: { error: 'invalid_relation', message: 'Этот тариф не позволяет добавить такой профиль.' } };
  }
  const label = typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : RELATION_LABELS[body.relation];
  if (!LABEL_PATTERN.test(label)) {
    return { ok: false, status: 400, data: { error: 'invalid_label', message: 'Имя профиля: до 40 букв, цифр и пробелов.' } };
  }
  const parsed = parseBirthInput(body);
  return parsed.ok ? { ok: true, profile: { relation: body.relation, label, ...parsed.profile } } : parsed;
}

export async function handleProfileRoutes({ req, res, path, user, store, json, readJson }) {
  if (path === '/api/plan' && req.method === 'GET') {
    const plan = await store.getPlan(user.id);
    return json(res, 200, { plan: publicPlan(plan), people: 1 + (await store.listChartProfiles(user.id)).length }), true;
  }
  if (path === '/api/profiles' && req.method === 'GET') {
    return json(res, 200, { plan: publicPlan(await store.getPlan(user.id)), self: await store.getBirthProfile(user.id),
      profiles: await profilesWithAccess(store, user.id), relationLabels: RELATION_LABELS }), true;
  }
  if (path === '/api/profiles' && req.method === 'POST') {
    const plan = await store.getPlan(user.id);
    const parsed = parseProfileBody(await readJson(req), plan);
    if (!parsed.ok) return json(res, parsed.status, parsed.data), true;
    const created = await store.createChartProfile(user.id, parsed.profile, extraProfileLimit(plan));
    if (!created) {
      return json(res, 403, { error: 'plan_limit', message: `По тарифу «${planFor(plan).label}» можно добавить не больше ${planFor(plan).maxPeople} человек вместе с вами.` }), true;
    }
    return json(res, 201, { profile: created }), true;
  }
  const match = PROFILE_PATH.exec(path);
  if (!match) return false;
  const id = Number(match[1]);
  if (req.method === 'PUT') {
    const parsed = parseProfileBody(await readJson(req), await store.getPlan(user.id));
    if (!parsed.ok) return json(res, parsed.status, parsed.data), true;
    const updated = await store.updateChartProfile(user.id, id, parsed.profile);
    return (updated ? json(res, 200, { profile: updated }) : json(res, 404, { error: 'not_found' })), true;
  }
  if (req.method === 'DELETE') {
    return ((await store.deleteChartProfile(user.id, id)) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' })), true;
  }
  return false;
}
