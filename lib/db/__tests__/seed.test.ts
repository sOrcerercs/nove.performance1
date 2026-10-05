import { expect, test } from 'vitest'
import { companyPct, deptPct } from '@/lib/domain/progress'
import { createTestDb } from '../index'
import { canSignIn } from '@/lib/domain/types'
import { departments, keyResults, objectives, periods, users } from '../schema'
import { seed } from '../seed'
import {
  FISCAL_START_MONTH,
  fiscalQuarterRange,
  fiscalYearOf,
} from '@/lib/domain/fiscal'
import {
  SEED_DEPARTMENTS,
  SEED_PERIODS,
  SEED_USERS,
} from '../seed-data'

test('seed carries the real OKR inventory', () => {
  expect(SEED_DEPARTMENTS).toHaveLength(10)
  expect(SEED_DEPARTMENTS.flatMap((d) => d.objectives)).toHaveLength(26)
  expect(SEED_DEPARTMENTS.flatMap((d) => d.objectives).flatMap((o) => o.krs)).toHaveLength(63)
})

test('company progress opens at zero — no actuals have been imported yet', () => {
  // Every key result seeds with current === start, so there is nothing to
  // average above zero until Bahadır enters real numbers.
  expect(companyPct(SEED_DEPARTMENTS)).toBe(0)
})

test('every department opens at zero, for the same reason', () => {
  for (const d of SEED_DEPARTMENTS) {
    expect(deptPct(d.objectives), d.id).toBe(0)
  }
})

test('empty owner and lead names resolve to null, not a dangling reference', async () => {
  // Every owner/lead field in the seed data is deliberately "" — the source
  // has no per-person ownership. `userIdByName.get('')` must miss and the
  // seeder must coalesce that to null rather than accidentally matching a
  // real user or leaving a broken foreign key.
  const db = await createTestDb()
  await seed(db)

  const deptRows = await db.select().from(departments)
  expect(deptRows.length).toBeGreaterThan(0)
  expect(deptRows.every((d) => d.leadUserId === null)).toBe(true)

  const objRows = await db.select().from(objectives)
  expect(objRows.length).toBeGreaterThan(0)
  expect(objRows.every((o) => o.ownerUserId === null)).toBe(true)

  const krRows = await db.select().from(keyResults)
  expect(krRows.length).toBeGreaterThan(0)
  expect(krRows.every((k) => k.ownerUserId === null)).toBe(true)
})

test('seeding writes the full dataset and is safe to repeat', async () => {
  const db = await createTestDb()
  await seed(db)
  await seed(db)

  expect(await db.select().from(departments)).toHaveLength(10)
  expect(await db.select().from(objectives)).toHaveLength(26)
  expect(await db.select().from(keyResults)).toHaveLength(63)
  expect(await db.select().from(users)).toHaveLength(SEED_USERS.length)
})

test('every seeded account gets a hashed password', async () => {
  // The real seed's three accounts are all admins — canSignIn roles — so
  // there is no staff row here to exercise the "personnel records get no
  // credential" branch the prototype's seed had. That behaviour is still
  // covered, just not through seed(): see
  // lib/actions/__tests__/users.test.ts > 'a staff record is created without
  // any credential'. Dropped here rather than kept as dead code that always
  // takes the same branch.
  const db = await createTestDb()
  const { password } = await seed(db)
  const rows = await db.select().from(users)
  expect(rows.length).toBeGreaterThan(0)

  for (const u of rows) {
    expect(canSignIn(u.role), u.email ?? undefined).toBe(true)
    expect(u.passwordHash, u.email ?? undefined).toBeTruthy()
    // Stored hashed, never in the clear.
    expect(u.passwordHash, u.email ?? undefined).not.toBe(password)
    expect(u.passwordHash?.startsWith('$2'), u.email ?? undefined).toBe(true)
  }
})

test('the seed password is generated, not a committed constant', async () => {
  const db = await createTestDb()
  const first = await seed(db)
  const second = await seed(db)
  // Two runs must not share a password, or it is effectively hard-coded.
  expect(first.password).not.toBe(second.password)
  expect(first.password.length).toBeGreaterThanOrEqual(20)
})

test('SEED_PASSWORD overrides the generated one', async () => {
  const db = await createTestDb()
  process.env.SEED_PASSWORD = 'OrtamdanGelenParola2026'
  try {
    const { password } = await seed(db)
    expect(password).toBe('OrtamdanGelenParola2026')
  } finally {
    delete process.env.SEED_PASSWORD
  }
})

test('the three real accounts are all admins; nobody else exists yet', () => {
  expect(SEED_USERS.filter((u) => u.role === 'admin')).toHaveLength(3)
  expect(SEED_USERS.filter((u) => u.role === 'executive')).toHaveLength(0)
  expect(SEED_USERS.filter((u) => u.role === 'staff')).toHaveLength(0)
  // The role was removed from the model entirely.
  expect(SEED_USERS.some((u) => (u.role as string) === 'dept_lead')).toBe(false)
})

test('three fiscal years of periods are seeded, exactly one open', async () => {
  const db = await createTestDb()
  await seed(db)
  const rows = await db.select().from(periods)

  expect(rows).toHaveLength(3)
  expect(rows.every((p) => p.kind === 'year')).toBe(true)
  // Months are deliberately absent: a month cannot show a year's objectives,
  // so seeding them would only produce empty screens.
  expect(rows.filter((p) => p.kind === 'month')).toHaveLength(0)

  const active = rows.filter((p) => p.state === 'active')
  expect(active).toHaveLength(1)

  // Asserted against today rather than a hard-coded code, so this stays true
  // whenever the seed is run.
  const today = new Date().toISOString().slice(0, 10)
  expect(active[0]!.startsOn <= today).toBe(true)
  expect(active[0]!.endsOn >= today).toBe(true)
})

test('the seed builds three fiscal years, not quarters', () => {
  expect(SEED_PERIODS).toHaveLength(3)
  expect(SEED_PERIODS.every((p) => p.kind === 'year')).toBe(true)
  expect(SEED_PERIODS.map((p) => p.code)).toEqual(
    SEED_PERIODS.map((p) => p.code).slice().sort(),
  )
})

test('a fiscal year runs September to the following August', () => {
  const open = SEED_PERIODS.find((p) => p.state === 'active')
  expect(open).toBeDefined()
  expect(open!.startsOn.slice(5)).toBe('09-01')
  expect(open!.endsOn.slice(5)).toBe('08-31')
  expect(open!.code).toBe(`${open!.startsOn.slice(0, 4)}-FY`)
})

test('exactly one fiscal year is open, with a closed one before and a planned one after', () => {
  const states = SEED_PERIODS.map((p) => p.state)
  expect(states.filter((s) => s === 'active')).toHaveLength(1)
  expect(states.filter((s) => s === 'closed')).toHaveLength(1)
  expect(states.filter((s) => s === 'planned')).toHaveLength(1)
})

test('the fiscal year starts in September and is labelled by its start year', () => {
  expect(FISCAL_START_MONTH).toBe(9)

  // The requirement: 2026-Q1 runs September to November 2026.
  expect(fiscalQuarterRange(2026, 1)).toEqual({
    startsOn: '2026-09-01', endsOn: '2026-11-30',
  })
  expect(fiscalQuarterRange(2026, 2)).toEqual({
    startsOn: '2026-12-01', endsOn: '2027-02-28',
  })
  expect(fiscalQuarterRange(2026, 4)).toEqual({
    startsOn: '2027-06-01', endsOn: '2027-08-31',
  })

  // February is derived, not tabulated, so leap years come out right.
  expect(fiscalQuarterRange(2027, 2).endsOn).toBe('2028-02-29')

  // August still belongs to the previous fiscal year; September starts the new one.
  expect(fiscalYearOf('2026-08-31')).toBe(2025)
  expect(fiscalYearOf('2026-09-01')).toBe(2026)
})

test('the seeded objectives land in the open quarter', async () => {
  const db = await createTestDb()
  await seed(db)

  const [open] = (await db.select().from(periods)).filter((p) => p.state === 'active')
  const objs = await db.select().from(objectives)
  expect(objs).toHaveLength(26)
  expect(objs.every((o) => o.periodId === open!.id)).toBe(true)
})
