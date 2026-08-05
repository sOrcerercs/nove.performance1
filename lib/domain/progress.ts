import type { KrLike } from './types'

/**
 * Progress of a single key result, as a percentage of the distance from its
 * start to its target.
 *
 * Because progress is measured against `target - start` rather than against
 * `target` alone, reduction goals (cut cost from 950 to 650) work without a
 * separate "lower is better" flag: the span is simply negative and the ratio
 * comes out positive as the current value falls.
 *
 * Clamped to [0, 140]: 0 so that moving away from the target reads as "not
 * started" rather than a negative bar, and 140 so a wildly overshot key result
 * cannot dominate the unweighted averages above it.
 */
export function krPct(kr: KrLike): number {
  const span = kr.target - kr.start
  if (span === 0) return 0
  const p = ((kr.current - kr.start) / span) * 100
  return Math.max(0, Math.min(140, Math.round(p)))
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, x) => a + x, 0) / xs.length)

/** Unweighted mean of the key results — every KR counts the same. */
export function objPct(krs: KrLike[]): number {
  return mean(krs.map(krPct))
}

/** Unweighted mean of the objectives, *not* of the key results underneath them. */
export function deptPct(objectives: { krs: KrLike[] }[]): number {
  return mean(objectives.map((o) => objPct(o.krs)))
}

/** Departments with nothing planned yet are excluded rather than counted as 0. */
export function companyPct(depts: { objectives: { krs: KrLike[] }[] }[]): number {
  return mean(
    depts.filter((d) => d.objectives.length > 0).map((d) => deptPct(d.objectives)),
  )
}
