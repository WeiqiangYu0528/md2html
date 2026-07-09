import type Token from 'markdown-it/lib/token.mjs'
import { escapeHtml } from './escape'
import type { TocMode } from './types'

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

const TOC_TITLES: Record<string, string> = { zh: '目录' }

/**
 * Render a nested TOC nav from h2/h3 headings. h3s nest under the preceding h2;
 * an h3 with no preceding h2 degrades to a top-level item. Returns '' if empty.
 */
export function renderToc(headings: Heading[], lang: string): string {
  if (headings.length === 0) return ''
  const title = TOC_TITLES[lang] ?? 'Contents'
  const out: string[] = []
  let inLi = false   // a top-level <li> is open
  let inSub = false  // a nested <ul> inside the current <li> is open

  const closeSub = () => { if (inSub) { out.push('</ul>'); inSub = false } }
  const closeLi = () => { closeSub(); if (inLi) { out.push('</li>'); inLi = false } }

  for (const h of headings) {
    const link = `<a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a>`
    if (h.level === 2) {
      closeLi()
      out.push(`<li>${link}`)
      inLi = true
    } else {
      if (!inLi) { out.push(`<li>${link}</li>`); continue }
      if (!inSub) { out.push('<ul>'); inSub = true }
      out.push(`<li>${link}</li>`)
    }
  }
  closeLi()

  return (
    `<nav class="toc" aria-label="Table of contents">\n` +
    `<p class="toc-title">${title}</p>\n` +
    `<ul>\n${out.join('\n')}\n</ul>\n</nav>\n`
  )
}

/**
 * Build the TOC nav for a parsed document.
 *
 * `tocMode` (from the CLI `--toc` flag) takes precedence over frontmatter:
 * - 'none'               → never emit a TOC.
 * - 'sidebar' | 'topbar' → force a TOC whenever there is >=1 heading.
 * - 'auto' (or omitted)  → defer to frontmatter `toc`: `false` suppresses,
 *                          `true` forces, otherwise a TOC appears only with
 *                          3+ headings.
 * The nav markup is identical in every case; placement is a theme concern.
 */
export function buildToc(
  tokens: Token[],
  opts: { lang: string; toc?: unknown; tocMode?: TocMode },
): string {
  const mode = opts.tocMode ?? 'auto'
  if (mode === 'none') return ''
  const headings = collectHeadings(tokens)
  if (headings.length === 0) return ''
  const forced = mode === 'sidebar' || mode === 'topbar'
  if (!forced) {
    if (opts.toc === false) return ''
    if (opts.toc !== true && headings.length < 3) return ''
  }
  return renderToc(headings, opts.lang)
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
