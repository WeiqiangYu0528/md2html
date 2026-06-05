import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import Shiki from '@shikijs/markdown-it'

/**
 * Build a markdown-it renderer with all v1 features enabled.
 * Async because Shiki must load its highlighter/theme before use.
 * @param shikiTheme name of a built-in Shiki theme (e.g. "vitesse-dark")
 */
export async function createRenderer(shikiTheme: string): Promise<MarkdownIt> {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  md.use(anchor)
  md.use(footnote)
  md.use(taskLists)
  md.use(await Shiki({ theme: shikiTheme }))
  return md
}
