import { parseFrontmatter } from './frontmatter'
import { createRenderer } from './markdown/renderer'
import type { ShikiTheme } from './types'

export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
}

/**
 * Parse + render a raw Markdown string into semantic body HTML plus metadata.
 * @param raw the full Markdown file contents (may include frontmatter)
 * @param shikiTheme a built-in Shiki theme name, or a parsed custom theme object
 */
export async function convert(raw: string, shikiTheme: ShikiTheme): Promise<ConvertResult> {
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  return { metadata, bodyHtml: md.render(content) }
}
