import type Token from 'markdown-it/lib/token.mjs'

export interface Heading {
  level: number
  id: string
  text: string
}

/** Plain text of a heading's inline token (strips bold/italic/etc. markup). */
function headingText(inline: Token): string {
  const children = inline.children ?? []
  const parts = children
    .filter((t) => t.type === 'text' || t.type === 'code_inline')
    .map((t) => t.content)
  return parts.length > 0 ? parts.join('') : inline.content
}

/** Collect h2 and h3 headings (with their anchor ids) from a parsed token stream. */
export function collectHeadings(tokens: Token[]): Heading[] {
  const headings: Heading[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type !== 'heading_open') continue
    const level = tok.tag === 'h2' ? 2 : tok.tag === 'h3' ? 3 : 0
    if (level === 0) continue
    const id = tok.attrGet('id') ?? ''
    const inline = tokens[i + 1]
    const text = inline && inline.type === 'inline' ? headingText(inline) : ''
    if (id) headings.push({ level, id, text })
  }
  return headings
}
