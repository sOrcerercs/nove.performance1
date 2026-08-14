import type { Db } from '@/lib/db'
import type { Role } from '@/lib/domain/types'
import { allUsers } from './tables'

export interface AssignablePerson {
  id: string
  name: string
  role: Role
  departmentId: string | null
}

/**
 * Everyone who can be named as an objective or key-result owner.
 *
 * Includes `staff` — that is the whole point of the role: they carry
 * responsibility for a result without holding an account. Deactivated people
 * are excluded so they stop appearing in new assignments, while any existing
 * assignment to them is left intact.
 *
 * Reads through `./tables`'s `allUsers` rather than its own `db.select()`, so
 * this shares the layout's `users` read instead of adding a second one — this
 * runs concurrently with the layout on every page that offers an owner
 * picker, including the admin screen alongside `getAdminData`'s own reads.
 */
export async function getAssignablePeople(db: Db): Promise<AssignablePerson[]> {
  const rows = await allUsers(db)

  return rows
    .filter((u) => u.state === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      departmentId: u.departmentId,
    }))
}
