import { resolve, dirname } from 'node:path'

const MD_EXT = /\.(md|markdown)$/i
// A URL scheme (http:, mailto:, etc.) — leave those alone.
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

/**
 * Rewrite relative Markdown links to their .html equivalents, but only when the
 * link's resolved target is a file in this conversion run (convertedSet). Every
 * other href — external, absolute, in-page anchor, non-markdown, or a relative
 * .md whose target is not being converted — is left byte-for-byte unchanged.
 *
 * @param html the rendered body HTML
 * @param currentFile absolute path of the source .md file being rendered
 * @param convertedSet resolved absolute paths of every source file in this run
 */
export function rewriteInternalLinks(
  html: string,
  currentFile: string,
  convertedSet: Set<string>,
): string {
  const baseDir = dirname(currentFile)
  return html.replace(/(<a\b[^>]*?\shref=")([^"]*)(")/gi, (match, pre, href, post) => {
    const rewritten = rewriteHref(href, baseDir, convertedSet)
    return rewritten === undefined ? match : `${pre}${rewritten}${post}`
  })
}

/** Returns the rewritten href value, or undefined to leave the original unchanged. */
function rewriteHref(href: string, baseDir: string, convertedSet: Set<string>): string | undefined {
  if (!href) return undefined
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('//')) return undefined
  if (HAS_SCHEME.test(href)) return undefined

  // Split off the first #fragment or ?query, preserving it verbatim.
  const suffixIdx = firstSuffixIndex(href)
  const path = suffixIdx === -1 ? href : href.slice(0, suffixIdx)
  const suffix = suffixIdx === -1 ? '' : href.slice(suffixIdx)

  if (!MD_EXT.test(path)) return undefined

  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return undefined
  }

  const target = resolve(baseDir, decoded)
  if (!convertedSet.has(target)) return undefined

  const newPath = path.replace(MD_EXT, '.html')
  return `${newPath}${suffix}`
}

function firstSuffixIndex(href: string): number {
  const hash = href.indexOf('#')
  const query = href.indexOf('?')
  if (hash === -1) return query
  if (query === -1) return hash
  return Math.min(hash, query)
}
