/**
 * Determine a document's language for the `<html lang>` attribute.
 *
 * An explicit frontmatter `lang:` always wins. Otherwise we auto-detect by
 * comparing CJK ideographs to Latin letters: if at least 30% of the letters are
 * Chinese, the document reads as Chinese ('zh'). This ignores a few stray
 * Chinese names in an English document while catching genuinely Chinese or
 * heavily bilingual prose. Detection only ever yields 'zh' or 'en'.
 *
 * This is semantic metadata, not presentation — the theme owns all CJK styling.
 */
export function detectLang(content: string, metadata: Record<string, unknown>): string {
  if (typeof metadata.lang === 'string' && metadata.lang.trim() !== '') {
    return metadata.lang.trim()
  }
  const cjk = (content.match(/[一-鿿㐀-䶿]/g) ?? []).length
  const latin = (content.match(/[A-Za-z]/g) ?? []).length
  const total = cjk + latin
  if (cjk > 0 && total > 0 && cjk / total >= 0.3) return 'zh'
  return 'en'
}
