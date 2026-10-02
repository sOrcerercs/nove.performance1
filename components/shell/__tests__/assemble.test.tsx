import { describe, expect, test } from 'vitest'
import { assembleOffset, isAssembleRoute, pickBlocks } from '../assemble-motion'

describe('isAssembleRoute', () => {
  test('the six screens the user listed assemble', () => {
    for (const p of ['/', '/rapor', '/veri-girisi', '/yonetim', '/yardim', '/bolum/misafir']) {
      expect(isAssembleRoute(p)).toBe(true)
    }
  })

  test('everything else opens as before', () => {
    for (const p of ['/hosgeldin', '/login', '/hesap', '/yeni', '/objective/o-1', '/bolum']) {
      expect(isAssembleRoute(p)).toBe(false)
    }
  })
})

describe('assembleOffset', () => {
  const center = { x: 500, y: 400 }

  test('a block left of centre comes in from the left, one below from below', () => {
    expect(assembleOffset({ x: 100, y: 400 }, center).dx).toBeLessThan(0)
    expect(assembleOffset({ x: 100, y: 400 }, center).dy).toBe(0)
    expect(assembleOffset({ x: 500, y: 800 }, center).dy).toBeGreaterThan(0)
  })

  test('farther blocks travel farther, within bounds', () => {
    const near = assembleOffset({ x: 560, y: 400 }, center)
    const far = assembleOffset({ x: 1400, y: 400 }, center)
    expect(far.dx).toBeGreaterThan(near.dx)
    expect(Math.hypot(far.dx, far.dy)).toBeLessThanOrEqual(220)
    expect(Math.hypot(near.dx, near.dy)).toBeGreaterThanOrEqual(80)
  })

  test('a block dead centre still moves (rises from below) rather than not at all', () => {
    const o = assembleOffset(center, center)
    expect(Math.hypot(o.dx, o.dy)).toBeGreaterThanOrEqual(80)
    expect(o.dy).toBeGreaterThan(0)
  })
})

describe('pickBlocks', () => {
  // jsdom has no layout, so size and paint are injected.
  function tree(html: string) {
    const root = document.createElement('div')
    root.innerHTML = html
    return root
  }
  const measure = (el: Element) => {
    const s = (el as HTMLElement).dataset
    return { width: Number(s.w ?? 400), height: Number(s.h ?? 200), opaque: s.bg === '1' }
  }

  test('takes the outermost painted boxes and never what is inside them', () => {
    const root = tree(`
      <h1>Başlık</h1>
      <section>
        <div id="a" data-bg="1"><div id="inner" data-bg="1"></div></div>
        <div id="b" data-bg="1"></div>
      </section>`)
    expect(pickBlocks(root, measure).map((e) => e.id)).toEqual(['a', 'b'])
  })

  test('skips marked elements (the top bar) and small chips', () => {
    const root = tree(`
      <header data-no-assemble data-bg="1"><div id="x" data-bg="1"></div></header>
      <span id="chip" data-bg="1" data-w="60" data-h="24"></span>
      <div id="card" data-bg="1"></div>`)
    expect(pickBlocks(root, measure).map((e) => e.id)).toEqual(['card'])
  })
})
