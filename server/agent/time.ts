const CAIRO_TIME_ZONE = 'Africa/Cairo';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

export interface CairoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function cairoParts(date: Date): CairoParts {
  const values = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return values as unknown as CairoParts;
}

export function cairoCalendarDay(parts: Pick<CairoParts, 'year' | 'month' | 'day'>): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function cairoLocalToUtc(parts: Pick<CairoParts, 'year' | 'month' | 'day' | 'hour'> & Partial<Pick<CairoParts, 'minute' | 'second'>>): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute ?? 0, parts.second ?? 0);
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = cairoParts(new Date(guess));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += desired - actualAsUtc;
  }
  return new Date(guess);
}

export function sameCairoDate(left: Date, right: Date): boolean {
  const a = cairoParts(left); const b = cairoParts(right);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
