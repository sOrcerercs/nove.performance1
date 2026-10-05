/**
 * Key result weights: a percent share of the objective's progress. Either every
 * key result of an objective carries one and they add up to 100, or none does
 * and the objective averages its key results equally — the state every
 * objective created before weights existed is in.
 *
 * Pure, so the wizard, the editor and the server action apply the same rule.
 */

/** Two-decimal inputs can sum to 99.99999…; anything within this is 100. */
export const WEIGHT_TOLERANCE = 0.005

export type WeightProblem = 'missing' | 'partial' | 'range' | 'total'

const isSet = (w: number | null | undefined): w is number => typeof w === 'number' && Number.isFinite(w)

export function weightTotal(ws: readonly (number | null | undefined)[]): number {
  return Math.round(ws.filter(isSet).reduce((a, w) => a + w, 0) * 100) / 100
}

export function checkWeights(
  ws: readonly (number | null | undefined)[],
  opts: { required: boolean },
): WeightProblem | null {
  const set = ws.filter(isSet)
  if (set.length === 0) return opts.required ? 'missing' : null
  if (set.length !== ws.length) return 'partial'
  if (set.some((w) => w <= 0 || w > 100 || Math.abs(w * 100 - Math.round(w * 100)) > 1e-6)) return 'range'
  if (Math.abs(set.reduce((a, w) => a + w, 0) - 100) > WEIGHT_TOLERANCE) return 'total'
  return null
}

/** n equal shares in hundredths; the rounding remainder goes to the first so the sum is exactly 100. */
export function equalWeights(n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(10000 / n) / 100
  const first = Math.round((100 - base * (n - 1)) * 100) / 100
  return [first, ...Array.from({ length: n - 1 }, () => base)]
}
