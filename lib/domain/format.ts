import type { Lang } from './types'

const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US' }

/**
 * Number formatting, ported from the prototype's `fmt`.
 *
 * Fractional values get exactly one decimal with the locale's separator;
 * integers of 1000 or more get locale grouping; anything else prints bare.
 * Missing or non-numeric values render as an em dash rather than "NaN".
 */
export function formatNumber(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'

  if (!Number.isInteger(n)) {
    return n.toFixed(1).replace('.', lang === 'tr' ? ',' : '.')
  }
  if (Math.abs(n) >= 1000) return n.toLocaleString(LOCALE[lang])
  return String(n)
}

/**
 * Like formatNumber, but keeps up to two decimals (trimmed) instead of one —
 * for tables where 4.74 vs 4.75 matters (survey scores, rates). Also removes
 * float noise such as 1.6 − 1.5 = 0.10000000000000009, and never prints "-0".
 */
export function formatPrecise(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const out = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 }).format(n)
  return out === '-0' ? '0' : out
}

/** formatValue with formatPrecise's number. */
/** A KR weight as a percentage: TR "%40", EN "40%" (up to two decimals). */
export function formatWeight(n: number, lang: Lang): string {
  const s = formatPrecise(n, lang)
  return lang === 'en' ? `${s}%` : `%${s}`
}

export function formatValuePrecise(n: number, unit: string, lang: Lang): string {
  const num = formatPrecise(n, lang)
  if (!unit) return num
  return unit === '%' ? `${num}%` : `${num} ${unit}`
}

/** "Eylül 2026" / "September 2026" — the full month name, for table rows. */
export function formatMonthLong(month: string, lang: Lang): string {
  const [year, index] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString(LOCALE[lang], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** A measurement with its unit. Percent hugs the number; every other unit gets a space. */
export function formatValue(n: number, unit: string, lang: Lang): string {
  const num = formatNumber(n, lang)
  if (!unit) return num
  return unit === '%' ? `${num}%` : `${num} ${unit}`
}

/** Avatar initials: first letters of the first two words, ignoring a "Dr." title. */
export function initials(name: string): string {
  return String(name)
    .replace('Dr. ', '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * An ISO date in the reader's convention: `10.08.2026` in Turkish,
 * `Aug 10, 2026` in English.
 *
 * The `Date` is built and formatted in UTC on purpose. Parsing `2025-09-01`
 * into local time and formatting it locally would print 31 August anywhere west
 * of UTC — the range label would disagree with the range.
 */
export function formatDate(date: string, lang: Lang): string {
  const [year, month, day] = date.split('-') as [string, string, string]
  if (lang === 'tr') return `${day}.${month}.${year}`

  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utc)
}

/**
 * Short month names, indexed by month number − 1.
 *
 * Lives here rather than in the chart that used to own it because three places
 * now need it: the trend axis, a key result's "son veri" marker, and
 * `formatMonth`.
 */
export const MONTH_NAMES: Record<Lang, readonly string[]> = {
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

/** A `YYYY-MM` month as a short name and year: `Eyl 2025` / `Sep 2025`. */
export function formatMonth(month: string, lang: Lang): string {
  const [year, index] = month.split('-') as [string, string]
  return `${MONTH_NAMES[lang][Number(index) - 1] ?? month} ${year}`
}

/**
 * A cutoff date as a phrase. Turkish puts the postposition after the date and
 * English its preposition before it, so this cannot be an i18n string with the
 * date appended — the word order is part of the translation.
 */
export function formatAsOf(date: string, lang: Lang): string {
  return lang === 'tr'
    ? `${formatDate(date, 'tr')} itibarıyla`
    : `as of ${formatDate(date, 'en')}`
}

/**
 * True when a `YYYY-MM` measurement month is strictly earlier than the
 * cutoff month — the condition the "son veri" marker exists to show. Must
 * stay `<`, never `<=`: "son veri: Mar 2026" while already looking at March
 * would be noise, not information. `month` is `null` for a key result with
 * no monthly rows at all (the summary bridge), which this treats as never
 * "before" anything, not as vacuously true.
 *
 * Single-sourced because two call sites (`KrRow`, `AttentionList`) need the
 * exact same comparison — writing it out twice is how one of them quietly
 * drifts to `<=`.
 */
export function isBeforeCutoff(month: string | null, asOfMonth: string | undefined): month is string {
  return month !== null && asOfMonth !== undefined && month < asOfMonth
}

/**
 * A count with its noun: `3 objective` in Turkish, which never pluralises
 * after a number, and `3 objectives` / `1 objective` in English. Only for
 * nouns spelled the same in both languages — objective, key result, check-in.
 * "KR" is an abbreviation and is not passed through here.
 */
export function formatCount(n: number, noun: string, lang: Lang): string {
  return lang === 'en' && n !== 1 ? `${n} ${noun}s` : `${n} ${noun}`
}

/** Elapsed whole days as a phrase: `3 gün önce` / `3 days ago`, `1 day ago`. */
export function formatDaysAgo(days: number, lang: Lang): string {
  if (lang === 'tr') return `${days} gün önce`
  return days === 1 ? '1 day ago' : `${days} days ago`
}

/** `3 gün önce güncellendi` / `updated 3 days ago`. */
export function formatUpdatedAgo(days: number, lang: Lang): string {
  return lang === 'tr' ? `${formatDaysAgo(days, 'tr')} güncellendi` : `updated ${formatDaysAgo(days, 'en')}`
}
