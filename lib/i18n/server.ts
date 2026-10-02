import { cookies } from 'next/headers'
import type { Lang } from '@/lib/domain/types'
import { LANG_COOKIE, parseLang } from './lang-cookie'
import { STR, type StringKey } from './strings'

/** The interface language for server components (see lang-cookie.ts). */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value)
}

/** `t()` for server components. */
export async function getT(): Promise<(key: StringKey) => string> {
  const lang = await getLang()
  return (key) => STR[lang][key] ?? STR.tr[key]
}
