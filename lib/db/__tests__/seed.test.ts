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
  SEED_DEPARTMENTS,
  SEED_USERS,
} from '../seed-data'

test('seed carries the prototype inventory', () => {
  expect(SEED_DEPARTMENTS).toHaveLength(8)
  expect(SEED_DEPARTMENTS.flatMap((d) => d.objectives)).toHaveLength(9)
  expect(SEED_DEPARTMENTS.flatMap((d) => d.objectives).flatMap((o) => o.krs)).toHaveLength(25)
})

test('company progress matches the figure the prototype renders', () => {
  // The prototype's hero panel reads 51%. If the port of the math or of the
  // numbers drifted, this is where it shows up.
  expect(companyPct(SEED_DEPARTMENTS)).toBe(51)
})

test('every department matches its prototype percentage', () => {
  const expected: Record<string, number> = {
    pazarlama: 54, saha: 65, kalite: 69, finans: 48,
    ik: 45, sdr: 41, medikal: 41, ofis: 41,
  }
  for (const d of SEED_DEPARTMENTS) {
    expect(deptPct(d.objectives), d.id).toBe(expected[d.id])
  }
})

test('every named owner resolves to a seeded user', () => {
  const names = new Set(SEED_USERS.map((u) => u.name))
  for (const d of SEED_DEPARTMENTS) {
    expect(names, d.owner).toContain(d.owner)
    for (const o of d.objectives) {
      expect(names, o.owner).toContain(o.owner)
      for (const k of o.krs) expect(names, k.owner).toContain(k.owner)
    }
  }
})

test('seeding writes the full dataset and is safe to repeat', async () => {
  const db = await createTestDb()
  await seed(db)
  await seed(db)

  expect(await db.select().from(departments)).toHaveLength(8)
  expect(await db.select().from(objectives)).toHaveLength(9)
  expect(await db.select().from(keyResults)).toHaveLength(25)
  expect(await db.select().from(users)).toHaveLength(SEED_USERS.length)
})

test('accounts get a hashed password and staff get none', async () => {
  const db = await createTestDb()
  const { password } = await seed(db)
  const rows = await db.select().from(users)

  for (const u of rows) {
    if (canSignIn(u.role)) {
      expect(u.passwordHash, u.email).toBeTruthy()
      // Stored hashed, never in the clear.
      expect(u.passwordHash, u.email).not.toBe(password)
      expect(u.passwordHash?.startsWith('$2'), u.email).toBe(true)
    } else {
      // Personnel records must not carry a credential.
      expect(u.passwordHash, u.email).toBeNull()
    }
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

test('only İK and Yönetim have accounts; everyone else is staff', () => {
  expect(SEED_USERS.filter((u) => u.role === 'admin')).toHaveLength(2)
  expect(SEED_USERS.filter((u) => u.role === 'executive')).toHaveLength(1)
  expect(SEED_USERS.filter((u) => u.role === 'staff')).toHaveLength(15)
  // The role was removed from the model entirely.
  expect(SEED_USERS.some((u) => (u.role as string) === 'dept_lead')).toBe(false)
})

test('three fiscal years of quarters are seeded, exactly one open', async () => {
  const db = await createTestDb()
  await seed(db)
  const rows = await db.select().from(periods)

  expect(rows).toHaveLength(12)
  expect(rows.every((p) => p.kind === 'quarter')).toBe(true)
  // Months are deliberately absent: a month cannot show a quarter's objectives,
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
  expect(fiscalYearOf(new Date('2026-08-31T00:00:00Z'))).toBe(2025)
  expect(fiscalYearOf(new Date('2026-09-01T00:00:00Z'))).toBe(2026)
})

test('the seeded objectives land in the open quarter', async () => {
  const db = await createTestDb()
  await seed(db)

  const [open] = (await db.select().from(periods)).filter((p) => p.state === 'active')
  const objs = await db.select().from(objectives)
  expect(objs).toHaveLength(9)
  expect(objs.every((o) => o.periodId === open!.id)).toBe(true)
})
