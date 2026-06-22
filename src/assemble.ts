import type { Theme } from './types'
import { escapeHtml } from './escape'

export interface AssembleInput {
  title: string
  bodyHtml: string
  theme: Theme
  /** Visible <h1> header; rendered only when present (from frontmatter title). */
  headerTitle?: string
  /** Inlined @font-face declarations (from --embed-fonts). */
  fontFaceCss?: string
  /** Inlined KaTeX stylesheet (only when the document contains math). */
  katexCss?: string
  /** Document language for the <html lang> attribute (default "en"). */
  lang?: string
  /** Table-of-contents nav HTML, injected after the header (default ""). */
  toc?: string
}

export function assembleDocument(input: AssembleInput): string {
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '', katexCss = '', lang = 'en', toc = '' } = input
  const header = headerTitle
    ? `<header class="md-header"><h1>${escapeHtml(headerTitle)}</h1></header>\n`
    : ''
  const content = header
    ? `${header}${toc}${bodyHtml}`
    : insertTocAfterLeadingH1(bodyHtml, toc)
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontFaceCss}${fontFaceCss ? '\n' : ''}${katexCss}${katexCss ? '\n' : ''}${theme.css}
</style>
</head>
<body class="theme-${theme.scopeClass ?? theme.name}">
<article class="md-content">
${content}
</article>
</body>
</html>
`
}

function insertTocAfterLeadingH1(bodyHtml: string, toc: string): string {
  if (!toc) return bodyHtml
  const leadingH1 = bodyHtml.match(/^(\s*<h1\b[^>]*>[\s\S]*?<\/h1>\n?)/)
  if (!leadingH1) return `${toc}${bodyHtml}`
  return `${leadingH1[1]}${toc}${bodyHtml.slice(leadingH1[1].length)}`
}
