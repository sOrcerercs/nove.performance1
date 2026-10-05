/**
 * Loads the HR employee list and the organisation charts into users.
 *
 *   npx tsx scripts/import-employees.ts "<tsv>" "<org json>"            # dry run (default)
 *   npx tsx scripts/import-employees.ts "<tsv>" "<org json>" --apply    # writes
 *
 * Target: `DATABASE_URL` when set (live — only with the user's go-ahead),
 * otherwise the local PGlite in `.pglite` (rehearsal).
 *
 * Dry run prints the plan and touches nothing. With any error, `--apply`
 * refuses to write anything. Adds and fills blanks only — never deletes, never
 * deactivates, never changes a role, never overwrites a manager, department
 * or title already set, never sets passwords. Unrelated to `npm run seed`.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, max } from 'drizzle-orm'
import { getDb } from '../lib/db'
import * as schema from '../lib/db/schema'
import { parseTsv, planImport, type OrgData } from '../lib/import/employees'

const [tsvPath, orgPath, flag] = process.argv.slice(2)
if (!tsvPath || !orgPath) {
  console.error('Kullanım: npx tsx scripts/import-employees.ts "<tsv>" "<org json>" [--apply]')
  process.exit(1)
}
console.log(`Hedef: ${process.env.DATABASE_URL ? 'DATABASE_URL (canlı olabilir!)' : 'yerel PGlite (.pglite)'}`)

const db = await getDb()
const rows = parseTsv(readFileSync(tsvPath, 'utf8'))
const org = JSON.parse(readFileSync(orgPath, 'utf8')) as OrgData
const existing = await db
  .select({
    id: schema.users.id, name: schema.users.name, departmentId: schema.users.departmentId,
    title: schema.users.title, managerId: schema.users.managerId, state: schema.users.state,
  })
  .from(schema.users)
const depts = await db.select({ id: schema.departments.id, nameTr: schema.departments.nameTr }).from(schema.departments)
const plan = planImport(rows, existing, depts, org)

const list = (xs: string[]) => (xs.length ? xs.join(', ') : '—')
console.log(`Listede ${rows.length} satır.`)
console.log(`Yeni kişi: ${plan.creates.length} (Yönetim Kurulu / executive: ${plan.creates.filter((c) => c.role === 'executive').length})`)
console.log(`Mevcutla eşleşen ve doldurulacak: ${plan.updates.length}`)
for (const u of plan.updates) {
  console.log(`  ~ ${u.name}: ${[u.title && `unvan=${u.title}`, u.departmentNameTr && `bölüm=${u.departmentNameTr}`].filter(Boolean).join(', ')}`)
}
console.log(`Atanacak yönetici bağı: ${plan.managers.length}`)
console.log(`Açılacak bölüm: ${list(plan.newDepartments.map((d) => d.nameTr))}`)
console.log(`Şemada olup kimseyle eşleşmeyen ad (atlanır): ${list(plan.unresolvedChartNames)}`)
console.log(`Benzer ad uyarısı (alias gerekebilir): ${plan.similarNames.length}`)
for (const s of plan.similarNames) console.log(`  ? "${s.listName}" ↔ mevcut "${s.existingName}"`)
console.log(`Listede olmayan mevcut kullanıcı (dokunulmaz): ${list(plan.untouched.map((u) => u.name))}`)
if (plan.errors.length) {
  console.log(`\n${plan.errors.length} HATA — hiçbir şey yazılmayacak:`)
  for (const e of plan.errors) console.log(`  ! ${e}`)
}

if (flag !== '--apply') {
  console.log('\nDeneme modu: hiçbir şey yazılmadı. Yazmak için --apply ekleyin.')
  process.exit(plan.errors.length ? 1 : 0)
}
if (plan.errors.length) process.exit(1)

await db.transaction(async (tx) => {
  const [{ top } = { top: 0 }] = await tx.select({ top: max(schema.departments.sortOrder) }).from(schema.departments)
  let order = Number(top ?? 0)
  for (const d of plan.newDepartments) {
    await tx.insert(schema.departments).values({
      id: d.slug, slug: d.slug, emoji: d.emoji, nameTr: d.nameTr, nameEn: d.nameEn, sortOrder: ++order,
    })
  }
  const allDepts = await tx.select({ id: schema.departments.id, nameTr: schema.departments.nameTr }).from(schema.departments)
  const deptId = new Map(allDepts.map((d) => [d.nameTr, d.id]))

  const idOfKey = new Map<string, string>()
  for (const c of plan.creates) {
    const id = `u-${randomUUID()}`
    idOfKey.set(c.key, id)
    await tx.insert(schema.users).values({
      id, name: c.name, email: null, passwordHash: null, role: c.role, title: c.title,
      departmentId: c.departmentNameTr ? (deptId.get(c.departmentNameTr) ?? null) : null,
      state: 'active',
    })
  }
  for (const u of plan.updates) {
    await tx.update(schema.users).set({
      ...(u.title ? { title: u.title } : {}),
      ...(u.departmentNameTr ? { departmentId: deptId.get(u.departmentNameTr) ?? null } : {}),
    }).where(eq(schema.users.id, u.userId))
  }
  const byKey = new Map(existing.map((u) => [u.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr'), u.id]))
  const resolve = (key: string) => idOfKey.get(key) ?? byKey.get(key)
  for (const m of plan.managers) {
    const personId = m.existingUserId ?? idOfKey.get(m.personKey)
    const managerId = resolve(m.managerKey)
    if (!personId || !managerId) throw new Error(`Çözülemeyen bağ: ${m.personName} → ${m.managerName}`)
    await tx.update(schema.users).set({ managerId }).where(eq(schema.users.id, personId))
  }
})

console.log('\nUygulandı.')
process.exit(0)
