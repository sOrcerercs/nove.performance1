import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { LoginExperience } from './login-experience'

export default async function LoginPage() {
  if (await currentUser()) redirect('/')

  return <LoginExperience showSeedHint={process.env.NODE_ENV !== 'production'} />
}
