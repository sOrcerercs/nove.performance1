import type { Role } from '@/lib/domain/types'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  departmentId: string | null
}

export type Action =
  | 'view:report'
  | 'manage:users'
  | 'manage:periods'
  | 'manage:departments'
  | 'manage:help'
  | 'create:objective'
  | 'edit:objective'
  | 'checkin:kr'
  | 'manage:objective-weights'

export interface ResourceContext {
  departmentId?: string | null
  ownerUserId?: string | null
}

/**
 * The single source of truth for authorization.
 *
 * Only İK and Yönetim use this system, so the model is deliberately flat:
 * `admin` does everything; `executive` (the board) reads, owns the objectives
 * themselves — create, edit, delete — and sets their weights, but not the
 * system around them (users, periods, departments, help, check-ins). There is no per-department
 * scoping because there are no department-lead accounts to scope — the
 * resource context is still accepted so callers need not change if scoped
 * roles ever come back.
 *
 * Pure by design: it takes the user rather than reading a session, so it is
 * exhaustively unit-testable and callable from pages and server actions alike.
 * Every mutation re-checks here; hiding a button is not an access control.
 */
export function can(
  user: SessionUser,
  action: Action,
  _resource: ResourceContext = {},
): boolean {
  // `staff` are personnel records, not accounts. They should never reach here,
  // but if a stale session ever carried one, it gets nothing.
  if (user.role === 'staff') return false

  if (user.role === 'admin') return true

  // executive — the board: oversight plus the objectives and their weights.
  switch (action) {
    case 'view:report':
    case 'create:objective':
    case 'edit:objective':
    // Management decides how much each objective counts; that decision is
    // theirs to enter, not something admin has to transcribe.
    case 'manage:objective-weights':
      return true
    case 'manage:users':
    case 'manage:periods':
    case 'manage:departments':
    case 'manage:help':
    case 'checkin:kr':
      return false
    default: {
      // Exhaustiveness: adding an Action without handling it fails to compile.
      const _never: never = action
      return _never
    }
  }
}
