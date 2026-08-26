import { cairoCalendarDay, cairoLocalToUtc, cairoParts } from './time.js';

function nextWorkingMorning(parts: ReturnType<typeof cairoParts>, includeCurrentDay: boolean): Date {
  const cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (!includeCurrentDay) cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getUTCDay() === 5 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cairoLocalToUtc({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate(), hour: 9 });
}

export function deferFollowUpToWorkingHours(dueAt: Date): Date {
  const local = cairoParts(dueAt);
  const weekday = cairoCalendarDay(local);
  const workingDay = weekday !== 5 && weekday !== 6;
  if (workingDay && local.hour >= 9 && local.hour < 18) return dueAt;
  if (workingDay && local.hour < 9) return nextWorkingMorning(local, true);
  return nextWorkingMorning(local, false);
}

export function scheduleFollowUps(lastCustomerMessageAt: Date): [Date, Date] {
  return [24, 72].map(hours => deferFollowUpToWorkingHours(new Date(lastCustomerMessageAt.getTime() + hours * 60 * 60_000))) as [Date, Date];
}
