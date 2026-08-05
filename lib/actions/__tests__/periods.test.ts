import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { periods } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import type { Role } from '@/lib/domain/types'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { resolvePeriod } from '@/lib/queries/periods'
import { createPeriodAs, setPeriodStateAs } from '../core/periods'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
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

test('an end date before the start is refused', async () => {
  const db = await seeded()
  const res = await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-03-31', endsOn: '2027-01-01',
  })
  expect(res.ok).toBe(false)
})

test('a duplicate period code is refused', async () => {
  const db = await seeded()
  const res = await createPeriodAs(db, actor('admin'), {
    code: SEED_OBJECTIVE_PERIOD_CODE, kind: 'quarter',
    startsOn: '2026-07-01', endsOn: '2026-09-30',
  })
  expect(res.ok).toBe(false)
})

test('activating a quarter closes the previously active one', async () => {
  const db = await seeded()
  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })

  const res = await setPeriodStateAs(db, actor('admin'), {
    periodId: 'p-2027-q1', state: 'active',
  })
  expect(res.ok).toBe(true)

  const quarters = (await db.select().from(periods)).filter((p) => p.kind === 'quarter')
  const active = quarters.filter((p) => p.state === 'active')
  // Exactly one, otherwise resolvePeriod's "first active" pick is arbitrary.
  expect(active).toHaveLength(1)
  expect(active[0]?.code).toBe('2027-Q1')
  // Whatever was open before is now closed.
  expect(quarters.find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)?.state).toBe('closed')
})

test('activation is scoped per granularity, not global', async () => {
  const db = await seeded()
  // Months are not seeded, but the core still supports them, so the exclusivity
  // rule is verified by creating one explicitly.
  await createPeriodAs(db, actor('admin'), {
    code: '2026-08', kind: 'month', startsOn: '2026-08-01', endsOn: '2026-08-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2026-08', state: 'active' })

  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2027-q1', state: 'active' })

  const all = await db.select().from(periods)
  // Activating a quarter must not close the month, and vice versa.
  expect(all.filter((p) => p.kind === 'month' && p.state === 'active').map((p) => p.code))
    .toEqual(['2026-08'])
  expect(all.filter((p) => p.kind === 'quarter' && p.state === 'active').map((p) => p.code))
    .toEqual(['2027-Q1'])
})

test('the app opens on whichever quarter is active', async () => {
  const db = await seeded()
  expect((await resolvePeriod(db, undefined))?.current.code).toBe(SEED_OBJECTIVE_PERIOD_CODE)

  await createPeriodAs(db, actor('admin'), {
    code: '2027-Q1', kind: 'quarter', startsOn: '2027-01-01', endsOn: '2027-03-31',
  })
  await setPeriodStateAs(db, actor('admin'), { periodId: 'p-2027-q1', state: 'active' })

  expect((await resolvePeriod(db, undefined))?.current.code).toBe('2027-Q1')
})

test('only an admin may create or activate a period', async () => {
  const db = await seeded()
  for (const role of ['executive', 'staff'] as const) {
    expect((await createPeriodAs(db, actor(role), {
      code: '2027-Q2', kind: 'quarter', startsOn: '2027-04-01', endsOn: '2027-06-30',
    })).ok, role).toBe(false)
    expect((await setPeriodStateAs(db, actor(role), {
      periodId: 'p-2026-q4', state: 'active',
    })).ok, role).toBe(false)
  }
})
