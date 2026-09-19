/**
 * Phase 2J.3 CRM isolation file kept as thin redirect to shared successor checks.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2J.3 CRM isolation', () => {
  it('opaque mobile root', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/background:\s*var\(--surface-primary/)
    expect(mobile).toContain('overflow: hidden')
  })
})
