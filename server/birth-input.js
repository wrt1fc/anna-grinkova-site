import { getCityById } from './cities.js';
import { birthInstant } from './birth-time.js';

const fail = (status, error, message) => ({ ok: false, status, data: message ? { error, message } : { error } });

function validBirthDate(date, today = new Date().toISOString().slice(0, 10)) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    && date >= '1900-01-01' && date <= today;
}

function coordinate(value) { return value === '' || value == null ? NaN : Number(value); }

// Shared by the owner's profile and the extra people on partner and family plans.
export function parseBirthInput(body) {
  const date = body.birthDate, time = body.birthTime;
  if (!validBirthDate(date) || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return fail(400, 'invalid_birth_profile', 'Проверьте дату, время и место рождения.');
  }
  const hasCity = body.birthCityId != null && body.birthCityId !== '';
  const city = hasCity ? getCityById(body.birthCityId) : null;
  if (hasCity && !city) return fail(400, 'invalid_city');
  const requestedPlace = typeof body.birthPlace === 'string' ? body.birthPlace.trim() : '';
  const place = city ? (city.aliases.includes(requestedPlace) ? requestedPlace : city.name) : requestedPlace;
  const latitude = city?.latitude ?? coordinate(body.birthLatitude);
  const longitude = city?.longitude ?? coordinate(body.birthLongitude);
  const timeZone = city?.timeZone || body.birthTimeZone;
  if (place.length < 2 || place.length > 120 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || typeof timeZone !== 'string') {
    return fail(400, 'invalid_birth_profile', 'Выберите город из списка либо укажите название, координаты и часовой пояс.');
  }
  let utcOffsetMinutes;
  if (body.birthUtcOffsetMinutes !== undefined && body.birthUtcOffsetMinutes !== '') {
    utcOffsetMinutes = Number(body.birthUtcOffsetMinutes);
    if (!Number.isInteger(utcOffsetMinutes)) return fail(400, 'invalid_birth_offset');
  }
  let instant;
  try { instant = birthInstant({ birthDate: date, birthTime: time, timeZone, utcOffsetMinutes }); }
  catch (error) {
    if (error.message === 'birth_time_ambiguous') return fail(409, 'birth_time_ambiguous',
      'Это местное время приходится на перевод часов. Уточните время рождения; если час повторялся, укажите смещение UTC в минутах.');
    return fail(400, 'invalid_birth_time', 'Проверьте местное время и часовой пояс рождения.');
  }
  return { ok: true, profile: { birthDate: date, birthTime: time, birthPlace: place, birthCityId: city?.id ?? null,
    birthLatitude: latitude, birthLongitude: longitude, birthTimeZone: timeZone, birthUtc: instant.utc,
    birthUtcOffsetMinutes: instant.offsetMinutes } };
}
