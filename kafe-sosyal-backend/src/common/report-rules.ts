export const REPORT_REASONS = ['spam', 'harassment', 'fake_account', 'inappropriate_photo', 'underage', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_CONTEXTS = ['profile', 'chat', 'invitation'] as const;
export type ReportContext = (typeof REPORT_CONTEXTS)[number];

/** Öncelik: 1 normal, 2 yüksek (taciz, reşit olmayan şüphesi); 3 yalnızca "Rahatsızım" için ayrılmıştır. */
export function reportPriority(reason: ReportReason): number {
  return reason === 'harassment' || reason === 'underage' ? 2 : 1;
}
