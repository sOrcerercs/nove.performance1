import { asc } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/domain/types'

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
 */
export async function getAssignablePeople(db: Db): Promise<AssignablePerson[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name))

  return rows
    .filter((u) => u.state === 'active')
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      departmentId: u.departmentId,
    }))
}
