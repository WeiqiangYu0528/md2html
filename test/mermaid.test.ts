import { describe, it, expect } from 'vitest'
import { mermaidFallbackHtml } from '../src/mermaid/render'

describe('mermaidFallbackHtml', () => {
  it('wraps the source in a .mermaid-fallback figure with escaped text', () => {
    const html = mermaidFallbackHtml('graph TD; A --> B & <x> "q"')
    expect(html).toContain('<figure class="mermaid-fallback">')
    expect(html).toContain('A --&gt; B &amp; &lt;x&gt; &quot;q&quot;')
    expect(html).toContain('</figure>')
  })
})
