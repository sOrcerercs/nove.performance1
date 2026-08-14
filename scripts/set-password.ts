/**
 * Break-glass password reset.
 *
 *   npm run set-password -- ad.soyad@nove.group 'YeniGucluParola2026'
 *
 * There is no email in this system, so a forgotten password is normally fixed
 * by another admin from /yonetim. This script exists for the case that cannot
 * fix itself: every admin has lost their password, so nobody is left who can
 * reset anyone. It deliberately requires database access — either DATABASE_URL
 * or the local .pglite directory — which is the right bar for a recovery path
 * that bypasses the UI entirely.
 *
 * Also clears any sign-in lockout on the address, since a forgotten password
 * usually comes with a handful of failed attempts.
 */
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db/index'
import { loginAttempts, users } from '../lib/db/schema'
import { canSignIn } from '../lib/domain/types'

const MIN_LENGTH = 12
const BCRYPT_ROUNDS = 10

const [emailArg, passwordArg] = process.argv.slice(2)

function usage(message: string): never {
  console.error(`\n${message}\n`)
  console.error("Kullanım: npm run set-password -- <e-posta> '<yeni parola>'")
  console.error("Örnek   : npm run set-password -- kagan.ozturk@nove.group 'CokGucluParola2026'\n")
  process.exit(1)
}

if (!emailArg || !passwordArg) usage('E-posta ve yeni parola gerekli.')
if (passwordArg.length < MIN_LENGTH) {
  usage(`Parola en az ${MIN_LENGTH} karakter olmalı (verilen: ${passwordArg.length}).`)
}

const email = emailArg.trim().toLowerCase()
const target = process.env.DATABASE_URL ? 'DATABASE_URL' : 'yerel PGlite (.pglite)'
console.log(`Hedef: ${target}`)

const db = await getDb()

const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
if (!user) {
  console.error(`\n'${email}' adresinde kullanıcı yok.\n`)
  const all = await db.select().from(users)
  const accounts = all.filter((u) => canSignIn(u.role))
  console.error('Giriş yapabilen hesaplar:')
  for (const a of accounts) console.error(`  ${a.role.padEnd(10)} ${a.email}`)
  process.exit(1)
}

if (!canSignIn(user.role)) {
  console.error(
    `\n${user.name} '${user.role}' rolünde — personel kaydının parolası olmaz.` +
      '\nÖnce /yonetim üzerinden rolünü Yönetici veya Üst Yönetim yapın.\n',
  )
  process.exit(1)
}

await db
  .update(users)
  .set({
    passwordHash: await bcrypt.hash(passwordArg, BCRYPT_ROUNDS),
    // A recovered account must be able to sign in, so lift a deactivation too.
    state: 'active',
  })
  .where(eq(users.id, user.id))

await db.delete(loginAttempts).where(eq(loginAttempts.key, email))

console.log(`\n${user.name} <${user.email}> parolası güncellendi.`)
console.log('Giriş kilidi de temizlendi.')
console.log('Bu parolayı ilgili kişiye ilettikten sonra kendisinin değiştirmesini isteyin (/hesap).\n')
process.exit(0)
