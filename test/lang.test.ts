import { describe, it, expect } from 'vitest'
import { detectLang } from '../src/lang'

describe('detectLang', () => {
  it('detects predominantly Chinese content as zh', () => {
    expect(detectLang('这是一篇用中文写成的文章，讲述排版之美。', {})).toBe('zh')
  })

  it('detects English content as en', () => {
    expect(detectLang('This is an English document about typography.', {})).toBe('en')
  })

  it('treats heavily bilingual (>=30% CJK) content as zh', () => {
    // ~12 CJK chars vs ~16 latin letters -> ratio ~0.43 -> zh
    expect(detectLang('Markdown 转换为 HTML 的中文排版示例 demo', {})).toBe('zh')
  })

  it('treats English with a few stray Chinese characters as en', () => {
    expect(detectLang('A long English sentence that merely mentions 你好 once.', {})).toBe('en')
  })

  it('lets an explicit frontmatter lang override detection', () => {
    expect(detectLang('All English content here.', { lang: 'ja' })).toBe('ja')
  })

  it('returns en for empty / letter-free content (no divide-by-zero)', () => {
    expect(detectLang('   123 !!! ---', {})).toBe('en')
    expect(detectLang('', {})).toBe('en')
  })
})
