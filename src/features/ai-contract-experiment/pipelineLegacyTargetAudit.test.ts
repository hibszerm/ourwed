/**
 * Ensures v2 pipeline consumers read replacement targets via canonical accessors only.
 * Run: npm run test:pipeline-legacy-target-audit
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '.')
const ALLOWLIST = new Set([
  'validation/occurrenceAccessors.ts',
  'pipeline/buildOccurrenceGraph.ts',
  'pipeline/graphAdapters.ts',
  'mappingValidator.ts',
  'experimentalReviewState.ts',
  'types.ts',
  'pipelineLegacyTargetAudit.test.ts',
  'semanticValidationArchitecture.test.ts',
])

const FORBIDDEN = [
  /\boccurrence\.targetValue\b/,
  /\boccurrence\.replacementValue\b/,
  /\bmapping\.targetValue\b/,
  /\bmapping\.replacementValue\b/,
]

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(path, acc)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      acc.push(path)
    }
  }
  return acc
}

function main() {
  const violations: string[] = []
  for (const file of walk(ROOT)) {
    const rel = file.slice(ROOT.length + 1)
    if (ALLOWLIST.has(rel)) continue
    const content = readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN) {
      if (pattern.test(content)) {
        violations.push(`${rel}: ${pattern}`)
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Legacy target/replacement reads found:\n${violations.join('\n')}`,
    )
  }
  console.log('ok — pipelineLegacyTargetAudit')
}

main()
