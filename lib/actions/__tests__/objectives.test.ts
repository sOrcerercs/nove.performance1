import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { checkins, keyResults, keyResults as krTable, objectives, periods, users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { krPct } from '@/lib/domain/progress'
import { getDepartment } from '@/lib/queries/department'
import { SEED_CLOSED_PERIOD_CODE, SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { getAssignablePeople } from '@/lib/queries/people'
import type { Role } from '@/lib/domain/types'
import { submitCheckinFor } from '../core/checkins'
import {
  createObjectiveFor,
  deleteObjectiveFor,
  describeObjectiveDeletion,
  updateObjectiveFor,
} from '../core/objectives'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const actor = (role: Role, departmentId: string | null, id = 'u-elif.cinar'): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId,
})

const validInput = (departmentId = 'saha') => ({
  title: 'Misafir memnuniyetini kalıcı olarak yükselt',
  departmentId,
  ownerUserId: null,
  periodCode: SEED_OBJECTIVE_PERIOD_CODE,
  krs: [{ title: 'NPS skorunu 70e çıkar', start: 54, target: 70, unit: '' }],
})

test('rejects an objective with no title', async () => {
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    title: '',
  })
  expect(res.ok).toBe(false)
})

test('rejects an objective with no key results', async () => {
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    krs: [],
  })
  expect(res.ok).toBe(false)
})

test('rejects more than five key results', async () => {
  const kr = { title: 'Ölçülebilir bir sonuç', start: 0, target: 10, unit: '' }
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    krs: Array.from({ length: 6 }, () => kr),
  })
  expect(res.ok).toBe(false)
})

test('rejects a key result whose start equals its target', async () => {
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    krs: [{ title: 'Hiç ilerlemeyecek bir KR', start: 50, target: 50, unit: '' }],
  })
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toContain('aynı olamaz')
})

test('a staff record may not create an objective', async () => {
  const res = await createObjectiveFor(await seeded(), actor('staff', 'saha'), validInput())
  expect(res.ok).toBe(false)
})

test('an executive may not create an objective — oversight is read-only', async () => {
  const res = await createObjectiveFor(await seeded(), actor('executive', null), validInput())
  expect(res.ok).toBe(false)
})

test('an admin creates in any department, not just their own', async () => {
  const db = await seeded()
  // The admin sits in 'ik' and is creating in 'saha'.
  const res = await createObjectiveFor(db, actor('admin', 'ik'), validInput('saha'))
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [row] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(row?.departmentId).toBe('saha')
  expect(row?.titleTr).toBe('Misafir memnuniyetini kalıcı olarak yükselt')

  const krs = await db.select().from(keyResults).where(eq(keyResults.objectiveId, res.data.id))
  expect(krs).toHaveLength(1)
  // A new key result starts at its start value, i.e. 0% progress.
  expect(krs[0]?.current).toBe(54)
  expect(krPct({ start: 54, current: 54, target: 70 })).toBe(0)
})

test('an unknown department is rejected even for an admin', async () => {
  const res = await createObjectiveFor(
    await seeded(),
    actor('admin', null),
    validInput('yok-boyle-bir-bolum'),
  )
  expect(res.ok).toBe(false)
})

test('the objective code increments per department', async () => {
  const db = await seeded()
  // 'saha' already has O1 from the seed.
  const res = await createObjectiveFor(db, actor('admin', null), validInput('saha'))
  expect(res.ok).toBe(true)
  if (!res.ok) return
  const [row] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(row?.code).toBe('O2')
})

/* ---------------------------- edit and delete ---------------------------- */

/** o-saha-1 holds k4, k5, k6. */
const SAHA_OBJ = 'o-saha-1'

async function krsOf(db: Awaited<ReturnType<typeof seeded>>, objectiveId: string) {
  return db.select().from(krTable).where(eq(krTable.objectiveId, objectiveId))
}

test('an admin edits the objective title', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', 'ik'), {
    id: SAHA_OBJ,
    title: 'Misafir deneyimini zirveye taşı',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id, title: k.titleTr, start: k.start, current: k.current,
      target: k.target, unit: k.unit, confidence: k.confidence,
    })),
  })
  expect(res.ok).toBe(true)

  const [row] = await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))
  expect(row?.titleTr).toBe('Misafir deneyimini zirveye taşı')
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(3)
})

test('editing a key result changes its measured values', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)
  const first = existing[0]!

  const res = await updateObjectiveFor(db, actor('admin', 'ik'), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id,
      title: k.id === first.id ? 'NPS skorunu 65e çıkar' : k.titleTr,
      start: k.start,
      current: k.current,
      target: k.id === first.id ? 65 : k.target,
      unit: k.unit,
      confidence: k.id === first.id ? ('low' as const) : k.confidence,
    })),
  })
  expect(res.ok).toBe(true)

  const [updated] = await db.select().from(krTable).where(eq(krTable.id, first.id))
  expect(updated?.titleTr).toBe('NPS skorunu 65e çıkar')
  expect(updated?.target).toBe(65)
  expect(updated?.confidence).toBe('low')
})

test('a key result omitted from the payload is removed', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', 'ik'), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: existing.slice(0, 2).map((k) => ({
      id: k.id, title: k.titleTr, start: k.start, current: k.current,
      target: k.target, unit: k.unit, confidence: k.confidence,
    })),
  })
  expect(res.ok).toBe(true)
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(2)
})

test('a key result without an id is added', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', 'ik'), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: [
      ...existing.map((k) => ({
        id: k.id, title: k.titleTr, start: k.start, current: k.current,
        target: k.target, unit: k.unit, confidence: k.confidence,
      })),
      { title: 'Şikayet kapanma süresini 24 saate indir', start: 72, current: 72, target: 24, unit: 'saat', confidence: 'mid' as const },
    ],
  })
  expect(res.ok).toBe(true)
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(4)
})

test('a key result belonging to another objective cannot be adopted', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)
  const foreign = (await krsOf(db, 'o-mkt-1'))[0]!

  const res = await updateObjectiveFor(db, actor('admin', 'ik'), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: [
      ...existing.map((k) => ({
        id: k.id, title: k.titleTr, start: k.start, current: k.current,
        target: k.target, unit: k.unit, confidence: k.confidence,
      })),
      { id: foreign.id, title: foreign.titleTr, start: foreign.start, current: foreign.current, target: foreign.target, unit: foreign.unit, confidence: foreign.confidence },
    ],
  })
  expect(res.ok).toBe(false)

  // The foreign key result must still belong to its original objective.
  const [still] = await db.select().from(krTable).where(eq(krTable.id, foreign.id))
  expect(still?.objectiveId).toBe('o-mkt-1')
})

test('an executive cannot edit or delete an objective', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const edit = await updateObjectiveFor(db, actor('executive', null), {
    id: SAHA_OBJ, title: 'Değişmemeli', ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id, title: k.titleTr, start: k.start, current: k.current,
      target: k.target, unit: k.unit, confidence: k.confidence,
    })),
  })
  expect(edit.ok).toBe(false)

  expect((await deleteObjectiveFor(db, actor('executive', null), { id: SAHA_OBJ })).ok).toBe(false)
  expect(await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))).toHaveLength(1)
})

test('the deletion impact reports what will be lost', async () => {
  const db = await seeded()
  await submitCheckinFor(db, actor('admin', 'ik'), {
    keyResultId: 'k4', newValue: 57, confidence: 'high',
  })

  const res = await describeObjectiveDeletion(db, actor('admin', 'ik'), SAHA_OBJ)
  expect(res.ok).toBe(true)
  if (!res.ok) return
  expect(res.data.keyResults).toBe(3)
  expect(res.data.checkins).toBe(1)
})

test('deleting an objective cascades to its key results and check-ins', async () => {
  const db = await seeded()
  await submitCheckinFor(db, actor('admin', 'ik'), {
    keyResultId: 'k4', newValue: 57, confidence: 'high',
  })

  const res = await deleteObjectiveFor(db, actor('admin', 'ik'), { id: SAHA_OBJ })
  expect(res.ok).toBe(true)

  expect(await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))).toHaveLength(0)
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(0)
  expect(await db.select().from(checkins).where(eq(checkins.keyResultId, 'k4'))).toHaveLength(0)
  // Other departments are untouched.
  expect(await krsOf(db, 'o-mkt-1')).toHaveLength(3)
})

test('deleting an unknown objective is refused', async () => {
  const db = await seeded()
  expect((await deleteObjectiveFor(db, actor('admin', 'ik'), { id: 'yok' })).ok).toBe(false)
})

/* -------------------------- owner assignment -------------------------- */

test('a created objective and its key results take the assigned owners', async () => {
  const db = await seeded()
  const res = await createObjectiveFor(db, actor('admin', 'ik'), {
    title: 'Misafir memnuniyetini kalıcı olarak yükselt',
    departmentId: 'saha',
    ownerUserId: 'u-murat.sen',
    periodCode: SEED_OBJECTIVE_PERIOD_CODE,
    krs: [
      { title: 'NPS skorunu 70e çıkar', start: 54, target: 70, unit: '', ownerUserId: 'u-gizem.kara' },
      { title: 'Şikayet süresini 24 saate indir', start: 72, target: 24, unit: 'saat', ownerUserId: null },
    ],
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [obj] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(obj?.ownerUserId).toBe('u-murat.sen')

  const created = await db.select().from(krTable).where(eq(krTable.objectiveId, res.data.id))
  const byTitle = new Map(created.map((k) => [k.titleTr, k.ownerUserId]))
  expect(byTitle.get('NPS skorunu 70e çıkar')).toBe('u-gizem.kara')
  // No explicit key-result owner falls back to the objective's owner, not the
  // admin who happened to create it.
  expect(byTitle.get('Şikayet süresini 24 saate indir')).toBe('u-murat.sen')
})

test('editing can reassign the objective and key-result owners', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', 'ik'), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: 'u-onur.bal',
    krs: existing.map((k, i) => ({
      id: k.id, title: k.titleTr, start: k.start, current: k.current,
      target: k.target, unit: k.unit, confidence: k.confidence,
      ownerUserId: i === 0 ? 'u-gizem.kara' : null,
    })),
  })
  expect(res.ok).toBe(true)

  const [obj] = await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))
  expect(obj?.ownerUserId).toBe('u-onur.bal')

  const after = await krsOf(db, SAHA_OBJ)
  expect(after.find((k) => k.id === existing[0]!.id)?.ownerUserId).toBe('u-gizem.kara')
  expect(after.find((k) => k.id === existing[1]!.id)?.ownerUserId).toBe('u-onur.bal')
})

test('staff are offered as owners; deactivated people are not', async () => {
  const db = await seeded()
  const before = await getAssignablePeople(db)
  expect(before.some((p) => p.id === 'u-murat.sen' && p.role === 'staff')).toBe(true)

  await db.update(users).set({ state: 'passive' }).where(eq(users.id, 'u-murat.sen'))
  const after = await getAssignablePeople(db)
  expect(after.some((p) => p.id === 'u-murat.sen')).toBe(false)
})

/* ------------------- historical back-filling (İK use case) ------------------- */

test('a closed period still accepts objectives, so history can be entered', async () => {
  const db = await seeded()
  // A quarter that has already ended. Back-filling must not be blocked by that.
  const [past] = await db.select().from(periods).where(eq(periods.code, SEED_CLOSED_PERIOD_CODE))
  expect(past?.state).toBe('closed')

  const res = await createObjectiveFor(db, actor('admin', 'ik'), {
    title: 'Q1 lead maliyetini düşür',
    departmentId: 'pazarlama',
    ownerUserId: 'u-deniz.aksoy',
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [{ title: 'Lead maliyetini 800e indir', start: 1000, current: 820, target: 800, unit: '₺' }],
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [row] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(row?.periodId).toBe(past!.id)
})

test('a key result can be created with the figure already achieved', async () => {
  const db = await seeded()
  const res = await createObjectiveFor(db, actor('admin', 'ik'), {
    title: 'Geçmiş çeyreğin sonucu',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [
      { title: 'Hedefe ulaşan KR', start: 0, current: 100, target: 100, unit: '%' },
      { title: 'Güncel verilmeyen KR', start: 10, target: 50, unit: '' },
    ],
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const krs = await db.select().from(krTable).where(eq(krTable.objectiveId, res.data.id))
  const byTitle = new Map(krs.map((k) => [k.titleTr, k]))

  // Supplied — this is what makes back-filling a single pass.
  expect(byTitle.get('Hedefe ulaşan KR')?.current).toBe(100)
  expect(krPct(byTitle.get('Hedefe ulaşan KR')!)).toBe(100)

  // Omitted — falls back to the start value, i.e. not started.
  expect(byTitle.get('Güncel verilmeyen KR')?.current).toBe(10)
  expect(krPct(byTitle.get('Güncel verilmeyen KR')!)).toBe(0)
})

test('a past period reports its own progress, independent of the open quarter', async () => {
  const db = await seeded()
  await createObjectiveFor(db, actor('admin', 'ik'), {
    title: 'Q1 hedefi',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [{ title: 'Tamamlanmış KR', start: 0, current: 100, target: 100, unit: '%' }],
  })

  const q1 = await getDepartment(db, 'pazarlama', SEED_CLOSED_PERIOD_CODE)
  const openQ = await getDepartment(db, 'pazarlama', SEED_OBJECTIVE_PERIOD_CODE)

  expect(q1?.pct).toBe(100)
  // Q3 is untouched — periods are separate buckets, which is what makes
  // historical entry safe.
  expect(openQ?.pct).toBe(54)
})
