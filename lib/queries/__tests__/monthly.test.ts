import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { monthsOfPeriod } from '@/lib/domain/monthly'
import { getMonthlyEntryVm } from '../monthly'
import { activePeriodOf } from '../range'
import { allPeriods } from '../tables'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

async function openPeriod(db: Awaited<ReturnType<typeof seeded>>) {
  const periods = await allPeriods(db)
  const period = periods.find((p) => p.code === SEED_OBJECTIVE_PERIOD_CODE)
  if (!period) throw new Error('seed has no open period')
  return period
}

const admin: SessionUser = {
  id: 'u-admin-test',
  name: 'Admin',
  email: 'admin@nove.group',
  role: 'admin',
  departmentId: null,
}

const executive: SessionUser = {
  id: 'u-exec-test',
  name: 'Executive',
  email: 'exec@nove.group',
  role: 'executive',
  departmentId: null,
}

test("the month list comes from the open period, not the calendar", async () => {
  const db = await seeded()
  const period = await openPeriod(db)

  const vm = await getMonthlyEntryVm(db, admin)

  expect(vm.months).toEqual(monthsOfPeriod(period.startsOn, period.endsOn))
  expect(vm.month).not.toBeNull()
  expect(vm.months).toContain(vm.month)
})

test('an admin may edit every row; an executive may edit none — but both see every row', async () => {
  const db = await seeded()

  const asAdmin = await getMonthlyEntryVm(db, admin)
  const asExecutive = await getMonthlyEntryVm(db, executive)

  const adminRows = asAdmin.depts.flatMap((d) => d.rows)
  const executiveRows = asExecutive.depts.flatMap((d) => d.rows)

  // Same 63 key results either way — nobody's rows are filtered out of the
  // read model just because they cannot edit them.
  expect(adminRows).toHaveLength(63)
  expect(executiveRows).toHaveLength(63)

  expect(adminRows.every((r) => r.canEdit)).toBe(true)
  expect(executiveRows.every((r) => !r.canEdit)).toBe(true)

  // The executive's blanket read-only rights collapse the editable
  // denominator to zero, which is why the counters below are keyed off
  // `editableCount`, not the row count.
  expect(asExecutive.editableCount).toBe(0)
  expect(asAdmin.editableCount).toBe(63)
})

test('the fill counter only counts editable rows that actually have a value for the selected month', async () => {
  const db = await seeded()
  const period = await openPeriod(db)
  const month = monthsOfPeriod(period.startsOn, period.endsOn)[0]
  if (!month) throw new Error('open period has no months')

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-t1', keyResultId: 'k-sat-italya', month, value: 40, authorUserId: 'u-kagan.ozturk' },
    { id: 'kmv-t2', keyResultId: 'k-sat-dis', month, value: 10, authorUserId: 'u-kagan.ozturk' },
  ])

  const vm = await getMonthlyEntryVm(db, admin, month)

  expect(vm.filledCount).toBe(2)
  expect(vm.editableCount).toBe(63)

  const italyRow = vm.depts.flatMap((d) => d.rows).find((r) => r.krId === 'k-sat-italya')
  expect(italyRow?.value).toBe(40)

  const untouchedRow = vm.depts.flatMap((d) => d.rows).find((r) => r.krId === 'k-sat-genel')
  // Never entered: `null`, not `0` — the distinction the whole screen exists
  // to protect.
  expect(untouchedRow?.value).toBeNull()
})

test("a key result's value comes from the requested month, not any other month on file", async () => {
  const db = await seeded()
  const period = await openPeriod(db)
  const [firstMonth, secondMonth] = monthsOfPeriod(period.startsOn, period.endsOn)
  if (!firstMonth || !secondMonth) throw new Error('open period needs at least two months')

  await db.insert(krMonthlyValues).values([
    { id: 'kmv-m1', keyResultId: 'k-sat-italya', month: firstMonth, value: 11, authorUserId: 'u-kagan.ozturk' },
    { id: 'kmv-m2', keyResultId: 'k-sat-italya', month: secondMonth, value: 22, authorUserId: 'u-kagan.ozturk' },
  ])

  const vmFirst = await getMonthlyEntryVm(db, admin, firstMonth)
  const vmSecond = await getMonthlyEntryVm(db, admin, secondMonth)

  const rowIn = (vm: Awaited<ReturnType<typeof getMonthlyEntryVm>>) =>
    vm.depts.flatMap((d) => d.rows).find((r) => r.krId === 'k-sat-italya')

  expect(rowIn(vmFirst)?.value).toBe(11)
  expect(rowIn(vmSecond)?.value).toBe(22)
})

test('a month outside the open period falls back to the default instead of an empty pick', async () => {
  const db = await seeded()
  const vm = await getMonthlyEntryVm(db, admin, '1999-01')

  expect(vm.month).not.toBe('1999-01')
  expect(vm.months).toContain(vm.month)
})

test('rows are grouped by department', async () => {
  const db = await seeded()
  const vm = await getMonthlyEntryVm(db, admin)

  const satis = vm.depts.find((d) => d.slug === 'satis')
  expect(satis?.rows.some((r) => r.krId === 'k-sat-italya')).toBe(true)

  const other = vm.depts.find((d) => d.slug !== 'satis')
  expect(other?.rows.some((r) => r.krId === 'k-sat-italya')).toBe(false)
})
