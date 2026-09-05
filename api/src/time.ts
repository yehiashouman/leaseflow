export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
export const subMonths = (date: Date, months: number) => { const next = new Date(date); next.setUTCMonth(next.getUTCMonth() - months); return next; };
