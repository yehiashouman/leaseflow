export const contractTimezone = 'Asia/Dubai';
export function calendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: contractTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}
export function monthStart(date: Date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}
export function anniversary(start: Date, months: number) {
  const first = monthStart(start, months);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(start.getUTCDate(), last)),
  );
}
export function dubaiMidnight(date: Date) {
  return new Date(date.getTime() - 4 * 3600000);
}
export function dueDate(period: Date, day: number) {
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new Error('DUE_DAY_POLICY_REQUIRED');
  return dubaiMidnight(new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), day)));
}
export function nextReviewMonth(start: Date, cursor: Date) {
  return (
    (cursor.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    cursor.getUTCMonth() -
    start.getUTCMonth()
  );
}
