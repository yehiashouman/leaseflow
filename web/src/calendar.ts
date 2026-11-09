function calendarDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(value);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: number('year'), month: number('month') - 1, day: number('day') };
}
export function occupancyElapsed(start: string, now = new Date(), timezone = 'Asia/Dubai') {
  const startValue = new Date(start);
  if (!Number.isFinite(startValue.getTime()) || !Number.isFinite(now.getTime())) return null;
  const from = calendarDate(startValue, timezone),
    to = calendarDate(now, timezone);
  const startDay = Date.UTC(from.year, from.month, from.day),
    today = Date.UTC(to.year, to.month, to.day);
  if (today < startDay) return { started: false, months: 0, days: 0 };
  let months = (to.year - from.year) * 12 + to.month - from.month;
  const anniversary = (count: number) => {
    const month = new Date(Date.UTC(from.year, from.month + count, 1));
    const lastDay = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(from.day, lastDay));
  };
  if (anniversary(months) > today) months--;
  return { started: true, months, days: Math.floor((today - anniversary(months)) / 86400000) };
}
