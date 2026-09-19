/**
 * Phase 2J.3 scroll ownership under 2K.
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

describe('Assistant UX 2J.3 scroll ownership', () => {
  it('no settle scroll; transcript contains overscroll', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const scroll = readSrc(
      'src/features/assistant/components/assistantScroll.ts',
    )
    expect(surface).not.toContain('window.scrollTo')
    expect(scroll).not.toContain('window.scrollTo')
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('overscroll-behavior: contain')
  })
})
