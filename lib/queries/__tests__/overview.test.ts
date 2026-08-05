import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_CODE } from '@/lib/db/seed-data'
import { getOverview, MONTHS_IN_YEAR } from '../overview'

async function overview() {
  const db = await createTestDb()
  await seed(db)
  return getOverview(db, SEED_OBJECTIVE_PERIOD_CODE)
}

test('the headline numbers match the prototype', async () => {
  const vm = await overview()
  expect(vm.companyPct).toBe(51)
  expect(vm.kpis).toEqual({ depts: 8, objectives: 9, krs: 25, avgPct: 51, openKrs: 17 })
})

test('every department carries its own rollup and counts', async () => {
  const vm = await overview()
  expect(vm.depts).toHaveLength(8)

  const bySlug = Object.fromEntries(vm.depts.map((d) => [d.slug, d.pct]))
  expect(bySlug).toEqual({
    pazarlama: 54, saha: 65, kalite: 69, finans: 48,
    ik: 45, sdr: 41, medikal: 41, ofis: 41,
  })

  expect(vm.depts.reduce((s, d) => s + d.objectiveCount, 0)).toBe(9)
  expect(vm.depts.reduce((s, d) => s + d.krCount, 0)).toBe(25)

  const saha = vm.depts.find((d) => d.slug === 'saha')
  expect(saha?.leadName).toBe('Murat Şen')
  expect(saha?.nameTr).toBeTruthy()
  expect(saha?.nameEn).toBeTruthy()
})

test('the attention list holds the open-to-development key results, worst first', async () => {
  const vm = await overview()
  expect(vm.attention).toHaveLength(vm.kpis.openKrs)

  for (const item of vm.attention) {
    expect(item.pct).toBeLessThanOrEqual(59)
    expect(item.deptSlug).toBeTruthy()
    expect(item.deptEmoji).toBeTruthy()
    expect(item.ownerName).toBeTruthy()
    expect(['high', 'mid', 'low']).toContain(item.confidence)
    expect(Number.isFinite(item.daysSinceUpdate)).toBe(true)
  }

  const pcts = vm.attention.map((a) => a.pct)
  expect(pcts).toEqual([...pcts].sort((a, b) => a - b))
})

test('the distribution covers all 25 key results across every status bucket', async () => {
  const vm = await overview()
  expect(vm.distribution.map((d) => d.status)).toEqual(['above', 'expected', 'below', 'open', 'none'])
  expect(vm.distribution.reduce((s, d) => s + d.count, 0)).toBe(25)

  const open = vm.distribution.find((d) => d.status === 'open')?.count ?? 0
  const none = vm.distribution.find((d) => d.status === 'none')?.count ?? 0
  // "Gelişime Açık" in the KPI row is everything at or under 59%, which is
  // exactly the "open" and "not started" buckets put together.
  expect(open + none).toBe(vm.kpis.openKrs)
})

test('the trend reproduces the prototype ramp and ends on the live average', async () => {
  const vm = await overview()
  expect(vm.trend.map((p) => p.actual)).toEqual([6, 13, 22, 29, 37, 44, 51])
  expect(vm.trend.map((p) => p.month)).toEqual(['01', '02', '03', '04', '05', '06', '07'])

  const first = vm.trend[0]
  const last = vm.trend[vm.trend.length - 1]
  expect(first?.pace).toBe(0)
  // The target pace is a straight 0 → 100 line across the twelve months.
  expect(last?.pace).toBe(Math.round((6 * 100) / (MONTHS_IN_YEAR - 1)))
})

test('the view model is JSON-serialisable so it can cross to the client', async () => {
  const vm = await overview()
  expect(JSON.parse(JSON.stringify(vm))).toEqual(vm)
})

test('an unknown period yields an empty overview rather than throwing', async () => {
  const db = await createTestDb()
  await seed(db)
  const vm = await getOverview(db, '1999-Q1')

  expect(vm.companyPct).toBe(0)
  expect(vm.kpis).toEqual({ depts: 0, objectives: 0, krs: 0, avgPct: 0, openKrs: 0 })
  expect(vm.attention).toEqual([])
  expect(vm.distribution.every((d) => d.count === 0)).toBe(true)
})
