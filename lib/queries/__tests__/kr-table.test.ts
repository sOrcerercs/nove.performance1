import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb, type Db } from '@/lib/db'
import { keyResults } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE, SEED_OBJECTIVE_PERIOD_ID } from '@/lib/db/seed-data'
import { setMonthlyValueAs } from '@/lib/actions/core/monthly'
import type { SessionUser } from '@/lib/auth/permissions'
import { M1, M2 } from '@/lib/actions/__tests__/open-months'
import { getKrTableVm } from '../kr-table'

const admin: SessionUser = { id: 'u-kagan.ozturk', name: 'Test', email: 't@nove.group', role: 'admin', departmentId: null }

async function seeded(): Promise<Db> {
  const db = await createTestDb()
  await seed(db)
  return db
}

test('lists every key result of the period, grouped by department in sidebar order', async () => {
  const db = await seeded()
  const vm = await getKrTableVm(db, [SEED_OBJECTIVE_PERIOD_ID])

  expect(vm.depts.length).toBeGreaterThan(0)
  const slugs = vm.depts.map((d) => d.slug)
  expect(new Set(slugs).size).toBe(slugs.length) // each department once
  expect(vm.depts.every((d) => d.krs.every((k) => k.periodCode === SEED_OBJECTIVE_PERIOD_CODE))).toBe(true)

  // With no selection, the first key result is shown.
  expect(vm.selected?.id).toBe(vm.depts[0]!.krs[0]!.id)
})

test('the selected key result carries a full-period monthly table with its entries', async () => {
  const db = await seeded()
  await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: M1, value: 40, note: 'fuar ayı' })
  await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: M2, value: 60 })

  const vm = await getKrTableVm(db, [SEED_OBJECTIVE_PERIOD_ID], 'k-sat-italya')
  const sel = vm.selected!
  expect(sel.id).toBe('k-sat-italya')
  expect(sel.rows).toHaveLength(12)
  expect(sel.rows[0]).toMatchObject({ month: M1, actual: 40, note: 'fuar ayı', status: 'entered' })
  expect(sel.rows[1]).toMatchObject({ month: M2, actual: 60, status: 'entered' })
  expect(sel.rows[2]).toMatchObject({ actual: null, status: 'pending' })

  // The monthly target follows the key result's own rule.
  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-sat-italya'))
  const expected = kr!.rollup === 'sum' ? kr!.target / 12 : kr!.target
  expect(sel.rows[0]!.monthlyTarget).toBeCloseTo(expected)
})

test('an unknown key result id falls back to the first one; no periods means an empty screen', async () => {
  const db = await seeded()
  const vm = await getKrTableVm(db, [SEED_OBJECTIVE_PERIOD_ID], 'k-does-not-exist')
  expect(vm.selected?.id).toBe(vm.depts[0]!.krs[0]!.id)

  expect(await getKrTableVm(db, [])).toEqual({ depts: [], selected: null })
})
