/**
 * The company's fiscal calendar.
 *
 *   Q1  Eylül   – Kasım
 *   Q2  Aralık  – Şubat      (yıl atlar)
 *   Q3  Mart    – Mayıs
 *   Q4  Haziran – Ağustos
 *
 * Lives in `lib/domain` rather than beside the seed data because the range
 * presets need it too, and the domain layer must not depend on seed fixtures.
 */

/** Mali yılın başladığı ay (1 = Ocak). */
export const FISCAL_START_MONTH = 9

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** Bir tarihin hangi mali yıla düştüğü. Eylül öncesi bir önceki yıla sayılır. */
export function fiscalYearOf(date: string): number {
  const parts = date.split('-').map(Number)
  const year = parts[0]!
  const month = parts[1]!
  return month >= FISCAL_START_MONTH ? year : year - 1
}

/**
 * Bir mali çeyreğin tarih aralığı.
 *
 * Ay taşması `Date.UTC` tarafından çözülür (ay 11 = Aralık, 12 = gelecek Ocak),
 * bitiş günü de "sonraki ayın 0. günü" ile bulunur — böylece Şubat ve artık
 * yıllar elle ay uzunluğu tablosu tutmadan doğru çıkar.
 */
export function fiscalQuarterRange(
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4,
): { startsOn: string; endsOn: string } {
  const startMonthIndex = FISCAL_START_MONTH - 1 + 3 * (quarter - 1)
  return {
    startsOn: iso(new Date(Date.UTC(fiscalYear, startMonthIndex, 1))),
    endsOn: iso(new Date(Date.UTC(fiscalYear, startMonthIndex + 3, 0))),
  }
}

/** Bir mali yılın tamamı: 1 Eylül'den ertesi 31 Ağustos'a. */
export function fiscalYearRange(fiscalYear: number): { startsOn: string; endsOn: string } {
  return {
    startsOn: fiscalQuarterRange(fiscalYear, 1).startsOn,
    endsOn: fiscalQuarterRange(fiscalYear, 4).endsOn,
  }
}
