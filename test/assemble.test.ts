import { describe, it, expect } from 'vitest'
import { assembleDocument } from '../src/assemble'
import { loadTheme } from '../src/themes'

const theme = loadTheme('claude')

describe('assembleDocument', () => {
  it('produces a self-contained HTML document', () => {
    const html = assembleDocument({ title: 'My Doc', bodyHtml: '<p>Hi</p>', theme })
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<title>My Doc</title>')
    expect(html).toContain('<body class="theme-claude">')
    expect(html).toContain('<article class="md-content">')
    expect(html).toContain('.theme-claude .md-content') // theme css inlined
    expect(html).toContain('<p>Hi</p>')
  })

  it('escapes the title', () => {
    const html = assembleDocument({ title: 'A & B <x>', bodyHtml: '', theme })
    expect(html).toContain('<title>A &amp; B &lt;x&gt;</title>')
  })

  it('renders a visible header only when headerTitle is given', () => {
    const withHeader = assembleDocument({ title: 'T', headerTitle: 'T', bodyHtml: '', theme })
    expect(withHeader).toContain('<header class="md-header">')
    const without = assembleDocument({ title: 'T', bodyHtml: '', theme })
    expect(without).not.toContain('<header class="md-header">')
  })

  it('inlines font-face CSS before theme CSS when provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme, fontFaceCss: '@font-face{}' })
    expect(html).toContain('@font-face{}')
  })

  it('inlines KaTeX CSS before theme CSS when provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme, katexCss: '.katex{color:red}' })
    expect(html).toContain('.katex{color:red}')
    // KaTeX CSS must come before theme CSS so the theme can override it.
    expect(html.indexOf('.katex{color:red}')).toBeLessThan(html.indexOf('.theme-claude .md-content'))
  })

  it('omits KaTeX CSS when not provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme })
    expect(html).not.toContain('.katex{color:red}')
  })

  it('sets <html lang> from the lang input', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme, lang: 'zh' })
    expect(html).toContain('<html lang="zh">')
  })

  it('defaults <html lang> to en when lang is omitted', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme })
    expect(html).toContain('<html lang="en">')
  })

  it('injects the TOC between the header and the body when provided', () => {
    const html = assembleDocument({
      title: 'T', headerTitle: 'T', bodyHtml: '<p>Body</p>', theme,
      toc: '<nav class="toc">TOC</nav>',
    })
    expect(html).toContain('<nav class="toc">TOC</nav>')
    // order: header h1, then toc, then body
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<nav class="toc">'))
    expect(html.indexOf('<nav class="toc">')).toBeLessThan(html.indexOf('<p>Body</p>'))
  })

  it('omits the TOC when not provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '<p>Body</p>', theme })
    expect(html).not.toContain('class="toc"')
  })

  it('uses the theme scopeClass for the body class', () => {
    const t = { ...theme, name: 'claude-dark', scopeClass: 'claude' }
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme: t })
    expect(html).toContain('<body class="theme-claude">')
  })
})
