import { parseFrontmatter } from './frontmatter'
import { detectLang } from './lang'
import { createRenderer } from './markdown/renderer'
import { buildToc } from './toc'
import type { ShikiTheme } from './types'

export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
  /** Document language for <html lang> (frontmatter lang, else auto-detected). */
  lang: string
  /** Table-of-contents nav HTML, or '' when no TOC is generated. */
  toc: string
}

/**
 * Parse + render a raw Markdown string into semantic body HTML plus metadata.
 * @param raw the full Markdown file contents (may include frontmatter)
 * @param shikiTheme a built-in Shiki theme name, or a parsed custom theme object
 */
export async function convert(raw: string, shikiTheme: ShikiTheme): Promise<ConvertResult> {
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  // Parse once, then render the body AND read the heading tokens for the TOC.
  // A shared env preserves footnote/anchor behavior (md.render does the same).
  const env: Record<string, unknown> = {}
  const tokens = md.parse(content, env)
  const bodyHtml = md.renderer.render(tokens, md.options, env)
  // texmath wraps inline math in <eq> and display math in <eqn>; these tags are
  // emitted only for real math (never for $…$ inside code), so they are a
  // reliable, cheap signal that the KaTeX stylesheet needs to be inlined.
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  const lang = detectLang(content, metadata)
  const toc = buildToc(tokens, { lang, toc: metadata.toc })
  return { metadata, bodyHtml, hasMath, lang, toc }
}
