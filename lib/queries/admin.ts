import type { Db } from '@/lib/db'
import type { PeriodKind, Role } from '@/lib/domain/types'
import { getDefaultRangeStart } from './settings'
import { allDepartments, allKeyResults, allObjectives, allPeriods, allUsers } from './tables'

export type UserState = 'active' | 'passive'
export type PeriodState = 'active' | 'closed' | 'planned'

export interface AdminUser {
  id: string
  name: string
  email: string | null
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
  /** Who this person reports to; '' when unassigned or unknown. */
  managerId: string | null
  managerName: string
  title: string | null
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
  /** The configured start of the default date range. */
  defaultRangeStart: string
}

/**
 * Every server action returns this instead of throwing: an expected failure
 * (duplicate email, missing permission, bad input) is data the form renders,
 * not an exception that blows up the client.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const NOT_ALLOWED = 'Bu işlem için yetkin yok.'

/**
 * Read model for the admin screen. Plain serialisable values only.
 *
 * Users, departments, periods, objectives and key results are all read
 * through `./tables` so this shares its reads with the layout's own fan-out
 * instead of issuing a second copy of each: the admin page renders
 * concurrently with the layout, and against a pool sized for one request's
 * worth of reads, a second copy of five of them was most of the way to
 * exhausting it. The owner count used to be its own `GROUP BY` select, which
 * looked unavoidable — no shared helper returns an aggregation — but
 * `allKeyResults` already returns every row unfiltered, the same rows the
 * grouping needs, so the count is folded in memory instead, the same way
 * `objectivesByDept` and `usersByDept` below are.
 */
export async function getAdminData(db: Db): Promise<AdminVm> {
  const [userRows, deptRows, periodRows, krRows, objRows, defaultRangeStart] =
    await Promise.all([
      allUsers(db),
      allDepartments(db),
      allPeriods(db),
      allKeyResults(db),
      allObjectives(db),
      getDefaultRangeStart(db),
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
  const ownedById = new Map<string, number>()
  for (const k of krRows) {
    if (k.ownerUserId) ownedById.set(k.ownerUserId, (ownedById.get(k.ownerUserId) ?? 0) + 1)
  }

  // `allUsers` is shared with other screens and carries no ordering of its
  // own; the table sorts by name, so that is applied here instead of in SQL.
  const sortedUsers = [...userRows].sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return {
    users: sortedUsers.map((u) => {
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
        managerId: u.managerId,
        managerName: u.managerId ? (userById.get(u.managerId)?.name ?? '') : '',
        title: u.title,
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
    defaultRangeStart,
  }
}
