function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Fallback HTML for a diagram that could not be rendered (no browser, or invalid
 * Mermaid syntax): the source shown as a code block. The theme styles
 * `.mermaid-fallback` (and may add a "not rendered" note).
 */
export function mermaidFallbackHtml(source: string): string {
  return `<figure class="mermaid-fallback"><pre><code>${escapeHtml(source)}</code></pre></figure>`
}
