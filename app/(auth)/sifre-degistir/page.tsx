import { requirePendingPasswordUser } from '@/lib/auth/session'
import { PrefsProvider } from '@/lib/prefs/PrefsProvider'
import { ForcedPasswordChange } from './forced-password-change'

export default async function ForcedPasswordPage() {
  const user = await requirePendingPasswordUser()
  return (
    <PrefsProvider>
      <ForcedPasswordChange name={user.name} />
    </PrefsProvider>
  )
}
