/**
 * Structured mapping schema validation tests.
 * Run: npm run test:ai-contract-mapping-schema
 */

import { EXPERIMENT_DYNAMIC_FIELD_KEYS } from './fieldRegistry'
import { parseStructuredMappingResponse } from './structuredMappingSchema'
import {
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V2,
  type StructuredAiMappingResponse,
} from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function validResponse(): StructuredAiMappingResponse {
  return {
    responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V2,
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: {
        physicalMode: 'composite',
        expectedPersonCount: 2,
      },
    },
    fields: [
      {
        fieldKey: 'couple_full_names',
        blockId: 'para-0',
        exactValue: 'Anna i Jan',
        evidenceText: 'Zamawiający: Anna i Jan',
        contextBefore: 'Zamawiający: ',
        contextAfter: '',
        semanticRole: 'client',
        confidence: 'high',
        reasoning: 'labeled client',
        pairedFieldGroup: null,
      },
    ],
    unsupportedValues: [],
    immutableFindings: [],
    warnings: [],
  }
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
  await run('valid response accepted', () => {
    const parsed = parseStructuredMappingResponse(validResponse())
    assert(parsed.ok, 'should parse')
    assert(parsed.ok && parsed.response.fields.length === 1, 'one field')
  })

  await run('invented key rejected', () => {
    const raw = {
      ...validResponse(),
      fields: [
        {
          ...validResponse().fields[0],
          fieldKey: 'totally_made_up',
        },
      ],
    }
    const parsed = parseStructuredMappingResponse(raw)
    assert(!parsed.ok, 'must reject')
    if (!parsed.ok) {
      assert(parsed.reason.includes('invented_field_key'), parsed.reason)
    }
  })

  await run('malformed response rejected', () => {
    const parsed = parseStructuredMappingResponse({ fields: [] })
    assert(!parsed.ok, 'missing assessment')
  })

  await run('missing required JSON property rejected', () => {
    const raw = { ...validResponse() }
    delete (raw as { warnings?: unknown }).warnings
    const parsed = parseStructuredMappingResponse(raw)
    assert(!parsed.ok, 'missing warnings')
  })

  await run('field key enum matches allowlist', () => {
    for (const key of EXPERIMENT_DYNAMIC_FIELD_KEYS) {
      const raw = {
        ...validResponse(),
        fields: [{ ...validResponse().fields[0]!, fieldKey: key }],
      }
      const parsed = parseStructuredMappingResponse(raw)
      assert(parsed.ok, `key ${key} should be accepted`)
    }
  })

  console.log('\nAll structured mapping schema tests passed.')
}

main().catch(() => process.exit(1))
