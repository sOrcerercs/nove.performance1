import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import { auth } from './config'
import type { SessionUser } from './permissions'

/** Where someone holding a temporary password is kept until they replace it. */
export const PASSWORD_CHANGE_PATH = '/sifre-degistir'

function toSessionUser(user: Session['user']): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
  }
}

/**
 * The signed-in user, or a redirect to the login screen.
 *
 * Every page under `app/(app)` and every server action goes through this.
 * Because the layout and each page are server components, the check runs on
 * the server for every request — there is no client-side guard to bypass.
 *
 * A pending temporary password redirects to the change screen, so the one
 * check also keeps a temporary password from being used for anything but
 * replacing itself. Only that screen and its action pass
 * `allowPendingPassword`. Tokens issued before the flag existed carry none and
 * are let through.
 */
export async function requireUser(
  opts: { allowPendingPassword?: boolean } = {},
): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (session.user.mustChangePassword && !opts.allowPendingPassword) redirect(PASSWORD_CHANGE_PATH)
  return toSessionUser(session.user)
}

/** For the change screen itself: someone with nothing pending is sent home. */
export async function requirePendingPasswordUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!session.user.mustChangePassword) redirect('/')
  return toSessionUser(session.user)
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
