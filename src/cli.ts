import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { convert } from './convert'
import { loadTheme, listThemes } from './themes'
import { assembleDocument } from './assemble'
import { buildFontFaceCss } from './fonts'
import { buildKatexCss } from './math/katex-css'

const USAGE = `md2html — render Markdown to a self-contained, beautiful HTML file

Usage:
  md2html <input.md> [options]

Options:
  -o, --output <path>   Output file (default: <input>.html next to source)
      --theme <name>    Theme to use (default: claude)
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
        theme: { type: 'string', default: 'claude' },
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

  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch {
    process.stderr.write(`Error: cannot read input file "${inputPath}"\n`)
    return 1
  }

  const { metadata, bodyHtml, hasMath, lang, toc } = await convert(raw, theme.shikiTheme)
  const fmTitle = typeof metadata.title === 'string' ? metadata.title : undefined
  const title = fmTitle ?? basename(inputPath, extname(inputPath))

  let fontFaceCss = ''
  if (values['embed-fonts']) {
    if (theme.fonts.length === 0) {
      process.stderr.write(`Warning: theme "${theme.name}" has no embeddable fonts; using system fonts.\n`)
    } else {
      fontFaceCss = buildFontFaceCss(theme)
    }
  }

  // KaTeX assets are embedded only when the document actually uses math, so
  // non-math documents stay byte-for-byte unchanged. Independent of
  // --embed-fonts (which governs the theme's text fonts).
  const katexCss = hasMath ? buildKatexCss() : ''

  const html = assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang, toc })

  const outputPath = (values.output as string) ?? resolve(inputPath.replace(/\.md$/i, '') + '.html')
  try {
    writeFileSync(outputPath, html, 'utf8')
  } catch (err) {
    process.stderr.write(`Error: cannot write output file "${outputPath}": ${(err as Error).message}\n`)
    return 1
  }

  process.stdout.write(`Wrote ${outputPath}\n`)
  return 0
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
