import { asc, count, isNotNull } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { departments, keyResults, objectives, periods, users } from '@/lib/db/schema'
import type { PeriodKind, Role } from '@/lib/domain/types'

export type UserState = 'active' | 'passive'
export type PeriodState = 'active' | 'closed' | 'planned'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  departmentId: string | null
  /**
   * Turkish department name — the default language. `departmentNameEn` carries
   * the English one so the table can translate without a second query.
   */
  departmentName: string
  departmentNameEn: string
  state: UserState
  krsOwned: number
}

export interface AdminPeriod {
  id: string
  code: string
  kind: PeriodKind
  state: PeriodState
  /** ISO `YYYY-MM-DD`, stored as text so no Date crosses to the client. */
  startsOn: string
  endsOn: string
}

export interface AdminDepartmentOption {
  id: string
  nameTr: string
  nameEn: string
}

/** A department row on the admin screen, with what blocks deleting it. */
export interface AdminDepartment {
  id: string
  slug: string
  emoji: string
  nameTr: string
  nameEn: string
  leadUserId: string | null
  leadName: string
  objectiveCount: number
  userCount: number
}

export interface AdminVm {
  users: AdminUser[]
  periods: AdminPeriod[]
  departments: AdminDepartmentOption[]
  departmentRows: AdminDepartment[]
}

/**
 * Every server action returns this instead of throwing: an expected failure
 * (duplicate email, missing permission, bad input) is data the form renders,
 * not an exception that blows up the client.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const NOT_ALLOWED = 'Bu işlem için yetkin yok.'

/** Read model for the admin screen. Plain serialisable values only. */
export async function getAdminData(db: Db): Promise<AdminVm> {
  const [userRows, deptRows, periodRows, ownedRows, objRows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(departments).orderBy(asc(departments.sortOrder)),
    db.select().from(periods).orderBy(asc(periods.startsOn)),
    db
      .select({ ownerUserId: keyResults.ownerUserId, n: count() })
      .from(keyResults)
      .where(isNotNull(keyResults.ownerUserId))
      .groupBy(keyResults.ownerUserId),
    db.select({ departmentId: objectives.departmentId }).from(objectives),
  ])

  const deptById = new Map(deptRows.map((d) => [d.id, d]))
  const userById = new Map(userRows.map((u) => [u.id, u]))

  // Counted across every period, not just the open one: a department with
  // history in a closed quarter still must not be deleted casually.
  const objectivesByDept = new Map<string, number>()
  for (const o of objRows) {
    objectivesByDept.set(o.departmentId, (objectivesByDept.get(o.departmentId) ?? 0) + 1)
  }
  const usersByDept = new Map<string, number>()
  for (const u of userRows) {
    if (u.departmentId) usersByDept.set(u.departmentId, (usersByDept.get(u.departmentId) ?? 0) + 1)
  }
  const ownedById = new Map(
    ownedRows.flatMap((r) => (r.ownerUserId ? [[r.ownerUserId, Number(r.n)] as const] : [])),
  )

  return {
    users: userRows.map((u) => {
      const dept = u.departmentId ? deptById.get(u.departmentId) : undefined
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        departmentId: u.departmentId,
        departmentName: dept?.nameTr ?? '',
        departmentNameEn: dept?.nameEn ?? '',
        state: u.state,
        krsOwned: ownedById.get(u.id) ?? 0,
      }
    }),
    periods: periodRows.map((p) => ({
      id: p.id,
      code: p.code,
      kind: p.kind,
      state: p.state,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
    })),
    departments: deptRows.map((d) => ({ id: d.id, nameTr: d.nameTr, nameEn: d.nameEn })),
    departmentRows: deptRows.map((d) => ({
      id: d.id,
      slug: d.slug,
      emoji: d.emoji,
      nameTr: d.nameTr,
      nameEn: d.nameEn,
      leadUserId: d.leadUserId,
      leadName: d.leadUserId ? (userById.get(d.leadUserId)?.name ?? '') : '',
      objectiveCount: objectivesByDept.get(d.id) ?? 0,
      userCount: usersByDept.get(d.id) ?? 0,
    })),
  }
}
