import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('createRenderer', () => {
  it('adds stable ids to headings', () => {
    expect(md.render('# Hello World')).toContain('id="hello-world"')
  })

  it('renders GFM tables', () => {
    const html = md.render('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('wraps tables in a horizontally-scrollable container', () => {
    const html = md.render('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<div class="table-wrap">')
    expect(html).toContain('</table>\n</div>')
  })

  it('renders footnotes', () => {
    const html = md.render('Text[^1]\n\n[^1]: A note')
    expect(html).toContain('class="footnotes"')
  })

  it('renders task-list checkboxes', () => {
    const html = md.render('- [x] done\n- [ ] todo')
    expect(html).toContain('type="checkbox"')
  })

  it('highlights fenced code with Shiki using inline colors', () => {
    const html = md.render('```js\nconst x = 1\n```')
    expect(html).toContain('class="shiki')
    expect(html).toContain('style="')
  })

  it('produces clean punctuation-free heading slugs', () => {
    expect(md.render('# Reading Markdown, Beautifully')).toContain('id="reading-markdown-beautifully"')
    expect(md.render('## Hello, World! & Friends')).toContain('id="hello-world-friends"')
  })

  it('produces non-empty, unique slugs for CJK headings', () => {
    expect(md.render('## 这是什么项目')).toContain('id="这是什么项目"')
    // Two distinct all-Chinese headings must not collapse to empty/colliding ids.
    const html = md.render('## 云 + 地区维度（决定）\n\n## 作业维度（资源）')
    expect(html).not.toContain('id=""')
    expect(html).toContain('id="云-地区维度决定"')
    expect(html).toContain('id="作业维度资源"')
  })
})
