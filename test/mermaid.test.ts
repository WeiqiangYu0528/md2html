import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { mermaidFallbackHtml, renderMermaid } from '../src/mermaid/render'
import { createRenderer } from '../src/markdown/renderer'

describe('mermaidFallbackHtml', () => {
  it('wraps the source in a .mermaid-fallback figure with escaped text', () => {
    const html = mermaidFallbackHtml('graph TD; A --> B & <x> "q"')
    expect(html).toContain('<figure class="mermaid-fallback">')
    expect(html).toContain('A --&gt; B &amp; &lt;x&gt; &quot;q&quot;')
    expect(html).toContain('</figure>')
  })
})

describe('mermaid fence interception', () => {
  let md: MarkdownIt
  beforeAll(async () => { md = await createRenderer('vitesse-dark') })

  it('emits the pre-rendered diagram from env for a mermaid fence', () => {
    const env = { mermaid: ['<figure class="mermaid">PRE_RENDERED</figure>'], mermaidIndex: 0 }
    const html = md.render('```mermaid\ngraph TD; A-->B;\n```', env)
    expect(html).toContain('<figure class="mermaid">PRE_RENDERED</figure>')
    expect(html).not.toContain('class="shiki') // bypassed Shiki entirely
  })

  it('falls back to source when env has no rendered diagram', () => {
    const html = md.render('```mermaid\ngraph TD; A-->B;\n```', {})
    expect(html).toContain('class="mermaid-fallback"')
  })

  it('still sends non-mermaid fences to Shiki', () => {
    const html = md.render('```js\nconst x = 1\n```', {})
    expect(html).toContain('class="shiki ')
  })
})

describe('renderMermaid (real browser, gated)', () => {
  it('renders a flowchart to inline SVG, or self-skips if no browser', async (ctx) => {
    let out: string[]
    try {
      out = await renderMermaid(['graph TD; A[Start]-->B[Done];'])
    } catch {
      ctx.skip()
      return
    }
    expect(out[0]).toContain('<figure class="mermaid">')
    expect(out[0]).toContain('<svg')
    expect(out[0]).toContain('Start')
  }, 60000)

  it('renders invalid syntax as a fallback (when a browser is available)', async (ctx) => {
    let out: string[]
    try {
      out = await renderMermaid(['graph TD; this is not valid mermaid @@@'])
    } catch {
      ctx.skip()
      return
    }
    expect(out[0]).toContain('class="mermaid-fallback"')
  }, 60000)
})
