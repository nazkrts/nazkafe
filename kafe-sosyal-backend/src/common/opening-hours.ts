const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Range = [string, string];
export type OpeningHours = Partial<Record<(typeof DAYS)[number], Range[]>>;

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : null;
}

function zonedParts(at: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: WEEKDAY_INDEX[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Kafe şu an açık mı? Biçim: { "mon": [["09:00","23:00"]], "fri": [["18:00","02:00"]] }.
 * Kapanış açılıştan küçük/eşitse gece yarısını aşan aralık sayılır.
 * Hiç gün tanımlı değilse (`{}`) kısıtlama yok sayılır ve kafe açık kabul edilir.
 */
export function isOpenAt(hours: unknown, at: Date, timeZone: string): boolean {
  if (!hours || typeof hours !== 'object' || Object.keys(hours).length === 0) return true;
  const h = hours as OpeningHours;
  const { day, minutes } = zonedParts(at, timeZone);

  for (const [o, c] of h[DAYS[day]] ?? []) {
    const open = toMinutes(o);
    const close = toMinutes(c);
    if (open === null || close === null) continue;
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  // Dünden taşan gece yarısı aralıkları
  for (const [o, c] of h[DAYS[(day + 6) % 7]] ?? []) {
    const open = toMinutes(o);
    const close = toMinutes(c);
    if (open === null || close === null) continue;
    if (close <= open && minutes < close) return true;
  }
  return false;
}
