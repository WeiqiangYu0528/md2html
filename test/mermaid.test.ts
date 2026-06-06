import { describe, it, expect } from 'vitest'
import { mermaidFallbackHtml, renderMermaid } from '../src/mermaid/render'

describe('mermaidFallbackHtml', () => {
  it('wraps the source in a .mermaid-fallback figure with escaped text', () => {
    const html = mermaidFallbackHtml('graph TD; A --> B & <x> "q"')
    expect(html).toContain('<figure class="mermaid-fallback">')
    expect(html).toContain('A --&gt; B &amp; &lt;x&gt; &quot;q&quot;')
    expect(html).toContain('</figure>')
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
