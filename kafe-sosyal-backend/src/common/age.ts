export interface YMD {
  y: number;
  m: number;
  d: number;
}

/** "YYYY-MM-DD" biçimini ve takvimde gerçekten var olan bir tarih olduğunu doğrular. */
export function parseIsoDate(s: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Verilen saat diliminde bugünün tarihi. */
export function todayIn(timeZone: string, now: Date = new Date()): YMD {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Doğum gününe göre tam yaş. */
export function computeAge(birth: YMD, now: Date = new Date(), timeZone = 'Europe/Istanbul'): number {
  const t = todayIn(timeZone, now);
  let age = t.y - birth.y;
  if (t.m < birth.m || (t.m === birth.m && t.d < birth.d)) age -= 1;
  return age;
}

export const isoDate = (v: YMD): string =>
  `${String(v.y).padStart(4, '0')}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}`;
