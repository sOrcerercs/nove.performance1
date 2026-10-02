'use client'

import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'
import { assembleOffset, isAssembleRoute, pickBlocks } from './assemble-motion'

const DURATION = 760
const STAGGER = 32
const MAX_DELAY = 360
const EASE = 'cubic-bezier(.16, 1, .3, 1)'

/**
 * Wraps the app's content area. When one of the listed screens opens, its
 * cards and tables come in from the edges and settle into place (see
 * assemble-motion.ts). Keyed on the pathname, so changing the date range or the
 * layout switch on the same screen does not replay it.
 *
 * A layout effect: it runs after the new screen is committed but before the
 * browser paints it, so the blocks never flash in their final place first.
 * Web Animations with `fill: 'backwards'` leave no inline styles behind.
 */
export function Assemble({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !isAssembleRoute(pathname)) return
    if (typeof root.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const viewH = window.innerHeight
    const box = root.getBoundingClientRect()
    const center = { x: box.left + box.width / 2, y: Math.min(viewH, box.bottom) / 2 + box.top / 2 }

    const blocks = pickBlocks(root, (el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const bg = cs.backgroundColor
      const painted = cs.backgroundImage !== 'none' || !(bg === 'transparent' || bg.endsWith(', 0)'))
      return { width: r.width, height: r.height, opaque: painted }
    })
      // Only what is on (or just below) the first screen; the rest is out of
      // sight anyway and animating it would only cost frames.
      .filter((el) => el.getBoundingClientRect().top < viewH + 120)

    const animations: Animation[] = [
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }),
    ]
    blocks.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const { dx, dy } = assembleOffset({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, center)
      animations.push(
        el.animate(
          [
            { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(1.04)`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: DURATION, delay: Math.min(i * STAGGER, MAX_DELAY), easing: EASE, fill: 'backwards' },
        ),
      )
    })

    return () => animations.forEach((a) => a.cancel())
  }, [pathname])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
