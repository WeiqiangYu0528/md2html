import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../src/cli'

vi.mock('../src/mermaid/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/mermaid/render')>()
  return {
    ...actual,
    renderMermaid: vi.fn(async (sources: string[]) => ({
      html: sources.map((source) => actual.mermaidFallbackHtml(source)),
      warnings: ['Warning: Mermaid diagram 1 failed to render; showing source fallback.\nParse error'],
    })),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'md2html-'))
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

describe('cli run()', () => {
  it('converts a Markdown file to a self-contained HTML file', async () => {
    const input = tmpFile('note.md', '# Title\n\nHello *world*.')
    const code = await run([input])
    expect(code).toBe(0)
    const out = input.replace(/\.md$/, '.html')
    expect(existsSync(out)).toBe(true)
    const html = readFileSync(out, 'utf8')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<body class="theme-claude">')
    expect(html).toContain('<style>')
  })

  it('writes to an explicit --output path', async () => {
    const input = tmpFile('a.md', '# x')
    const out = input.replace(/a\.md$/, 'custom.html')
    const code = await run([input, '-o', out])
    expect(code).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  it('returns 1 for a missing input file', async () => {
    expect(await run(['/no/such/file.md'])).toBe(1)
  })

  it('returns 1 for an unknown theme', async () => {
    const input = tmpFile('b.md', '# x')
    expect(await run([input, '--theme', 'bogus'])).toBe(1)
  })

  it('lists themes and exits 0', async () => {
    expect(await run(['--list-themes'])).toBe(0)
  })

  it('embeds KaTeX CSS + fonts only when the document has math', async () => {
    const mathIn = tmpFile('m.md', 'Euler: $e^{i\\pi}+1=0$.')
    expect(await run([mathIn])).toBe(0)
    const mathHtml = readFileSync(mathIn.replace(/\.md$/, '.html'), 'utf8')
    expect(mathHtml).toContain('class="katex"')
    expect(mathHtml).toContain('data:font/woff2;base64,')

    const plainIn = tmpFile('p.md', '# Just prose\n\nNo math here.')
    expect(await run([plainIn])).toBe(0)
    const plainHtml = readFileSync(plainIn.replace(/\.md$/, '.html'), 'utf8')
    expect(plainHtml).not.toContain('data:font/woff2;base64,')
  })

  it('sets <html lang="zh"> for a Chinese document and en for English', async () => {
    const zhIn = tmpFile('zh.md', '# 标题\n\n这是一篇用于测试的中文文档，内容足够多以触发语言检测。')
    expect(await run([zhIn])).toBe(0)
    const zhHtml = readFileSync(zhIn.replace(/\.md$/, '.html'), 'utf8')
    expect(zhHtml).toContain('<html lang="zh">')

    const enIn = tmpFile('en.md', '# Title\n\nThis is an ordinary English document.')
    expect(await run([enIn])).toBe(0)
    const enHtml = readFileSync(enIn.replace(/\.md$/, '.html'), 'utf8')
    expect(enHtml).toContain('<html lang="en">')
  })

  it('includes a TOC for a multi-heading document and omits it for a short one', async () => {
    const longIn = tmpFile('toc.md', '# Doc\n\n## Alpha\n\n## Beta\n\n## Gamma\n\ntext')
    expect(await run([longIn])).toBe(0)
    const longHtml = readFileSync(longIn.replace(/\.md$/, '.html'), 'utf8')
    expect(longHtml).toContain('<nav class="toc"')

    const shortIn = tmpFile('short.md', '# Doc\n\n## Only one\n\ntext')
    expect(await run([shortIn])).toBe(0)
    const shortHtml = readFileSync(shortIn.replace(/\.md$/, '.html'), 'utf8')
    expect(shortHtml).not.toContain('<nav class="toc"')
  })

  it('prints Mermaid renderer warnings to stderr while still writing HTML', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const input = tmpFile('diagram.md', '```mermaid\ngraph TD; bad\n```')

    const code = await run([input])

    expect(code).toBe(0)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Warning: Mermaid diagram 1 failed to render'))
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('class="mermaid-fallback"')
  })
})
