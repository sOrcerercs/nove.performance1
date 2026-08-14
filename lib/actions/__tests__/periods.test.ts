import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb, type Db } from '@/lib/db'
import { periods } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import type { Role } from '@/lib/domain/types'
import { SEED_OBJECTIVE_PERIOD_CODE, SEED_OBJECTIVE_PERIOD_ID } from '@/lib/db/seed-data'
import { activePeriodOf, type PeriodOption } from '@/lib/queries/range'
import { allPeriods } from '@/lib/queries/tables'
import { createPeriodAs, setPeriodStateAs } from '../core/periods'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** Every period, shaped the way `activePeriodOf` expects. */
async function everyPeriod(db: Db): Promise<PeriodOption[]> {
  return (await allPeriods(db)).map((p) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    state: p.state,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
  }))
}

const actor = (role: Role): SessionUser => ({
  id: 'u-elif.cinar', name: 'Test', email: 't@nove.group', role, departmentId: 'ik',
})

test('a new quarter is created as planned', async () => {
  const db = await seeded()
  const res = await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })
  expect(res.ok).toBe(true)

  const [row] = await db.select().from(periods).where(eq(periods.code, '2027-Q1'))
  expect(row?.state).toBe('planned')
  expect(row?.kind).toBe('quarter')
})

test('a quarter code must look like a quarter, and a month like a month', async () => {
  const db = await seeded()
  expect((await createPeriodAs(db, actor('admin'), {
    code: '2027-01', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })).ok).toBe(false)
  expect((await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'month', startsOn: '2027-01-01', endsOn: '2027-01-31',
  })).ok).toBe(false)
})

test('a fiscal year code is accepted, a malformed one is not', async () => {
  const db = await seeded()
  expect((await createPeriodAs(db, actor('admin'), {
    code: '2028-FY', kind: 'year', startsOn: '2028-09-01', endsOn: '2029-08-31',
  })).ok).toBe(true)
  expect((await createPeriodAs(db, actor('admin'), {
    code: '2028-Q1', kind: 'year', startsOn: '2028-09-01', endsOn: '2029-08-31',
  })).ok).toBe(false)
})

test('an end date before the start is refused', async () => {
  const db = await seeded()
  const res = await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-03-31', endsOn: '2027-01-01',
  })
  expect(res.ok).toBe(false)
})

test('a duplicate period code is refused', async () => {
  const db = await seeded()
  const input = {
    code: '2030-Q1', kind: 'quarter' as const,
    startsOn: '2030-09-01', endsOn: '2030-11-30',
  }
  expect((await createPeriodAs(db, actor('admin'), input)).ok).toBe(true)

  const second = await createPeriodAs(db, actor('admin'), input)
  expect(second).toEqual({ ok: false, error: 'Bu dönem zaten tanımlı.' })
})

test('activating a quarter closes the previously active one', async () => {
  const db = await seeded()
  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2027-q1', state: 'active' })

  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q2', kind: 'quarter', startsOn: '2027-04-01', endsOn: '2027-06-30',
  })
  const res = await setPeriodStateAs(db, actor('admin'), {
    periodId: 'p-2027-q2', state: 'active',
  })
  expect(res.ok).toBe(true)

  const quarters = (await db.select().from(periods)).filter((p) => p.kind === 'quarter')
  const active = quarters.filter((p) => p.state === 'active')
  // Exactly one, otherwise activePeriodOf's "first active" pick is arbitrary.
  expect(active).toHaveLength(1)
  expect(active[0]?.code).toBe('2027-Q2')
  // The previously active quarter is now closed.
  expect(quarters.find((p) => p.code === '2027-Q1')?.state).toBe('closed')
  // Activation exclusivity is cross-kind: the seed's fiscal year was closed
  // the moment the first quarter was activated.
  expect((await db.select().from(periods)).find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)?.state)
    .toBe('closed')
})

test('activation is global, not scoped per granularity', async () => {
  const db = await seeded()
  // Months are not seeded, but the core still supports them, so the
  // cross-kind exclusivity rule is verified by creating one explicitly.
  await createPeriodAs(db, actor('admin'), {
    code: '2026-08', kind: 'month', startsOn: '2026-08-01', endsOn: '2026-08-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2026-08', state: 'active' })

  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2027-q1', state: 'active' })

  const all = await db.select().from(periods)
  // Activating the quarter must also close the month — at most one active
  // period across every kind, full stop.
  expect(all.filter((p) => p.state === 'active').map((p) => p.code)).toEqual(['2027-Q1'])
})

test('activating a period closes an open period of a different kind', async () => {
  const db = await seeded()
  const before = (await allPeriods(db)).find((p) => p.state === 'active')
  expect(before?.kind).toBe('year')

  const created = await createPeriodAs(db, actor('admin'), {
    code: '2031-Q1', kind: 'quarter', startsOn: '2031-09-01', endsOn: '2031-11-30',
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return
  await setPeriodStateAs(db, actor('admin'), { periodId: created.data.id, state: 'active' })

  const active = (await allPeriods(db)).filter((p) => p.state === 'active')
  expect(active).toHaveLength(1)
  expect(active[0]?.kind).toBe('quarter')
})

test('the app opens on whichever period is active', async () => {
  const db = await seeded()
  // The seed's canonical open period is now a fiscal year, not a quarter, so
  // `activePeriodOf` finds it — it no longer filters on kind.
  expect(activePeriodOf(await everyPeriod(db))?.code).toBe(SEED_OBJECTIVE_PERIOD_CODE)

  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2027-q1', state: 'active' })

  expect(activePeriodOf(await everyPeriod(db))?.code).toBe('2027-Q1')
})

test('only an admin may create or activate a period', async () => {
  const db = await seeded()
  for (const role of ['executive', 'staff'] as const) {
    expect((await createPeriodAs(db, actor(role), {
      code: '2027-Q2', kind: 'quarter', startsOn: '2027-04-01', endsOn: '2027-06-30',
    })).ok, role).toBe(false)
    expect((await setPeriodStateAs(db, actor(role), {
      periodId: SEED_OBJECTIVE_PERIOD_ID, state: 'active',
    })).ok, role).toBe(false)
  }
})
