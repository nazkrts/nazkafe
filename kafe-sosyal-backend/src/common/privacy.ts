export type CountBucket = 'none' | 'few' | 'exact' | 'many';

export interface CountLabel {
  bucket: CountBucket;
  /** İstemcinin göstereceği etiket. 'few' için istemci yerelleştirilmiş "Birkaç" metnini kullanır. */
  label: string;
}

/**
 * Kafe kartlarındaki sayılar tek tek kişiyi tespit etmeye yaklaşmasın diye kovalanır:
 * 0 → none, 1-2 → few ("birkaç"), 3-9 → tam sayı, 10+ → "10+".
 * Ham sayı istemciye hiçbir zaman gönderilmez (3-9 aralığındaki tam sayı hariç).
 */
export function formatCount(n: number): CountLabel {
  if (!Number.isFinite(n) || n <= 0) return { bucket: 'none', label: '0' };
  if (n <= 2) return { bucket: 'few', label: 'Birkaç' };
  if (n < 10) return { bucket: 'exact', label: String(Math.floor(n)) };
  return { bucket: 'many', label: '10+' };
}

/** Kafe paneli istatistiklerinde bu değerden küçük gruplar gösterilmez. */
export const MIN_GROUP_SIZE = 5;
