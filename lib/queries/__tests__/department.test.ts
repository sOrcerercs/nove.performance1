import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { getDepartment, getObjective } from '../department'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

test('an unknown slug yields null rather than an empty department', async () => {
  expect(await getDepartment(await seeded(), 'yok-boyle-bir-bolum', SEED_OBJECTIVE_PERIOD_CODE)).toBeNull()
})

test('a department carries its objectives, key results and rolled-up progress', async () => {
  const saha = await getDepartment(await seeded(), 'saha', SEED_OBJECTIVE_PERIOD_CODE)

  expect(saha).not.toBeNull()
  expect(saha?.emoji).toBe('🏨')
  expect(saha?.nameTr).toBe('Saha Operasyon')
  expect(saha?.nameEn).toBe('Field Operations')
  expect(saha?.leadName).toBe('Murat Şen')
  expect(saha?.pct).toBe(65)
  expect(saha?.objectives).toHaveLength(1)
  expect(saha?.objectives[0]?.krs).toHaveLength(3)
})

test('a department with two objectives averages them unweighted', async () => {
  const ik = await getDepartment(await seeded(), 'ik', SEED_OBJECTIVE_PERIOD_CODE)

  expect(ik?.objectives).toHaveLength(2)
  expect(ik?.pct).toBe(45)
  // Unweighted: 3 key results in O1 and 2 in O2 still count one objective each.
  expect(ik?.objectives.map((o) => o.code)).toEqual(['O1', 'O2'])
})

test('key result view models are serialisable and carry their own progress', async () => {
  const saha = await getDepartment(await seeded(), 'saha', SEED_OBJECTIVE_PERIOD_CODE)
  const k5 = saha?.objectives[0]?.krs.find((kr) => kr.id === 'k5')

  expect(k5).toMatchObject({
    titleEn: 'Cut transfer delay rate to 4%',
    start: 12,
    current: 7,
    target: 4,
    unit: '%',
    confidence: 'mid',
    ownerName: 'Gizem Kara',
    daysSinceUpdate: 4,
  })
  // A reduction goal: 12 → 7 against a target of 4 is 5/8 of the distance.
  expect(k5?.pct).toBe(63)
  // Nothing that would break the server → client boundary.
  expect(JSON.parse(JSON.stringify(k5))).toEqual(k5)
})

test('an objective resolves owner names for itself and its key results', async () => {
  const obj = await getObjective(await seeded(), 'o-saha-1', SEED_OBJECTIVE_PERIOD_CODE)

  expect(obj?.code).toBe('O1')
  expect(obj?.titleTr).toBe('Misafir deneyim skorunu kalıcı olarak yükselt')
  expect(obj?.ownerName).toBe('Murat Şen')
  expect(obj?.pct).toBe(65)
  expect(obj?.krs.map((kr) => kr.ownerName)).toEqual(['Murat Şen', 'Gizem Kara', 'Onur Bal'])
})

test('an objective knows the department it belongs to', async () => {
  const obj = await getObjective(await seeded(), 'o-ik-2', SEED_OBJECTIVE_PERIOD_CODE)

  expect(obj?.deptSlug).toBe('ik')
  expect(obj?.deptEmoji).toBe('👥')
  expect(obj?.deptNameTr).toBe('İnsan Kaynakları')
  expect(obj?.deptNameEn).toBe('People')
})

test('an unknown objective id yields null', async () => {
  expect(await getObjective(await seeded(), 'o-yok', SEED_OBJECTIVE_PERIOD_CODE)).toBeNull()
})

test('an unknown period leaves both lookups empty rather than throwing', async () => {
  const db = await seeded()
  expect(await getDepartment(db, 'saha', '1999-Q1')).toBeNull()
  expect(await getObjective(db, 'o-saha-1', '1999-Q1')).toBeNull()
})
