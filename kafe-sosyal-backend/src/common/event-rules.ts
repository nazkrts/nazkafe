import { cleanText } from './cafe-rules';
import { AppError } from './errors';

export const EVENT_CATEGORIES = ['quiz', 'tasting', 'boardgames', 'networking', 'music', 'other'] as const;
export const MAX_EVENT_HOURS = 12;
export const MAX_EVENT_DAYS_AHEAD = 180;
export const MAX_CAPACITY = 500;

export interface EventFields {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  capacity?: unknown;
}
export interface CleanEvent {
  title: string;
  description: string | null;
  category: string | null;
  starts_at: Date;
  ends_at: Date;
  capacity: number | null;
}

const bad = (msg: string) => new AppError('INVALID_EVENT', msg, 422);

function parseDate(raw: unknown, field: string): Date {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) throw bad(`${field} ISO 8601 biçiminde olmalı.`);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw bad(`${field} geçersiz.`);
  return d;
}

/**
 * Etkinlik alanlarını doğrular. `requireFuture` yeni etkinlikte ve başlangıç değişince true:
 * başlangıç gelecekte ve en fazla 180 gün sonrası olmalı. Süre en fazla 12 saat.
 */
export function buildEvent(f: EventFields, now: Date, requireFuture: boolean): CleanEvent {
  const title = cleanText(f.title, 'Başlık', 3, 80, true)!;
  const description = cleanText(f.description, 'Açıklama', 1, 500, false);
  let category: string | null = null;
  if (f.category !== null && f.category !== undefined) {
    if (typeof f.category !== 'string' || !(EVENT_CATEGORIES as readonly string[]).includes(f.category)) {
      throw bad(`Kategori şunlardan biri olmalı: ${EVENT_CATEGORIES.join(', ')}`);
    }
    category = f.category;
  }
  const starts_at = parseDate(f.starts_at, 'Başlangıç');
  const ends_at = parseDate(f.ends_at, 'Bitiş');
  if (ends_at <= starts_at) throw bad('Bitiş, başlangıçtan sonra olmalı.');
  if (ends_at.getTime() - starts_at.getTime() > MAX_EVENT_HOURS * 3600_000) throw bad(`Etkinlik en fazla ${MAX_EVENT_HOURS} saat sürebilir.`);
  if (requireFuture) {
    if (starts_at <= now) throw bad('Başlangıç gelecekte olmalı.');
    if (starts_at.getTime() - now.getTime() > MAX_EVENT_DAYS_AHEAD * 86400_000) throw bad(`En fazla ${MAX_EVENT_DAYS_AHEAD} gün sonrası için etkinlik oluşturulabilir.`);
  }
  let capacity: number | null = null;
  if (f.capacity !== null && f.capacity !== undefined) {
    if (typeof f.capacity !== 'number' || !Number.isInteger(f.capacity) || f.capacity < 1 || f.capacity > MAX_CAPACITY) {
      throw bad(`Kapasite 1-${MAX_CAPACITY} arasında bir tam sayı olmalı.`);
    }
    capacity = f.capacity;
  }
  return { title, description, category, starts_at, ends_at, capacity };
}

/** Kafe paneli istatistiklerinde yorumlanabilirlik için toplam, 5'in katına yuvarlanır (artık çıkarımını önler). */
export function floorToGroup(n: number, k = 5): number | null {
  return n < k ? null : Math.floor(n / k) * k;
}
