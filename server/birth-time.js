import { Temporal } from '@js-temporal/polyfill';

function offsetText(minutes) {
  if (!Number.isInteger(minutes) || Math.abs(minutes) > 14 * 60) throw new Error('invalid_birth_offset');
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function birthInstant({ birthDate, birthTime, timeZone, utcOffsetMinutes }) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    || typeof birthTime !== 'string' || !/^\d{2}:\d{2}$/.test(birthTime)
    || typeof timeZone !== 'string' || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timeZone)) {
    throw new Error('invalid_birth_time');
  }
  let date, time;
  try {
    date = Temporal.PlainDate.from(birthDate, { overflow: 'reject' });
    time = Temporal.PlainTime.from(birthTime, { overflow: 'reject' });
    new Intl.DateTimeFormat('en', { timeZone });
  } catch { throw new Error('invalid_birth_time'); }
  let zoned;
  try {
    if (utcOffsetMinutes !== undefined && utcOffsetMinutes !== null) {
      const offset = offsetText(utcOffsetMinutes);
      zoned = Temporal.ZonedDateTime.from(`${birthDate}T${birthTime}:00${offset}[${timeZone}]`, { offset: 'reject' });
    } else {
      zoned = Temporal.ZonedDateTime.from({ timeZone, year: date.year, month: date.month, day: date.day,
        hour: time.hour, minute: time.minute }, { overflow: 'reject', disambiguation: 'reject' });
    }
  } catch (error) {
    if (error.message === 'invalid_birth_offset') throw error;
    throw new Error(utcOffsetMinutes === undefined || utcOffsetMinutes === null ? 'birth_time_ambiguous' : 'invalid_birth_offset');
  }
  return { utc: new Date(Number(zoned.epochMilliseconds)).toISOString(), offsetMinutes: zoned.offsetNanoseconds / 60_000_000_000 };
}
