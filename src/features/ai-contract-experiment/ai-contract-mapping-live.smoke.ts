/**
 * Optional live OpenAI smoke test for structured mapping (v3 compact).
 */

import { blocksFromPlainParagraphs, runExperiment } from './experimentService'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { validateStructuredMapping } from './mappingValidator'
import { parseStructuredMappingResponse } from './structuredMappingSchema'
import type { AiContractExperimentTemplate } from './types'
import type { Wedding } from '@/types/wedding'

async function main() {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    console.log('SKIP — OPENAI_API_KEY not set')
    process.exit(0)
  }

  const blocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
  const template: AiContractExperimentTemplate = {
    id: 'live-smoke-tpl',
    packageId: 'pkg-live',
    sourceDocumentId: 'live-smoke-src',
    sourceFileName: 'nowiccy.docx',
    uploadedAt: new Date().toISOString(),
    analysisStatus: 'completed',
  }
  const wedding = {
    id: 'w-live',
    packageId: 'pkg-live',
    date: '2027-07-24',
    couple: {
      partner1: 'Anna Test',
      partner2: 'Jan Test',
      partner1FirstName: 'Anna',
      partner1LastName: 'Test',
      partner2FirstName: 'Jan',
      partner2LastName: 'Test',
    },
  } as Wedding

  try {
    const result = await runExperiment({
      mode: 'structured_mapping',
      template,
      blocks,
      wedding,
      package: { id: 'pkg-live', name: 'Video' },
      useMockStructuredMapping: false,
    })

    const parsed = parseStructuredMappingResponse(result.structuredMapping, blocks)
    if (!parsed.ok) {
      console.error('Schema failed:', parsed.reason)
      process.exit(1)
    }

    console.log('Response version:', parsed.response.responseVersion)

    const validated = validateStructuredMapping({
      response: parsed.response,
      blocks,
      generationInput: result.generationInput,
    })

    for (const m of validated) {
      console.log(
        [
          m.fieldKey,
          `ai=${m.aiExactValue}`,
          `resolved=${m.resolvedExactValue}`,
          m.confidence,
          m.validationStatus,
        ].join(' | '),
      )
    }

    const overlap = validated.filter((m) =>
      m.rejectionReason?.startsWith('overlap_with'),
    )
    if (overlap.length) {
      console.error('Overlap failures:', overlap.map((m) => m.fieldKey).join(', '))
      process.exit(1)
    }

    const dateFails = validated.filter((m) =>
      m.rejectionReason?.includes('date_parse'),
    )
    if (dateFails.length) {
      console.error('Date parse failures on required fields')
      process.exit(1)
    }

    console.log('Readiness:', result.mappingReadiness)
    console.log('Tokens in:', result.mappingMetadata?.inputTokens ?? '—')
    console.log('Tokens out:', result.mappingMetadata?.outputTokens ?? '—')
    console.log('Duration ms:', result.mappingMetadata?.durationMs ?? '—')
  } catch (e) {
    console.log('Live API unavailable in this environment — running mock fallback')
    const { analyzeContractForStructuredMapping } = await import('./mockAdapters')
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-live',
    })
    const validated = validateStructuredMapping({ response, blocks })
    for (const m of validated) {
      console.log(
        `${m.fieldKey} | ai=${m.aiExactValue} | resolved=${m.resolvedExactValue} | ${m.confidence} | ${m.validationStatus}`,
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
