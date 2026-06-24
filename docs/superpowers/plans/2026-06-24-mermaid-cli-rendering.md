# Mermaid CLI Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-written Playwright Mermaid rendering with a local Mermaid CLI renderer that normally produces inline SVG and falls back per diagram with clear warnings.

**Architecture:** Mermaid rendering becomes a small build-time pipeline around the local `@mermaid-js/mermaid-cli` dependency. `renderMermaid()` writes each diagram to a temp `.mmd`, invokes local `mmdc`, reads the generated SVG, and returns both rendered HTML and warnings. `convert()` carries those warnings to the CLI, and `cli.run()` prints them to stderr while still producing self-contained HTML.

**Tech Stack:** TypeScript ESM, Node child process APIs, `@mermaid-js/mermaid-cli@11.15.0`, `puppeteer@24.43.1`, markdown-it, Vitest, tsup.

---

## Preflight requirement

Run implementation in a clean isolated worktree. The main checkout currently has an unrelated `package-lock.json` modification; do not include that pre-existing diff. The dependency task intentionally updates `package.json` and `package-lock.json`, but it should start from a clean lockfile state in the implementation worktree.

## File structure

- Modify: `package.json` — replace direct `playwright` dependency with local Mermaid CLI renderer dependencies.
- Modify: `package-lock.json` — dependency graph update from npm install/uninstall.
- Modify: `tsup.config.ts` — keep Mermaid CLI/Puppeteer external so the built CLI resolves installed package files at runtime.
- Create: `src/mermaid/cli-runner.ts` — resolve and invoke local `mmdc` through Node, never global PATH.
- Modify: `src/mermaid/render.ts` — temp-file rendering, per-diagram fallback, infrastructure fallback, warning text.
- Modify: `src/convert.ts` — collect Mermaid warnings and return them with converted HTML.
- Modify: `src/cli.ts` — print Mermaid warnings to stderr.
- Create: `test/package.test.ts` — dependency invariants.
- Create: `test/mermaid-cli-runner.test.ts` — local `mmdc` resolution and argument construction.
- Modify: `test/mermaid.test.ts` — renderer unit tests with mocked local CLI runner.
- Modify: `test/convert.test.ts` — new renderer return shape and warning propagation.
- Modify: `test/cli.test.ts` — stderr warning output.

---

### Task 1: Dependency model

**Files:**
- Create: `test/package.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsup.config.ts`

- [ ] **Step 1: Write the failing dependency invariant test**

Create `test/package.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

describe('package dependency model', () => {
  it('uses local Mermaid CLI dependencies instead of direct Playwright rendering', () => {
    expect(pkg.dependencies['@mermaid-js/mermaid-cli']).toBe('^11.15.0')
    expect(pkg.dependencies.puppeteer).toBe('^24.43.1')
    expect(pkg.dependencies.playwright).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npm test -- test/package.test.ts --test-timeout=60000
```

Expected: FAIL because `@mermaid-js/mermaid-cli` and `puppeteer` are not dependencies yet, and `playwright` is still present.

- [ ] **Step 3: Update dependencies**

Run:

```bash
npm uninstall playwright
npm install @mermaid-js/mermaid-cli@11.15.0 puppeteer@24.43.1
```

This intentionally updates both `package.json` and `package-lock.json`.

- [ ] **Step 4: Keep Mermaid CLI external in the build**

Replace `tsup.config.ts` with:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: false,
  external: ['@mermaid-js/mermaid-cli', 'puppeteer'],
  banner: { js: '#!/usr/bin/env node' },
})
```

- [ ] **Step 5: Run the dependency test to verify it passes**

Run:

```bash
npm test -- test/package.test.ts --test-timeout=60000
```

Expected: PASS.

- [ ] **Step 6: Commit dependency changes**

Run:

```bash
git add package.json package-lock.json tsup.config.ts test/package.test.ts
git commit -m "Switch Mermaid rendering dependencies to Mermaid CLI"
```

---

### Task 2: Local Mermaid CLI runner

**Files:**
- Create: `src/mermaid/cli-runner.ts`
- Create: `test/mermaid-cli-runner.test.ts`

- [ ] **Step 1: Write the failing runner tests**

Create `test/mermaid-cli-runner.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest'
import { buildMmdcArgs, resolveMmdcCli } from '../src/mermaid/cli-runner'

describe('Mermaid CLI runner helpers', () => {
  it('resolves the local Mermaid CLI entrypoint from dependencies', () => {
    const cli = resolveMmdcCli()
    expect(cli).toMatch(/@mermaid-js[/\\]mermaid-cli[/\\]src[/\\]cli\.js$/)
  })

  it('builds mmdc arguments for SVG rendering with theme config', () => {
    expect(buildMmdcArgs('/deps/mmdc/src/cli.js', '/tmp/in.mmd', '/tmp/out.svg', '/tmp/config.json')).toEqual([
      '/deps/mmdc/src/cli.js',
      '-i',
      '/tmp/in.mmd',
      '-o',
      '/tmp/out.svg',
      '-c',
      '/tmp/config.json',
    ])
  })
})
```

- [ ] **Step 2: Run the runner tests to verify they fail**

Run:

```bash
npm test -- test/mermaid-cli-runner.test.ts --test-timeout=60000
```

Expected: FAIL because `src/mermaid/cli-runner.ts` does not exist.

- [ ] **Step 3: Implement the local CLI runner**

Create `src/mermaid/cli-runner.ts` with this content:

```ts
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export interface MermaidCliResult {
  code: number | null
  stdout: string
  stderr: string
}

export function resolveMmdcCli(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@mermaid-js/mermaid-cli')), 'cli.js')
}

export function buildMmdcArgs(cliPath: string, inputPath: string, outputPath: string, configPath: string): string[] {
  return [cliPath, '-i', inputPath, '-o', outputPath, '-c', configPath]
}

export function runMermaidCli(inputPath: string, outputPath: string, configPath: string): Promise<MermaidCliResult> {
  const child = spawn(process.execPath, buildMmdcArgs(resolveMmdcCli(), inputPath, outputPath, configPath), {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}
```

- [ ] **Step 4: Run the runner tests to verify they pass**

Run:

```bash
npm test -- test/mermaid-cli-runner.test.ts --test-timeout=60000
```

Expected: PASS.

- [ ] **Step 5: Commit the runner boundary**

Run:

```bash
git add src/mermaid/cli-runner.ts test/mermaid-cli-runner.test.ts
git commit -m "Add local Mermaid CLI runner"
```

---

### Task 3: Mermaid renderer result model and fallback behavior

**Files:**
- Modify: `src/mermaid/render.ts`
- Modify: `test/mermaid.test.ts`

- [ ] **Step 1: Replace renderer tests with CLI-backed behavior tests**

Replace `test/mermaid.test.ts` with this content:

```ts
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
```

- [ ] **Step 2: Run renderer tests to verify they fail**

Run:

```bash
npm test -- test/mermaid.test.ts --test-timeout=60000
```

Expected: FAIL because `renderMermaid()` still returns `string[]` and still imports Playwright directly.

- [ ] **Step 3: Replace Playwright renderer with Mermaid CLI renderer**

Replace `src/mermaid/render.ts` with this content:

```ts
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

      const result = await runMermaidCli(inputPath, outputPath, configPath)
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
```

- [ ] **Step 4: Run renderer tests to verify they pass**

Run:

```bash
npm test -- test/mermaid.test.ts --test-timeout=60000
```

Expected: PASS.

- [ ] **Step 5: Commit renderer behavior**

Run:

```bash
git add src/mermaid/render.ts test/mermaid.test.ts
git commit -m "Render Mermaid through local CLI with fallback warnings"
```

---

### Task 4: Conversion warning propagation

**Files:**
- Modify: `src/convert.ts`
- Modify: `test/convert.test.ts`

- [ ] **Step 1: Update convert tests for renderer result and warnings**

In `test/convert.test.ts`, replace the existing Mermaid mock at the top with:

```ts
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
```

Then replace the Mermaid test block at the bottom of `test/convert.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run convert tests to verify they fail**

Run:

```bash
npm test -- test/convert.test.ts --test-timeout=60000
```

Expected: FAIL because `convert()` does not return `warnings` and still expects `renderMermaid()` to return `string[]`.

- [ ] **Step 3: Update `convert()` to return warnings**

Modify `src/convert.ts` so the interface and Mermaid block read:

```ts
export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
  /** Document language for <html lang> (frontmatter lang, else auto-detected). */
  lang: string
  /** Table-of-contents nav HTML, or '' when no TOC is generated. */
  toc: string
  /** Non-fatal conversion warnings to print from the CLI. */
  warnings: string[]
}
```

Then replace the Mermaid collection block in `convert()` with:

```ts
  const warnings: string[] = []
  const mermaidSources = tokens
    .filter((t) => t.type === 'fence' && t.info.trim() === 'mermaid')
    .map((t) => t.content)
  if (mermaidSources.length > 0) {
    try {
      const rendered = await renderMermaid(mermaidSources, mermaidConfig)
      env.mermaid = rendered.html
      warnings.push(...rendered.warnings)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const count = mermaidSources.length
      const noun = count === 1 ? 'diagram' : 'diagrams'
      env.mermaid = mermaidSources.map((s) => mermaidFallbackHtml(s))
      warnings.push(`Warning: Mermaid renderer could not start; showing source fallback for ${count} ${noun}.\n${message}`)
    }
    env.mermaidIndex = 0
  }
```

Finally replace the return statement with:

```ts
  return { metadata, bodyHtml, hasMath, lang, toc, warnings }
```

- [ ] **Step 4: Run convert tests to verify they pass**

Run:

```bash
npm test -- test/convert.test.ts --test-timeout=60000
```

Expected: PASS.

- [ ] **Step 5: Commit conversion warning propagation**

Run:

```bash
git add src/convert.ts test/convert.test.ts
git commit -m "Propagate Mermaid rendering warnings"
```

---

### Task 5: CLI warning output

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Update CLI tests to mock Mermaid warnings**

Replace the first import line in `test/cli.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
```

Add this mock after the imports:

```ts
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
```

Add this test before the final `})` in `test/cli.test.ts`:

```ts
  it('prints Mermaid renderer warnings to stderr while still writing HTML', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const input = tmpFile('diagram.md', '```mermaid\ngraph TD; bad\n```')

    const code = await run([input])

    expect(code).toBe(0)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Warning: Mermaid diagram 1 failed to render'))
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('class="mermaid-fallback"')
  })
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run:

```bash
npm test -- test/cli.test.ts --test-timeout=60000
```

Expected: FAIL because `run()` does not print `convert()` warnings.

- [ ] **Step 3: Print warnings from `run()`**

In `src/cli.ts`, replace:

```ts
  const { metadata, bodyHtml, hasMath, lang, toc } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {})
```

with:

```ts
  const { metadata, bodyHtml, hasMath, lang, toc, warnings } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {})
```

Then insert this block after the KaTeX CSS calculation and before `assembleDocument(...)`:

```ts
  for (const warning of warnings) {
    process.stderr.write(`${warning}\n`)
  }
```

- [ ] **Step 4: Run CLI tests to verify they pass**

Run:

```bash
npm test -- test/cli.test.ts --test-timeout=60000
```

Expected: PASS.

- [ ] **Step 5: Commit CLI warning output**

Run:

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Print Mermaid rendering warnings from CLI"
```

---

### Task 6: Gated real Mermaid CLI integration coverage

**Files:**
- Create: `test/mermaid-cli.integration.test.ts`

- [ ] **Step 1: Add a gated integration test**

Create `test/mermaid-cli.integration.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest'
import { renderMermaid } from '../src/mermaid/render'

describe.runIf(process.env.RUN_MERMAID_CLI_INTEGRATION === '1')('Mermaid CLI integration', () => {
  it('renders a real Mermaid flowchart to inline SVG', async () => {
    const result = await renderMermaid(['flowchart TD\n  A[Start] --> B[Done]'])

    expect(result.warnings).toEqual([])
    expect(result.html[0]).toContain('<figure class="mermaid">')
    expect(result.html[0]).toContain('<svg')
    expect(result.html[0]).toContain('Start')
    expect(result.html[0]).toContain('Done')
  }, 120000)
})
```

- [ ] **Step 2: Run the gated integration test in skipped mode**

Run:

```bash
npm test -- test/mermaid-cli.integration.test.ts --test-timeout=120000
```

Expected: PASS with the suite skipped because `RUN_MERMAID_CLI_INTEGRATION` is not set.

- [ ] **Step 3: Run the real integration test**

Run:

```bash
RUN_MERMAID_CLI_INTEGRATION=1 npm test -- test/mermaid-cli.integration.test.ts --test-timeout=120000
```

Expected: PASS with inline SVG output. If this fails with a Puppeteer browser-install error, fix the package dependency/install setup before continuing; do not add a Playwright workaround.

- [ ] **Step 4: Commit integration coverage**

Run:

```bash
git add test/mermaid-cli.integration.test.ts
git commit -m "Add gated Mermaid CLI integration test"
```

---

### Task 7: Full verification and sample rendering

**Files:**
- Verify generated HTML only; do not edit source unless a verification command fails.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test -- --test-timeout=120000
```

Expected: PASS. The gated integration test remains skipped unless `RUN_MERMAID_CLI_INTEGRATION=1` is set.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Render the user sample document**

Run:

```bash
node dist/cli.js \
  "/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.md" \
  -o "/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.html" \
  --theme gpt
```

Expected stdout:

```text
Wrote /Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.html
```

Expected stderr: empty for valid Mermaid diagrams.

- [ ] **Step 5: Confirm sample Mermaid diagrams rendered to SVG**

Run:

```bash
grep -n "figure class=\"mermaid\"\|figure class=\"mermaid-fallback\"" "/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.html"
```

Expected: at least one `figure class="mermaid"` match and no `figure class="mermaid-fallback"` matches for this sample.

- [ ] **Step 6: Commit verification-sensitive changes**

If no files changed during verification, skip this commit. If snapshots or sample fixtures changed in the repository, run:

```bash
git add <changed tracked files>
git commit -m "Verify Mermaid CLI rendering output"
```

Do not commit `/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.html` unless that repository is intentionally in scope for the implementation branch.

---

## Final verification checklist

Run these commands before reporting completion:

```bash
npm test -- --test-timeout=120000
npm run typecheck
npm run build
RUN_MERMAID_CLI_INTEGRATION=1 npm test -- test/mermaid-cli.integration.test.ts --test-timeout=120000
node dist/cli.js \
  "/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.md" \
  -o "/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.html" \
  --theme gpt
grep -n "figure class=\"mermaid\"\|figure class=\"mermaid-fallback\"" "/Users/connoryu/Downloads/workspace/hdmap-pipeline-engine2/docs/track_smoothing_adb_livox_rt6_ieout_wuge_flow.html"
```

Expected final state:

- `package.json` depends on `@mermaid-js/mermaid-cli` and `puppeteer`.
- `package.json` no longer depends on `playwright`.
- Mermaid SVG output is inlined into generated HTML.
- Failed diagrams still emit `.mermaid-fallback` blocks.
- Mermaid warnings are printed to stderr.
- The sample document renders Mermaid diagrams as SVG, not fallback.
