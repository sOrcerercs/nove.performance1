/**
 * The reporting tree, built from `users.manager_id`. Pure: callers pass the
 * rows they already read (`allUsers`), so walking the tree costs no query.
 */

export interface TreeUser {
  id: string
  managerId: string | null
  state?: 'active' | 'passive'
}

/**
 * Everyone below `rootId` at any depth, excluding `rootId`. A visited set
 * makes a cycle in the data (the write path refuses them, but a hand-edited
 * row could still hold one) terminate instead of looping.
 */
export function subtreeOf(rootId: string, users: readonly TreeUser[]): string[] {
  const children = new Map<string, string[]>()
  for (const u of users) {
    if (!u.managerId) continue
    const list = children.get(u.managerId)
    if (list) list.push(u.id)
    else children.set(u.managerId, [u.id])
  }
  const seen = new Set<string>([rootId])
  const out: string[] = []
  const queue = [...(children.get(rootId) ?? [])]
  while (queue.length > 0) {
    const id = queue.shift() as string
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    queue.push(...(children.get(id) ?? []))
  }
  return out
}

/** Whether making `managerId` the manager of `userId` would close a loop. */
export function wouldCreateCycle(
  userId: string,
  managerId: string | null,
  users: readonly TreeUser[],
): boolean {
  if (managerId === null) return false
  if (managerId === userId) return true
  return subtreeOf(userId, users).includes(managerId)
}

/**
 * Who may be chosen as `userId`'s manager: active people outside the person's
 * own subtree. The Kullanıcılar screen lists exactly these; the server still
 * re-checks with `wouldCreateCycle`.
 */
export function managerCandidates<T extends TreeUser>(userId: string, users: readonly T[]): T[] {
  const excluded = new Set([userId, ...subtreeOf(userId, users)])
  return users.filter((u) => (u.state ?? 'active') === 'active' && !excluded.has(u.id))
}
