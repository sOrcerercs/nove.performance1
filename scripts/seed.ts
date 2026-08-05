/**
 * Seeds the database that `DATABASE_URL` points at, or the local PGlite store
 * when it is unset. Run with `npm run seed`.
 *
 * The account password is printed once and stored nowhere else. Set
 * `SEED_PASSWORD` to choose it yourself:
 *
 *   SEED_PASSWORD='BenimParolam2026' npm run seed
 */
import { getDb } from '../lib/db/index'
import { seed } from '../lib/db/seed'
import { SEED_USERS } from '../lib/db/seed-data'
import { canSignIn } from '../lib/domain/types'

const target = process.env.DATABASE_URL ? 'DATABASE_URL' : 'yerel PGlite (.pglite)'
console.log(`Seed hedefi: ${target}`)

const db = await getDb()
const { password } = await seed(db)

const accounts = SEED_USERS.filter((u) => canSignIn(u.role))

console.log('\nGiriş yapabilen hesaplar:')
for (const a of accounts) {
  console.log(`  ${a.role.padEnd(10)} ${a.email}`)
}
console.log(`\nParola (hepsi için aynı): ${password}`)
console.log(
  process.env.SEED_PASSWORD
    ? 'SEED_PASSWORD ortam değişkeninden alındı.'
    : 'Rastgele üretildi ve yalnızca burada gösteriliyor — kaydedin.',
)
console.log('Değiştirmek için: /hesap (kendi) veya npm run set-password\n')
process.exit(0)
