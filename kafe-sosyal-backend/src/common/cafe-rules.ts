import { AppError } from './errors';

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const HHMM = /^([01]?\d|2[0-4]):[0-5]\d$/;
const bad = (msg: string) => new AppError('INVALID_CAFE_DATA', msg, 422);

/** Metin alanı: kırpar; uzunluk ve kontrol karakteri denetler. Boş metin null olur (zorunlu değilse). */
export function cleanText(raw: unknown, field: string, min: number, max: number, required: boolean): string | null {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    if (required) throw bad(`${field} boş olamaz.`);
    return null;
  }
  if (typeof raw !== 'string') throw bad(`${field} metin olmalı.`);
  const v = raw.trim().replace(/[ \t]+/g, ' ');
  const len = [...v].length;
  if (len < min || len > max || CONTROL_RE.test(v.replace(/\n/g, ''))) throw bad(`${field} ${min}-${max} karakter olmalı.`);
  return v;
}

/** Çalışma saatleri: { "mon": [["09:00","23:00"]], ... }. Gün başına en fazla 3 aralık. {} = kısıtsız. */
export function validateOpeningHours(raw: unknown): Record<string, [string, string][]> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw bad('Çalışma saatleri nesne olmalı.');
  const out: Record<string, [string, string][]> = {};
  for (const [day, ranges] of Object.entries(raw as Record<string, unknown>)) {
    if (!DAYS.includes(day)) throw bad(`Geçersiz gün: ${day}`);
    if (!Array.isArray(ranges) || ranges.length > 3) throw bad(`${day} için en fazla 3 aralık verilebilir.`);
    out[day] = ranges.map((r) => {
      if (!Array.isArray(r) || r.length !== 2 || !HHMM.test(String(r[0])) || !HHMM.test(String(r[1]))) {
        throw bad(`${day}: aralık ["SS:DD","SS:DD"] biçiminde olmalı.`);
      }
      return [String(r[0]), String(r[1])];
    });
  }
  return out;
}

export function validateCoord(raw: unknown, field: 'lat' | 'lng'): number | null {
  if (raw === null || raw === undefined) return null;
  const lim = field === 'lat' ? 90 : 180;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.abs(raw) > lim) throw bad(`${field} geçersiz.`);
  return raw;
}
