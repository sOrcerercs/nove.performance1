import { randomInt } from 'node:crypto'

/**
 * Letters and digits with the look-alikes removed (0 O o 1 l I i): the person
 * types this by hand from a message, once. 55 symbols × 16 ≈ 92 bits.
 */
export const TEMP_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ' + 'abcdefghjkmnpqrstuvwxyz' + '23456789'

export const TEMP_PASSWORD_LENGTH = 16

/**
 * A one-time password an admin hands over. `pick(n)` must return an integer in
 * [0, n); it defaults to the CSPRNG and is a parameter only so tests are exact.
 */
export function generateTempPassword(pick: (n: number) => number = (n) => randomInt(n)): string {
  let out = ''
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    out += TEMP_PASSWORD_ALPHABET[pick(TEMP_PASSWORD_ALPHABET.length)]
  }
  return out
}
