import { parseFrontmatter } from './frontmatter'
import { createRenderer } from './markdown/renderer'

export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
}

/**
 * Parse + render a raw Markdown string into semantic body HTML plus metadata.
 * @param raw the full Markdown file contents (may include frontmatter)
 * @param shikiTheme Shiki theme name for code highlighting
 */
export async function convert(raw: string, shikiTheme: string): Promise<ConvertResult> {
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  return { metadata, bodyHtml: md.render(content) }
}
