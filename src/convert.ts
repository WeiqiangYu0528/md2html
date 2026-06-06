import { parseFrontmatter } from './frontmatter'
import { createRenderer } from './markdown/renderer'
import type { ShikiTheme } from './types'

export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
}

/**
 * Parse + render a raw Markdown string into semantic body HTML plus metadata.
 * @param raw the full Markdown file contents (may include frontmatter)
 * @param shikiTheme a built-in Shiki theme name, or a parsed custom theme object
 */
export async function convert(raw: string, shikiTheme: ShikiTheme): Promise<ConvertResult> {
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  const bodyHtml = md.render(content)
  // texmath wraps inline math in <eq> and display math in <eqn>; these tags are
  // emitted only for real math (never for $…$ inside code), so they are a
  // reliable, cheap signal that the KaTeX stylesheet needs to be inlined.
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  return { metadata, bodyHtml, hasMath }
}
