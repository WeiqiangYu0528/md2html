import { describe, it, expect, vi } from 'vitest'
import { convert } from '../src/convert'

vi.mock('../src/mermaid/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/mermaid/render')>()
  return {
    ...actual,
    renderMermaid: vi.fn(async (sources: string[]) => ({
      html: sources.map((_s, i) => `<figure class="mermaid"><svg>MOCK${i}</svg></figure>`),
      warnings: [],
    })),
  }
})

describe('convert', () => {
  it('combines frontmatter parsing and rendering', async () => {
    const { metadata, bodyHtml } = await convert('---\ntitle: Doc\n---\n# Hi', 'vitesse-dark')
    expect(metadata.title).toBe('Doc')
    expect(bodyHtml).toContain('id="hi"')
  })

  it('renders a body with no frontmatter', async () => {
    const { metadata, bodyHtml } = await convert('Just **text**.', 'vitesse-dark')
    expect(metadata).toEqual({})
    expect(bodyHtml).toContain('<strong>text</strong>')
  })

  it('reports hasMath=true when the document contains math', async () => {
    const { hasMath } = await convert('Euler: $e^{i\\pi}+1=0$.', 'vitesse-dark')
    expect(hasMath).toBe(true)
  })

  it('reports hasMath=false when there is no math', async () => {
    const { hasMath } = await convert('Just **prose**, no math.', 'vitesse-dark')
    expect(hasMath).toBe(false)
  })

  it('reports hasMath=false when "math" only appears inside code', async () => {
    const { hasMath } = await convert('Inline `$x$` and a fence:\n\n```\n$y$\n```', 'vitesse-dark')
    expect(hasMath).toBe(false)
  })

  it('reports the detected language', async () => {
    const zh = await convert('这是一篇中文文档，用于测试语言检测。', 'vitesse-dark')
    expect(zh.lang).toBe('zh')
    const en = await convert('A plain English document.', 'vitesse-dark')
    expect(en.lang).toBe('en')
  })

  it('honors an explicit frontmatter lang', async () => {
    const { lang } = await convert('---\nlang: zh\n---\nMostly English body.', 'vitesse-dark')
    expect(lang).toBe('zh')
  })

  it('returns a TOC for a multi-heading document', async () => {
    const { toc } = await convert('## One\n\n## Two\n\n## Three', 'vitesse-dark')
    expect(toc).toContain('<nav class="toc"')
    expect(toc).toContain('<a href="#one">One</a>')
  })

  it('returns an empty toc for a short document', async () => {
    const { toc } = await convert('# Title\n\nBody only.', 'vitesse-dark')
    expect(toc).toBe('')
  })

  it('honors frontmatter toc:false', async () => {
    const { toc } = await convert('---\ntoc: false\n---\n## A\n\n## B\n\n## C', 'vitesse-dark')
    expect(toc).toBe('')
  })
})

describe('convert mermaid diagrams', () => {
  const md = '# T\n\n```mermaid\ngraph TD; A-->B;\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```'

  it('renders each mermaid block to a figure (in order)', async () => {
    const { bodyHtml } = await convert(md, 'vitesse-dark')
    expect(bodyHtml).toContain('<figure class="mermaid"><svg>MOCK0</svg></figure>')
    expect(bodyHtml).toContain('<figure class="mermaid"><svg>MOCK1</svg></figure>')
  })

  it('passes the mermaid config through to the renderer', async () => {
    const mod = await import('../src/mermaid/render')
    await convert('```mermaid\ngraph TD; A-->B;\n```', 'vitesse-dark', { theme: 'base' })
    expect(mod.renderMermaid).toHaveBeenCalledWith(expect.any(Array), { theme: 'base' })
  })

  it('returns Mermaid renderer warnings', async () => {
    const mod = await import('../src/mermaid/render')
    ;(mod.renderMermaid as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      html: ['<figure class="mermaid-fallback"><pre><code>graph TD; bad</code></pre></figure>'],
      warnings: ['Warning: Mermaid diagram 1 failed to render; showing source fallback.\nParse error'],
    })

    const { bodyHtml, warnings } = await convert('```mermaid\ngraph TD; bad\n```', 'vitesse-dark')

    expect(bodyHtml).toContain('class="mermaid-fallback"')
    expect(warnings).toEqual(['Warning: Mermaid diagram 1 failed to render; showing source fallback.\nParse error'])
  })

  it('falls back for every diagram when the renderer throws unexpectedly', async () => {
    const mod = await import('../src/mermaid/render')
    ;(mod.renderMermaid as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('unexpected renderer crash'))

    const { bodyHtml, warnings } = await convert('```mermaid\ngraph TD; A-->B;\n```', 'vitesse-dark')

    expect(bodyHtml).toContain('class="mermaid-fallback"')
    expect(warnings).toEqual([
      'Warning: Mermaid renderer could not start; showing source fallback for 1 diagram.\nunexpected renderer crash',
    ])
  })

  it('does not invoke the renderer when there are no diagrams', async () => {
    const mod = await import('../src/mermaid/render')
    ;(mod.renderMermaid as ReturnType<typeof vi.fn>).mockClear()
    await convert('# Just text\n\nNo diagrams here.', 'vitesse-dark')
    expect(mod.renderMermaid).not.toHaveBeenCalled()
  })
})
