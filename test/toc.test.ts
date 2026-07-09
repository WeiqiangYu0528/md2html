import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'
import { collectHeadings, renderToc, buildToc } from '../src/toc'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('collectHeadings', () => {
  it('collects h2 and h3 with id and text, ignoring h1 and h4', () => {
    const tokens = md.parse('# Title\n\n## Intro\n\n### Details\n\n## Usage\n\n#### Tiny', {})
    const headings = collectHeadings(tokens)
    expect(headings).toEqual([
      { level: 2, id: 'intro', text: 'Intro' },
      { level: 3, id: 'details', text: 'Details' },
      { level: 2, id: 'usage', text: 'Usage' },
    ])
  })

  it('extracts plain text from formatted headings (strips markup)', () => {
    const tokens = md.parse('## A **bold** and `code` word', {})
    expect(collectHeadings(tokens)[0].text).toBe('A bold and code word')
  })
})

describe('renderToc', () => {
  const headings = [
    { level: 2, id: 'intro', text: 'Intro' },
    { level: 2, id: 'usage', text: 'Usage' },
    { level: 3, id: 'flags', text: 'Flags' },
  ]

  it('renders a nested nav with localized title and anchor links', () => {
    const html = renderToc(headings, 'en')
    expect(html).toContain('<nav class="toc" aria-label="Table of contents">')
    expect(html).toContain('<p class="toc-title">Contents</p>')
    expect(html).toContain('<a href="#intro">Intro</a>')
    expect(html).toContain('<a href="#flags">Flags</a>')
    // the h3 'Flags' must be nested inside the 'Usage' h2 item
    expect(html).toMatch(/Usage<\/a>\s*<ul>\s*<li><a href="#flags">Flags<\/a><\/li>/)
  })

  it('localizes the title to 目录 for zh', () => {
    expect(renderToc(headings, 'zh')).toContain('<p class="toc-title">目录</p>')
  })

  it('escapes heading text and returns empty string for no headings', () => {
    expect(renderToc([{ level: 2, id: 'x', text: 'A & <b>' }], 'en')).toContain('A &amp; &lt;b&gt;')
    expect(renderToc([], 'en')).toBe('')
  })
})

describe('buildToc trigger', () => {
  const parse = (src: string) => md.parse(src, {})

  it('emits a TOC when there are 3+ headings', () => {
    const html = buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en' })
    expect(html).toContain('<nav class="toc"')
  })

  it('emits nothing for fewer than 3 headings by default', () => {
    expect(buildToc(parse('## A\n\n## B'), { lang: 'en' })).toBe('')
  })

  it('toc:false suppresses even with many headings', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', toc: false })).toBe('')
  })

  it('toc:true forces a TOC even with one heading', () => {
    expect(buildToc(parse('## Only'), { lang: 'en', toc: true })).toContain('<nav class="toc"')
  })

  it('emits nothing when there are no headings', () => {
    expect(buildToc(parse('Just text.'), { lang: 'en', toc: true })).toBe('')
  })
})

describe('buildToc tocMode', () => {
  const parse = (src: string) => md.parse(src, {})

  it('mode "none" suppresses even with many headings', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', tocMode: 'none' })).toBe('')
  })

  it('mode "sidebar" forces a TOC with a single heading', () => {
    expect(buildToc(parse('## Only'), { lang: 'en', tocMode: 'sidebar' })).toContain('<nav class="toc"')
  })

  it('mode "topbar" forces a TOC with a single heading', () => {
    expect(buildToc(parse('## Only'), { lang: 'en', tocMode: 'topbar' })).toContain('<nav class="toc"')
  })

  it('mode "sidebar"/"topbar" overrides frontmatter toc:false (CLI wins)', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', toc: false, tocMode: 'sidebar' }))
      .toContain('<nav class="toc"')
  })

  it('mode "auto" defers to frontmatter toc:false', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', toc: false, tocMode: 'auto' })).toBe('')
  })

  it('mode "auto" keeps the >=3 heading threshold', () => {
    expect(buildToc(parse('## A\n\n## B'), { lang: 'en', tocMode: 'auto' })).toBe('')
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', tocMode: 'auto' })).toContain('<nav class="toc"')
  })

  it('forced modes still emit nothing when there are no headings', () => {
    expect(buildToc(parse('Just text.'), { lang: 'en', tocMode: 'sidebar' })).toBe('')
  })
})
