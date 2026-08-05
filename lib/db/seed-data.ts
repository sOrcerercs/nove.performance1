import type { Confidence, PeriodKind, Role } from '@/lib/domain/types'

/**
 * The prototype's data, extracted from `Component.seed()` rather than retyped,
 * so every start/current/target survives the port unchanged. Verified by
 * lib/db/__tests__/seed.test.ts: company progress must come out at 51%.
 */

export interface SeedKr {
  id: string
  title: { tr: string; en: string }
  start: number
  current: number
  target: number
  unit: string
  conf: Confidence
  owner: string
  /** Days since the last update in the prototype; becomes the initial updatedAt. */
  updated: number
}

export interface SeedObjective {
  id: string
  code: string
  title: { tr: string; en: string }
  owner: string
  krs: SeedKr[]
}

export interface SeedDepartment {
  id: string
  emoji: string
  name: { tr: string; en: string }
  owner: string
  objectives: SeedObjective[]
}

export interface SeedUser {
  id: string
  name: string
  email: string
  role: Role
  departmentId: string | null
}

export interface SeedPeriod {
  id: string
  code: string
  kind: PeriodKind
  state: 'active' | 'closed' | 'planned'
  startsOn: string
  endsOn: string
}

/* ------------------------------------------------------------------ *
 * Mali takvim
 *
 * Nove'un mali yılı **Eylül'de** başlar ve çeyrek etiketindeki yıl, mali yılın
 * *başladığı* yıldır. Yani `2026-Q1` = 1 Eylül 2026 – 30 Kasım 2026.
 *
 *   Q1  Eylül   – Kasım
 *   Q2  Aralık  – Şubat      (yıl atlar)
 *   Q3  Mart    – Mayıs
 *   Q4  Haziran – Ağustos
 * ------------------------------------------------------------------ */

/** Mali yılın başladığı ay (1 = Ocak). */
export const FISCAL_START_MONTH = 9

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** Bir tarihin hangi mali yıla düştüğü. Eylül öncesi bir önceki yıla sayılır. */
export function fiscalYearOf(date: Date): number {
  return date.getUTCMonth() + 1 >= FISCAL_START_MONTH
    ? date.getUTCFullYear()
    : date.getUTCFullYear() - 1
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

/**
 * Üç mali yıl: geçen, içinde bulunulan ve gelecek. Geçmiş çeyrekler İK'nın
 * geriye dönük veri girmesi, gelecek olanlar planlama için.
 *
 * Durum gerçek tarihten türetilir — sabit bir "bugün" gömmek, seed başka bir
 * yılda çalıştırıldığında yanlış çeyreği açık gösterirdi.
 */
function buildPeriods(today: Date = new Date()): SeedPeriod[] {
  const currentFy = fiscalYearOf(today)
  const stamp = iso(today)
  const out: SeedPeriod[] = []

  for (const fy of [currentFy - 1, currentFy, currentFy + 1]) {
    for (const q of [1, 2, 3, 4] as const) {
      const { startsOn, endsOn } = fiscalQuarterRange(fy, q)
      out.push({
        id: `p-${fy}-q${q}`,
        code: `${fy}-Q${q}`,
        kind: 'quarter',
        state: endsOn < stamp ? 'closed' : startsOn > stamp ? 'planned' : 'active',
        startsOn,
        endsOn,
      })
    }
  }

  return out
}

/** Bugünü içeren çeyrek — prototipin devam eden işi buraya bağlanır. */
function activeQuarterId(periods: SeedPeriod[]): string {
  const active = periods.find((p) => p.state === 'active')
  if (!active) throw new Error('Bugünü içeren çeyrek bulunamadı — mali takvim hesabı bozuk.')
  return active.id
}

export const SEED_PERIODS: SeedPeriod[] = buildPeriods()

/** The prototype's in-progress work belongs to whichever quarter is open now. */
export const SEED_OBJECTIVE_PERIOD_ID = activeQuarterId(SEED_PERIODS)

/** Same quarter, by code. Nothing should hard-code a quarter label. */
export const SEED_OBJECTIVE_PERIOD_CODE =
  SEED_PERIODS.find((p) => p.id === SEED_OBJECTIVE_PERIOD_ID)?.code ?? ''

/** A quarter that has already ended — used for back-filling history. */
export const SEED_CLOSED_PERIOD_CODE =
  [...SEED_PERIODS].reverse().find((p) => p.state === 'closed')?.code ?? ''

export const SEED_USERS: SeedUser[] = [
  { id: "u-deniz.aksoy", name: "Deniz Aksoy", email: "deniz.aksoy@nove.group", role: "staff", departmentId: "pazarlama" },
  { id: "u-berk.ucar", name: "Berk Uçar", email: "berk.ucar@nove.group", role: "staff", departmentId: "pazarlama" },
  { id: "u-selin.ates", name: "Selin Ateş", email: "selin.ates@nove.group", role: "staff", departmentId: "pazarlama" },
  { id: "u-murat.sen", name: "Murat Şen", email: "murat.sen@nove.group", role: "staff", departmentId: "saha" },
  { id: "u-gizem.kara", name: "Gizem Kara", email: "gizem.kara@nove.group", role: "staff", departmentId: "saha" },
  { id: "u-onur.bal", name: "Onur Bal", email: "onur.bal@nove.group", role: "staff", departmentId: "saha" },
  { id: "u-aylin.demir", name: "Aylin Demir", email: "aylin.demir@nove.group", role: "staff", departmentId: "kalite" },
  { id: "u-cem.yildiz", name: "Cem Yıldız", email: "cem.yildiz@nove.group", role: "staff", departmentId: "kalite" },
  { id: "u-kerem.polat", name: "Kerem Polat", email: "kerem.polat@nove.group", role: "staff", departmentId: "finans" },
  { id: "u-ece.tan", name: "Ece Tan", email: "ece.tan@nove.group", role: "staff", departmentId: "finans" },
  { id: "u-elif.cinar", name: "Elif Çınar", email: "elif.cinar@nove.group", role: "admin", departmentId: "ik" },
  { id: "u-nazli.er", name: "Nazlı Er", email: "nazli.er@nove.group", role: "admin", departmentId: "ik" },
  { id: "u-baris.koc", name: "Barış Koç", email: "baris.koc@nove.group", role: "staff", departmentId: "sdr" },
  { id: "u-tuna.aydin", name: "Tuna Aydın", email: "tuna.aydin@nove.group", role: "staff", departmentId: "sdr" },
  { id: "u-hakan.yalin", name: "Dr. Hakan Yalın", email: "hakan.yalin@nove.group", role: "staff", departmentId: "medikal" },
  { id: "u-sena.ok", name: "Dr. Sena Ok", email: "sena.ok@nove.group", role: "staff", departmentId: "medikal" },
  { id: "u-sibel.ari", name: "Sibel Arı", email: "sibel.ari@nove.group", role: "staff", departmentId: "ofis" },
  { id: "u-genel.mudurluk", name: "Genel Müdürlük", email: "yonetici@nove.group", role: "executive", departmentId: null },
]

export const SEED_DEPARTMENTS: SeedDepartment[] = [
  {
    id: "pazarlama", emoji: "📢", owner: "Deniz Aksoy",
    name: { tr: "Pazarlama", en: "Marketing" },
    objectives: [
      {
        id: "o-mkt-1", code: "O1", owner: "Deniz Aksoy",
        title: { tr: "Nitelikli lead maliyetini düşür", en: "Bring down qualified lead cost" },
        krs: [
          { id: "k1", start: 950, current: 720, target: 650, unit: "₺", conf: "mid", owner: "Deniz Aksoy", updated: 3,
            title: { tr: "Lead başına maliyeti 650 TL’ye indir", en: "Reduce cost per lead to ₺650" } },
          { id: "k2", start: 42000, current: 61000, target: 80000, unit: "", conf: "high", owner: "Berk Uçar", updated: 1,
            title: { tr: "Organik trafiği 80.000 oturuma çıkar", en: "Grow organic traffic to 80k sessions" } },
          { id: "k3", start: 18000, current: 24000, target: 35000, unit: "", conf: "low", owner: "Selin Ateş", updated: 9,
            title: { tr: "Instagram takipçisini 35.000’e çıkar", en: "Grow Instagram to 35k followers" } },
        ],
      },
    ],
  },
  {
    id: "saha", emoji: "🏨", owner: "Murat Şen",
    name: { tr: "Saha Operasyon", en: "Field Operations" },
    objectives: [
      {
        id: "o-saha-1", code: "O1", owner: "Murat Şen",
        title: { tr: "Misafir deneyim skorunu kalıcı olarak yükselt", en: "Permanently lift the guest experience score" },
        krs: [
          { id: "k4", start: 41, current: 54, target: 60, unit: "", conf: "high", owner: "Murat Şen", updated: 2,
            title: { tr: "NPS skorunu 60’a çıkar", en: "Raise NPS to 60" } },
          { id: "k5", start: 12, current: 7, target: 4, unit: "%", conf: "mid", owner: "Gizem Kara", updated: 4,
            title: { tr: "Transfer gecikme oranını %4’e düşür", en: "Cut transfer delay rate to 4%" } },
          { id: "k6", start: 68, current: 79, target: 85, unit: "%", conf: "high", owner: "Onur Bal", updated: 1,
            title: { tr: "Konaklama doluluğunu %85’e çıkar", en: "Raise accommodation occupancy to 85%" } },
        ],
      },
    ],
  },
  {
    id: "kalite", emoji: "🎯", owner: "Aylin Demir",
    name: { tr: "Kalite Kontrol", en: "Quality Control" },
    objectives: [
      {
        id: "o-kal-1", code: "O1", owner: "Aylin Demir",
        title: { tr: "Klinik süreç uyumunu standartlaştır", en: "Standardise clinical process compliance" },
        krs: [
          { id: "k7", start: 76, current: 88, target: 95, unit: "", conf: "high", owner: "Aylin Demir", updated: 2,
            title: { tr: "Denetim uyum skorunu 95’e çıkar", en: "Raise audit compliance score to 95" } },
          { id: "k8", start: 5.2, current: 3.4, target: 2, unit: "%", conf: "mid", owner: "Cem Yıldız", updated: 5,
            title: { tr: "Tekrar işlem oranını %2’ye düşür", en: "Reduce rework rate to 2%" } },
          { id: "k9", start: 60, current: 95, target: 100, unit: "%", conf: "high", owner: "Aylin Demir", updated: 1,
            title: { tr: "SOP kapsamasını %100’e tamamla", en: "Complete SOP coverage to 100%" } },
        ],
      },
    ],
  },
  {
    id: "finans", emoji: "💰", owner: "Kerem Polat",
    name: { tr: "Finans", en: "Finance" },
    objectives: [
      {
        id: "o-fin-1", code: "O1", owner: "Kerem Polat",
        title: { tr: "Nakit döngüsünü kısalt", en: "Shorten the cash cycle" },
        krs: [
          { id: "k10", start: 46, current: 38, target: 30, unit: "gün", conf: "mid", owner: "Kerem Polat", updated: 3,
            title: { tr: "Ortalama tahsilat süresini 30 güne indir", en: "Cut average collection to 30 days" } },
          { id: "k11", start: 34, current: 37, target: 41, unit: "%", conf: "mid", owner: "Kerem Polat", updated: 2,
            title: { tr: "Brüt marjı %41’e çıkar", en: "Raise gross margin to 41%" } },
          { id: "k12", start: 9, current: 6, target: 3, unit: "%", conf: "high", owner: "Ece Tan", updated: 6,
            title: { tr: "Bütçe sapmasını %3’e indir", en: "Reduce budget variance to 3%" } },
        ],
      },
    ],
  },
  {
    id: "ik", emoji: "👥", owner: "Elif Çınar",
    name: { tr: "İnsan Kaynakları", en: "People" },
    objectives: [
      {
        id: "o-ik-1", code: "O1", owner: "Elif Çınar",
        title: { tr: "Ekip bağlılığını ve yetkinliğini büyüt", en: "Grow engagement and capability" },
        krs: [
          { id: "k13", start: 62, current: 69, target: 78, unit: "", conf: "mid", owner: "Elif Çınar", updated: 2,
            title: { tr: "Çalışan bağlılık skorunu 78’e çıkar", en: "Raise engagement score to 78" } },
          { id: "k14", start: 28, current: 22, target: 15, unit: "%", conf: "low", owner: "Elif Çınar", updated: 7,
            title: { tr: "İlk yıl devir hızını %15’e düşür", en: "Cut first-year turnover to 15%" } },
          { id: "k15", start: 45, current: 81, target: 90, unit: "%", conf: "high", owner: "Nazlı Er", updated: 1,
            title: { tr: "Eğitim tamamlama oranını %90’a çıkar", en: "Raise training completion to 90%" } },
        ],
      },
      {
        id: "o-ik-2", code: "O2", owner: "Nazlı Er",
        title: { tr: "İşe alım hızını artır", en: "Speed up hiring" },
        krs: [
          { id: "k16", start: 41, current: 33, target: 25, unit: "gün", conf: "mid", owner: "Nazlı Er", updated: 3,
            title: { tr: "Time-to-hire’ı 25 güne indir", en: "Cut time-to-hire to 25 days" } },
          { id: "k17", start: 12, current: 14, target: 25, unit: "%", conf: "low", owner: "Elif Çınar", updated: 8,
            title: { tr: "İç terfi oranını %25’e çıkar", en: "Raise internal promotion rate to 25%" } },
        ],
      },
    ],
  },
  {
    id: "sdr", emoji: "💼", owner: "Barış Koç",
    name: { tr: "SDR/Satış", en: "SDR/Sales" },
    objectives: [
      {
        id: "o-sdr-1", code: "O1", owner: "Barış Koç",
        title: { tr: "Dönüşüm hunisini sıkılaştır", en: "Tighten the conversion funnel" },
        krs: [
          { id: "k18", start: 18, current: 26, target: 30, unit: "%", conf: "high", owner: "Barış Koç", updated: 1,
            title: { tr: "Lead→konsültasyon oranını %30’a çıkar", en: "Raise lead→consult rate to 30%" } },
          { id: "k19", start: 31, current: 33, target: 45, unit: "%", conf: "low", owner: "Tuna Aydın", updated: 6,
            title: { tr: "Konsültasyon→işlem oranını %45’e çıkar", en: "Raise consult→procedure rate to 45%" } },
          { id: "k20", start: 4200, current: 4750, target: 5500, unit: "€", conf: "mid", owner: "Barış Koç", updated: 2,
            title: { tr: "Ortalama sepeti 5.500 €’ya çıkar", en: "Raise average basket to €5,500" } },
        ],
      },
    ],
  },
  {
    id: "medikal", emoji: "🩺", owner: "Dr. Hakan Yalın",
    name: { tr: "Medikal Operasyon", en: "Medical Operations" },
    objectives: [
      {
        id: "o-med-1", code: "O1", owner: "Dr. Hakan Yalın",
        title: { tr: "Komplikasyon oranını düşür, kapasiteyi büyüt", en: "Reduce complications, grow capacity" },
        krs: [
          { id: "k21", start: 2.4, current: 1.9, target: 1, unit: "%", conf: "mid", owner: "Dr. Hakan Yalın", updated: 2,
            title: { tr: "Komplikasyon oranını %1,0’a düşür", en: "Cut complication rate to 1.0%" } },
          { id: "k22", start: 14, current: 17, target: 22, unit: "", conf: "mid", owner: "Dr. Sena Ok", updated: 3,
            title: { tr: "Günlük vaka kapasitesini 22’ye çıkar", en: "Grow daily case capacity to 22" } },
          { id: "k23", start: 58, current: 74, target: 90, unit: "%", conf: "high", owner: "Dr. Sena Ok", updated: 1,
            title: { tr: "30. gün hasta takibini %90’a çıkar", en: "Raise 30-day follow-up to 90%" } },
        ],
      },
    ],
  },
  {
    id: "ofis", emoji: "🛏️", owner: "Sibel Arı",
    name: { tr: "Ofis Operasyon", en: "Office Operations" },
    objectives: [
      {
        id: "o-ofs-1", code: "O1", owner: "Sibel Arı",
        title: { tr: "Operasyonel maliyeti optimize et", en: "Optimise operating cost" },
        krs: [
          { id: "k24", start: 1850, current: 1620, target: 1400, unit: "₺", conf: "mid", owner: "Sibel Arı", updated: 4,
            title: { tr: "Kişi başı ofis maliyetini 1.400 TL’ye indir", en: "Cut office cost per head to ₺1,400" } },
          { id: "k25", start: 6, current: 4.8, target: 2, unit: "%", conf: "low", owner: "Sibel Arı", updated: 11,
            title: { tr: "Envanter fire oranını %2’ye düşür", en: "Cut inventory waste to 2%" } },
        ],
      },
    ],
  },
]
