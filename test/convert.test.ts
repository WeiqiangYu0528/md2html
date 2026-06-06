import { describe, it, expect } from 'vitest'
import { convert } from '../src/convert'

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
})
