import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { RichText } from '../RichText'

/**
 * These answers are written by admins, so the text is untrusted input. The
 * renderer must turn markup into characters, never into HTML.
 */

test('bold and code markers become elements', () => {
  const { container } = render(<RichText text="Kişiyi **pasifleştirin**, `npm run seed` değil." />)
  expect(container.querySelector('strong')?.textContent).toBe('pasifleştirin')
  expect(container.querySelector('code')?.textContent).toBe('npm run seed')
})

test('a blank line starts a new paragraph, a single newline does not', () => {
  const { container } = render(<RichText text={'Birinci paragraf.\nAynı paragraf.\n\nİkinci paragraf.'} />)
  expect(container.querySelectorAll('p')).toHaveLength(2)
  expect(container.querySelectorAll('br')).toHaveLength(1)
})

test('HTML in the text is escaped, not rendered', () => {
  const nasty = '<script>alert(1)</script><img src=x onerror=alert(2)><b>kalın değil</b>'
  const { container } = render(<RichText text={nasty} />)

  // Nothing was interpreted as markup.
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('b')).toBeNull()
  // It is all still visible as literal text.
  expect(container.textContent).toContain('<script>alert(1)</script>')
  expect(container.textContent).toContain('<b>kalın değil</b>')
})

test('unclosed markers are left as literal characters', () => {
  const { container } = render(<RichText text="Yarım **kalın ve yarım `kod" />)
  expect(container.querySelector('strong')).toBeNull()
  expect(container.querySelector('code')).toBeNull()
  expect(container.textContent).toBe('Yarım **kalın ve yarım `kod')
})

test('empty text renders nothing rather than throwing', () => {
  const { container } = render(<RichText text="   " />)
  expect(container.querySelectorAll('p')).toHaveLength(0)
})
