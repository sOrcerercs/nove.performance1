import type { Lang } from '@/lib/domain/types'

/**
 * The interface language also lives in a cookie, mirrored from the prefs in
 * localStorage, so server-rendered pieces (the `<html lang>`, server pages,
 * page titles) can follow it. localStorage stays the source of truth on the
 * client; the cookie is only a copy the server can read.
 */
export const LANG_COOKIE = 'nove-lang'

export function parseLang(v: string | undefined | null): Lang {
  return v === 'en' ? 'en' : 'tr'
}

/** Client only. One year, whole site, not sensitive. */
export function writeLangCookie(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`
}
