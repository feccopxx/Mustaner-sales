import { cairoCalendarDay, cairoParts, sameCairoDate } from './time.js';

export type MeetingSlotResult = { valid: true } | { valid: false; reason: 'NON_WORKING_DAY' | 'NOT_HOURLY' | 'OUTSIDE_WORKING_HOURS' | 'PAST' | 'INSUFFICIENT_NOTICE' };

export function validateMeetingSlot(requestedAt: Date, now: Date): MeetingSlotResult {
  const slot = cairoParts(requestedAt);
  const weekday = cairoCalendarDay(slot);
  if (weekday === 5 || weekday === 6) return { valid: false, reason: 'NON_WORKING_DAY' };
  if (slot.minute !== 0 || slot.second !== 0 || requestedAt.getUTCMilliseconds() !== 0) return { valid: false, reason: 'NOT_HOURLY' };
  if (slot.hour < 9 || slot.hour > 17) return { valid: false, reason: 'OUTSIDE_WORKING_HOURS' };
  if (requestedAt.getTime() <= now.getTime()) return { valid: false, reason: 'PAST' };
  if (sameCairoDate(requestedAt, now) && requestedAt.getTime() - now.getTime() < 2 * 60 * 60_000) return { valid: false, reason: 'INSUFFICIENT_NOTICE' };
  return { valid: true };
}
