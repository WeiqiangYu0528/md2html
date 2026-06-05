import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import Shiki from '@shikijs/markdown-it'
import { alert } from '@mdit/plugin-alert'
import { calloutOptions } from './callouts'

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
 * @param shikiTheme name of a built-in Shiki theme (e.g. "vitesse-dark")
 */
export async function createRenderer(shikiTheme: string): Promise<MarkdownIt> {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  md.use(anchor, { slugify })
  md.use(footnote)
  md.use(taskLists)
  md.use(alert, calloutOptions)
  md.use(await Shiki({ theme: shikiTheme }))

  md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n'
  md.renderer.rules.table_close = () => '</table>\n</div>\n'

  return md
}
