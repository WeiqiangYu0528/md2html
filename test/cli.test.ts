import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
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
    expect(html).toContain('<body class="theme-gpt">')
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

  it('rejects an invalid --toc value with exit 1', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const input = tmpFile('bad.md', '# x\n\n## a\n\n## b\n\n## c')
    expect(await run([input, '--toc', 'bogus'])).toBe(1)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('auto'))
  })

  it('--toc none omits the TOC even with many headings', async () => {
    const input = tmpFile('n.md', '# Doc\n\n## A\n\n## B\n\n## C\n\ntext')
    expect(await run([input, '--toc', 'none'])).toBe(0)
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).not.toContain('<nav class="toc"')
  })

  it('--toc sidebar forces the TOC and adds the sidebar body class', async () => {
    const input = tmpFile('sb.md', '# Doc\n\n## Only\n\ntext')
    expect(await run([input, '--toc', 'sidebar'])).toBe(0)
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('<nav class="toc"')
    expect(html).toContain('toc-sidebar')
  })

  it('--toc topbar adds the topbar body class', async () => {
    const input = tmpFile('tb.md', '# Doc\n\n## Only\n\ntext')
    expect(await run([input, '--toc', 'topbar'])).toBe(0)
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('toc-topbar')
  })
})

describe('cli run() — multiple file inputs', () => {
  function tmpFiles(...contents: string[]): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'md2html-multi-'))
    return contents.map((content, i) => {
      const p = join(dir, `f${i + 1}.md`)
      writeFileSync(p, content)
      return p
    })
  }

  it('converts every listed file, each alongside its source', async () => {
    const [a, b, c] = tmpFiles('# A', '# B', '# C')
    const code = await run([a, b, c])
    expect(code).toBe(0)
    for (const f of [a, b, c]) {
      expect(existsSync(f.replace(/\.md$/, '.html'))).toBe(true)
    }
  })

  it('routes multiple files into an --output directory', async () => {
    const [a, b] = tmpFiles('# A', '# B')
    const out = mkdtempSync(join(tmpdir(), 'md2html-multi-out-'))
    const code = await run([a, b, '-o', out])
    expect(code).toBe(0)
    expect(existsSync(join(out, 'f1.html'))).toBe(true)
    expect(existsSync(join(out, 'f2.html'))).toBe(true)
  })

  it('rewrites cross-file .md links between listed files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'md2html-multi-links-'))
    const a = join(dir, 'a.md')
    const b = join(dir, 'b.md')
    writeFileSync(a, '# A\n\n[to b](./b.md)')
    writeFileSync(b, '# B\n\n[to a](./a.md)')
    const code = await run([a, b, '--theme', 'claude'])
    expect(code).toBe(0)
    expect(readFileSync(a.replace(/\.md$/, '.html'), 'utf8')).toContain('href="./b.html"')
    expect(readFileSync(b.replace(/\.md$/, '.html'), 'utf8')).toContain('href="./a.html"')
  })

  it('returns 1 when any listed file is missing, before converting', async () => {
    const [a] = tmpFiles('# A')
    expect(await run([a, '/no/such/file.md'])).toBe(1)
  })

  it('reports a converted count for multiple inputs', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const [a, b] = tmpFiles('# A', '# B')
    expect(await run([a, b])).toBe(0)
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Converted 2/2 file(s)'))
  })
})

describe('cli run() — folder input', () => {
  function tmpTree(): string {
    const root = mkdtempSync(join(tmpdir(), 'md2html-tree-'))
    mkdirSync(join(root, 'sub', 'deep'), { recursive: true })
    writeFileSync(join(root, 'root.md'), '# Root\n\nHello.')
    writeFileSync(join(root, 'sub', 'a.markdown'), '# Sub A\n\ntext')
    writeFileSync(join(root, 'sub', 'deep', 'd.md'), '# Deep\n\ntext')
    writeFileSync(join(root, 'sub', 'skip.txt'), 'not markdown')
    return root
  }

  it('recursively converts every .md/.markdown in place, mirroring the tree', async () => {
    const root = tmpTree()
    const code = await run([root, '--theme', 'claude'])
    expect(code).toBe(0)
    expect(existsSync(join(root, 'root.html'))).toBe(true)
    expect(existsSync(join(root, 'sub', 'a.html'))).toBe(true)
    expect(existsSync(join(root, 'sub', 'deep', 'd.html'))).toBe(true)
    // Non-markdown files are left untouched (no .html sibling).
    expect(existsSync(join(root, 'sub', 'skip.html'))).toBe(false)
    expect(readFileSync(join(root, 'root.html'), 'utf8')).toContain('<body class="theme-claude">')
  })

  it('writes the mirrored tree under --output when given an output directory', async () => {
    const root = tmpTree()
    const out = mkdtempSync(join(tmpdir(), 'md2html-out-'))
    const code = await run([root, '-o', out])
    expect(code).toBe(0)
    expect(existsSync(join(out, 'root.html'))).toBe(true)
    expect(existsSync(join(out, 'sub', 'deep', 'd.html'))).toBe(true)
    // Source tree is not polluted with output when --output is set.
    expect(existsSync(join(root, 'root.html'))).toBe(false)
  })

  it('returns 1 for a folder with no Markdown files', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'md2html-empty-'))
    expect(await run([empty])).toBe(1)
  })
})

describe('cli run() — internal link rewriting', () => {
  it('rewrites .md links between converted files, keeps unconverted and external links', async () => {
    const root = mkdtempSync(join(tmpdir(), 'md2html-links-'))
    mkdirSync(join(root, 'sub'), { recursive: true })
    writeFileSync(
      join(root, 'a.md'),
      '# A\n\n[to b](./sub/b.md) [missing](./nope.md) [ext](https://x.com/y.md) [anchor](#top)',
    )
    writeFileSync(join(root, 'sub', 'b.md'), '# B\n\n[back to a](../a.md)')

    const code = await run([root, '--theme', 'claude'])
    expect(code).toBe(0)

    const aHtml = readFileSync(join(root, 'a.html'), 'utf8')
    expect(aHtml).toContain('href="./sub/b.html"')      // converted → rewritten
    expect(aHtml).toContain('href="./nope.md"')          // not converted → unchanged
    expect(aHtml).toContain('href="https://x.com/y.md"') // external → unchanged
    expect(aHtml).toContain('href="#top"')               // anchor → unchanged

    const bHtml = readFileSync(join(root, 'sub', 'b.html'), 'utf8')
    expect(bHtml).toContain('href="../a.html"')          // ../ traversal into converted set
  })

  it('leaves .md links untouched for a single-file conversion', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'md2html-single-'))
    writeFileSync(join(dir, 'sibling.md'), '# Sibling')
    const input = join(dir, 'main.md')
    writeFileSync(input, '# Main\n\n[to sibling](./sibling.md)')

    const code = await run([input, '--theme', 'claude'])
    expect(code).toBe(0)

    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('href="./sibling.md"') // single-file mode → not rewritten
  })
})
