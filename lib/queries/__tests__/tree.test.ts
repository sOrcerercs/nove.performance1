import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { companyPct, deptPct } from '@/lib/domain/progress'
import { isOpenToDevelopment } from '@/lib/domain/status'
import { krPct } from '@/lib/domain/progress'
import { allKrs, loadTree } from '../tree'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

test('the tree loads the full seeded dataset', async () => {
  const { period, depts } = await loadTree(await seeded(), SEED_OBJECTIVE_PERIOD_CODE)
  expect(period?.code).toBe(SEED_OBJECTIVE_PERIOD_CODE)
  expect(depts).toHaveLength(8)
  expect(depts.flatMap((d) => d.objectives)).toHaveLength(9)
  expect(allKrs(depts)).toHaveLength(25)
})

test('progress computed from the database matches the prototype', async () => {
  const { depts } = await loadTree(await seeded(), SEED_OBJECTIVE_PERIOD_CODE)
  expect(companyPct(depts)).toBe(51)

  const bySlug = Object.fromEntries(depts.map((d) => [d.slug, deptPct(d.objectives)]))
  expect(bySlug).toEqual({
    pazarlama: 54, saha: 65, kalite: 69, finans: 48,
    ik: 45, sdr: 41, medikal: 41, ofis: 41,
  })
})

test('seventeen key results sit in the "Gelişime Açık" band (≤%59)', async () => {
  const { depts } = await loadTree(await seeded(), SEED_OBJECTIVE_PERIOD_CODE)
  const openToDev = allKrs(depts).filter(({ kr }) => isOpenToDevelopment(krPct(kr)))
  expect(openToDev).toHaveLength(17)
})

test('owners are resolved to names, not left as ids', async () => {
  const { depts } = await loadTree(await seeded(), SEED_OBJECTIVE_PERIOD_CODE)
  const saha = depts.find((d) => d.slug === 'saha')
  expect(saha?.leadName).toBe('Murat Şen')
  expect(saha?.objectives[0]?.ownerName).toBe('Murat Şen')
  expect(saha?.objectives[0]?.krs[1]?.ownerName).toBe('Gizem Kara')
})

test('an unknown period yields no departments rather than throwing', async () => {
  const { period, depts } = await loadTree(await seeded(), '1999-Q1')
  expect(period).toBeNull()
  expect(depts).toEqual([])
})

test('days since update is derived from the stored timestamp', async () => {
  const { depts } = await loadTree(await seeded(), SEED_OBJECTIVE_PERIOD_CODE)
  const k1 = allKrs(depts).find(({ kr }) => kr.id === 'k1')
  // Seeded as 3 days ago.
  expect(k1?.kr.daysSinceUpdate).toBe(3)
})
