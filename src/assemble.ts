import type { Theme } from './types'

export interface AssembleInput {
  title: string
  bodyHtml: string
  theme: Theme
  /** Visible <h1> header; rendered only when present (from frontmatter title). */
  headerTitle?: string
  /** Inlined @font-face declarations (from --embed-fonts). */
  fontFaceCss?: string
}

export function assembleDocument(input: AssembleInput): string {
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '' } = input
  const header = headerTitle
    ? `<header class="md-header"><h1>${escapeHtml(headerTitle)}</h1></header>\n`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontFaceCss}${fontFaceCss ? '\n' : ''}${theme.css}
</style>
</head>
<body class="theme-${theme.name}">
<article class="md-content">
${header}${bodyHtml}
</article>
</body>
</html>
`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
