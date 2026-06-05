import matter from 'gray-matter'

export interface ParsedDocument {
  metadata: Record<string, unknown>
  content: string
}

/**
 * Split a raw Markdown string into YAML frontmatter metadata and body content.
 * Malformed frontmatter is tolerated: the whole input is treated as body.
 */
export function parseFrontmatter(raw: string): ParsedDocument {
  try {
    const { data, content } = matter(raw)
    return { metadata: data ?? {}, content }
  } catch {
    return { metadata: {}, content: raw }
  }
}
