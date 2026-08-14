import type { Confidence, PeriodKind, Role, RollupRule } from '@/lib/domain/types'
import { fiscalYearOf, fiscalYearRange } from '@/lib/domain/fiscal'

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
  rollup: RollupRule
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

/**
 * Three fiscal years: last, current and next. The company runs annual OKRs — the
 * Excel workbook this data comes from covers 1 September 2025 to 31 August 2026 —
 * so the period IS the fiscal year, not a quarter within it.
 *
 * State is derived from the real date rather than a hard-coded "today": seeding
 * in a different year would otherwise mark the wrong year open.
 */
function buildPeriods(today: Date = new Date()): SeedPeriod[] {
  const stamp = today.toISOString().slice(0, 10)
  const currentFy = fiscalYearOf(stamp)

  return [currentFy - 1, currentFy, currentFy + 1].map((fy) => {
    const { startsOn, endsOn } = fiscalYearRange(fy)
    return {
      id: `p-${fy}-fy`,
      code: `${fy}-FY`,
      kind: 'year' as const,
      state: endsOn < stamp ? ('closed' as const) : startsOn > stamp ? ('planned' as const) : ('active' as const),
      startsOn,
      endsOn,
    }
  })
}

/** Bugünü içeren mali yıl — prototipin devam eden işi buraya bağlanır. */
function activePeriodId(periods: SeedPeriod[]): string {
  const active = periods.find((p) => p.state === 'active')
  if (!active) throw new Error('Bugünü içeren mali yıl bulunamadı — takvim hesabı bozuk.')
  return active.id
}

export const SEED_PERIODS: SeedPeriod[] = buildPeriods()

/** The prototype's in-progress work belongs to whichever fiscal year is open now. */
export const SEED_OBJECTIVE_PERIOD_ID = activePeriodId(SEED_PERIODS)

/** Same fiscal year, by code. Nothing should hard-code a period label. */
export const SEED_OBJECTIVE_PERIOD_CODE =
  SEED_PERIODS.find((p) => p.id === SEED_OBJECTIVE_PERIOD_ID)?.code ?? ''

/** A fiscal year that has already ended — used for back-filling history. */
export const SEED_CLOSED_PERIOD_CODE =
  [...SEED_PERIODS].reverse().find((p) => p.state === 'closed')?.code ?? ''

/**
 * The three real accounts. The prototype's 18 demo people are gone — this is a
 * live system now, and a personnel list nobody recognises is worse than none.
 *
 * All three are admins: the system is still being set up, and Bahadır needs to
 * enter data while Kağan and Oğuzhan configure it.
 */
export const SEED_USERS: SeedUser[] = [
  { id: "u-kagan.ozturk", name: "Kağan Öztürk", email: "kagan.ozturk@nove.group", role: "admin", departmentId: null },
  { id: "u-oguzhan.kizilcan", name: "Oğuzhan Kızılcan", email: "oguzhan.kizilcan@nove.group", role: "admin", departmentId: null },
  { id: "u-bahadir.temizer", name: "Bahadır Temizer", email: "bahadir.temizer@nove.group", role: "admin", departmentId: null },
]

/* ---------------------------------------------------------------------------
 * SEED_DEPARTMENTS — Excel'den aktarılan gerçek OKR verisi.
 *
 * Kaynak: "NOVE Group Sep 2025-Aug 2026 OKR Tracking", 10 sayfa.
 * 10 bölüm · 26 hedef · 63 key result. Hepsi 2025-FY dönemine bağlanır.
 *
 * Kurallar (tasarımdan):
 *  - current = start her yerde: sistem %0'dan açılır, gerçekleşen değerleri
 *    Bahadır girer. Excel'de 40 KR'da dolu değer vardı; bilinçli olarak alınmadı.
 *  - Yüzdeler Excel'de kesirdi (0.075); burada 7.5 + unit '%'.
 *  - conf her yerde 'mid': Excel'in "On track / At Risk" etiketleri atılan
 *    ölçümlere göre verilmişti, %0'dan başlayan tabloda yanıltıcı olurdu.
 *  - owner her yerde '': Excel'de 51 KR'da sahip yok, 12'sinde kişi değil rol
 *    etiketi var ("Ops Planning", "All", "Drs"). Sahiplik sonradan atanır.
 *  - rollup: aylık kırılım (Faz 2) bunu kullanır. 14 sum · 37 avg · 12 last.
 *  - updated: 0 — hiç güncelleme yapılmadı.
 *
 * `start === target` olan KR "ölçülemiyor" sayılır, rozetle işaretlenir ve
 * ortalamaya katılmaz. Bu dosyada iki tane var: k-mkt-cpl ve k-hop-anket-genel.
 * ------------------------------------------------------------------------- */

export const SEED_DEPARTMENTS: SeedDepartment[] = [
  {
    id: "sirket", emoji: "🏢", owner: "",
    name: { tr: "Şirket", en: "Company" },
    objectives: [
      {
        id: "o-sirket-1", code: "O1", owner: "",
        title: {
          tr: "Türkiye'nin en çok aranan saç ekim kliniği ol",
          en: "Become the most searched hair transplant clinic in Turkey",
        },
        krs: [
          { id: "k-sirket-operasyon", start: 0, current: 0, target: 3400, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Toplam operasyon sayısı", en: "Number of operations — all" } },
          { id: "k-sirket-aov", start: 0, current: 0, target: 5200, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Saç ekiminde ortalama sepet tutarı", en: "AOV — hair transplant" } },
          { id: "k-sirket-roas", start: 4.25, current: 4.25, target: 5.3, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Saç ekiminde ROAS'ı 5,3'e çıkar", en: "Increase ROAS — hair transplant" } },
          { id: "k-sirket-marka", start: 4.04, current: 4.04, target: 4.8, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Estenove marka bilinirliği skorunu artır", en: "Increase brand awareness score — Estenove" } },
          { id: "k-sirket-nps", start: 0, current: 0, target: 88, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "NPS'i (12. gün) 88'e çıkar", en: "Increase NPS (12th day)" } },
        ],
      },
    ],
  },

  {
    id: "pazarlama", emoji: "📢", owner: "",
    name: { tr: "Pazarlama", en: "Marketing" },
    objectives: [
      {
        id: "o-pzr-1", code: "O1", owner: "",
        title: { tr: "Hasta havuzunu büyüt", en: "Drive patient pipeline generation" },
        krs: [
          { id: "k-mkt-lead", start: 51500, current: 51500, target: 57500, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Yılda 57.500 lead üret (ayda 4.791)", en: "Generate 57,500 total leads annually (4,791/month)" } },
          // Excel'de başlangıç 0, hedef 77,5 yazıyordu. Maliyet DÜŞMESİ gereken bir
          // metrikte 0'dan 77,5'e çıkmak ilerleme sayılırdı — yön tersine dönerdi.
          // Bugünkü maliyet bilinmediği için start = target: "ölçülemiyor".
          { id: "k-mkt-cpl", start: 77.5, current: 77.5, target: 77.5, unit: "$", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Arama kampanyalarında lead maliyetini 77,5 doların altına indir", en: "Achieve cost per lead below $77.5 for search campaigns" } },
        ],
      },
      {
        id: "o-pzr-2", code: "O2", owner: "",
        title: { tr: "Estenove marka otoritesini kur", en: "Build Estenove brand authority" },
        krs: [
          { id: "k-mkt-arama", start: 74000, current: 74000, target: 100000, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "100.000 marka aramasına ulaş", en: "Reach 100,000 brand searches" } },
          { id: "k-mkt-organik", start: 10909, current: 10909, target: 14200, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Organik leadleri %30 artır", en: "Increase organic leads by 30%" } },
          { id: "k-mkt-seo", start: 20, current: 20, target: 60, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Hedef anahtar kelimelerin en az %60'ında ilk 10'a gir", en: "Rank in the top 10 for at least 60% of target SEO keywords" } },
        ],
      },
      {
        id: "o-pzr-3", code: "O3", owner: "",
        title: { tr: "Pazarlama verimliliğini optimize et", en: "Optimize marketing ROI and efficiency" },
        krs: [
          // Kullanıcı netleştirdi: %7,5 VARILACAK oran, artış miktarı değil.
          // Gerçek başlangıç bilinmiyor; 0'dan başlayınca ilerleme olduğundan
          // düşük görünür. Bahadır ilk ay girişinde başlangıcı düzeltebilir.
          { id: "k-mkt-cro", start: 0, current: 0, target: 7.5, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Google arama dönüşüm oranını %7,5'e çıkar", en: "Increase Google search conversion rate to 7.5%" } },
        ],
      },
      {
        id: "o-pzr-4", code: "O4", owner: "",
        title: { tr: "CRM ve sadakat pazarlamasını güçlendir", en: "Strengthen CRM and retention marketing" },
        krs: [
          { id: "k-mkt-crm", start: 1, current: 1, target: 5, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Uyuyan leadlerin en az %5'ini yeniden kazan", en: "Reactivate at least 5% of dormant leads" } },
        ],
      },
    ],
  },

  {
    id: "misafir", emoji: "🏨", owner: "",
    name: { tr: "Misafir Deneyimi", en: "Hospitality" },
    objectives: [
      {
        id: "o-msf-1", code: "O1", owner: "",
        title: { tr: "En çok tavsiye edilen saç ekim şirketi ol", en: "Become the most promoted hair transplant company" },
        krs: [
          { id: "k-msf-anket", start: 0, current: 0, target: 4.75, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Misafir deneyimi anket ortalaması", en: "Hospitality survey (average)" } },
          { id: "k-msf-yorum", start: 0, current: 0, target: 650, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Yeni Google ve Trustpilot 5 yıldız yorumu", en: "New Google and Trustpilot 5-star reviews" } },
          { id: "k-msf-nps", start: 73, current: 73, target: 88, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "NPS (12. gün)", en: "NPS (12th day)" } },
        ],
      },
      {
        id: "o-msf-2", code: "O2", owner: "",
        title: { tr: "Ek satışları artır", en: "Increase add-on sales" },
        krs: [
          { id: "k-msf-epi23", start: 0, current: 0, target: 269450, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Epi23 ve günlük tur satışları", en: "Epi23 and daily tour sales" } },
          { id: "k-msf-diger", start: 0, current: 0, target: 292680, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Diğer satışlar (otel, transfer vb.)", en: "Other sales (hotels, transfers, etc.)" } },
          { id: "k-msf-aftercare", start: 0, current: 0, target: 159500, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Aftercare ürün satışları", en: "Aftercare product sales" } },
        ],
      },
    ],
  },

  {
    id: "satis-kalite", emoji: "🎧", owner: "",
    name: { tr: "Satış Kalite", en: "Sales Performance & Quality" },
    objectives: [
      {
        id: "o-skl-1", code: "O1", owner: "",
        title: { tr: "Satış kalitesini yükselt", en: "Improve the quality of sales" },
        krs: [
          { id: "k-skl-skor", start: 98.87, current: 98.87, target: 99.5, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Kalite skorunu %99,50'ye çıkar", en: "Increase quality score to 99.50%" } },
          { id: "k-skl-stemcell", start: 0, current: 0, target: 95, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Tüm görüşmelerde stem cell paket tanıtımını %95'e çıkar", en: "Increase stem cell package mentions in all calls to 95%" } },
          { id: "k-skl-dusuk5", start: 96.68, current: 96.68, target: 98, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "En düşük 5 satıcı skorunu %98'e yükselt", en: "Raise the lowest five salesperson scores to 98%" } },
          { id: "k-skl-premium", start: 0, current: 0, target: 90, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Tüm görüşmelerde premium paket tanıtımını %90'a çıkar", en: "Increase premium package mentions in all calls to 90%" } },
        ],
      },
      {
        id: "o-skl-2", code: "O2", owner: "",
        title: { tr: "Analiz süreçlerini sistemleştir", en: "Systematize analysis processes" },
        krs: [
          { id: "k-skl-otomasyon", start: 0, current: 0, target: 100, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Görüşme dinleme ve puanlamayı %100 otomatikleştir", en: "Automate call listening and scoring and integrate fully" } },
        ],
      },
    ],
  },

  {
    id: "finans", emoji: "💰", owner: "",
    name: { tr: "Finans", en: "Finance" },
    objectives: [
      {
        id: "o-fin-1", code: "O1", owner: "",
        title: { tr: "Teşvikleri ve finansal tasarrufu artır", en: "Increase marketing incentives and financial savings" },
        krs: [
          { id: "k-fin-tesvik", start: 0, current: 0, target: 100, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Reklam giderlerinin %100'ünü ödemeden sonraki 1 gün içinde teşvik ekibine ilet", en: "Forward 100% of advertising expenses to the incentive team within one day of payment" } },
          // "Sezon başına 35.000$" — sezon tanımı netleşmedi, yılda tek sezon varsayıldı.
          { id: "k-fin-tedarik", start: 0, current: 0, target: 35000, unit: "$", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Yeni yıl tedarikçi anlaşmalarında sezon başına 35.000 dolar kâr sağla", en: "Cut total costs in new-year supplier agreements to achieve $35,000 profit per season" } },
        ],
      },
      {
        id: "o-fin-2", code: "O2", owner: "",
        title: { tr: "Hasta memnuniyetini artıran finansal süreçler kur", en: "Create financial processes that increase patient satisfaction" },
        krs: [
          { id: "k-fin-kayip", start: 2, current: 2, target: 1, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Ödeme süreçlerinde hasta/ödeme kaybını %1'in altına indir", en: "Reduce the patient and payment loss rate below 1%" } },
          { id: "k-fin-taksit", start: 0, current: 0, target: 50000, unit: "$", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Taksitli ödemeden 50.000 doları aşan ciro elde et", en: "Achieve over $50,000 revenue from instalment payments" } },
        ],
      },
      {
        id: "o-fin-3", code: "O3", owner: "",
        title: { tr: "Sürdürülebilirliğe katkı sağla", en: "Contribute to sustainability" },
        krs: [
          { id: "k-fin-tedarikci", start: 0, current: 0, target: 98, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Tedarikçi memnuniyetini %98 ve üzerine çıkar", en: "Achieve a supplier satisfaction rate of 98% or higher" } },
          { id: "k-fin-butce", start: 0, current: 0, target: 95, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Bütçe rakamlarına %95 uyum sağla", en: "Ensure 95% compliance with budget figures" } },
        ],
      },
    ],
  },

  {
    id: "insan-kultur", emoji: "👥", owner: "",
    name: { tr: "İnsan ve Kültür", en: "People & Culture" },
    objectives: [
      {
        id: "o-ikl-1", code: "O1", owner: "",
        title: { tr: "İşe alım verimliliğini artır", en: "Improve recruitment efficiency" },
        krs: [
          { id: "k-ikl-turnover1", start: 20, current: 20, target: 17, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "İlk yıl devir oranını %17'ye düşür", en: "Reduce first-year turnover to 17%" } },
          { id: "k-ikl-sure", start: 48, current: 48, target: 45, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Ortalama işe alım süresini 45 güne indir", en: "Reduce average time-to-hire to 45 days" } },
          { id: "k-ikl-kalite", start: 0, current: 0, target: 85, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "%85 işe alım kalitesi oranına ulaş", en: "Achieve an 85% quality-of-hire rate" } },
        ],
      },
      {
        id: "o-ikl-2", code: "O2", owner: "",
        title: { tr: "Yetenekleri geliştir ve sürdürülebilir büyümeyi destekle", en: "Develop and onboard talent to support sustainable growth" },
        krs: [
          { id: "k-ikl-egitim", start: 4.8, current: 4.8, target: 4.85, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Ortalama eğitim memnuniyetini 4,85 / 5 yap", en: "Achieve an average training satisfaction score of 4.85 / 5" } },
          { id: "k-ikl-oryantasyon", start: 91, current: 91, target: 95, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Yeni işe alımlarda %95 oryantasyon memnuniyeti sağla", en: "Achieve a 95% onboarding satisfaction score for new hires" } },
        ],
      },
      {
        id: "o-ikl-3", code: "O3", owner: "",
        title: { tr: "Yüksek performanslı ve mutlu bir ekip kur", en: "Build and sustain a high-performing, happy workforce" },
        krs: [
          { id: "k-ikl-gonullu", start: 26, current: 26, target: 23, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Gönüllü ayrılma oranını yıllık %23'e düşür", en: "Reduce voluntary turnover to around 23% annually" } },
          { id: "k-ikl-memnuniyet", start: 77, current: 77, target: 80, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Çalışan memnuniyetini %80'e çıkar", en: "Increase employee satisfaction to 80%" } },
          { id: "k-ikl-katilim", start: 78, current: 78, target: 84, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Yıllık memnuniyet anketinde %84 üzeri katılım sağla", en: "Reach 84%+ participation in the annual satisfaction survey" } },
        ],
      },
    ],
  },

  {
    id: "satis", emoji: "📈", owner: "",
    name: { tr: "Satış", en: "Sales" },
    objectives: [
      {
        id: "o-sat-1", code: "O1", owner: "",
        title: { tr: "Hasta sayısını artır", en: "Increase the number of patients" },
        krs: [
          { id: "k-sat-genel", start: 5.45, current: 5.45, target: 6, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Genel satış oranını %5,45'ten %6'ya çıkar", en: "Increase the overall sales rate from 5.45% to 6%" } },
          { id: "k-sat-italya", start: 0, current: 0, target: 200, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "İtalya ve Almanya'dan 200 hasta getir", en: "Bring 200 patients from Italy and Germany" } },
          { id: "k-sat-dis", start: 0, current: 0, target: 200, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Diş kategorisinde 200 hasta getir", en: "Bring 200 patients in the dental category" } },
          { id: "k-sat-fblost", start: 0, current: 0, target: 100, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "FB&Lost kategorisinde 100 satış üret", en: "Generate 100 sales in the FB&Lost category" } },
          { id: "k-sat-google", start: 4.2, current: 4.2, target: 4.8, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Google satış oranını %4,2'den %4,8'e çıkar", en: "Increase the Google sales rate from 4.2% to 4.8%" } },
          { id: "k-sat-organik", start: 12.2, current: 12.2, target: 13.5, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Organik lead satış oranını %12'den %13,5'e çıkar", en: "Increase the organic lead sales rate from 12% to 13.5%" } },
        ],
      },
      {
        id: "o-sat-2", code: "O2", owner: "",
        title: { tr: "Ortalama sepet tutarını artır", en: "Increase AOV" },
        krs: [
          { id: "k-sat-premium", start: 0, current: 0, target: 8, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Premium paket satış oranını %8'e çıkar", en: "Increase the premium package sales rate to 8%" } },
          { id: "k-sat-stemcell", start: 0, current: 0, target: 55, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Stem cell paket satış oranını %55'e çıkar", en: "Increase the stem cell package sales rate to 55%" } },
        ],
      },
    ],
  },

  {
    id: "medikal", emoji: "🩺", owner: "",
    name: { tr: "Medikal Operasyon", en: "Medical Operations" },
    objectives: [
      {
        id: "o-med-1", code: "O1", owner: "",
        title: { tr: "Medikal operasyon kalitesini artır", en: "Increase the quality of medical operations" },
        krs: [
          { id: "k-med-skor9", start: 0, current: 0, target: 9.2, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Medikal skor — 9 ay (klinik ortalaması)", en: "Medical score — 9 months (clinic average)" } },
          { id: "k-med-genel9", start: 0, current: 0, target: 8.5, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Genel skor — 9 ay (klinik ortalaması)", en: "Overall score — 9 months (clinic average)" } },
        ],
      },
      {
        id: "o-med-2", code: "O2", owner: "",
        title: { tr: "Müşteri memnuniyetini artır", en: "Increase customer satisfaction" },
        krs: [
          { id: "k-med-anket", start: 0, current: 0, target: 4.8, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Klinik bölümü anket ortalaması", en: "Clinic-part survey (average)" } },
          { id: "k-med-nps12", start: 0, current: 0, target: 88, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Survey Monkey — NPS (12. gün)", en: "Survey Monkey — NPS (12th day)" } },
          { id: "k-med-nps9", start: 0, current: 0, target: 70, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Survey Monkey — NPS (9. ay)", en: "Survey Monkey — NPS (9th month)" } },
          { id: "k-med-ekip", start: 0, current: 0, target: 4.8, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Survey Monkey — medikal ekip bölümü", en: "Survey Monkey — medical team part" } },
        ],
      },
    ],
  },

  {
    id: "hasta-op", emoji: "🛏️", owner: "",
    name: { tr: "Hasta Operasyon", en: "Patient Operations" },
    objectives: [
      {
        id: "o-hop-1", code: "O1", owner: "",
        title: { tr: "En çok tavsiye edilen saç ekim şirketi ol", en: "Become the most promoted hair transplant company" },
        krs: [
          { id: "k-hop-tercuman", start: 0, current: 0, target: 4.8, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Tercüman anket ortalaması", en: "Interpreters survey (average)" } },
          // Excel'de başlangıç 73, hedef 4,8 yazıyordu: NPS (73→88) ile 5'lik anket
          // ölçeği (4,75 / 4,8) karışmış. Doğru hedef bilinmiyor; start = target
          // bırakılıp "ölçülemiyor" işaretleniyor, Bahadır doğrusunu girecek.
          { id: "k-hop-anket-genel", start: 0, current: 0, target: 0, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Genel anket (1. gün)", en: "General survey (1st day)" } },
          { id: "k-hop-nps", start: 73, current: 73, target: 88, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Survey Monkey — NPS (12. gün)", en: "Survey Monkey — NPS (12th day)" } },
        ],
      },
      {
        id: "o-hop-2", code: "O2", owner: "",
        title: { tr: "Ek satışları artır", en: "Increase add-on sales" },
        krs: [
          { id: "k-hop-aftercare", start: 0, current: 0, target: 1329750, unit: "", conf: "mid", owner: "", updated: 0, rollup: "sum",
            title: { tr: "Aftercare ürün satışı", en: "Aftercare product sales" } },
          { id: "k-hop-satisorani", start: 0, current: 0, target: 70, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Müşteriye satış oranı", en: "Sales-to-customer rate" } },
        ],
      },
      {
        id: "o-hop-3", code: "O3", owner: "",
        title: { tr: "Operasyon hijyen standartlarını yükselt", en: "Increase operation hygiene standards" },
        krs: [
          { id: "k-hop-hijyen", start: 0, current: 0, target: 4.8, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Hijyen skoru anketi", en: "Hygiene score survey" } },
        ],
      },
      {
        id: "o-hop-4", code: "O4", owner: "",
        title: { tr: "Sarf malzemede bütçe uyumunu koru", en: "Maximize budget compliance for consumables" },
        krs: [
          // Excel'de başlangıç 0, hedef 1,1 (%110) yazıyordu. Bu bir TAVAN, ulaşılacak
          // hedef değil — %110'a çıkmak başarı gibi okunurdu. Düşürme hedefine
          // çevrildi: %110'dan %100'e.
          { id: "k-hop-sarf", start: 110, current: 110, target: 100, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Hasta başı sarf malzeme bütçenin %110'unu aşmasın", en: "Keep consumables per patient within 110% of budget" } },
        ],
      },
    ],
  },

  {
    id: "pre-op", emoji: "📋", owner: "",
    name: { tr: "Operasyon Öncesi", en: "Pre-Ops" },
    objectives: [
      {
        id: "o-pre-1", code: "O1", owner: "",
        title: { tr: "En çok tavsiye edilen saç ekim şirketi ol", en: "Become the most promoted hair transplant company" },
        krs: [
          { id: "k-pre-anket", start: 0, current: 0, target: 4.75, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Klinik bölümü anket ortalaması", en: "Clinic-part survey (average)" } },
          { id: "k-pre-nps", start: 73, current: 73, target: 88, unit: "", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "NPS (12. gün)", en: "NPS (12th day)" } },
        ],
      },
      {
        id: "o-pre-2", code: "O2", owner: "",
        title: { tr: "SAP'ta sarı bayrak modülünü devreye al", en: "Implement the yellow flags module in SAP" },
        krs: [
          { id: "k-pre-faz1", start: 0, current: 0, target: 1, unit: "", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Faz 1: her sarı bayrak hastası için varış öncesi klinik bilgi aracı", en: "Phase 1: clinic info tool for every yellow-flag patient before arrival" } },
          { id: "k-pre-faz2", start: 0, current: 0, target: 1, unit: "", conf: "mid", owner: "", updated: 0, rollup: "last",
            title: { tr: "Faz 2: sarı bayrak hastasını varış öncesi SAP'a işle", en: "Phase 2: implement yellow-flag patients in SAP before arrival" } },
        ],
      },
      {
        id: "o-pre-3", code: "O3", owner: "",
        title: { tr: "9 aylık sonuçları puanla", en: "Score nine-month results" },
        krs: [
          { id: "k-pre-skorlama", start: 0, current: 0, target: 65, unit: "%", conf: "mid", owner: "", updated: 0, rollup: "avg",
            title: { tr: "Medikal skorlama oranını artır (9 ay)", en: "Increase the percentage of medical scoring (9 months)" } },
        ],
      },
    ],
  },
]
