import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { rewriteInternalLinks } from '../src/links'

// Simulate a converted folder rooted at /docs.
const root = '/docs'
const current = resolve(root, 'guide.md')
const set = new Set([
  resolve(root, 'guide.md'),
  resolve(root, 'intro.md'),
  resolve(root, 'sub/deep.markdown'),
  resolve(root, 'My Doc.md'),
])

function a(href: string): string {
  return `<p>see <a href="${href}">x</a></p>`
}

describe('rewriteInternalLinks', () => {
  it('rewrites an in-set relative .md link', () => {
    expect(rewriteInternalLinks(a('./intro.md'), current, set)).toBe(a('./intro.html'))
  })

  it('rewrites an in-set .markdown link across a subdir', () => {
    expect(rewriteInternalLinks(a('./sub/deep.markdown'), current, set)).toBe(a('./sub/deep.html'))
  })

  it('rewrites via ../ traversal into an in-set file', () => {
    const nested = resolve(root, 'sub/page.md')
    const nestedSet = new Set([nested, resolve(root, 'intro.md')])
    expect(rewriteInternalLinks(a('../intro.md'), nested, nestedSet)).toBe(a('../intro.html'))
  })

  it('preserves a #fragment', () => {
    expect(rewriteInternalLinks(a('./intro.md#setup'), current, set)).toBe(a('./intro.html#setup'))
  })

  it('preserves a ?query', () => {
    expect(rewriteInternalLinks(a('./intro.md?v=1'), current, set)).toBe(a('./intro.html?v=1'))
  })

  it('preserves a suffix containing &amp; verbatim (markdown-it escapes & in hrefs)', () => {
    expect(rewriteInternalLinks(a('./intro.md?a=1&amp;b=2'), current, set)).toBe(a('./intro.html?a=1&amp;b=2'))
  })

  it('splits at the first suffix char when both # and ? are present, either order', () => {
    expect(rewriteInternalLinks(a('./intro.md#frag?x=1'), current, set)).toBe(a('./intro.html#frag?x=1'))
    expect(rewriteInternalLinks(a('./intro.md?x=1#frag'), current, set)).toBe(a('./intro.html?x=1#frag'))
  })

  it('preserves encoding when the decoded name is in the set', () => {
    expect(rewriteInternalLinks(a('./My%20Doc.md'), current, set)).toBe(a('./My%20Doc.html'))
  })

  it('leaves a relative .md link whose target is not in the set', () => {
    expect(rewriteInternalLinks(a('./missing.md'), current, set)).toBe(a('./missing.md'))
  })

  it('leaves http(s), mailto, protocol-relative, and absolute links', () => {
    for (const href of ['https://x.com/a.md', 'http://x/a.md', 'mailto:a@b.com', '//cdn/a.md', '/docs/intro.md']) {
      expect(rewriteInternalLinks(a(href), current, set)).toBe(a(href))
    }
  })

  it('leaves in-page anchors and non-markdown targets', () => {
    for (const href of ['#section', 'image.png', 'file.pdf', 'page.html']) {
      expect(rewriteInternalLinks(a(href), current, set)).toBe(a(href))
    }
  })

  it('is case-sensitive on the extension target', () => {
    // set holds guide.md; a link to guide.MD must not match
    expect(rewriteInternalLinks(a('./guide.MD'), current, set)).toBe(a('./guide.MD'))
  })

  it('rewrites only the hits when a document mixes hit and miss links', () => {
    const html = `${a('./intro.md')}${a('./missing.md')}${a('https://x.com/a.md')}`
    const expected = `${a('./intro.html')}${a('./missing.md')}${a('https://x.com/a.md')}`
    expect(rewriteInternalLinks(html, current, set)).toBe(expected)
  })

  it('does not touch .md text outside <a href> (e.g. code or img src)', () => {
    const html = '<code>./intro.md</code> <img src="./intro.md">'
    expect(rewriteInternalLinks(html, current, set)).toBe(html)
  })
})
