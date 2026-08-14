import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { seed } from '@/lib/db/seed'
import { setDefaultRangeStartAs } from '@/lib/actions/core/settings'
import type { SessionUser } from '@/lib/auth/permissions'
import {
  activePeriodOf,
  periodsInRange,
  resolveRange,
  searchParamsFromHeader,
  type PeriodOption,
} from '../range'
import { withRequestScope } from '../tables'

const admin: SessionUser = {
  id: 'u-admin', name: 'Admin', email: 'admin@example.com', role: 'admin', departmentId: null,
}

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

/** A fixed clock: 10 August 2026, 09:00 Istanbul. */
const NOW = new Date('2026-08-10T06:00:00Z')

const period = (over: Partial<PeriodOption>): PeriodOption => ({
  id: 'p', code: 'X', kind: 'quarter', state: 'planned',
  startsOn: '2026-01-01', endsOn: '2026-03-31', ...over,
})

test('a period touching either edge of the range is included', () => {
  const periods = [
    period({ id: 'before', startsOn: '2025-01-01', endsOn: '2025-08-31' }),
    period({ id: 'ends-on-from', startsOn: '2025-06-01', endsOn: '2025-09-01' }),
    period({ id: 'inside', startsOn: '2025-10-01', endsOn: '2025-12-31' }),
    period({ id: 'starts-on-to', startsOn: '2026-08-10', endsOn: '2026-10-31' }),
    period({ id: 'after', startsOn: '2026-08-11', endsOn: '2026-12-31' }),
  ]
  const hit = periodsInRange(periods, { from: '2025-09-01', to: '2026-08-10' })
  expect(hit.map((p) => p.id)).toEqual(['ends-on-from', 'inside', 'starts-on-to'])
})

test('periods come back oldest first', () => {
  const periods = [
    period({ id: 'b', startsOn: '2025-12-01', endsOn: '2026-02-28' }),
    period({ id: 'a', startsOn: '2025-09-01', endsOn: '2025-11-30' }),
  ]
  const hit = periodsInRange(periods, { from: '2025-09-01', to: '2026-08-10' })
  expect(hit.map((p) => p.id)).toEqual(['a', 'b'])
})

test('the open period is found, and null when there is none', () => {
  const open = period({ id: 'now', kind: 'quarter', state: 'active' })
  expect(activePeriodOf([period({ id: 'old', state: 'closed' }), open])?.id).toBe('now')
  expect(activePeriodOf([period({ id: 'old', state: 'closed' })])).toBeNull()
})

test('a non-quarter period can be the open one', () => {
  const fy = period({ id: 'fy', kind: 'year', state: 'active' })
  expect(activePeriodOf([fy])?.id).toBe('fy')
})

test('with no query string the range runs from the configured start to today', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() => resolveRange(db, undefined, NOW))
  expect(sel.range).toEqual({ from: '2025-09-01', to: '2026-08-10' })
  expect(sel.preset).toBe('fy')
})

test('the configured start moves the default range', async () => {
  const db = await seeded()
  await setDefaultRangeStartAs(db, admin, { startsOn: '2026-01-01' })
  const sel = await withRequestScope(() => resolveRange(db, undefined, NOW))
  expect(sel.range.from).toBe('2026-01-01')
})

test('from and to are read out of the query string', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() =>
    resolveRange(db, { from: '2026-03-01', to: '2026-05-31' }, NOW))
  expect(sel.range).toEqual({ from: '2026-03-01', to: '2026-05-31' })
  expect(sel.preset).toBe('custom')
})

test('a malformed, reversed or half-given range falls back to the default', async () => {
  const db = await seeded()
  const fallback = { from: '2025-09-01', to: '2026-08-10' }

  for (const params of [
    { from: 'yarın', to: '2026-05-31' },
    { from: '2026-02-30', to: '2026-05-31' },
    { from: '2026-05-31', to: '2026-03-01' },
    { from: '2026-03-01' },
    { to: '2026-05-31' },
    { from: ['2026-03-01'], to: '2026-05-31' },
  ]) {
    const sel = await withRequestScope(() => resolveRange(db, params, NOW))
    expect(sel.range, JSON.stringify(params)).toEqual(fallback)
  }
})

test('an old ?period= link maps to that period dates', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() => resolveRange(db, { period: '2025-FY' }, NOW))
  expect(sel.range).toEqual({ from: '2025-09-01', to: '2026-08-31' })
  expect(sel.periods.map((p) => p.code)).toEqual(['2025-FY'])
})

test('an unknown ?period= falls back rather than erroring', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() => resolveRange(db, { period: '1999-Q1' }, NOW))
  expect(sel.range).toEqual({ from: '2025-09-01', to: '2026-08-10' })
})

test('an explicit range wins over a stale ?period=', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() =>
    resolveRange(db, { period: '2025-FY', from: '2026-03-01', to: '2026-05-31' }, NOW))
  expect(sel.range).toEqual({ from: '2026-03-01', to: '2026-05-31' })
})

test('a range matching no period yields no periods rather than throwing', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() =>
    resolveRange(db, { from: '1999-01-01', to: '1999-12-31' }, NOW))
  expect(sel.periods).toEqual([])
})

test('the default range covers the whole current fiscal year of the seed', async () => {
  const db = await seeded()
  const sel = await withRequestScope(() => resolveRange(db, undefined, NOW))
  expect(sel.periods.map((p) => p.code)).toEqual(['2025-FY'])
})

test('the search-param header is parsed, and a missing one is not an error', () => {
  expect(searchParamsFromHeader('from=2025-09-01&to=2026-03-31'))
    .toEqual({ from: '2025-09-01', to: '2026-03-31' })
  expect(searchParamsFromHeader('?from=2025-09-01')).toEqual({ from: '2025-09-01' })
  // A middleware that did not run, or a request that bypassed it: fall back to
  // the default range rather than erroring — readRange's policy exactly.
  expect(searchParamsFromHeader(null)).toEqual({})
  expect(searchParamsFromHeader('')).toEqual({})
})

test('a duplicated header key comes back as an array, matching Next\'s own searchParams shape', () => {
  // Next hands the page `from: ['2020-01-01', '2026-02-01']` for a duplicated
  // `?from=`, and `readRange`'s `param()` rejects anything that isn't a plain
  // string. `Object.fromEntries(new URLSearchParams(...))` would instead keep
  // only the last value here — a single valid-looking string the page would
  // never have received for the same URL.
  expect(searchParamsFromHeader('from=2020-01-01&from=2026-02-01')).toEqual({
    from: ['2020-01-01', '2026-02-01'],
  })
})

test('a duplicated ?from in the header is rejected exactly like the page rejects it, not collapsed to the last value', async () => {
  const db = await seeded()
  const header = searchParamsFromHeader('from=2020-01-01&from=2026-02-01&to=2026-05-31')
  const sel = await withRequestScope(() => resolveRange(db, header, NOW))
  // Collapsing to the last value (the old `Object.fromEntries` behaviour)
  // would resolve `{ from: '2026-02-01', to: '2026-05-31' }` here — a valid,
  // DIFFERENT range the page would never show for this exact URL. Rejecting
  // the array falls through to the same default both layers already agree on.
  expect(sel.range).toEqual({ from: '2025-09-01', to: '2026-08-10' })
})
