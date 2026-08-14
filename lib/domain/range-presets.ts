import type { DateRange } from './dates'
import { fiscalYearOf, fiscalYearRange } from './fiscal'

export type PresetKey = 'fy' | 'period' | 'prevFy' | 'custom'

export interface PresetOption {
  key: Exclude<PresetKey, 'custom'>
  range: DateRange
}

export interface PresetInput {
  /** Today, in Istanbul time. */
  today: string
  /** The configured default range start — `app_settings.default_range_start`. */
  defaultStart: string
  /** The open period's span, or null when no period is open. */
  activePeriod: DateRange | null
}

/**
 * The picker's presets, in menu order. The first entry is the default the app
 * opens with, so `fy` leads.
 *
 * Ranges are resolved here rather than stored as names because they end up in
 * the URL: a link shared today must still show the same data tomorrow.
 */
export function buildPresets({ today, defaultStart, activePeriod }: PresetInput): PresetOption[] {
  const previous = fiscalYearRange(fiscalYearOf(today) - 1)

  const presets: PresetOption[] = [{ key: 'fy', range: { from: defaultStart, to: today } }]

  // Omitted rather than disabled: a preset that cannot resolve to a range has
  // nothing to navigate to.
  if (activePeriod) presets.push({ key: 'period', range: activePeriod })

  presets.push({ key: 'prevFy', range: { from: previous.startsOn, to: previous.endsOn } })

  return presets
}

/** Which preset a range came from, or `custom` when it matches none. */
export function matchPreset(range: DateRange, presets: readonly PresetOption[]): PresetKey {
  const hit = presets.find((p) => p.range.from === range.from && p.range.to === range.to)
  return hit?.key ?? 'custom'
}
