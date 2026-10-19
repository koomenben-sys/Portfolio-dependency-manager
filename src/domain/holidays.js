// Release B (docs/design.md section 22, D51): working days of a quarter = weekdays minus Dutch public
// holidays that fall on a weekday. Fixed set, no toggles: Nieuwjaarsdag, Eerste en Tweede Paasdag,
// Koningsdag (27/4, 26/4 when the 27th is a Sunday), Hemelvaartsdag, Eerste en Tweede Pinksterdag,
// Eerste en Tweede Kerstdag. Goede Vrijdag and Bevrijdingsdag are not included (not free for everyone).
// All dates are UTC midnight so daylight-saving changes never shift a day.
// (No import from plan.js: capacity.js -> holidays.js -> plan.js would be a cycle; the quarter start is
// the same arithmetic as plan.quarterStart.)

const DAY = 86400000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

// Easter Sunday (Gregorian, "anonymous" algorithm). Month is 1-based.
export function easterSunday(year) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

// Public holidays of one calendar year as [{ name, at }] (at = UTC midnight in ms).
export function dutchHolidays(year) {
  const easter = easterSunday(year);
  const kings = new Date(utc(year, 4, 27)).getUTCDay() === 0 ? utc(year, 4, 26) : utc(year, 4, 27);
  return [
    { name: 'Nieuwjaarsdag', at: utc(year, 1, 1) },
    { name: 'Eerste Paasdag', at: easter },
    { name: 'Tweede Paasdag', at: easter + DAY },
    { name: 'Koningsdag', at: kings },
    { name: 'Hemelvaartsdag', at: easter + 39 * DAY },
    { name: 'Eerste Pinksterdag', at: easter + 49 * DAY },
    { name: 'Tweede Pinksterdag', at: easter + 50 * DAY },
    { name: 'Eerste Kerstdag', at: utc(year, 12, 25) },
    { name: 'Tweede Kerstdag', at: utc(year, 12, 26) },
  ];
}

// [start, end) of a quarter as UTC midnights, honouring the fiscal-year start month (1 = January).
export function quarterRange(q, fiscalStartMonth = 1) {
  const m = (fiscalStartMonth - 1) + (q.q - 1) * 3;
  const start = Date.UTC(q.year + Math.floor(m / 12), m % 12, 1);
  const e = new Date(start); e.setUTCMonth(e.getUTCMonth() + 3);
  return [start, e.getTime()];
}

const isWeekday = (ms) => { const d = new Date(ms).getUTCDay(); return d !== 0 && d !== 6; };

// { weekdays, holidays: [{name, at}] (on weekdays, inside the quarter), workingDays }
export function workingDays(q, fiscalStartMonth = 1) {
  if (!q) return { weekdays: 0, holidays: [], workingDays: 0 };
  const [start, end] = quarterRange(q, fiscalStartMonth);
  let weekdays = 0;
  for (let t = start; t < end; t += DAY) if (isWeekday(t)) weekdays += 1;
  const years = new Set([new Date(start).getUTCFullYear(), new Date(end - DAY).getUTCFullYear()]);
  const holidays = [...years].flatMap(dutchHolidays).filter((h) => h.at >= start && h.at < end && isWeekday(h.at)).sort((a, b) => a.at - b.at);
  return { weekdays, holidays, workingDays: weekdays - holidays.length };
}
