import { can, type SessionUser } from '@/lib/auth/permissions'
import type { Db } from '@/lib/db'
import { krPct } from '@/lib/domain/progress'
import type { Confidence } from '@/lib/domain/types'
import { allKrs, loadTree } from './tree'

export interface CheckinCandidate {
  krId: string
  titleTr: string
  titleEn: string
  deptEmoji: string
  deptSlug: string
  start: number
  current: number
  target: number
  unit: string
  confidence: Confidence
  pct: number
  daysSinceUpdate: number
}

/**
 * Key results the signed-in user may check in on, least-recently-updated first.
 *
 * The ordering is the point: the prototype surfaces whatever has gone stalest,
 * so the weekly ritual starts with the thing nobody has touched.
 */
export async function getCheckinCandidates(
  db: Db,
  user: SessionUser,
  periodCode: string,
): Promise<CheckinCandidate[]> {
  const { depts } = await loadTree(db, periodCode)

  return allKrs(depts)
    .filter(({ dept, kr }) =>
      can(user, 'checkin:kr', { departmentId: dept.id, ownerUserId: kr.ownerUserId }),
    )
    .map(({ dept, kr }) => ({
      krId: kr.id,
      titleTr: kr.titleTr,
      titleEn: kr.titleEn,
      deptEmoji: dept.emoji,
      deptSlug: dept.slug,
      start: kr.start,
      current: kr.current,
      target: kr.target,
      unit: kr.unit,
      confidence: kr.confidence,
      pct: krPct(kr),
      daysSinceUpdate: kr.daysSinceUpdate,
    }))
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
}
