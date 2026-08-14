import { and, eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { createTestDb } from '@/lib/db'
import { checkins, keyResults, krMonthlyValues } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { todayInIstanbul } from '@/lib/domain/dates'
import type { Role } from '@/lib/domain/types'
import { submitCheckinFor } from '../core/checkins'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

const actor = (role: Role, departmentId: string | null, id: string): SessionUser => ({
  id, name: 'Test', email: 't@nove.group', role, departmentId,
})

// k-msf-yorum belongs to objective o-msf-1 in department 'misafir'. Nobody
// owns it — the real workbook carries no per-person ownership.
// k-fin-taksit belongs to o-fin-2 in department 'finans'.
// The three real accounts are all admins with no home department
// (departmentId null): there is no department-lead account left to compare
// against.
const ADMIN = 'u-kagan.ozturk'

test('an admin can check in, and the value moves', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-msf-yorum',
    newValue: 546,
    confidence: 'high',
    note: 'Bu hafta iki yeni süreç devreye alındı.',
  })

  expect(res.ok).toBe(true)
  if (!res.ok) return
  // k-msf-yorum: start 0, target 650. 546/650 = 84%.
  expect(res.data.pct).toBe(84)
  expect(res.data.previousValue).toBe(0)

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-msf-yorum'))
  expect(kr?.current).toBe(546)
  expect(kr?.confidence).toBe('high')
})

test('an audit row records who changed what, from what value', async () => {
  const db = await seeded()
  await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-msf-yorum', newValue: 546, confidence: 'high', note: 'Not',
  })

  const rows = await db.select().from(checkins).where(eq(checkins.keyResultId, 'k-msf-yorum'))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.previousValue).toBe(0)
  expect(rows[0]?.newValue).toBe(546)
  expect(rows[0]?.authorUserId).toBe(ADMIN)
  expect(rows[0]?.note).toBe('Not')
})

test('an admin checks in on a department that is not their own — they have none', async () => {
  const db = await seeded()
  // The admin's own departmentId is null; k-fin-taksit sits in 'finans'. There
  // is no department-based restriction to bypass in `can()`, but the flow
  // must still succeed end to end against a department the actor has no tie to.
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-fin-taksit', newValue: 50000, confidence: 'high',
  })
  expect(res.ok).toBe(true)
  if (res.ok) expect(res.data.pct).toBe(100)
})

test('an executive cannot check in — oversight is read-only', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('executive', null, 'u-someone-else'), {
    keyResultId: 'k-msf-yorum', newValue: 546, confidence: 'high',
  })
  expect(res.ok).toBe(false)

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-msf-yorum'))
  expect(kr?.current).toBe(0) // unchanged
  expect(await db.select().from(checkins)).toHaveLength(0)
})

test('a staff role cannot check in, regardless of resource context', async () => {
  // The seed data has no owner for any key result, so "even on one they own"
  // has no real counterpart — the equivalent claim is that the role check
  // rejects `staff` outright, independent of department or ownership context.
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('staff', 'misafir', 'u-someone-else'), {
    keyResultId: 'k-msf-yorum', newValue: 546, confidence: 'high',
  })
  expect(res.ok).toBe(false)
  expect(await db.select().from(checkins)).toHaveLength(0)
})

test('an unknown key result is rejected', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'nope', newValue: 1, confidence: 'mid',
  })
  expect(res.ok).toBe(false)
})

test('a non-finite value is rejected before touching the database', async () => {
  const db = await seeded()
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-msf-yorum', newValue: Number.NaN, confidence: 'mid',
  })
  expect(res.ok).toBe(false)
  expect(await db.select().from(checkins)).toHaveLength(0)
})

/* ------------------- Task 5: check-in writes the current month ------------------- */

test('a check-in writes the current month, the summary follows the rollup rule, and checkins.month is filled', async () => {
  const db = await seeded()
  const month = todayInIstanbul().slice(0, 7)

  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-msf-yorum', newValue: 200, confidence: 'high',
  })
  expect(res.ok).toBe(true)
  // k-msf-yorum: start 0, target 650. 200/650 rounds to 31%, the same figure
  // `krPct` would derive from the recomputed `current`, not the raw input.
  if (res.ok) expect(res.data.pct).toBe(31)

  const [monthRow] = await db
    .select()
    .from(krMonthlyValues)
    .where(and(eq(krMonthlyValues.keyResultId, 'k-msf-yorum'), eq(krMonthlyValues.month, month)))
  expect(monthRow?.value).toBe(200)
  expect(monthRow?.authorUserId).toBe(ADMIN)

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-msf-yorum'))
  // k-msf-yorum is a `sum` rule; with only this one month on file, the
  // derived summary equals the single entry.
  expect(kr?.current).toBe(200)

  const [audit] = await db.select().from(checkins).where(eq(checkins.keyResultId, 'k-msf-yorum'))
  expect(audit?.month).toBe(month)
})

test('a second check-in the same month corrects that month\'s row rather than adding one', async () => {
  const db = await seeded()
  const month = todayInIstanbul().slice(0, 7)

  await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-msf-yorum', newValue: 200, confidence: 'high',
  })
  const res = await submitCheckinFor(db, actor('admin', null, ADMIN), {
    keyResultId: 'k-msf-yorum', newValue: 260, confidence: 'high',
  })
  expect(res.ok).toBe(true)
  // previousValue is this month's own prior figure, not the whole key
  // result's derived summary — the two happen to coincide here only because
  // `sum` with one month on file equals that month's value.
  if (res.ok) expect(res.data.previousValue).toBe(200)

  const rows = await db
    .select()
    .from(krMonthlyValues)
    .where(and(eq(krMonthlyValues.keyResultId, 'k-msf-yorum'), eq(krMonthlyValues.month, month)))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.value).toBe(260)

  const [kr] = await db.select().from(keyResults).where(eq(keyResults.id, 'k-msf-yorum'))
  expect(kr?.current).toBe(260)
})
