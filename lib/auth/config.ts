import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { canSignIn, type Role } from '@/lib/domain/types'
import { clearFailures, getThrottleState, recordFailure } from './throttle'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: Role
      departmentId: string | null
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials sign-in requires JWT sessions: there is no adapter row to
  // point a database session at.
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-posta', type: 'email' },
        password: { label: 'Parola', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const db = await getDb()
        const email = parsed.data.email.toLowerCase().trim()

        // Enforced here rather than only in the sign-in action, because this is
        // what a script hitting /api/auth/callback/credentials directly runs
        // through.
        if ((await getThrottleState(db, email)).locked) return null

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

        // Deactivated accounts and `staff` (personnel records, no credential) are
        // both refused here; the role check is what keeps a stray password hash
        // from becoming a way in.
        const usable =
          user && user.passwordHash && user.state === 'active' && canSignIn(user.role)

        if (!usable) {
          // Recorded even for unknown addresses: throttling only real accounts
          // would reveal which ones exist.
          await recordFailure(db, email)
          return null
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash as string)
        if (!ok) {
          await recordFailure(db, email)
          return null
        }

        await clearFailures(db, email)

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
        }
      },
    }),
  ],
  callbacks: {
    // The JWT is the only place role and department survive between requests,
    // so they are copied on at sign-in and read back into the session.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: Role }).role
        token.departmentId = (user as { departmentId: string | null }).departmentId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as Role
      session.user.departmentId = token.departmentId as string | null
      return session
    },
  },
})
