import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../src/cli'

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
})
