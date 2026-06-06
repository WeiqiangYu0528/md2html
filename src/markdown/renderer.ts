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

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // drop punctuation/symbols
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
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets'],
    katexOptions: { throwOnError: false },
  })
  // Shiki accepts either a theme name or a raw theme object.
  md.use(await Shiki({ theme: shikiTheme as never }))

  md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n'
  md.renderer.rules.table_close = () => '</table>\n</div>\n'

  return md
}
