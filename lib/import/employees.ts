import { wouldCreateCycle } from '@/lib/auth/hierarchy'

/**
 * Plans loading the HR employee list (Employee List - Oct 2026.xlsx) and the
 * five organisation charts into `users`. Pure: the script reads the files and
 * the database, this decides what to write, and the script writes it.
 *
 * The list has no email and no manager column. Managers come from the charts;
 * anything the charts do not cover is assigned on the Kullanıcılar screen.
 * A re-run only ever fills blanks, so it cannot undo an assignment made there.
 */

export interface EmployeeRow { name: string; surname: string; department: string; position: string }
export interface ExistingUser {
  id: string; name: string; departmentId: string | null; title: string | null
  managerId: string | null; state: 'active' | 'passive'
}
export interface DeptRef { id: string; nameTr: string }
export interface NewDepartment { slug: string; emoji: string; nameTr: string; nameEn: string }
/** Manager's display name → the display names of their direct reports, as on the charts. */
export type OrgChart = Record<string, string[]>
export interface OrgData { chart: OrgChart; aliases: Record<string, string> }
export interface PlannedCreate { key: string; name: string; title: string | null; departmentNameTr: string | null; role: 'staff' | 'executive' }
export interface PlannedUpdate { userId: string; name: string; title?: string; departmentNameTr?: string }
export interface PlannedManager {
  personKey: string; personName: string; managerKey: string; managerName: string
  /** Set when the person already exists; null for someone this run creates. */
  existingUserId: string | null
}
export interface ImportPlan {
  creates: PlannedCreate[]
  updates: PlannedUpdate[]
  managers: PlannedManager[]
  newDepartments: NewDepartment[]
  untouched: { id: string; name: string }[]
  unresolvedChartNames: string[]
  similarNames: { listName: string; existingName: string }[]
  /** Creates named only from the list's CAPITALS (no chart/existing spelling) that contain I/ı — the dotless/dotted guess may be wrong. */
  uncertainCasing: string[]
  errors: string[]
}

export const EXECUTIVE = Symbol('executive')

/** HR's department name → the system's `name_tr`. Decided with the user on 2026-10-01. */
export const DEPARTMENT_MAP: Record<string, string | typeof EXECUTIVE> = {
  'Pazarlama': 'Pazarlama',
  'Finans': 'Finans',
  'İnsan ve Kültür': 'İnsan ve Kültür',
  'Satış': 'Satış',
  'Medikal Operasyon': 'Medikal Operasyon',
  'Uluslararası Misafir Deneyimi': 'Misafir Deneyimi',
  'Satış Performans ve Kalite': 'Satış Kalite',
  'Hasta Hizmetleri': 'Hasta Operasyon',
  'Satış Geliştirme Departmanı (SDR)': 'SDR',
  'İdari İşler': 'İdari İşler',
  'Yönetim Kurulu': EXECUTIVE,
}

export const NEW_DEPARTMENTS: NewDepartment[] = [
  { slug: 'sdr', emoji: '📞', nameTr: 'SDR', nameEn: 'Sales Development' },
  { slug: 'idari-isler', emoji: '🗂️', nameTr: 'İdari İşler', nameEn: 'Administrative Affairs' },
]

/** "A. BERNİS" → "A. Bernis": lower-cased with Turkish rules, each word capitalised. */
export function toTitleCaseTr(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLocaleLowerCase('tr')
      return lower.charAt(0).toLocaleUpperCase('tr') + lower.slice(1)
    })
    .join(' ')
}

/** Matching key: Turkish lower-case, then ı folded to i so I, İ, ı and i all compare equal. */
export function normaliseName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr').replace(/ı/g, 'i')
}

/** Same surname and at least one shared given name — a probable second spelling. */
function looksLikeSamePerson(a: string, b: string): boolean {
  const pa = normaliseName(a).split(' ')
  const pb = normaliseName(b).split(' ')
  if (pa.length < 2 || pb.length < 2 || pa.at(-1) !== pb.at(-1)) return false
  const givenB = new Set(pb.slice(0, -1))
  return pa.slice(0, -1).some((g) => givenB.has(g))
}

export function planImport(
  rows: readonly EmployeeRow[],
  existing: readonly ExistingUser[],
  depts: readonly DeptRef[],
  org: OrgData = { chart: {}, aliases: {} },
): ImportPlan {
  const errors: string[] = []
  const aliasByKey = new Map(Object.entries(org.aliases).map(([from, to]) => [normaliseName(from), toTitleCaseTr(to)]))
  /** Applies an alias, then title-cases: the one display name a person ends up with. */
  const canonical = (raw: string) => aliasByKey.get(normaliseName(raw)) ?? toTitleCaseTr(raw)

  // The charts' own (mixed-case) spellings, by matching key: preferred over a guess from the list's capitals.
  const chartSpelling = new Map<string, string>()
  for (const [manager, reports] of Object.entries(org.chart)) {
    for (const n of [manager, ...reports]) chartSpelling.set(normaliseName(canonical(n)), canonical(n))
  }

  const known = new Set(depts.map((d) => d.nameTr))
  const existingByKey = new Map(existing.map((u) => [normaliseName(u.name), u]))
  const seen = new Set<string>()
  const matched = new Set<string>()
  const neededNew = new Map<string, NewDepartment>()
  const creates: PlannedCreate[] = []
  const updates: PlannedUpdate[] = []
  const similarNames: ImportPlan['similarNames'] = []
  const uncertainCasing: string[] = []

  rows.forEach((r, i) => {
    const line = i + 2 // header is line 1
    const raw = `${r.name} ${r.surname}`
    const listName = canonical(raw)
    const chartName = chartSpelling.get(normaliseName(listName))
    const name = chartName ?? listName
    if (name.trim() === '') { errors.push(`Satır ${line}: ad boş.`); return }

    const key = normaliseName(name)
    if (seen.has(key)) { errors.push(`Satır ${line}: "${name}" listede birden fazla kez geçiyor.`); return }
    seen.add(key)

    const mapped = DEPARTMENT_MAP[r.department.trim()]
    if (mapped === undefined) { errors.push(`Satır ${line}: bilinmeyen bölüm "${r.department}".`); return }

    let departmentNameTr: string | null = null
    let role: 'staff' | 'executive' = 'staff'
    if (mapped === EXECUTIVE) {
      role = 'executive'
    } else {
      departmentNameTr = mapped
      if (!known.has(mapped)) {
        const fresh = NEW_DEPARTMENTS.find((d) => d.nameTr === mapped)
        if (!fresh) { errors.push(`Satır ${line}: "${mapped}" bölümü sistemde yok.`); return }
        neededNew.set(fresh.nameTr, fresh)
      }
    }

    const title = r.position.trim() || null
    const match = existingByKey.get(key)
    if (match) {
      matched.add(match.id)
      const update: PlannedUpdate = { userId: match.id, name: match.name }
      if (!match.title && title) update.title = title
      if (!match.departmentId && departmentNameTr) update.departmentNameTr = departmentNameTr
      if (update.title || update.departmentNameTr) updates.push(update)
      return
    }

    if (!chartName && !aliasByKey.has(normaliseName(raw)) && /[Iı]/.test(name)) uncertainCasing.push(name)
    const near = existing.find((u) => looksLikeSamePerson(name, u.name))
    if (near) similarNames.push({ listName: name, existingName: near.name })
    creates.push({ key, name, title, departmentNameTr, role })
  })

  // ---- organisation charts → manager links ----
  const nameOfKey = new Map<string, string>()
  for (const u of existing) nameOfKey.set(normaliseName(u.name), u.name)
  for (const c of creates) nameOfKey.set(c.key, c.name)

  const unresolved = new Set<string>()
  const managerOf = new Map<string, string>() // personKey → managerKey
  for (const [managerRaw, reports] of Object.entries(org.chart)) {
    const managerKey = normaliseName(canonical(managerRaw))
    if (!nameOfKey.has(managerKey)) { unresolved.add(canonical(managerRaw)); continue }
    for (const reportRaw of reports) {
      const personKey = normaliseName(canonical(reportRaw))
      if (!nameOfKey.has(personKey)) { unresolved.add(canonical(reportRaw)); continue }
      const prior = managerOf.get(personKey)
      if (prior && prior !== managerKey) {
        errors.push(`"${nameOfKey.get(personKey)}" şemada iki yöneticinin altında: "${nameOfKey.get(prior)}" ve "${nameOfKey.get(managerKey)}".`)
        continue
      }
      managerOf.set(personKey, managerKey)
    }
  }

  // The final graph — existing links plus the chart's — must not loop.
  const idOfKey = (k: string) => existingByKey.get(k)?.id ?? `new:${k}`
  const graph = [
    ...existing.map((u) => ({ id: u.id, managerId: u.managerId })),
    ...creates.map((c) => ({ id: `new:${c.key}`, managerId: null as string | null })),
  ]
  const managers: PlannedManager[] = []
  for (const [personKey, managerKey] of managerOf) {
    const person = existingByKey.get(personKey)
    if (person?.managerId) continue // filled already: never overwrite
    const node = graph.find((g) => g.id === idOfKey(personKey))
    if (!node) continue
    if (wouldCreateCycle(node.id, idOfKey(managerKey), graph)) {
      errors.push(`"${nameOfKey.get(personKey)}" → "${nameOfKey.get(managerKey)}" bağı döngü oluşturuyor.`)
      continue
    }
    node.managerId = idOfKey(managerKey)
    managers.push({
      personKey, personName: nameOfKey.get(personKey) as string,
      managerKey, managerName: nameOfKey.get(managerKey) as string,
      existingUserId: person?.id ?? null,
    })
  }

  return {
    creates,
    updates,
    managers,
    newDepartments: [...neededNew.values()],
    untouched: existing.filter((u) => !matched.has(u.id)).map((u) => ({ id: u.id, name: u.name })),
    unresolvedChartNames: [...unresolved],
    similarNames,
    uncertainCasing,
    errors,
  }
}

/** Tab-separated, first line headers; only the columns the import needs are read. */
export function parseTsv(text: string): EmployeeRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = (lines.shift() ?? '').split('\t').map((h) => h.trim())
  const col = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`TSV'de "${name}" kolonu yok.`)
    return i
  }
  const [n, s, d, p] = [col('Name'), col('Surname'), col('Departman'), col('Pozisyonu')]
  return lines.map((l) => {
    const c = l.split('\t')
    return { name: c[n] ?? '', surname: c[s] ?? '', department: c[d] ?? '', position: c[p] ?? '' }
  })
}
