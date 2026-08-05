import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import {
  clearFailures,
  getThrottleState,
  LOCK_MS,
  MAX_FAILURES,
  recordFailure,
  WINDOW_MS,
} from '../throttle'

const EMAIL = 'elif.cinar@nove.group'
const T0 = new Date('2026-08-03T10:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

test('a fresh address is not throttled', async () => {
  const db = await createTestDb()
  const state = await getThrottleState(db, EMAIL, T0)
  expect(state.locked).toBe(false)
  expect(state.remaining).toBe(MAX_FAILURES)
})

test('failures count down the remaining attempts', async () => {
  const db = await createTestDb()
  for (let i = 1; i < MAX_FAILURES; i++) {
    const state = await recordFailure(db, EMAIL, at(i * 1000))
    expect(state.locked, `attempt ${i}`).toBe(false)
    expect(state.remaining, `attempt ${i}`).toBe(MAX_FAILURES - i)
  }
})

test('the address locks on the fifth failure', async () => {
  const db = await createTestDb()
  let state = { locked: false } as Awaited<ReturnType<typeof recordFailure>>
  for (let i = 0; i < MAX_FAILURES; i++) state = await recordFailure(db, EMAIL, at(i * 1000))

  expect(state.locked).toBe(true)
  expect(state.remaining).toBe(0)
  expect(state.retryAfterMinutes).toBeGreaterThan(0)

  expect((await getThrottleState(db, EMAIL, at(6000))).locked).toBe(true)
})

test('the lock lifts once it expires', async () => {
  const db = await createTestDb()
  for (let i = 0; i < MAX_FAILURES; i++) await recordFailure(db, EMAIL, at(i * 1000))

  expect((await getThrottleState(db, EMAIL, at(LOCK_MS - 1000))).locked).toBe(true)

  const after = await getThrottleState(db, EMAIL, at(LOCK_MS + 60_000))
  expect(after.locked).toBe(false)
  expect(after.remaining).toBe(MAX_FAILURES)
})

test('failures spread beyond the window do not accumulate', async () => {
  const db = await createTestDb()
  await recordFailure(db, EMAIL, T0)
  await recordFailure(db, EMAIL, at(1000))
  // Well past the window: the counter restarts rather than creeping toward a lock.
  const state = await recordFailure(db, EMAIL, at(WINDOW_MS + 60_000))
  expect(state.locked).toBe(false)
  expect(state.remaining).toBe(MAX_FAILURES - 1)
})

test('a successful sign-in clears the counter', async () => {
  const db = await createTestDb()
  await recordFailure(db, EMAIL, T0)
  await recordFailure(db, EMAIL, at(1000))
  await clearFailures(db, EMAIL)

  const state = await getThrottleState(db, EMAIL, at(2000))
  expect(state.remaining).toBe(MAX_FAILURES)
})

test('throttling is per address, not global', async () => {
  const db = await createTestDb()
  for (let i = 0; i < MAX_FAILURES; i++) await recordFailure(db, EMAIL, at(i * 1000))

  expect((await getThrottleState(db, EMAIL, at(6000))).locked).toBe(true)
  expect((await getThrottleState(db, 'nazli.er@nove.group', at(6000))).locked).toBe(false)
})

test('the key is case- and whitespace-insensitive', async () => {
  const db = await createTestDb()
  for (let i = 0; i < MAX_FAILURES; i++) {
    await recordFailure(db, '  Elif.Cinar@Nove.Group ', at(i * 1000))
  }
  // Varying the casing must not hand an attacker a fresh budget.
  expect((await getThrottleState(db, EMAIL, at(6000))).locked).toBe(true)
})

test('unknown addresses are throttled too, so lockout cannot enumerate accounts', async () => {
  const db = await createTestDb()
  for (let i = 0; i < MAX_FAILURES; i++) {
    await recordFailure(db, 'boyle-biri-yok@nove.group', at(i * 1000))
  }
  expect((await getThrottleState(db, 'boyle-biri-yok@nove.group', at(6000))).locked).toBe(true)
})
