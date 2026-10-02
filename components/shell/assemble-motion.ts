/**
 * "Assemble" page entrance, modelled on the Steep reference video: on opening
 * a screen, its cards and tables slide in from the edges toward the centre and
 * settle into the layout. Pure helpers here; the DOM side is `Assemble.tsx`.
 */

/** The screens the user listed: overview, report, data entry, admin, guide, departments. */
export function isAssembleRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    ['/rapor', '/veri-girisi', '/yonetim', '/yardim'].some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith('/bolum/')
  )
}

const MIN_TRAVEL = 80
const MAX_TRAVEL = 220

/**
 * Where a block starts, relative to where it ends: pushed outward from the
 * centre along the line through its own centre, so left-hand blocks come from
 * the left and lower ones from below. Farther blocks travel a little farther.
 */
export function assembleOffset(
  block: { x: number; y: number },
  center: { x: number; y: number },
): { dx: number; dy: number } {
  const vx = block.x - center.x
  const vy = block.y - center.y
  const len = Math.hypot(vx, vy)
  // Dead centre has no direction: rise from below, like the reference's
  // last tiles.
  if (len < 1) return { dx: 0, dy: MIN_TRAVEL }
  const travel = Math.min(MAX_TRAVEL, MIN_TRAVEL + len * 0.15)
  return { dx: (vx / len) * travel, dy: (vy / len) * travel }
}

export interface BlockMeasure {
  width: number
  height: number
  /** Paints a background (colour or image) — i.e. reads as a card/table. */
  opaque: boolean
}

const MIN_W = 120
const MIN_H = 48

/**
 * The outermost painted boxes under `root` — the cards, tables and panels.
 * Text without a box of its own is not a block (it fades with the page).
 * `[data-no-assemble]` subtrees (the top bar) are left alone, and small
 * painted chips (badges, pills) are looked through rather than flown.
 */
export function pickBlocks(root: Element, measure: (el: Element) => BlockMeasure): HTMLElement[] {
  const out: HTMLElement[] = []
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.hasAttribute('data-no-assemble')) continue
      const m = measure(child)
      if (m.opaque && m.width >= MIN_W && m.height >= MIN_H) out.push(child as HTMLElement)
      else walk(child)
    }
  }
  walk(root)
  return out
}
