import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { writeFile, readFile } from 'node:fs/promises'
import { mermaidFallbackHtml, renderMermaid } from '../src/mermaid/render'
import { runMermaidCli } from '../src/mermaid/cli-runner'
import { createRenderer } from '../src/markdown/renderer'

vi.mock('../src/mermaid/cli-runner', () => ({
  runMermaidCli: vi.fn(),
}))

const mockedRunMermaidCli = vi.mocked(runMermaidCli)

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
    expect(html).not.toContain('class="shiki')
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

describe('renderMermaid', () => {
  beforeEach(() => {
    mockedRunMermaidCli.mockReset()
  })

  it('renders successful Mermaid CLI output as inline SVG figures', async () => {
    mockedRunMermaidCli.mockImplementation(async (_inputPath, outputPath) => {
      await writeFile(outputPath, '<svg><text>Rendered</text></svg>', 'utf8')
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await renderMermaid(['graph TD; A-->B;'])

    expect(result.html).toEqual(['<figure class="mermaid"><svg><text>Rendered</text></svg></figure>'])
    expect(result.warnings).toEqual([])
  })

  it('passes theme Mermaid config to the temporary config file', async () => {
    let configFileContent = ''
    mockedRunMermaidCli.mockImplementation(async (_inputPath, outputPath, configPath) => {
      configFileContent = await readFile(configPath, 'utf8')
      await writeFile(outputPath, '<svg></svg>', 'utf8')
      return { code: 0, stdout: '', stderr: '' }
    })

    await renderMermaid(['graph TD; A-->B;'], { theme: 'base', themeVariables: { primaryColor: '#fff' } })

    expect(JSON.parse(configFileContent)).toEqual({ theme: 'base', themeVariables: { primaryColor: '#fff' } })
  })

  it('falls back only the diagram whose Mermaid CLI render fails', async () => {
    mockedRunMermaidCli
      .mockImplementationOnce(async (_inputPath, outputPath) => {
        await writeFile(outputPath, '<svg><text>One</text></svg>', 'utf8')
        return { code: 0, stdout: '', stderr: '' }
      })
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Parse error on line 1' })

    const result = await renderMermaid(['graph TD; A-->B;', 'graph TD; invalid @@@'])

    expect(result.html[0]).toContain('<figure class="mermaid"><svg><text>One</text></svg></figure>')
    expect(result.html[1]).toContain('class="mermaid-fallback"')
    expect(result.html[1]).toContain('invalid @@@')
    expect(result.warnings).toEqual([
      'Warning: Mermaid diagram 2 failed to render; showing source fallback.\nParse error on line 1',
    ])
  })

  it('falls back all diagrams when Mermaid CLI infrastructure cannot start', async () => {
    mockedRunMermaidCli.mockRejectedValueOnce(new Error('spawn mmdc ENOENT'))

    const result = await renderMermaid(['graph TD; A-->B;', 'graph TD; C-->D;'])

    expect(result.html).toHaveLength(2)
    expect(result.html.every((html) => html.includes('class="mermaid-fallback"'))).toBe(true)
    expect(result.warnings).toEqual([
      'Warning: Mermaid renderer could not start; showing source fallback for 2 diagrams.\nspawn mmdc ENOENT',
    ])
  })

  it('treats missing browser errors as renderer infrastructure failure', async () => {
    mockedRunMermaidCli.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Could not find Chrome' })

    const result = await renderMermaid(['graph TD; A-->B;', 'graph TD; C-->D;'])

    expect(result.html).toHaveLength(2)
    expect(result.html.every((html) => html.includes('class="mermaid-fallback"'))).toBe(true)
    expect(result.warnings).toEqual([
      'Warning: Mermaid renderer could not start; showing source fallback for 2 diagrams.\nCould not find Chrome',
    ])
  })
})
