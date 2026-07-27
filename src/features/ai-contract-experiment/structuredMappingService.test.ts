/**
 * Client-side structured mapping service helpers (mocked paths).
 * Run: npm run test:ai-contract-mapping-service
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseStructuredMappingResponse } from './structuredMappingSchema'
import { EXPERIMENT_FIELD_REGISTRY } from './fieldRegistry'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

async function main() {
  await run('completed response metadata shape is safe', () => {
    const metadata = {
      model: 'gpt-4.1-mini',
      requestCount: 1,
      inputTokens: 1200,
      outputTokens: 400,
      durationMs: 3400,
      responseId: 'resp_test',
      promptVersion: '2026-07-v1',
    }
    assert(!JSON.stringify(metadata).includes('sk-'), 'no secret in metadata')
    assert(metadata.model.length > 0, 'model present')
  })

  await run('refusal-like payload rejected by schema parser', () => {
    const parsed = parseStructuredMappingResponse({ documentAssessment: {} })
    assert(!parsed.ok, 'invalid payload rejected')
  })

  await run('registry keys closed on client', () => {
    const keys = new Set(EXPERIMENT_FIELD_REGISTRY.map((f) => f.key))
    assert(keys.has('couple_full_names'), 'has couple')
    assert(!keys.has('client_party_identity' as never), 'no invented alias')
  })

  await run('API client module graph avoids openai import', () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        'src/features/ai-contract-experiment/structuredMappingApi.ts',
      ),
      'utf8',
    )
    assert(src.includes('runLiveStructuredMapping'), 'export exists')
    assert(!src.includes('OPENAI_API_KEY'), 'no key in source')
    assert(!src.includes("from 'openai'"), 'no openai import')
  })

  console.log('\nStructured mapping service tests passed.')
}

main().catch(() => process.exit(1))
