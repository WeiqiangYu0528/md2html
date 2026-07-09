import { parseFrontmatter } from './frontmatter'
import { detectLang } from './lang'
import { createRenderer } from './markdown/renderer'
import { renderMermaid, mermaidFallbackHtml } from './mermaid/render'
import { buildToc } from './toc'
import type { ShikiTheme, TocMode } from './types'

export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
  /** Document language for <html lang> (frontmatter lang, else auto-detected). */
  lang: string
  /** Table-of-contents nav HTML, or '' when no TOC is generated. */
  toc: string
  /** Non-fatal conversion warnings to print from the CLI. */
  warnings: string[]
}

/**
 * Parse + render a raw Markdown string into semantic body HTML plus metadata.
 * @param raw the full Markdown file contents (may include frontmatter)
 * @param shikiTheme a built-in Shiki theme name, or a parsed custom theme object
 */
export async function convert(
  raw: string,
  shikiTheme: ShikiTheme,
  mermaidConfig: Record<string, unknown> = {},
  tocMode: TocMode = 'auto',
): Promise<ConvertResult> {
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  // Parse once, then render the body AND read the heading tokens for the TOC.
  // A shared env preserves footnote/anchor behavior (md.render does the same).
  const env: Record<string, unknown> = {}
  const tokens = md.parse(content, env)
  // Collect ```mermaid sources (in document order) and render them to SVG before
  // the synchronous render pass. Only launches a browser when diagrams exist.
  const warnings: string[] = []
  const mermaidSources = tokens
    .filter((t) => t.type === 'fence' && t.info.trim() === 'mermaid')
    .map((t) => t.content)
  if (mermaidSources.length > 0) {
    try {
      const rendered = await renderMermaid(mermaidSources, mermaidConfig)
      env.mermaid = rendered.html
      warnings.push(...rendered.warnings)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const count = mermaidSources.length
      const noun = count === 1 ? 'diagram' : 'diagrams'
      env.mermaid = mermaidSources.map((s) => mermaidFallbackHtml(s))
      warnings.push(`Warning: Mermaid renderer could not start; showing source fallback for ${count} ${noun}.\n${message}`)
    }
    env.mermaidIndex = 0
  }
  const bodyHtml = md.renderer.render(tokens, md.options, env)
  // texmath wraps inline math in <eq> and display math in <eqn>; these tags are
  // emitted only for real math (never for $…$ inside code), so they are a
  // reliable, cheap signal that the KaTeX stylesheet needs to be inlined.
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  const lang = detectLang(content, metadata)
  const toc = buildToc(tokens, { lang, toc: metadata.toc, tocMode })
  return { metadata, bodyHtml, hasMath, lang, toc, warnings }
}
