import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

describe('package dependency model', () => {
  it('uses local Mermaid CLI dependencies instead of direct Playwright rendering', () => {
    expect(pkg.dependencies['@mermaid-js/mermaid-cli']).toBe('^11.15.0')
    expect(pkg.dependencies.puppeteer).toBe('^24.43.1')
    expect(pkg.dependencies.playwright).toBeUndefined()
  })
})
