import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('math rendering', () => {
  it('renders inline $…$ as KaTeX wrapped in <eq>', () => {
    const html = md.render('Pythagoras: $a^2 + b^2 = c^2$.')
    expect(html).toContain('<eq>')
    expect(html).toContain('class="katex"')
  })

  it('renders display $$…$$ as a <section><eqn> with katex-display', () => {
    const html = md.render('$$\\int_0^1 x^2\\,dx = \\tfrac13$$')
    expect(html).toContain('<eqn>')
    expect(html).toContain('katex-display')
  })

  it('supports backslash delimiters \\( \\) and \\[ \\]', () => {
    const inline = md.render('Inline \\(x+1\\) here.')
    expect(inline).toContain('<eq>')
    expect(inline).toContain('class="katex"')

    // texmath block rules always render display mode, so \[…\] is true display math
    const display = md.render('\\[ y = mx + b \\]')
    expect(display).toContain('<eqn>')
    expect(display).toContain('katex-display')
  })

  it('does NOT render math inside inline code or code fences', () => {
    const code = md.render('Use `$x$` literally, not math.')
    expect(code).not.toContain('class="katex"')
    expect(code).toContain('<code>')

    const fence = md.render('```\n$a^2$\n```')
    expect(fence).not.toContain('class="katex"')
  })

  it('does not throw on invalid LaTeX; emits a flagged error span', () => {
    const html = md.render('Broken: $\\frac{1}{$')
    expect(html).toContain('<eq>') // wrapper still emitted
    expect(html).toContain('katex-error')
  })
})
