import { redirect } from 'next/navigation'
import { auth } from './config'
import type { SessionUser } from './permissions'

/**
 * The signed-in user, or a redirect to the login screen.
 *
 * Every page under `app/(app)` goes through this. Because the layout and each
 * page are server components, the check runs on the server for every request —
 * there is no client-side guard to bypass.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    departmentId: session.user.departmentId,
  }
}

/** The signed-in user if there is one, without redirecting. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    departmentId: session.user.departmentId,
  }
}
