import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb, type Db } from '@/lib/db'
import { checkins, keyResults, keyResults as krTable, krMonthlyValues, objectives, periods, users } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { krPct } from '@/lib/domain/progress'
import { getDepartment } from '@/lib/queries/department'
import { SEED_CLOSED_PERIOD_CODE, SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { getAssignablePeople } from '@/lib/queries/people'
import { allPeriods } from '@/lib/queries/tables'
import type { Role } from '@/lib/domain/types'
import { submitCheckinFor } from '../core/checkins'
import { setMonthlyValueAs } from '../core/monthly'
import { M1, M2 } from './open-months'
import {
  createObjectiveFor,
  deleteObjectiveFor,
  describeObjectiveDeletion,
  updateObjectiveFor,
} from '../core/objectives'
import { createUserAs } from '../core/users'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** Period ids for a code — `getDepartment` takes ids, the seed exports codes. */
async function idsOf(db: Db, code: string): Promise<string[]> {
  return (await allPeriods(db)).filter((p) => p.code === code).map((p) => p.id)
}

const actor = (role: Role, departmentId: string | null, id = 'u-kagan.ozturk'): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId,
})

const validInput = (departmentId = 'satis') => ({
  title: 'Misafir memnuniyetini kalıcı olarak yükselt',
  departmentId,
  ownerUserId: null,
  periodCode: SEED_OBJECTIVE_PERIOD_CODE,
  krs: [{ title: 'NPS skorunu 70e çıkar', start: 54, target: 70, unit: '', rollup: 'last' as const }],
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
  const kr = { title: 'Ölçülebilir bir sonuç', start: 0, target: 10, unit: '', rollup: 'last' as const }
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    krs: Array.from({ length: 6 }, () => kr),
  })
  expect(res.ok).toBe(false)
})

test('rejects a key result whose start equals its target', async () => {
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    krs: [{ title: 'Hiç ilerlemeyecek bir KR', start: 50, target: 50, unit: '', rollup: 'last' as const }],
  })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('aynı olamaz')
    expect(res.error.en).toContain("can't be the same")
  }
})

test('a staff record may not create an objective', async () => {
  const res = await createObjectiveFor(await seeded(), actor('staff', 'satis'), validInput())
  expect(res.ok).toBe(false)
})

test('an executive may not create an objective — oversight is read-only', async () => {
  const res = await createObjectiveFor(await seeded(), actor('executive', null), validInput())
  expect(res.ok).toBe(false)
})

test('an admin creates in any department, not just their own', async () => {
  const db = await seeded()
  // The real accounts have no home department at all (departmentId null) —
  // this creates in 'satis' regardless.
  const res = await createObjectiveFor(db, actor('admin', null), validInput('satis'))
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [row] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(row?.departmentId).toBe('satis')
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
  // 'satis' already has O1 and O2 from the seed.
  const res = await createObjectiveFor(db, actor('admin', null), validInput('satis'))
  expect(res.ok).toBe(true)
  if (!res.ok) return
  const [row] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(row?.code).toBe('O3')
})

// Regression: the wizard never sent a rollup rule, so every new key result
// silently got the column default `last` — a cumulative target ("750 new
// reviews") then showed only the latest month instead of the running total.
test('a new key result keeps the rollup rule it was created with', async () => {
  const db = await seeded()
  const res = await createObjectiveFor(db, actor('admin', null), {
    ...validInput('misafir'),
    krs: [{ title: '750 yeni 5 yıldızlı yorum', start: 0, target: 750, unit: '', rollup: 'sum' }],
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [kr] = await db.select().from(krTable).where(eq(krTable.objectiveId, res.data.id))
  expect(kr?.rollup).toBe('sum')

  await setMonthlyValueAs(db, actor('admin', null), { krId: kr!.id, month: M1, value: 110 })
  await setMonthlyValueAs(db, actor('admin', null), { krId: kr!.id, month: M2, value: 75 })
  const [after] = await db.select().from(krTable).where(eq(krTable.id, kr!.id))
  expect(after?.current).toBe(185)
})

test('a key result without a rollup rule is refused — no silent default', async () => {
  const res = await createObjectiveFor(await seeded(), actor('admin', null), {
    ...validInput(),
    // A caller that forgets the rule must fail loudly, as editing already does.
    krs: [{ title: 'NPS skorunu 70e çıkar', start: 54, target: 70, unit: '' } as never],
  })
  expect(res.ok).toBe(false)
})

/* ---------------------------- edit and delete ---------------------------- */

/** o-msf-1 (Misafir Deneyimi) holds three key results, mirroring the
 *  prototype's o-saha-1 shape that these tests were originally built around. */
const SAHA_OBJ = 'o-msf-1'

async function krsOf(db: Awaited<ReturnType<typeof seeded>>, objectiveId: string) {
  return db.select().from(krTable).where(eq(krTable.objectiveId, objectiveId))
}

test('an admin edits the objective title', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyimini zirveye taşı',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id, title: k.titleTr, start: k.start,
      target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
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

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id,
      title: k.id === first.id ? 'NPS skorunu 65e çıkar' : k.titleTr,
      start: k.start,
      target: k.id === first.id ? 65 : k.target,
      unit: k.unit,
      confidence: k.id === first.id ? ('low' as const) : k.confidence,
      rollup: k.rollup,
    })),
  })
  expect(res.ok).toBe(true)

  const [updated] = await db.select().from(krTable).where(eq(krTable.id, first.id))
  expect(updated?.titleTr).toBe('NPS skorunu 65e çıkar')
  expect(updated?.target).toBe(65)
  expect(updated?.confidence).toBe('low')
})

test('changing the rollup rule recomputes current, without touching the monthly rows', async () => {
  const db = await seeded()
  // k-msf-yorum is a `sum` rule: two months on file sum to 90.
  await setMonthlyValueAs(db, actor('admin', null), { krId: 'k-msf-yorum', month: M1, value: 30 })
  await setMonthlyValueAs(db, actor('admin', null), { krId: 'k-msf-yorum', month: M2, value: 60 })

  const [before] = await db.select().from(krTable).where(eq(krTable.id, 'k-msf-yorum'))
  expect(before?.current).toBe(90)

  const existing = await krsOf(db, SAHA_OBJ)
  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id, title: k.titleTr, start: k.start,
      target: k.target, unit: k.unit, confidence: k.confidence,
      // Only k-msf-yorum's rule changes; the other two keep theirs.
      rollup: k.id === 'k-msf-yorum' ? ('last' as const) : k.rollup,
    })),
  })
  expect(res.ok).toBe(true)

  // `last` picks the most recent month on file, 60 — not the sum, 90.
  const [after] = await db.select().from(krTable).where(eq(krTable.id, 'k-msf-yorum'))
  expect(after?.current).toBe(60)
  expect(after?.rollup).toBe('last')

  // The monthly rows themselves are untouched — only the derived figure moved.
  const rows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-msf-yorum'))
  expect(rows).toHaveLength(2)
})

test('editing a key result without changing its rollup rule leaves current alone', async () => {
  const db = await seeded()
  await setMonthlyValueAs(db, actor('admin', null), { krId: 'k-msf-yorum', month: M1, value: 30 })
  await setMonthlyValueAs(db, actor('admin', null), { krId: 'k-msf-yorum', month: M2, value: 60 })

  const existing = await krsOf(db, SAHA_OBJ)
  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Yeni başlık, kural değişmedi',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id, title: k.titleTr, start: k.start,
      target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
    })),
  })
  expect(res.ok).toBe(true)

  // Still the sum of the two months on file — an edit that keeps the same
  // rollup rule must not disturb the derived summary.
  const [after] = await db.select().from(krTable).where(eq(krTable.id, 'k-msf-yorum'))
  expect(after?.current).toBe(90)
})

test('a rule change on a back-filled key result with no monthly rows keeps its current', async () => {
  const db = await seeded()

  // The documented back-fill path: a closed period, a key result created
  // with its already-achieved figure supplied directly, no monthly rows at
  // all. `/veri-girisi` only lists the open period, so there is no UI to
  // re-enter this if it gets wiped.
  const created = await createObjectiveFor(db, actor('admin', null), {
    title: 'Geçmiş çeyreğin back-fill KR\'ı',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [{ title: 'Zaten ulaşılmış hedef', start: 0, current: 5000, target: 10000, unit: '', rollup: 'last' as const }],
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  const [kr] = await krsOf(db, created.data.id)
  expect(kr?.current).toBe(5000)
  expect(kr?.rollup).toBe('last') // the schema default, unset by createObjectiveSchema

  // An unrelated edit flips the rollup rule — nothing to do with the figure
  // itself, and no monthly rows exist for `recomputeSummary` to derive
  // anything from.
  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: created.data.id,
    title: kr!.titleTr, // objective title stays via the KR's parent below
    ownerUserId: null,
    krs: [{
      id: kr!.id, title: kr!.titleTr, start: kr!.start, target: kr!.target,
      unit: kr!.unit, confidence: kr!.confidence, rollup: 'avg',
    }],
  })
  expect(res.ok).toBe(true)

  const [after] = await krsOf(db, created.data.id)
  expect(after?.rollup).toBe('avg')
  // The load-bearing assertion: a rollup change with zero monthly rows must
  // not fall through to `start` (0) and wipe the back-filled figure.
  expect(after?.current).toBe(5000)
})

test('editing `start` on a never-measured key result moves `current` with it', async () => {
  const db = await seeded()

  // No `current` supplied: defaults to `start`, i.e. genuinely unmeasured —
  // the "current === start" invariant holds from creation.
  const created = await createObjectiveFor(db, actor('admin', null), {
    title: 'Henüz ölçülmemiş KR',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_OBJECTIVE_PERIOD_CODE,
    krs: [{ title: 'Ölçülmeyi bekleyen hedef', start: 0, target: 100, unit: '', rollup: 'last' as const }],
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  const [kr] = await krsOf(db, created.data.id)
  expect(kr?.current).toBe(0)

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: created.data.id,
    title: kr!.titleTr,
    ownerUserId: null,
    krs: [{
      id: kr!.id, title: kr!.titleTr, start: 50, target: kr!.target,
      unit: kr!.unit, confidence: kr!.confidence, rollup: kr!.rollup,
    }],
  })
  expect(res.ok).toBe(true)

  const [after] = await krsOf(db, created.data.id)
  // The invariant is preserved: still never measured, so `current` follows
  // `start` to its new value rather than staying at the old, now-stale 0.
  expect(after?.start).toBe(50)
  expect(after?.current).toBe(50)
  expect(krPct(after!)).toBe(0) // "not started", not some fabricated non-zero figure
})

test('editing `start` on a back-filled key result leaves its current alone — the two fixes compose', async () => {
  const db = await seeded()

  const created = await createObjectiveFor(db, actor('admin', null), {
    title: 'Geçmiş çeyreğin back-fill KR\'ı 2',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [{ title: 'Zaten ulaşılmış başka bir hedef', start: 0, current: 5000, target: 10000, unit: '', rollup: 'last' as const }],
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  const [kr] = await krsOf(db, created.data.id)
  expect(kr?.current).toBe(5000)

  // A baseline correction — `start` moves, but this key result was never
  // "not started": it already carries a real, deliberately entered figure.
  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: created.data.id,
    title: kr!.titleTr,
    ownerUserId: null,
    krs: [{
      id: kr!.id, title: kr!.titleTr, start: 10, target: kr!.target,
      unit: kr!.unit, confidence: kr!.confidence, rollup: kr!.rollup,
    }],
  })
  expect(res.ok).toBe(true)

  const [after] = await krsOf(db, created.data.id)
  expect(after?.start).toBe(10)
  // The back-filled figure must survive a start edit exactly as it survives
  // a rollup edit above — the zero-rows guard, not the "follow start"
  // behaviour, is what applies here.
  expect(after?.current).toBe(5000)
})

test('a key result omitted from the payload is removed', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: existing.slice(0, 2).map((k) => ({
      id: k.id, title: k.titleTr, start: k.start,
      target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
    })),
  })
  expect(res.ok).toBe(true)
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(2)
})

test('a key result without an id is added', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: [
      ...existing.map((k) => ({
        id: k.id, title: k.titleTr, start: k.start,
        target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
      })),
      { title: 'Şikayet kapanma süresini 24 saate indir', start: 72, target: 24, unit: 'saat', confidence: 'mid' as const, rollup: 'last' as const },
    ],
  })
  expect(res.ok).toBe(true)
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(4)
})

test('a key result belonging to another objective cannot be adopted', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)
  const foreign = (await krsOf(db, 'o-pzr-1'))[0]!

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: [
      ...existing.map((k) => ({
        id: k.id, title: k.titleTr, start: k.start,
        target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
      })),
      { id: foreign.id, title: foreign.titleTr, start: foreign.start, target: foreign.target, unit: foreign.unit, confidence: foreign.confidence, rollup: foreign.rollup },
    ],
  })
  expect(res.ok).toBe(false)

  // The foreign key result must still belong to its original objective.
  const [still] = await db.select().from(krTable).where(eq(krTable.id, foreign.id))
  expect(still?.objectiveId).toBe('o-pzr-1')
})

/* --------------------- grandfathering unmeasurable key results --------------------- */

test('a pre-existing unmeasurable key result is grandfathered: an unrelated edit still saves', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)
  const stuck = existing[0]!

  // Simulate a real-data row whose source figure was ambiguous: start already
  // equals target before this save, the way an import would leave it — this
  // bypasses `createObjectiveFor`'s validation on purpose, the same way the
  // real data will.
  await db.update(krTable).set({ start: 42, target: 42 }).where(eq(krTable.id, stuck.id))

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt', // the unrelated change being saved
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id,
      title: k.titleTr,
      start: k.id === stuck.id ? 42 : k.start,
      target: k.id === stuck.id ? 42 : k.target,
      unit: k.unit,
      confidence: k.confidence,
      rollup: k.rollup,
    })),
  })
  expect(res.ok).toBe(true)

  const [row] = await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))
  expect(row?.titleTr).toBe('Misafir deneyim skorunu kalıcı olarak yükselt')

  const [after] = await db.select().from(krTable).where(eq(krTable.id, stuck.id))
  expect(after?.start).toBe(42)
  expect(after?.target).toBe(42)
})

test('changing a healthy key result to start equal target is still rejected, naming it', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)
  const victim = existing[0]!

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id,
      title: k.titleTr,
      start: k.start,
      target: k.id === victim.id ? k.start : k.target,
      unit: k.unit,
      confidence: k.confidence,
      rollup: k.rollup,
    })),
  })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain(victim.titleTr)
    expect(res.error.tr).toContain('aynı olamaz')
    expect(res.error.en).toContain(victim.titleTr)
  }

  // Rejected wholesale: the key result keeps its original target.
  const [row] = await db.select().from(krTable).where(eq(krTable.id, victim.id))
  expect(row?.target).toBe(victim.target)
})

test('adding a brand-new key result with start equal to target within an edit is still rejected', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: null,
    krs: [
      ...existing.map((k) => ({
        id: k.id, title: k.titleTr, start: k.start,
        target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
      })),
      {
        title: 'Hiç ilerlemeyecek yeni KR',
        start: 30,
        target: 30,
        unit: '',
        confidence: 'mid' as const,
        rollup: 'last' as const,
      },
    ],
  })
  expect(res.ok).toBe(false)
  if (!res.ok) {
    expect(res.error.tr).toContain('aynı olamaz')
    expect(res.error.en).toContain("can't be the same")
  }

  // Nothing was added.
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(existing.length)
})

test('an executive cannot edit or delete an objective', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const edit = await updateObjectiveFor(db, actor('executive', null), {
    id: SAHA_OBJ, title: 'Değişmemeli', ownerUserId: null,
    krs: existing.map((k) => ({
      id: k.id, title: k.titleTr, start: k.start,
      target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
    })),
  })
  expect(edit.ok).toBe(false)

  expect((await deleteObjectiveFor(db, actor('executive', null), { id: SAHA_OBJ })).ok).toBe(false)
  expect(await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))).toHaveLength(1)
})

test('the deletion impact reports what will be lost', async () => {
  const db = await seeded()
  await submitCheckinFor(db, actor('admin', null), {
    keyResultId: 'k-msf-yorum', newValue: 57, confidence: 'high',
  })

  const res = await describeObjectiveDeletion(db, actor('admin', null), SAHA_OBJ)
  expect(res.ok).toBe(true)
  if (!res.ok) return
  expect(res.data.keyResults).toBe(3)
  expect(res.data.checkins).toBe(1)
})

test('deleting an objective cascades to its key results and check-ins', async () => {
  const db = await seeded()
  await submitCheckinFor(db, actor('admin', null), {
    keyResultId: 'k-msf-yorum', newValue: 57, confidence: 'high',
  })

  const res = await deleteObjectiveFor(db, actor('admin', null), { id: SAHA_OBJ })
  expect(res.ok).toBe(true)

  expect(await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))).toHaveLength(0)
  expect(await krsOf(db, SAHA_OBJ)).toHaveLength(0)
  expect(await db.select().from(checkins).where(eq(checkins.keyResultId, 'k-msf-yorum'))).toHaveLength(0)
  // Other departments are untouched.
  expect(await krsOf(db, 'o-pzr-1')).toHaveLength(2)
})

test('deleting an unknown objective is refused', async () => {
  const db = await seeded()
  expect((await deleteObjectiveFor(db, actor('admin', null), { id: 'yok' })).ok).toBe(false)
})

/* -------------------------- owner assignment -------------------------- */

test('a created objective and its key results take the assigned owners', async () => {
  const db = await seeded()
  // Only three real accounts exist, and all are admins — but ownership
  // assignment itself does not care about role, so they stand in for the
  // demo staff/lead names the prototype used here.
  const res = await createObjectiveFor(db, actor('admin', null), {
    title: 'Misafir memnuniyetini kalıcı olarak yükselt',
    departmentId: 'satis',
    ownerUserId: 'u-kagan.ozturk',
    periodCode: SEED_OBJECTIVE_PERIOD_CODE,
    krs: [
      { title: 'NPS skorunu 70e çıkar', start: 54, target: 70, unit: '', ownerUserId: 'u-oguzhan.kizilcan', rollup: 'last' as const },
      { title: 'Şikayet süresini 24 saate indir', start: 72, target: 24, unit: 'saat', ownerUserId: null, rollup: 'last' as const },
    ],
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [obj] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(obj?.ownerUserId).toBe('u-kagan.ozturk')

  const created = await db.select().from(krTable).where(eq(krTable.objectiveId, res.data.id))
  const byTitle = new Map(created.map((k) => [k.titleTr, k.ownerUserId]))
  expect(byTitle.get('NPS skorunu 70e çıkar')).toBe('u-oguzhan.kizilcan')
  // No explicit key-result owner falls back to the objective's owner, not the
  // admin who happened to create it.
  expect(byTitle.get('Şikayet süresini 24 saate indir')).toBe('u-kagan.ozturk')
})

test('editing can reassign the objective and key-result owners', async () => {
  const db = await seeded()
  const existing = await krsOf(db, SAHA_OBJ)

  const res = await updateObjectiveFor(db, actor('admin', null), {
    id: SAHA_OBJ,
    title: 'Misafir deneyim skorunu kalıcı olarak yükselt',
    ownerUserId: 'u-bahadir.temizer',
    krs: existing.map((k, i) => ({
      id: k.id, title: k.titleTr, start: k.start,
      target: k.target, unit: k.unit, confidence: k.confidence, rollup: k.rollup,
      ownerUserId: i === 0 ? 'u-oguzhan.kizilcan' : null,
    })),
  })
  expect(res.ok).toBe(true)

  const [obj] = await db.select().from(objectives).where(eq(objectives.id, SAHA_OBJ))
  expect(obj?.ownerUserId).toBe('u-bahadir.temizer')

  const after = await krsOf(db, SAHA_OBJ)
  expect(after.find((k) => k.id === existing[0]!.id)?.ownerUserId).toBe('u-oguzhan.kizilcan')
  expect(after.find((k) => k.id === existing[1]!.id)?.ownerUserId).toBe('u-bahadir.temizer')
})

test('staff are offered as owners; deactivated people are not', async () => {
  // The real seed has no staff records (all three accounts are admins), so
  // one is planted here — the same pattern as
  // lib/actions/__tests__/users.test.ts:131 — to restore the original claim:
  // `getAssignablePeople` is role-independent (a `staff` record with no login
  // capability is still offered), driven only by `state`. Asserting this with
  // an admin instead would still pass a regression that added
  // `role === 'admin'` to that filter — the role-independence half of the
  // claim needs a non-admin record to catch that.
  const db = await seeded()
  const created = await createUserAs(db, actor('admin', null), {
    name: 'Geçici Personel', email: 'gecici-personel-owner@nove.group', role: 'staff', departmentId: null,
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  const before = await getAssignablePeople(db)
  expect(before.some((p) => p.id === created.data.id && p.role === 'staff')).toBe(true)

  await db.update(users).set({ state: 'passive' }).where(eq(users.id, created.data.id))
  const after = await getAssignablePeople(db)
  expect(after.some((p) => p.id === created.data.id)).toBe(false)
})

/* ------------------- historical back-filling (İK use case) ------------------- */

test('a closed period still accepts objectives, so history can be entered', async () => {
  const db = await seeded()
  // A quarter that has already ended. Back-filling must not be blocked by that.
  const [past] = await db.select().from(periods).where(eq(periods.code, SEED_CLOSED_PERIOD_CODE))
  expect(past?.state).toBe('closed')

  const res = await createObjectiveFor(db, actor('admin', null), {
    title: 'Q1 lead maliyetini düşür',
    departmentId: 'pazarlama',
    ownerUserId: 'u-oguzhan.kizilcan',
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [{ title: 'Lead maliyetini 800e indir', start: 1000, current: 820, target: 800, unit: '₺', rollup: 'last' as const }],
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const [row] = await db.select().from(objectives).where(eq(objectives.id, res.data.id))
  expect(row?.periodId).toBe(past!.id)
})

test('a key result can be created with the figure already achieved', async () => {
  const db = await seeded()
  const res = await createObjectiveFor(db, actor('admin', null), {
    title: 'Geçmiş çeyreğin sonucu',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [
      { title: 'Hedefe ulaşan KR', start: 0, current: 100, target: 100, unit: '%', rollup: 'last' as const },
      { title: 'Güncel verilmeyen KR', start: 10, target: 50, unit: '', rollup: 'last' as const },
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
  await createObjectiveFor(db, actor('admin', null), {
    title: 'Q1 hedefi',
    departmentId: 'pazarlama',
    ownerUserId: null,
    periodCode: SEED_CLOSED_PERIOD_CODE,
    krs: [{ title: 'Tamamlanmış KR', start: 0, current: 100, target: 100, unit: '%', rollup: 'last' as const }],
  })

  const q1 = await getDepartment(db, 'pazarlama', await idsOf(db, SEED_CLOSED_PERIOD_CODE))
  const openQ = await getDepartment(db, 'pazarlama', await idsOf(db, SEED_OBJECTIVE_PERIOD_CODE))

  expect(q1?.pct).toBe(100)
  // The open fiscal year is untouched — periods are separate buckets, which
  // is what makes historical entry safe. Pazarlama's open-year figure is 0%:
  // nothing has been measured there yet.
  expect(openQ?.pct).toBe(0)
})
