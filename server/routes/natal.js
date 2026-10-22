import { parseBirthInput } from '../birth-input.js';
import { publicNatal } from '../natal-public.js';

const DEFAULT_BIRTH_TIME = '12:00';

// The natal chart page. Guests send the birth data in the request and nothing is stored; a signed-in account with saved
// birth data can ask for its own chart without sending anything.
export function createNatalRoutes({ store, metrics }) {
  return async function handleNatalRoutes({ req, res, path, user, json, readJson }) {
    if (path === '/api/natal' && req.method === 'POST') {
      const body = await readJson(req);
      const timeKnown = body?.timeUnknown !== true;
      const parsed = parseBirthInput({ ...body, birthTime: timeKnown ? body?.birthTime : DEFAULT_BIRTH_TIME });
      if (!parsed.ok) return json(res, parsed.status, parsed.data), true;
      const { birthUtc, birthLatitude: latitude, birthLongitude: longitude } = parsed.profile;
      metrics.count('natal_chart_guest');
      return json(res, 200, { natal: publicNatal({ birthUtc, latitude, longitude, timeKnown }) }), true;
    }
    if (path === '/api/natal/me' && req.method === 'GET') {
      if (!user) return json(res, 401, { error: 'login_required' }), true;
      const profile = await store.getBirthProfile(user.id);
      if (!profile?.birthUtc) return json(res, 404, { error: 'no_birth_profile', message: 'Данные рождения не заполнены.' }), true;
      metrics.count('natal_chart_account');
      return json(res, 200, { natal: publicNatal({ birthUtc: profile.birthUtc, latitude: profile.birthLatitude, longitude: profile.birthLongitude }) }), true;
    }
    return false;
  };
}
