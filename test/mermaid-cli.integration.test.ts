import { describe, it, expect } from 'vitest'
import { renderMermaid } from '../src/mermaid/render'

describe.runIf(process.env.RUN_MERMAID_CLI_INTEGRATION === '1')('Mermaid CLI integration', () => {
  it('renders a real Mermaid flowchart to inline SVG', async () => {
    const result = await renderMermaid(['flowchart TD\n  A[Start] --> B[Done]'])

    expect(result.warnings).toEqual([])
    expect(result.html[0]).toContain('<figure class="mermaid">')
    expect(result.html[0]).toContain('<svg')
    expect(result.html[0]).toContain('Start')
    expect(result.html[0]).toContain('Done')
  }, 120000)
})
