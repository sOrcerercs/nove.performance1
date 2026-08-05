import { expect, test } from 'vitest'
import { foldForSearch, matchesQuery } from '../search'

test('Turkish diacritics fold to ASCII', () => {
  expect(foldForSearch('Geçmiş')).toBe('gecmis')
  expect(foldForSearch('DÖNEM')).toBe('donem')
  expect(foldForSearch('Bölüm')).toBe('bolum')
  expect(foldForSearch('İlerleme')).toBe('ilerleme')
  expect(foldForSearch('ışık')).toBe('isik')
})

test('typing without diacritics still finds the entry', () => {
  const text = 'Geçmiş bir çeyreğe veri nasıl girilir?'
  for (const q of ['gecmis', 'geçmiş', 'GECMIS', 'çeyreğe', 'ceyrege']) {
    expect(matchesQuery(text, q), q).toBe(true)
  }
})

test('the dotted capital I matches a plain i', () => {
  // İ lowercases to "i̇" under a tr locale, which would not match "i".
  expect(matchesQuery('İnsan Kaynakları', 'insan')).toBe(true)
  expect(matchesQuery('insan kaynakları', 'İNSAN')).toBe(true)
})

test('all terms must appear, in any order', () => {
  const text = 'Parolamı unuttum, ne yapmalıyım?'
  expect(matchesQuery(text, 'parola unuttum')).toBe(true)
  expect(matchesQuery(text, 'unuttum parola')).toBe(true)
  expect(matchesQuery(text, 'parola çeyrek')).toBe(false)
})

test('an empty query matches everything', () => {
  expect(matchesQuery('herhangi bir metin', '   ')).toBe(true)
})
