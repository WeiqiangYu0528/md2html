import puppeteer from 'puppeteer'
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
    expect(html).toContain('aria-current')
  })

  it('injects the TOC after a leading markdown h1 when no header is provided', () => {
    const html = assembleDocument({
      title: 'T', bodyHtml: '<h1 id="doc">Doc</h1>\n<p>Body</p>', theme,
      toc: '<nav class="toc">TOC</nav>',
    })
    expect(html.indexOf('<h1 id="doc">Doc</h1>')).toBeLessThan(html.indexOf('<nav class="toc">'))
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

  it('adds no toc placement class for auto/none/omitted', () => {
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme }))
      .toContain('<body class="theme-claude">')
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'auto' }))
      .toContain('<body class="theme-claude">')
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'none' }))
      .toContain('<body class="theme-claude">')
  })

  it('adds toc-sidebar / toc-topbar body class for those modes', () => {
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'sidebar' }))
      .toContain('<body class="theme-claude toc-sidebar">')
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'topbar' }))
      .toContain('<body class="theme-claude toc-topbar">')
  })

  it('injects a media lightbox when the document has images', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '<p><img src="a.png" alt="A"></p>', theme })

    expect(html).toContain('.media-lightbox')
    expect(html).toContain('data-media-lightbox')
    expect(html).toContain('article.querySelectorAll(\'img, figure.mermaid svg\')')
  })

  it('injects a media lightbox when the document has Mermaid diagrams', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '<figure class="mermaid"><svg></svg></figure>', theme })

    expect(html).toContain('.media-lightbox')
    expect(html).toContain('figure.mermaid svg')
  })

  it('remaps SVG clone IDs and every supported fragment reference', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '<figure class="mermaid"><svg></svg></figure>', theme })

    expect(html).toContain('const remapSvgIds = (svg, suffix) => {')
    expect(html).toContain("const svgElements = [svg, ...svg.querySelectorAll('*')];")
    expect(html).toContain('const elementsWithIds = svgElements.filter((element) => element.id);')
    expect(html).toContain('for (const element of svgElements) {')
    expect(html).toContain("const baseId = oldId + '--lightbox-' + suffix;")
    expect(html).toContain('document.getElementById(newId) || assignedIds.has(newId)')
    expect(html).toContain('assignedIds.add(newId);')
    expect(html).toContain('idMap.set(oldId, newId);')
    expect(html).toContain('element.id = newId;')
    expect(html).toContain('const replaceLocalUrl = (value) => value.replace(')
    expect(html).toContain('const replaceLocalHref = (value) => {')
    expect(html).toContain("svg.querySelectorAll('style')")
    expect(html).toContain("'clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke'")
    expect(html).toContain("const hrefAttributes = ['href', 'xlink:href'];")
    expect(html).toContain("'aria-labelledby', 'aria-describedby'")
    expect(html).toContain("value.replace(/\\S+/g,")
    expect(html).toContain('let svgCloneId = 0;')
    expect(html).toContain('remapSvgIds(clone, ++svgCloneId);')
  })

  it('remaps SVG clone IDs and references at runtime without mutating the source', async () => {
    const bodyHtml = `<div id="fff--lightbox-1"></div>
<button id="behind-overlay">Behind overlay</button>
<figure class="mermaid"><svg id="fff" role="graphics-document" aria-label="Original diagram" aria-labelledby="title description" filter="url(#shadow)">
<style>#fff .node { fill: url(#paint); filter: url(#shadow); color: #fff; } #node { stroke: url(#paint); } /* responsive */ /* nested */ @media (min-width: 0px) { #description { opacity: 1; } [href="#node"] { color: #fff; } .label::before { content: "#node"; } } @keyframes pulse { from { opacity: 0; } to { opacity: 1; } } .external { fill: url(https://example.com/#paint); }</style>
<title id="title">Diagram</title>
<desc id="description">Description</desc>
<defs>
  <linearGradient id="paint"></linearGradient>
  <filter id="shadow"></filter>
</defs>
<g id="node" aria-labelledby="title description" aria-describedby="description" href="#paint" xlink:href="#node" fill="url(#paint)"></g>
<g data-color-node fill="#fff" href="https://example.com/#node"></g>
</svg></figure>`
    const html = assembleDocument({ title: 'T', bodyHtml, theme })
    const browser = await puppeteer.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.setContent(html)
      const result = await page.evaluate(() => {
        const runtime = globalThis as unknown as { document: any; KeyboardEvent: any; MouseEvent: any }
        const source = runtime.document.querySelector('figure.mermaid svg')
        const sourceMarkup = source.outerHTML
        source.dispatchEvent(new runtime.MouseEvent('click', { bubbles: true }))
        const firstClone = runtime.document.querySelector('.media-lightbox-content svg')
        const firstNode = firstClone.querySelector('[id^="node--lightbox-"]')
        const colorNode = firstClone.querySelector('[data-color-node]')
        runtime.document.querySelector('#behind-overlay').focus()
        runtime.document.dispatchEvent(new runtime.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
        const first = {
          rootId: firstClone.id,
          rootRole: firstClone.getAttribute('role'),
          rootAriaLabel: firstClone.getAttribute('aria-label'),
          rootTabindex: firstClone.getAttribute('tabindex'),
          rootAria: firstClone.getAttribute('aria-labelledby'),
          rootFilter: firstClone.getAttribute('filter'),
          nodeId: firstNode.id,
          nodeAriaLabelledby: firstNode.getAttribute('aria-labelledby'),
          nodeAriaDescribedby: firstNode.getAttribute('aria-describedby'),
          nodeFill: firstNode.getAttribute('fill'),
          nodeHref: firstNode.getAttribute('href'),
          nodeXlinkHref: firstNode.getAttribute('xlink:href'),
          colorFill: colorNode.getAttribute('fill'),
          externalHref: colorNode.getAttribute('href'),
          style: firstClone.querySelector('style')?.textContent,
          focusedClass: runtime.document.activeElement?.className,
        }
        runtime.document.querySelector('.media-lightbox-close')?.click()
        source.dispatchEvent(new runtime.MouseEvent('click', { bubbles: true }))
        const secondClone = runtime.document.querySelector('.media-lightbox-content svg')
        return {
          sourceUnchanged: source.outerHTML === sourceMarkup,
          first,
          secondRootId: secondClone.id,
          sourceIds: [...source.querySelectorAll('[id]'), source].map((element) => element.id),
          cloneIds: [secondClone, ...secondClone.querySelectorAll('[id]')].map((element) => element.id),
        }
      })

      expect(result.sourceUnchanged).toBe(true)
      expect(result.first.rootId).toBe('fff--lightbox-1-1')
      expect(result.first.rootRole).toBe('graphics-document')
      expect(result.first.rootAriaLabel).toBe('Original diagram')
      expect(result.first.rootTabindex).toBeNull()
      expect(result.first.rootAria).toBe('title--lightbox-1 description--lightbox-1')
      expect(result.first.rootFilter).toBe('url(#shadow--lightbox-1)')
      expect(result.first.nodeId).toBe('node--lightbox-1')
      expect(result.first.nodeAriaLabelledby).toBe('title--lightbox-1 description--lightbox-1')
      expect(result.first.nodeAriaDescribedby).toBe('description--lightbox-1')
      expect(result.first.nodeFill).toBe('url(#paint--lightbox-1)')
      expect(result.first.nodeHref).toBe('#paint--lightbox-1')
      expect(result.first.nodeXlinkHref).toBe('#node--lightbox-1')
      expect(result.first.colorFill).toBe('#fff')
      expect(result.first.externalHref).toBe('https://example.com/#node')
      expect(result.first.style).toContain('#fff--lightbox-1-1 .node')
      expect(result.first.style).toContain('#node--lightbox-1')
      expect(result.first.style).toContain('#description--lightbox-1')
      expect(result.first.style).toContain('/* responsive */ /* nested */ @media')
      expect(result.first.style).toContain('url(#paint--lightbox-1)')
      expect(result.first.style).toContain('color: #fff')
      expect(result.first.style).toContain('[href="#node"]')
      expect(result.first.style).toContain('content: "#node"')
      expect(result.first.style).toContain('@keyframes pulse')
      expect(result.first.style).toContain('url(https://example.com/#paint)')
      expect(result.first.focusedClass).toBe('media-lightbox-close')
      expect(result.secondRootId).toBe('fff--lightbox-2')
      expect(result.cloneIds.some((id) => result.sourceIds.includes(id))).toBe(false)
    } finally {
      await browser.close()
    }
  }, 25_000)

  it('omits the media lightbox when the document has no images or Mermaid diagrams', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '<p>Only text</p>', theme })

    expect(html).not.toContain('.media-lightbox')
    expect(html).not.toContain('data-media-lightbox')
  })
})
