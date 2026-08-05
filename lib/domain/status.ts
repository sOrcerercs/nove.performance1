import type { StatusKey } from './types'

/**
 * Bands from the "Performans Yönetim Süreci Puanlama Tablosu":
 *
 * | Değerlendirme        | Puan aralığı |
 * | -------------------- | ------------ |
 * | Gelişime Açık        | ≤ 59         |
 * | Beklenenin Altında   | 60–79        |
 * | Beklenen             | 80–100       |
 * | Beklenenin Üzerinde  | 101–130      |
 *
 * `none` sits underneath the table: 0% means nothing has been entered yet, so
 * it reads as "Başlamadı" rather than as genuinely low performance.
 *
 * Order matters: first match from the top wins.
 */
export function statusOf(pct: number): StatusKey {
  if (pct >= 101) return 'above'
  if (pct >= 80) return 'expected'
  if (pct >= 60) return 'below'
  if (pct >= 1) return 'open'
  return 'none'
}

/** "Gelişime Açık KR" in the KPI row and the attention list: 59% or under. */
export const isOpenToDevelopment = (pct: number): boolean => pct <= 59

/**
 * CSS custom-property names for each status. Components read these rather than
 * hard-coding hex values so the palette stays in tokens.css.
 */
export const STATUS_VARS: Record<StatusKey, { fg: string; bg: string }> = {
  above: { fg: 'var(--info-fg)', bg: 'var(--info-bg)' },
  expected: { fg: 'var(--success-fg)', bg: 'var(--success-bg)' },
  below: { fg: 'var(--warning-fg)', bg: 'var(--warning-bg)' },
  open: { fg: 'var(--danger-fg)', bg: 'var(--danger-bg)' },
  none: { fg: 'var(--neutral-fg)', bg: 'var(--neutral-bg)' },
}
