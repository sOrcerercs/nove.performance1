/** Clears sign-in throttling. Useful in development after testing the lockout. */
import { getDb } from '../lib/db/index'
import { loginAttempts } from '../lib/db/schema'

const db = await getDb()
await db.delete(loginAttempts)
console.log('Giriş denemesi sayaçları temizlendi.')
process.exit(0)
