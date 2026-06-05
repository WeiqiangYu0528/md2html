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
})
