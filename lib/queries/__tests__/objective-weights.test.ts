import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb } from '@/lib/db'
import { objectives } from '@/lib/db/schema'
import { seed } from '@/lib/db/seed'
import { SEED_OBJECTIVE_PERIOD_ID } from '@/lib/db/seed-data'
import { loadTree } from '../tree'

async function seeded() {
  const db = await createTestDb()
  await seed(db)
  return db
}

test('loadTree carries each objective weight', async () => {
  const db = await seeded()
  await db.update(objectives).set({ weight: 40 }).where(eq(objectives.id, 'o-sat-1'))
  const { depts } = await loadTree(db, [SEED_OBJECTIVE_PERIOD_ID])
  const satis = depts.find((d) => d.slug === 'satis')!
  expect(satis.objectives.find((o) => o.id === 'o-sat-1')!.weight).toBe(40)
  expect(satis.objectives.find((o) => o.id === 'o-sat-2')!.weight).toBeNull()
})
