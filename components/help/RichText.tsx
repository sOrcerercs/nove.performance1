import { Fragment } from 'react'
import styles from './help.module.css'

/**
 * The tiny formatter the guide answers are written in: blank-line paragraphs,
 * `**kalın**` and `` `kod` ``.
 *
 * Deliberately not a Markdown library and deliberately never
 * `dangerouslySetInnerHTML`. Admins write these answers, so the text is
 * untrusted input; producing React elements from a tokeniser means markup in
 * the text can only ever render as characters, never as HTML.
 */

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'code'; value: string }

/** Splits on `**bold**` and `` `code` `` without regex backtracking surprises. */
function tokenise(line: string): Token[] {
  const tokens: Token[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: 'text', value: buffer })
      buffer = ''
    }
  }

  while (i < line.length) {
    if (line.startsWith('**', i)) {
      const end = line.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        tokens.push({ kind: 'bold', value: line.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        tokens.push({ kind: 'code', value: line.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    buffer += line[i]
    i += 1
  }

  flush()
  return tokens
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {tokenise(text).map((t, i) => {
        if (t.kind === 'bold') return <strong key={i}>{t.value}</strong>
        if (t.kind === 'code') return <code key={i} className={styles.code}>{t.value}</code>
        return <Fragment key={i}>{t.value}</Fragment>
      })}
    </>
  )
}

export function RichText({ text }: { text: string }) {
  // Blank line separates paragraphs; a single newline stays inside one.
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  return (
    <div className={styles.prose}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              <Inline text={line} />
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}
