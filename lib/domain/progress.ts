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
 * cannot dominate the averages above it.
 */
export function krPct(kr: KrLike): number {
  const span = kr.target - kr.start
  if (span === 0) return 0
  const p = ((kr.current - kr.start) / span) * 100
  return Math.max(0, Math.min(140, Math.round(p)))
}

/**
 * Whether a key result's progress can be measured at all.
 *
 * `target === start` means there is no distance to cover, so any current value
 * is 0% by definition — which is not "no progress", it is "no target". Counting
 * that as a zero would drag the department's average down because someone has
 * not finished entering data yet, so these are excluded from every average and
 * shown with an "Ölçülemiyor" badge instead.
 */
export function isMeasurable(kr: KrLike): boolean {
  return kr.target !== kr.start
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, x) => a + x, 0) / xs.length)

/**
 * Mean of the key results whose progress can be measured — weighted when every
 * one of them carries a weight, re-proportioned among those measurable so an
 * unmeasurable key result does not pull the objective towards 0. Otherwise the
 * plain mean, which is what every objective created before weights gets.
 */
export function objPct(krs: KrLike[]): number {
  const measurable = krs.filter(isMeasurable)
  const weighted =
    measurable.length > 0 && measurable.every((k) => typeof k.weight === 'number' && k.weight > 0)
  if (!weighted) return mean(measurable.map(krPct))
  const total = measurable.reduce((a, k) => a + (k.weight as number), 0)
  return Math.round(measurable.reduce((a, k) => a + krPct(k) * (k.weight as number), 0) / total)
}

/** An objective contributes a percentage only if some key result can be measured. */
const hasMeasurableKr = (o: { krs: KrLike[] }): boolean => o.krs.some(isMeasurable)

/**
 * Unweighted mean of the objectives, *not* of the key results underneath them.
 *
 * Objectives with nothing measurable are excluded rather than counted as 0 —
 * the same reasoning as `companyPct` skipping departments with no objectives.
 * A zero there would mean "this department is failing" when it actually means
 * "nobody has set these targets yet".
 */
export function deptPct(objectives: { krs: KrLike[] }[]): number {
  return mean(objectives.filter(hasMeasurableKr).map((o) => objPct(o.krs)))
}

/**
 * Departments with nothing planned — or nothing measurable — yet are excluded
 * rather than counted as 0, for the same reason `deptPct` excludes such
 * objectives: a department stuck at "no targets set" should not read as a
 * department stuck at "failing".
 */
export function companyPct(depts: { objectives: { krs: KrLike[] }[] }[]): number {
  return mean(
    depts.filter((d) => d.objectives.some(hasMeasurableKr)).map((d) => deptPct(d.objectives)),
  )
}
