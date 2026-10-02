import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { PrefsProvider } from '@/lib/prefs/PrefsProvider'
import { LoginExperience } from './login-experience'

export default async function LoginPage() {
  if (await currentUser()) redirect('/')

  // The same preference store the app uses: the language chosen here is the
  // language the app opens in.
  return (
    <PrefsProvider>
      <LoginExperience showSeedHint={process.env.NODE_ENV !== 'production'} />
    </PrefsProvider>
  )
}
