import { describe, expect, test } from 'vitest'
import { firstNameOf, nextProgress, validateCredentials } from '../sign-in-progress'

describe('nextProgress', () => {
  test('rises quickly at first, then creeps, and never completes before the server answers', () => {
    let p = 0
    for (let t = 16; t <= 600; t += 16) p = nextProgress(p, t, 16, false)
    expect(p).toBeGreaterThan(0.55)

    for (let t = 616; t <= 60_000; t += 16) p = nextProgress(p, t, 16, false)
    expect(p).toBeLessThanOrEqual(0.88)
  })

  test('never moves backwards', () => {
    expect(nextProgress(0.8, 10, 16, false)).toBe(0.8)
  })

  test('completes within about half a second once the server has answered', () => {
    let p = 0.5
    let frames = 0
    while (p < 1 && frames < 100) {
      p = nextProgress(p, 1000 + frames * 16, 16, true)
      frames++
    }
    expect(p).toBe(1)
    expect(frames * 16).toBeLessThanOrEqual(500)
  })
})

describe('validateCredentials', () => {
  test('asks for both fields when empty', () => {
    expect(validateCredentials('', '')).toEqual({ email: 'missing', password: 'missing' })
  })

  test('rejects something that is not an e-mail address', () => {
    expect(validateCredentials('kagan', 'x').email).toBe('format')
  })

  test('accepts a plausible address and any non-empty password', () => {
    expect(validateCredentials('  kagan.ozturk@nove.group ', 'x')).toEqual({})
  })
})

describe('firstNameOf', () => {
  test('takes the first word of the full name', () => {
    expect(firstNameOf('Kağan Öztürk')).toBe('Kağan')
    expect(firstNameOf('  Yücel   İskender ')).toBe('Yücel')
  })

  test('returns an empty string when there is no name', () => {
    expect(firstNameOf('')).toBe('')
    expect(firstNameOf(undefined)).toBe('')
  })
})
