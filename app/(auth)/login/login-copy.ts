import type { Lang } from '@/lib/domain/types'
import type { SignInResult } from './actions'
import type { CredentialErrors } from './sign-in-progress'

/**
 * Every word on the sign-in and welcome screens, in both languages. Turkish is
 * authoritative (as in `lib/i18n/strings.ts`). The server and the validator
 * return codes, never sentences, so the message follows the chosen language.
 */
export const COPY = {
  tr: {
    signInRegion: 'Giriş',
    headlineLabel: 'Büyük hedefler, küçük adımlarla büyür.',
    headline: ['Büyük hedefler,', 'küçük adımlarla', 'büyür.'],
    group: 'Nove Group',
    system: 'Performans Yönetim Sistemi',
    email: 'E-posta',
    emailPlaceholder: 'ad.soyad@nove.group',
    password: 'Parola',
    forgot: 'Parolanı mı unuttun? Yöneticine başvur.',
    submit: 'Giriş yap',
    submitting: 'Giriş yapılıyor',
    seedHint:
      'Tohum hesapların parolası `npm run seed` çıktısında bir kez gösterilir. Kaybettiyseniz `npm run set-password` ile yenisini belirleyin. Bu kutu yalnızca geliştirme ortamında görünür.',
    language: 'Dil',
    welcomeRegion: 'Hoş geldin',
    welcome: 'Hoş geldin',
    home: 'Anasayfa',
    scrollHint: 'Devam etmek için aşağı kaydırın',
    scroll: 'Kaydır ↓',
  },
  en: {
    signInRegion: 'Sign in',
    headlineLabel: 'Big goals grow in small steps.',
    // Split to mirror the Turkish shape: long middle line, short last line
    // (a long last line runs under the sign-in card).
    headline: ['Big goals', 'grow in small', 'steps.'],
    group: 'Nove Group',
    system: 'Performance Management System',
    email: 'Email',
    emailPlaceholder: 'name.surname@nove.group',
    password: 'Password',
    forgot: 'Forgot your password? Ask your administrator.',
    submit: 'Sign in',
    submitting: 'Signing in',
    seedHint:
      'Seed account passwords are shown once in the `npm run seed` output. If you lost it, set a new one with `npm run set-password`. This box only appears in development.',
    language: 'Language',
    welcomeRegion: 'Welcome',
    welcome: 'Welcome',
    home: 'Home',
    scrollHint: 'Scroll down to continue',
    scroll: 'Scroll ↓',
  },
} as const satisfies Record<Lang, Record<string, string | readonly string[]>>

export function fieldMessage(
  field: keyof CredentialErrors,
  code: NonNullable<CredentialErrors[keyof CredentialErrors]>,
  lang: Lang,
): string {
  if (lang === 'en') {
    if (field === 'password') return 'Enter your password.'
    return code === 'format'
      ? "That doesn't look like an email address. Example: name.surname@nove.group"
      : 'Enter your email address.'
  }
  if (field === 'password') return 'Parolanızı yazın.'
  return code === 'format'
    ? 'Bu bir e-posta adresi gibi görünmüyor. Örnek: ad.soyad@nove.group'
    : 'E-posta adresinizi yazın.'
}

/** Result of a failed sign-in, plus the client's own "server unreachable". */
export type SignInFailure = Exclude<SignInResult['code'], 'ok'> | 'unreachable'

export function failureMessage(
  code: SignInFailure,
  lang: Lang,
  detail: { remaining?: number; retryAfterMinutes?: number } = {},
): string {
  const en = lang === 'en'
  switch (code) {
    case 'locked':
      return en
        ? `Too many failed attempts. Try again in ${detail.retryAfterMinutes} minutes.`
        : `Çok fazla başarısız deneme. ${detail.retryAfterMinutes} dakika sonra tekrar dene.`
    case 'unreachable':
      return en
        ? 'Could not reach the server, or it took too long. Please try again.'
        : 'Sunucuya ulaşılamadı veya yanıt gecikti. Lütfen tekrar deneyin.'
    case 'invalid': {
      const left = detail.remaining
      // Same rule as before: only warn when two attempts or fewer remain.
      const suffix =
        left !== undefined && left <= 2
          ? en
            ? ` ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
            : ` ${left} deneme hakkın kaldı.`
          : ''
      return (en ? 'Wrong email or password.' : 'E-posta veya parola hatalı.') + suffix
    }
  }
}
