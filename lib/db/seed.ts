import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { canSignIn } from '@/lib/domain/types'
import type { Db } from './index'
import { checkins, departments, keyResults, objectives, periods, users } from './schema'
import {
  SEED_DEPARTMENTS,
  SEED_OBJECTIVE_PERIOD_ID,
  SEED_PERIODS,
  SEED_USERS,
} from './seed-data'

/**
 * Password given to every seeded account.
 *
 * Never hard-coded: a literal here would live in the repository and its history
 * forever. Taken from `SEED_PASSWORD` when set, otherwise generated freshly per
 * run and printed once by `npm run seed` — so the only copy is the operator's.
 */
export function resolveSeedPassword(): string {
  const fromEnv = process.env.SEED_PASSWORD?.trim()
  if (fromEnv) return fromEnv
  // 24 base64url chars: strong enough that a printed-once password is fine.
  return randomBytes(18).toString('base64url')
}

const userIdByName = new Map(SEED_USERS.map((u) => [u.name, u.id]))

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

/**
 * Replaces the entire dataset with the prototype's content. Idempotent: running
 * it twice leaves the same rows, so it is safe to re-run against a dev database.
 */
export async function seed(db: Db): Promise<{ password: string }> {
  // Children first — the FKs are ON DELETE CASCADE, but being explicit keeps
  // this correct if a cascade is ever relaxed.
  await db.delete(checkins)
  await db.delete(keyResults)
  await db.delete(objectives)
  await db.delete(users)
  await db.delete(departments)
  await db.delete(periods)

  await db.insert(departments).values(
    SEED_DEPARTMENTS.map((d, i) => ({
      id: d.id,
      slug: d.id,
      emoji: d.emoji,
      nameTr: d.name.tr,
      nameEn: d.name.en,
      leadUserId: userIdByName.get(d.owner) ?? null,
      sortOrder: i,
    })),
  )

  await db.insert(periods).values(SEED_PERIODS.map((p) => ({ ...p })))

  const password = resolveSeedPassword()
  const passwordHash = await bcrypt.hash(password, 10)
  await db.insert(users).values(
    SEED_USERS.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      // Only accounts get a password. `staff` are personnel records — giving
      // them a hash would be handing out logins nobody asked for.
      passwordHash: canSignIn(u.role) ? passwordHash : null,
      role: u.role,
      departmentId: u.departmentId,
      state: 'active' as const,
    })),
  )

  const objectiveRows = SEED_DEPARTMENTS.flatMap((d) =>
    d.objectives.map((o) => ({
      id: o.id,
      code: o.code,
      departmentId: d.id,
      periodId: SEED_OBJECTIVE_PERIOD_ID,
      titleTr: o.title.tr,
      titleEn: o.title.en,
      ownerUserId: userIdByName.get(o.owner) ?? null,
    })),
  )
  await db.insert(objectives).values(objectiveRows)

  const krRows = SEED_DEPARTMENTS.flatMap((d) =>
    d.objectives.flatMap((o) =>
      o.krs.map((k) => ({
        id: k.id,
        objectiveId: o.id,
        titleTr: k.title.tr,
        titleEn: k.title.en,
        start: k.start,
        current: k.current,
        target: k.target,
        unit: k.unit,
        confidence: k.conf,
        ownerUserId: userIdByName.get(k.owner) ?? null,
        updatedAt: daysAgo(k.updated),
        rollup: k.rollup,
      })),
    ),
  )
  await db.insert(keyResults).values(krRows)

  return { password }
}
