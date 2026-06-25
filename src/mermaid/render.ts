import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escapeHtml } from '../escape'
import { runMermaidCli } from './cli-runner'

export interface MermaidRenderResult {
  html: string[]
  warnings: string[]
}

export function mermaidFallbackHtml(source: string): string {
  return `<figure class="mermaid-fallback"><pre><code>${escapeHtml(source)}</code></pre></figure>`
}

export async function renderMermaid(
  sources: string[],
  config: Record<string, unknown> = {},
): Promise<MermaidRenderResult> {
  const workDir = await mkdtemp(join(tmpdir(), 'md2html-mermaid-'))
  try {
    const configPath = join(workDir, 'mermaid-config.json')
    await writeFile(configPath, JSON.stringify(config), 'utf8')

    const html: string[] = []
    const warnings: string[] = []
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      const inputPath = join(workDir, `diagram-${i}.mmd`)
      const outputPath = join(workDir, `diagram-${i}.svg`)
      await writeFile(inputPath, source, 'utf8')

      const result = await runMermaidCli(inputPath, outputPath, configPath, `md2html-mermaid-${i}`)
      const output = cleanRendererOutput(result.stderr || result.stdout)
      if (result.code !== 0) {
        if (isRendererInfrastructureFailure(output)) {
          return infrastructureFallback(sources, output)
        }
        html.push(mermaidFallbackHtml(source))
        warnings.push(`Warning: Mermaid diagram ${i + 1} failed to render; showing source fallback.\n${output}`)
        continue
      }

      try {
        const svg = await readFile(outputPath, 'utf8')
        html.push(`<figure class="mermaid">${svg}</figure>`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        html.push(mermaidFallbackHtml(source))
        warnings.push(`Warning: Mermaid diagram ${i + 1} failed to render; showing source fallback.\n${message}`)
      }
    }

    return { html, warnings }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return infrastructureFallback(sources, message)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

function infrastructureFallback(sources: string[], message: string): MermaidRenderResult {
  const count = sources.length
  const noun = count === 1 ? 'diagram' : 'diagrams'
  return {
    html: sources.map((source) => mermaidFallbackHtml(source)),
    warnings: [`Warning: Mermaid renderer could not start; showing source fallback for ${count} ${noun}.\n${message}`],
  }
}

function cleanRendererOutput(output: string): string {
  return output.trim() || 'Mermaid CLI exited without an error message.'
}

function isRendererInfrastructureFailure(output: string): boolean {
  return /chrom(e|ium)|puppeteer|browser|spawn|enoent|executable/i.test(output)
}
