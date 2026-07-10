import { readFileSync, writeFileSync, realpathSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { basename, extname, resolve, join, relative, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { convert } from './convert'
import { loadTheme, listThemes } from './themes'
import type { Theme, TocMode } from './types'
import { assembleDocument } from './assemble'
import { buildFontFaceCss } from './fonts'
import { buildKatexCss } from './math/katex-css'
import { rewriteInternalLinks } from './links'

const MD_EXT = /\.(md|markdown)$/i

const USAGE = `md2html — render Markdown to a self-contained, beautiful HTML file

Usage:
  md2html <input.md> [options]
  md2html <a.md> <b.md> ... [options]   Convert several files at once
  md2html <folder> [options]            Convert every .md/.markdown under <folder> recursively

Options:
  -o, --output <path>   Output file (single file input) or output directory
                        (multiple inputs / folder input). Defaults to alongside
                        each source file.
      --theme <name>    Theme to use (default: gpt)
      --toc <mode>      TOC placement: auto | sidebar | topbar | none (default: auto)
      --embed-fonts     Inline the theme's fonts into the HTML
      --list-themes     List available themes and exit
  -h, --help            Show this help
`

export async function run(argv: string[]): Promise<number> {
  let values
  let positionals: string[]
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        theme: { type: 'string', default: 'gpt' },
        toc: { type: 'string', default: 'auto' },
        output: { type: 'string', short: 'o' },
        'embed-fonts': { type: 'boolean', default: false },
        'list-themes': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
    values = parsed.values
    positionals = parsed.positionals
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`)
    return 1
  }

  const TOC_MODES: readonly TocMode[] = ['auto', 'sidebar', 'topbar', 'none']
  const tocMode = values.toc as string
  if (!TOC_MODES.includes(tocMode as TocMode)) {
    process.stderr.write(`Error: invalid --toc value "${tocMode}". Expected one of: ${TOC_MODES.join(', ')}\n`)
    return 1
  }

  if (values['list-themes']) {
    process.stdout.write(listThemes().join('\n') + '\n')
    return 0
  }
  if (values.help || positionals.length === 0) {
    process.stdout.write(USAGE)
    return values.help ? 0 : 1
  }

  const inputPaths = positionals

  let theme
  try {
    theme = loadTheme(values.theme as string)
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`)
    return 1
  }

  const embedFonts = values['embed-fonts'] as boolean
  if (embedFonts && theme.fonts.length === 0) {
    process.stderr.write(`Warning: theme "${theme.name}" has no embeddable fonts; using system fonts.\n`)
  }

  // Expand each input into its source files. A directory contributes every
  // Markdown file beneath it (mirroring root = the directory); a plain file
  // contributes itself (mirroring root = its parent, so it lands alongside).
  let sawDirectory = false
  const sources: { file: string; root: string }[] = []
  for (const inputPath of inputPaths) {
    let stats
    try {
      stats = statSync(inputPath)
    } catch {
      process.stderr.write(`Error: cannot read input "${inputPath}"\n`)
      return 1
    }
    if (stats.isDirectory()) {
      sawDirectory = true
      const root = resolve(inputPath)
      const files = collectMarkdown(root)
      if (files.length === 0) {
        process.stderr.write(`Error: no .md or .markdown files found under "${inputPath}"\n`)
        return 1
      }
      for (const file of files) sources.push({ file, root })
    } else {
      const file = resolve(inputPath)
      sources.push({ file, root: dirname(file) })
    }
  }

  // The converted set spans every source, so cross-file .md links between the
  // listed inputs are rewritten. A lone file maps only to itself, so its links
  // to unlisted files stay untouched (nothing to point them at).
  const convertedSet = new Set(sources.map((s) => s.file))
  const output = values.output as string | undefined
  // --output names a file only for a single plain-file input; otherwise it is
  // an output directory (mirroring each source under it).
  const singleFile = inputPaths.length === 1 && !sawDirectory

  let failures = 0
  for (const { file, root } of sources) {
    const outputPath = singleFile && output
      ? resolve(output)
      : join(output ? resolve(output) : root, relative(root, file).replace(MD_EXT, '') + '.html')
    if (!(await convertFile(file, outputPath, theme, embedFonts, convertedSet, tocMode as TocMode))) {
      failures++
    }
  }

  if (sources.length > 1) {
    const converted = sources.length - failures
    process.stdout.write(`Converted ${converted}/${sources.length} file(s) with theme "${theme.name}".\n`)
  }
  return failures > 0 ? 1 : 0
}

/** Convert one Markdown file, writing the HTML to outputPath. Returns true on success. */
async function convertFile(
  inputPath: string,
  outputPath: string,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
  tocMode: TocMode,
): Promise<boolean> {
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch {
    process.stderr.write(`Error: cannot read input file "${inputPath}"\n`)
    return false
  }

  const html = await renderMarkdown(raw, inputPath, theme, embedFonts, convertedSet, tocMode)
  try {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, html, 'utf8')
  } catch (err) {
    process.stderr.write(`Error: cannot write output file "${outputPath}": ${(err as Error).message}\n`)
    return false
  }

  process.stdout.write(`Wrote ${outputPath}\n`)
  return true
}

/** Recursively collect Markdown file paths under dir, skipping dotfolders. */
function collectMarkdown(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectMarkdown(full))
    } else if (entry.isFile() && MD_EXT.test(entry.name)) {
      out.push(full)
    }
  }
  return out.sort()
}

/** Parse + assemble a single Markdown string into a complete HTML document. */
async function renderMarkdown(
  raw: string,
  inputPath: string,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
  tocMode: TocMode,
): Promise<string> {
  const { metadata, bodyHtml: rawBody, hasMath, lang, toc, warnings } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {}, tocMode)
  const bodyHtml = rewriteInternalLinks(rawBody, resolve(inputPath), convertedSet)
  const fmTitle = typeof metadata.title === 'string' ? metadata.title : undefined
  const title = fmTitle ?? basename(inputPath, extname(inputPath))

  const fontFaceCss = embedFonts && theme.fonts.length > 0 ? buildFontFaceCss(theme) : ''
  // KaTeX assets are embedded only when the document actually uses math, so
  // non-math documents stay byte-for-byte unchanged. Independent of
  // --embed-fonts (which governs the theme's text fonts).
  const katexCss = hasMath ? buildKatexCss() : ''

  for (const warning of warnings) {
    process.stderr.write(`${warning}\n`)
  }

  return assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang, toc, tocMode })
}

// Auto-run only when executed directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`Error: ${(err as Error).message}\n`)
      process.exit(1)
    })
}
