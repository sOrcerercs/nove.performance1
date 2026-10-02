import { eq, sql } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'
import { can, type SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { keyResults, krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { setMonthlyValueAs, setMonthlyValuesAs } from '../core/monthly'
import { FORBIDDEN } from '../types'

/**
 * `can()` is mocked here, but only ever as a pass-through by default: every
 * test that does not touch it gets the exact real behaviour
 * (`vi.importActual` below is captured once and used as the initial —
 * and, after each test, restored — implementation). The one test that needs
 * a real actor who may edit one key result and not another
 * ("a mixed-permission batch…") overrides it for its own duration, because
 * today's flat role model genuinely cannot produce that actor: `can()`
 * ignores its resource argument entirely (admin: always true, executive:
 * always false — see lib/auth/permissions.ts). Stubbing it here is the only
 * way to exercise `setMonthlyValuesAs`'s per-item enforcement against a
 * genuinely mixed set of results without inventing department-scoped roles
 * the product does not have yet.
 */
vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return { ...actual, can: vi.fn(actual.can) }
})

const { can: realCan } = await vi.importActual<typeof import('@/lib/auth/permissions')>(
  '@/lib/auth/permissions',
)

afterEach(() => {
  vi.mocked(can).mockImplementation(realCan)
})

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const admin: SessionUser = {
  id: 'u-kagan.ozturk',
  name: 'Test',
  email: 't@nove.group',
  role: 'admin',
  departmentId: null,
}

const executive: SessionUser = {
  id: 'u-someone-else',
  name: 'Test',
  email: 't2@nove.group',
  role: 'executive',
  departmentId: null,
}

test('writing a month stores the value and recomputes the summary', async () => {
  const db = await seeded()
  const r = await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: '2025-09', value: 40 })
  expect(r.ok).toBe(true)

  const rows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-sat-italya'))
  expect(rows).toHaveLength(1)
  expect(rows[0]!.value).toBe(40)

  // k-sat-italya is a `sum` rule: the summary is the total of filled months.
  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-sat-italya'))
  expect(kr!.current).toBe(40)
})

test('writing the same month again updates it rather than adding a row', async () => {
  const db = await seeded()
  await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: '2025-09', value: 40 })
  await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: '2025-09', value: 55 })

  const rows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-sat-italya'))
  expect(rows).toHaveLength(1)
  expect(rows[0]!.value).toBe(55)
})

test('sum accumulates across months', async () => {
  const db = await seeded()
  await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: '2025-09', value: 40 })
  await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: '2025-10', value: 60 })

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-sat-italya'))
  expect(kr!.current).toBe(100)
})

test('avg averages the filled months, not the calendar', async () => {
  const db = await seeded()
  // k-skl-skor is an `avg` rule.
  await setMonthlyValueAs(db, admin, { krId: 'k-skl-skor', month: '2025-09', value: 99 })
  await setMonthlyValueAs(db, admin, { krId: 'k-skl-skor', month: '2025-10', value: 99.4 })

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-skl-skor'))
  expect(kr!.current).toBeCloseTo(99.2, 5)
})

/**
 * Both `last` tests below disable index/bitmap scans for the session before
 * writing anything.
 *
 * `kr_monthly_values` carries a unique index on (keyResultId, month) — see
 * schema.ts — and against a table this small the planner happily satisfies
 * `WHERE key_result_id = ...` with an index scan on it, which incidentally
 * returns rows in month order as a side effect of the index's own key order.
 * That accident hid this exact bug during manual verification: a plain
 * `SELECT ... WHERE key_result_id = ...` with no `ORDER BY` came back sorted
 * anyway, so nothing looked wrong. Forcing a sequential scan removes that
 * accident and reads the rows back in true heap order — the order production
 * risks once the table is larger, statistics differ, or the planner simply
 * picks differently, and the exact order `recomputeSummary` was reading in
 * before this fix.
 */
async function forceSeqScan(db: Awaited<ReturnType<typeof seeded>>) {
  await db.execute(sql`set enable_indexscan = off`)
  await db.execute(sql`set enable_bitmapscan = off`)
}

test('last picks the chronologically latest month, regardless of write order', async () => {
  const db = await seeded()
  await forceSeqScan(db)
  // k-fin-tedarikci is a `last` rule. October is written first, September
  // second — the write order is deliberately reversed from calendar order.
  await setMonthlyValueAs(db, admin, { krId: 'k-fin-tedarikci', month: '2025-10', value: 90 })
  await setMonthlyValueAs(db, admin, { krId: 'k-fin-tedarikci', month: '2025-09', value: 80 })

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-fin-tedarikci'))
  // October is chronologically later, so it must still win — not 80, the
  // row that happens to have been written last.
  expect(kr!.current).toBe(90)
})

test('correcting an earlier month does not revert `last` to that month\'s value', async () => {
  const db = await seeded()
  await forceSeqScan(db)
  // Ascending write order first (September, then October) — the everyday
  // motion every other test in this file already uses, and which never
  // reproduced the bug. Then September is corrected, which is what moves
  // its row to the end of the heap on a real Postgres table (confirmed via
  // `ctid` while investigating this fix).
  await setMonthlyValueAs(db, admin, { krId: 'k-fin-tedarikci', month: '2025-09', value: 80 })
  await setMonthlyValueAs(db, admin, { krId: 'k-fin-tedarikci', month: '2025-10', value: 90 })
  await setMonthlyValueAs(db, admin, { krId: 'k-fin-tedarikci', month: '2025-09', value: 85 })

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-fin-tedarikci'))
  // October is still the chronologically latest month on file — correcting
  // September must not revert `current` back to September's value.
  expect(kr!.current).toBe(90)
})

test('a month outside the key result period is refused', async () => {
  const db = await seeded()
  const r = await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month: '2030-01', value: 1 })
  expect(r.ok).toBe(false)
})

test('a malformed month is refused', async () => {
  const db = await seeded()
  for (const month of ['2025-9', '2025', 'eylül', '2025-13']) {
    expect((await setMonthlyValueAs(db, admin, { krId: 'k-sat-italya', month, value: 1 })).ok, month).toBe(false)
  }
})

test('someone without check-in permission cannot write', async () => {
  const db = await seeded()
  const r = await setMonthlyValueAs(db, executive, { krId: 'k-sat-italya', month: '2025-09', value: 40 })
  expect(r).toEqual({ ok: false, error: FORBIDDEN })
  if (!r.ok) expect(r.error.tr).toBe('Bu işlem için yetkiniz yok.')
})

test('nothing outside setMonthlyValue writes the derived summary', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { join } = await import('node:path')

  const roots = ['lib', 'app', 'components', 'scripts']
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) {
        const src = readFileSync(p, 'utf8')
        // A `.set({ ... current ... })` on the keyResults table.
        if (/update\(\s*keyResults\s*\)[\s\S]{0,200}?\bcurrent\s*:/.test(src)) offenders.push(p)
      }
    }
  }
  for (const r of roots) walk(r)

  // The seeder writes `current` on insert, which is fine — it is not an update.
  //
  // Task 2's first pass found seven writers, not one: this file plus
  // `checkins.ts` and `objectives.ts` (see that task's report) — both
  // production code, neither anticipated as a sole exception. Task 5 closed
  // both: `checkins.ts` now writes the current month through
  // `upsertMonthlyValue` + `recomputeSummary` instead of assigning `current`,
  // and `objectives.ts` recomputes via that same `recomputeSummary` when a
  // key result's rollup rule changes, instead of assigning `current` itself.
  // This file is the only production writer left — the invariant its header
  // states is now enforced, not just documented.
  //
  // The four `lib/queries/__tests__/*` files poke `current` directly to set up
  // a read-path fixture — a test arranging data, not an application write path,
  // the same exemption as the seeder's insert above. They are unreachable
  // through any real UI action, so narrowing the walked roots or the regex to
  // exclude them would hide real offenders as readily as it hides these.
  // `tree.test.ts` joined this list in the kesit-görünümü plan's Task 2 review
  // round: its bridge and "omitting the cutoff" tests need `current` set to a
  // value distinct from both `start` and any inserted monthly row, or a bug
  // that fell through to one of those would pass unnoticed — the same
  // fixture-arranging use the other three were already exempted for.
  // `sidebar.test.ts` left this list in Task 4: its rewrite computes off
  // `loadTree`/`getDepartment` instead of building its own per-period sums, and
  // no longer needs to move a key result off its seeded `current` to do that.
  expect(offenders.slice().sort()).toEqual(
    [
      'lib/actions/core/monthly.ts',
      'lib/queries/__tests__/department.test.ts',
      'lib/queries/__tests__/overview.test.ts',
      'lib/queries/__tests__/report.test.ts',
      'lib/queries/__tests__/tree.test.ts',
    ].sort(),
  )
})

// ------------------------------ setMonthlyValuesAs ------------------------------

test('a clean batch writes every row, each summary reflecting its own rollup rule', async () => {
  const db = await seeded()

  // k-sat-italya: `sum`. k-skl-skor: `avg`. Two months each, chosen so a
  // swapped rule would visibly change the result: sum → 100 vs avg → 50 for
  // the first, avg → 99.2 vs sum → 198.4 for the second.
  const result = await setMonthlyValuesAs(db, admin, [
    { krId: 'k-sat-italya', month: '2025-09', value: 40 },
    { krId: 'k-sat-italya', month: '2025-10', value: 60 },
    { krId: 'k-skl-skor', month: '2025-09', value: 99 },
    { krId: 'k-skl-skor', month: '2025-10', value: 99.4 },
  ])

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.data.every((r) => r.ok)).toBe(true)

  const italyaRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-sat-italya'))
  const skorRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-skl-skor'))
  expect(italyaRows).toHaveLength(2)
  expect(skorRows).toHaveLength(2)

  const [italya] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-sat-italya'))
  const [skor] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-skl-skor'))
  expect(italya!.current).toBe(100)
  expect(skor!.current).toBeCloseTo(99.2, 5)
})

test('a mixed-permission batch refuses only what it must', async () => {
  const db = await seeded()

  // Today's flat role model cannot produce this actor for real (see the
  // module-level comment above) — 'satis' is allowed, everything else is not.
  // The id has to be a real seeded user: `krMonthlyValues.authorUserId` is a
  // foreign key, and this test writes a real row through it.
  const mixedActor: SessionUser = {
    id: 'u-oguzhan.kizilcan',
    name: 'Mixed',
    email: 'mixed@nove.group',
    role: 'executive',
    departmentId: 'satis',
  }
  vi.mocked(can).mockImplementation((user, action, resource) =>
    user.id === mixedActor.id ? resource?.departmentId === 'satis' : realCan(user, action, resource),
  )

  // k-sat-italya → 'satis' (permitted). k-fin-taksit → 'finans' (refused).
  const result = await setMonthlyValuesAs(db, mixedActor, [
    { krId: 'k-sat-italya', month: '2025-09', value: 40 },
    { krId: 'k-fin-taksit', month: '2025-09', value: 5000 },
  ])

  expect(result.ok).toBe(true)
  if (!result.ok) return

  const permitted = result.data.find((r) => r.krId === 'k-sat-italya')
  const refused = result.data.find((r) => r.krId === 'k-fin-taksit')
  expect(permitted?.ok).toBe(true)
  expect(refused).toEqual({ krId: 'k-fin-taksit', month: '2025-09', ok: false, error: FORBIDDEN })

  // The load-bearing assertion: the permitted row landed, the refused row did
  // not — a batch that wrote everything, or refused everything, fails this.
  const satRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-sat-italya'))
  const finRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-fin-taksit'))
  expect(satRows).toHaveLength(1)
  expect(finRows).toHaveLength(0)
})

test('a batch from an actor with no permission at all writes nothing', async () => {
  const db = await seeded()

  const result = await setMonthlyValuesAs(db, executive, [
    { krId: 'k-sat-italya', month: '2025-09', value: 40 },
    { krId: 'k-skl-skor', month: '2025-09', value: 99 },
  ])

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.data.every((r) => r.ok === false)).toBe(true)

  const italyaRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-sat-italya'))
  const skorRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-skl-skor'))
  expect(italyaRows).toHaveLength(0)
  expect(skorRows).toHaveLength(0)
})

test('an invalid item does not poison the valid ones in the same batch', async () => {
  const db = await seeded()

  const result = await setMonthlyValuesAs(db, admin, [
    { krId: 'k-sat-italya', month: '2025-09', value: 40 },
    // Outside k-skl-skor's period — refused by setMonthlyValueAs itself, not
    // a permission failure.
    { krId: 'k-skl-skor', month: '2030-01', value: 999 },
  ])

  expect(result.ok).toBe(true)
  if (!result.ok) return

  const good = result.data.find((r) => r.krId === 'k-sat-italya')
  const bad = result.data.find((r) => r.krId === 'k-skl-skor')
  expect(good?.ok).toBe(true)
  expect(bad?.ok).toBe(false)

  const italyaRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-sat-italya'))
  const skorRows = await db.select().from(krMonthlyValues).where(eq(krMonthlyValues.keyResultId, 'k-skl-skor'))
  expect(italyaRows).toHaveLength(1)
  expect(skorRows).toHaveLength(0)

  const [italya] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-sat-italya'))
  const [skor] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-skl-skor'))
  expect(italya!.current).toBe(40)
  // Untouched: still its seeded start, not dragged down by the refused write.
  expect(skor!.current).toBe(98.87)
})
