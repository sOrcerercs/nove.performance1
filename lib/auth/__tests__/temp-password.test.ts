import { expect, test } from 'vitest'
import { generateTempPassword, TEMP_PASSWORD_ALPHABET, TEMP_PASSWORD_LENGTH } from '../temp-password'

test('a temporary password is 16 characters from an alphabet with no look-alikes', () => {
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword()
    expect(p).toHaveLength(TEMP_PASSWORD_LENGTH)
    for (const ch of p) expect(TEMP_PASSWORD_ALPHABET).toContain(ch)
  }
  for (const lookalike of ['0', 'O', 'o', '1', 'l', 'I', 'i']) {
    expect(TEMP_PASSWORD_ALPHABET).not.toContain(lookalike)
  }
})

test('it is long enough for the account password rule', () => {
  // passwordSchema in lib/actions/core/users.ts asks for at least 12.
  expect(TEMP_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12)
})

test('the randomness source is injectable, so the mapping is exact', () => {
  const seq = [0, 1, TEMP_PASSWORD_ALPHABET.length - 1]
  let i = 0
  const p = generateTempPassword(() => seq[i++ % seq.length]!)
  expect(p.slice(0, 3)).toBe(
    TEMP_PASSWORD_ALPHABET[0]! + TEMP_PASSWORD_ALPHABET[1]! + TEMP_PASSWORD_ALPHABET.at(-1)!,
  )
})
