import { readFileSync, writeFileSync, realpathSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { basename, extname, resolve, join, relative, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { convert } from './convert'
import { loadTheme, listThemes } from './themes'
import type { Theme } from './types'
import { assembleDocument } from './assemble'
import { buildFontFaceCss } from './fonts'
import { buildKatexCss } from './math/katex-css'
import { rewriteInternalLinks } from './links'

const MD_EXT = /\.(md|markdown)$/i

const USAGE = `md2html — render Markdown to a self-contained, beautiful HTML file

Usage:
  md2html <input.md> [options]
  md2html <folder> [options]    Convert every .md/.markdown under <folder> recursively

Options:
  -o, --output <path>   Output file (single input) or output directory (folder input).
                        Defaults to alongside each source file.
      --theme <name>    Theme to use (default: gpt)
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

  if (values['list-themes']) {
    process.stdout.write(listThemes().join('\n') + '\n')
    return 0
  }
  if (values.help || positionals.length === 0) {
    process.stdout.write(USAGE)
    return values.help ? 0 : 1
  }

  const inputPath = positionals[0]

  let theme
  try {
    theme = loadTheme(values.theme as string)
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`)
    return 1
  }

  let stats
  try {
    stats = statSync(inputPath)
  } catch {
    process.stderr.write(`Error: cannot read input "${inputPath}"\n`)
    return 1
  }

  const embedFonts = values['embed-fonts'] as boolean
  if (embedFonts && theme.fonts.length === 0) {
    process.stderr.write(`Warning: theme "${theme.name}" has no embeddable fonts; using system fonts.\n`)
  }

  if (stats.isDirectory()) {
    return runDirectory(inputPath, values.output as string | undefined, theme, embedFonts)
  }

  // Single-file mode: the converted set is just this file, so cross-file .md
  // links are never rewritten (a link to another file has no .html to point to).
  const convertedSet = new Set([resolve(inputPath)])
  return runSingle(inputPath, values.output as string | undefined, theme, embedFonts, convertedSet)
}

/** Convert one Markdown file, writing the HTML to outputPath. Returns 0 on success. */
async function runSingle(
  inputPath: string,
  output: string | undefined,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
): Promise<number> {
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch {
    process.stderr.write(`Error: cannot read input file "${inputPath}"\n`)
    return 1
  }

  const outputPath = output ?? resolve(inputPath.replace(MD_EXT, '') + '.html')
  const html = await renderMarkdown(raw, inputPath, theme, embedFonts, convertedSet)
  try {
    writeFileSync(outputPath, html, 'utf8')
  } catch (err) {
    process.stderr.write(`Error: cannot write output file "${outputPath}": ${(err as Error).message}\n`)
    return 1
  }

  process.stdout.write(`Wrote ${outputPath}\n`)
  return 0
}

/**
 * Convert every .md/.markdown under inputDir recursively. The output tree mirrors
 * the source tree: a file at <inputDir>/sub/a.md becomes <outDir>/sub/a.html, where
 * outDir is --output (created if needed) or inputDir itself when --output is absent.
 */
async function runDirectory(
  inputDir: string,
  output: string | undefined,
  theme: Theme,
  embedFonts: boolean,
): Promise<number> {
  const root = resolve(inputDir)
  const outRoot = output ? resolve(output) : root
  const files = collectMarkdown(root)
  // collectMarkdown already returns absolute paths (join on a resolved root),
  // so this set matches what rewriteInternalLinks resolves link targets to.
  const convertedSet = new Set(files)

  if (files.length === 0) {
    process.stderr.write(`Error: no .md or .markdown files found under "${inputDir}"\n`)
    return 1
  }

  let failures = 0
  for (const file of files) {
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      process.stderr.write(`Error: cannot read input file "${file}"\n`)
      failures++
      continue
    }
    const outputPath = join(outRoot, relative(root, file).replace(MD_EXT, '') + '.html')
    const html = await renderMarkdown(raw, file, theme, embedFonts, convertedSet)
    try {
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, html, 'utf8')
    } catch (err) {
      process.stderr.write(`Error: cannot write output file "${outputPath}": ${(err as Error).message}\n`)
      failures++
      continue
    }
    process.stdout.write(`Wrote ${outputPath}\n`)
  }

  const converted = files.length - failures
  process.stdout.write(`Converted ${converted}/${files.length} file(s) with theme "${theme.name}".\n`)
  return failures > 0 ? 1 : 0
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
): Promise<string> {
  const { metadata, bodyHtml: rawBody, hasMath, lang, toc, warnings } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {})
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

  return assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang, toc })
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
