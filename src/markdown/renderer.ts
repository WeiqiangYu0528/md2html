import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import Shiki from '@shikijs/markdown-it'
import { alert } from '@mdit/plugin-alert'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { calloutOptions } from './callouts'
import type { ShikiTheme } from '../types'
import { mermaidFallbackHtml } from '../mermaid/render'
import { escapeHtml } from '../escape'

/**
 * The header-bar label for a code card, derived from a fence info string.
 * GFM info is "<lang> <rest…>"; the docs label a block with the rest when
 * present (e.g. ```bash cURL → "cURL"), else the bare language (```js → "js").
 * Returns '' when there is no language at all (a plain ``` fence).
 */
export function codeLabel(info: string): string {
  const trimmed = info.trim()
  if (!trimmed) return ''
  const space = trimmed.indexOf(' ')
  return space === -1 ? trimmed : trimmed.slice(space + 1).trim()
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')  // drop punctuation/symbols, keep letters/numbers in any script (incl. CJK)
    .replace(/\s+/g, '-')        // spaces → hyphens
    .replace(/-+/g, '-')         // collapse repeats
    .replace(/^-+|-+$/g, '')     // trim leading/trailing hyphens
}

/**
 * Build a markdown-it renderer with all v1 features enabled.
 * Async because Shiki must load its highlighter/theme before use.
 * @param shikiTheme a built-in Shiki theme name, or a parsed custom theme object
 */
export async function createRenderer(shikiTheme: ShikiTheme): Promise<MarkdownIt> {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  md.use(anchor, { slugify })
  md.use(footnote)
  md.use(taskLists)
  md.use(alert, calloutOptions)
  // Math: texmath handles delimiters, KaTeX renders to static HTML at build time.
  // 'dollars' → $…$ and $$…$$; 'brackets' → \(…\) and \[…\]. throwOnError:false
  // means a malformed formula renders flagged instead of crashing conversion.
  // strict:'ignore' silences KaTeX's per-character warnings for CJK text used as
  // formula variables (common in Chinese docs, e.g. $$可用性 = \frac{a}{b}$$),
  // which are noise, not errors — the formula still renders correctly.
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets'],
    katexOptions: { throwOnError: false, strict: 'ignore' },
  })
  // Shiki accepts either a theme name or a raw theme object.
  // fallbackLanguage: an unrecognized fence language (e.g. ```mtail) degrades to
  // plain text instead of throwing and aborting the whole conversion. 'text' is a
  // Shiki special-cased plain language (not in the bundled-language type), hence the cast.
  md.use(await Shiki({ theme: shikiTheme as never, fallbackLanguage: 'text' as never }))

  // Intercept ```mermaid fences: emit the pre-rendered diagram stashed in env by
  // convert(); everything else goes to Shiki, wrapped in a code-card with a
  // header bar carrying the language/title label (a stable theme hook).
  const shikiFence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const info = tokens[idx].info
    if (info.trim() === 'mermaid') {
      const e = env as { mermaid?: string[]; mermaidIndex?: number }
      const i = e.mermaidIndex ?? 0
      e.mermaidIndex = i + 1
      return e.mermaid?.[i] ?? mermaidFallbackHtml(tokens[idx].content)
    }
    const pre = shikiFence(tokens, idx, options, env, self)
    const label = codeLabel(info)
    const header = label
      ? `<div class="code-card-header">${escapeHtml(label)}</div>\n`
      : ''
    return `<div class="code-card">\n${header}${pre}</div>\n`
  }

  md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n'
  md.renderer.rules.table_close = () => '</table>\n</div>\n'

  return md
}
