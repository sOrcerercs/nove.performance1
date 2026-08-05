'use server'

import { signOut } from '@/lib/auth/config'

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
