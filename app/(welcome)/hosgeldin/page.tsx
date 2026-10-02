import { LoginExperience } from '@/app/(auth)/login/login-experience'
import { requireUser } from '@/lib/auth/session'

/**
 * The welcome screen on its own, for a user who is already signed in — the
 * sidebar's "Anasayfa" link. Full-bleed, so it lives outside the `(app)`
 * shell; scrolling down opens the overview, exactly as after sign-in.
 */
export default async function WelcomePage() {
  const user = await requireUser()
  return <LoginExperience showSeedHint={false} welcomeName={user.name} />
}
