import { expect, test } from 'vitest'
import { normaliseName, parseTsv, planImport, toTitleCaseTr } from '../employees'

const DEPTS = [
  { id: 'satis', nameTr: 'Satış' },
  { id: 'misafir', nameTr: 'Misafir Deneyimi' },
  { id: 'hasta-op', nameTr: 'Hasta Operasyon' },
  { id: 'satis-kalite', nameTr: 'Satış Kalite' },
]
const row = (name: string, surname: string, department: string, position = 'Uzman') => ({ name, surname, department, position })
const existing = (id: string, name: string, extra: Partial<{ departmentId: string; title: string; managerId: string }> = {}) => ({
  id, name, departmentId: extra.departmentId ?? null, title: extra.title ?? null, managerId: extra.managerId ?? null, state: 'active' as const,
})

test('Turkish title case handles İ and I correctly', () => {
  expect(toTitleCaseTr('AHMET CAN AZAK')).toBe('Ahmet Can Azak')
  expect(toTitleCaseTr('A. BERNİS ÖZDEMİR')).toBe('A. Bernis Özdemir')
  expect(toTitleCaseTr('ILGAZ IŞIK')).toBe('Ilgaz Işık')
  expect(toTitleCaseTr('ŞENOL İĞİT')).toBe('Şenol İğit')
})

test('names compare regardless of case and spacing', () => {
  expect(normaliseName('  ŞENOL   İĞİT ')).toBe(normaliseName('Şenol İğit'))
})

test('maps HR departments onto the system’s, and the board onto executives', () => {
  const plan = planImport([
    row('AYŞE', 'YILMAZ', 'Uluslararası Misafir Deneyimi'),
    row('MEHMET', 'KAYA', 'Hasta Hizmetleri'),
    row('CAN', 'DEMİR', 'Yönetim Kurulu', 'Yön.Kur.Başkanı'),
  ], [], DEPTS)
  expect(plan.errors).toEqual([])
  expect(plan.creates.map((c) => [c.name, c.departmentNameTr, c.role])).toEqual([
    ['Ayşe Yılmaz', 'Misafir Deneyimi', 'staff'],
    ['Mehmet Kaya', 'Hasta Operasyon', 'staff'],
    ['Can Demir', null, 'executive'],
  ])
})

test('SDR and İdari İşler are planned as new departments when missing', () => {
  const plan = planImport([row('A', 'B', 'Satış Geliştirme Departmanı (SDR)'), row('C', 'D', 'İdari İşler')], [], DEPTS)
  expect(plan.newDepartments.map((d) => d.nameTr).sort()).toEqual(['SDR', 'İdari İşler'].sort())
  expect(plan.errors).toEqual([])
})

test('an existing user keeps their data; only empty fields are filled; their role is not touched', () => {
  const plan = planImport(
    [row('DENİZ', 'ARSLAN', 'Yönetim Kurulu', 'Yön.Kur.Üyesi'), row('ELİF', 'KOÇ', 'Satış', 'Analist')],
    [existing('u-deniz', 'Deniz Arslan', { title: 'Mevcut Unvan' }), existing('u-elif', 'Elif Koç')],
    DEPTS,
  )
  expect(plan.creates).toEqual([])
  expect(plan.updates).toEqual([{ userId: 'u-elif', name: 'Elif Koç', title: 'Analist', departmentNameTr: 'Satış' }])
})

test('the org chart becomes manager links between new and existing people', () => {
  const plan = planImport(
    [row('YASİN', 'ÇELİK', 'Satış'), row('NUR', 'AKSOY', 'Satış'), row('ONUR', 'TEKİN', 'Yönetim Kurulu')],
    [existing('u-onur', 'Onur Tekin')],
    DEPTS,
    { chart: { 'ONUR TEKİN': ['YASİN ÇELİK'], 'YASİN ÇELİK': ['NUR AKSOY'] }, aliases: {} },
  )
  expect(plan.errors).toEqual([])
  expect(plan.managers.map((m) => [m.personName, m.managerName, m.existingUserId])).toEqual([
    ['Yasin Çelik', 'Onur Tekin', null],
    ['Nur Aksoy', 'Yasin Çelik', null],
  ])
})

test('an existing manager link is never overwritten', () => {
  const plan = planImport(
    [row('SELİN', 'ER', 'Satış')],
    [existing('u-selin', 'Selin Er', { managerId: 'u-elle-atanan' }), existing('u-baska', 'Başka Yönetici')],
    DEPTS,
    { chart: { 'Başka Yönetici': ['Selin Er'] }, aliases: {} },
  )
  expect(plan.managers).toEqual([])
})

test('aliases join two spellings of one person; near-misses are reported, not guessed', () => {
  const rows = [row('MUSTAFA ARDA', 'BULUT', 'Satış'), row('ZEYNEP İPEK', 'SARI', 'Satış')]
  const people = [existing('u-arda', 'Arda Bulut'), existing('u-zeynep', 'Zeynep Sarı')]

  const noAlias = planImport(rows, people, DEPTS)
  // Without an alias both would be created anew — the report flags them instead of guessing.
  expect(noAlias.similarNames).toEqual([
    { listName: 'Mustafa Arda Bulut', existingName: 'Arda Bulut' },
    { listName: 'Zeynep İpek Sarı', existingName: 'Zeynep Sarı' },
  ])

  const withAlias = planImport(rows, people, DEPTS, {
    chart: {},
    aliases: { 'Mustafa Arda Bulut': 'Arda Bulut', 'Zeynep İpek Sarı': 'Zeynep Sarı' },
  })
  expect(withAlias.creates).toEqual([])
  expect(withAlias.similarNames).toEqual([])
})

test('a chart name nobody has is reported and skipped; the rest still applies', () => {
  const plan = planImport(
    [row('KEMAL', 'UÇAR', 'Satış'), row('SEDA', 'GÜL', 'Satış')],
    [],
    DEPTS,
    { chart: { 'Kemal Uçar': ['Seda Gül', 'Hayali Kişi'] }, aliases: {} },
  )
  expect(plan.errors).toEqual([])
  expect(plan.unresolvedChartNames).toEqual(['Hayali Kişi'])
  expect(plan.managers.map((m) => m.personName)).toEqual(['Seda Gül'])
})

test('two managers for one person, or a loop, is an error', () => {
  const rows = [row('A', 'BİR', 'Satış'), row('B', 'İKİ', 'Satış'), row('C', 'ÜÇ', 'Satış')]
  const twoBosses = planImport(rows, [], DEPTS, { chart: { 'A Bir': ['C Üç'], 'B İki': ['C Üç'] }, aliases: {} })
  expect(twoBosses.errors.length).toBe(1)
  const loop = planImport(rows, [], DEPTS, { chart: { 'A Bir': ['B İki'], 'B İki': ['A Bir'] }, aliases: {} })
  expect(loop.errors.length).toBeGreaterThan(0)
})

test('an unknown department or a duplicate name is an error', () => {
  const plan = planImport([row('A', 'B', 'Uzay Ajansı'), row('C', 'D', 'Satış'), row('C', 'D', 'Satış')], [], DEPTS)
  expect(plan.errors).toHaveLength(2)
})

test('parseTsv reads the needed columns by header', () => {
  const tsv = 'Name\tSurname\tDepartman\tPozisyonu\tWorking Status\nAHMET\tKARA\tMedikal Operasyon\tSaç Ekim Uzmanı\tActive\n'
  expect(parseTsv(tsv)).toEqual([{ name: 'AHMET', surname: 'KARA', department: 'Medikal Operasyon', position: 'Saç Ekim Uzmanı' }])
})

test('a capitals list row takes the chart’s spelling, so I is not turned into ı', () => {
  const plan = planImport(
    [row('ADA', 'BEY', 'Satış'), row('LIAM', 'IRVING', 'Satış')],
    [],
    DEPTS,
    { chart: { 'Ada Bey': ['Liam Irving'] }, aliases: {} },
  )
  expect(plan.creates.map((c) => c.name)).toEqual(['Ada Bey', 'Liam Irving'])
  expect(plan.managers).toHaveLength(1)
  expect(plan.managers[0]?.personName).toBe('Liam Irving')
  expect(plan.unresolvedChartNames).toEqual([])
  expect(plan.uncertainCasing).toEqual([])
})

test('I/ı/İ/i do not stop a list row matching an existing user', () => {
  const plan = planImport([row('ILGAZ', 'IŞIK', 'Satış')], [existing('u1', 'Ilgaz Işık')], DEPTS)
  expect(plan.creates).toEqual([])
  expect(plan.errors).toEqual([])
})

test('list-only names containing I/ı are flagged for a casing check', () => {
  const plan = planImport([row('IVAN', 'IVANOV', 'Satış'), row('ESRA', 'KOÇ', 'Satış')], [], DEPTS)
  expect(plan.uncertainCasing).toEqual(['Ivan Ivanov'])
})

test('passive people a list row or a chart edge touches are flagged for review', () => {
  const passive = (id: string, name: string) => ({ ...existing(id, name), state: 'passive' as const })
  const plan = planImport(
    [row('ELİF', 'DEMİR', 'Satış'), row('Veli', 'Kara', 'Satış')],
    [passive('u1', 'Elif Demir'), passive('u2', 'Ayhan Boz'), existing('u3', 'Veli Kara')],
    DEPTS,
    { chart: { 'Ayhan Boz': ['Veli Kara'] }, aliases: {} },
  )
  expect(plan.passiveMatches).toEqual(['Elif Demir', 'Ayhan Boz (yönetici olarak)'])
  expect(plan.managers).toHaveLength(1)
})
