import { eq } from 'drizzle-orm'
import type { JWT } from 'next-auth/jwt'
import type { Db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/domain/types'

/** What `authorize()` returns and the token keeps between requests. */
export interface SignedInUser {
  id: string
  role: Role
  departmentId: string | null
  mustChangePassword: boolean
}

/** Copies what later requests need onto the token at sign-in. */
export function stampSignIn(token: JWT, user: SignedInUser): JWT {
  token.id = user.id
  token.role = user.role
  token.departmentId = user.departmentId
  token.mustChangePassword = user.mustChangePassword
  return token
}

/**
 * Re-reads the pending-password flag on an `update`.
 *
 * An update can be sent from the browser (POST /api/auth/session) with any
 * payload, so the flag comes from the database and never from the request —
 * otherwise a temporary password could be kept forever by clearing the flag.
 */
export async function refreshPasswordFlag(db: Db, token: JWT): Promise<JWT> {
  if (typeof token.id !== 'string') return token
  const [row] = await db
    .select({ pending: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, token.id))
    .limit(1)
  token.mustChangePassword = row?.pending ?? false
  return token
}
