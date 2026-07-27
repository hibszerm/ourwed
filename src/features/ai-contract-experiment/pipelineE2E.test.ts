/**
 * Phase 3 pipeline end-to-end tests — graph → plan → render → audit.
 * Run: npm run test:pipeline-e2e
 */

import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE, nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { analyzeContractForStructuredMapping } from './mockAdapters'
import { validateStructuredMapping } from './mappingValidator'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { buildRenderPlan, isPlanExecutable } from './pipeline/buildRenderPlan'
import {
  approveAllAutoOccurrences,
  approveOccurrence,
  ignoreOccurrence,
  setOccurrenceCustomReplacement,
} from './pipeline/graphReviewActions'
import { evaluateGraphReadiness } from './pipeline/planReadiness'
import { executeRenderPlan } from './pipeline/executeRenderPlan'
import { auditRenderPlan } from './pipeline/auditRenderPlan'
import { supplementOccurrenceMappings } from './supplementalOccurrenceDetection'
import { createMappingId } from './mappingId'
import type { ContractGenerationInput } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

const TEST_RUN_ID = 'run-pipeline-e2e'

const generationInput: ContractGenerationInput = {
  currentDate: '02.02.2027 r.',
  weddingDate: '24.07.2027 r.',
  clients: [
    {
      id: 'c1',
      firstName: 'Michał',
      lastName: 'Nowicki',
      fullName: 'Michał Nowicki',
      address: 'os. Piastowskie 5/9, 61-136 Poznań',
      phone: '502 118 774',
    },
    {
      id: 'c2',
      firstName: 'Julia',
      lastName: 'Nowicka',
      fullName: 'Julia Nowicka',
    },
  ],
  locations: {
    reception: 'Lwowska, 34-144 Izdebnik, Polska',
  },
  finances: {
    contractValue: 6000,
    contractValueFormatted: '6 000 zł',
    contractValueWords: 'sześć tysięcy złotych',
    depositAmount: 0,
    depositAmountFormatted: '0 zł',
    depositAmountWords: 'zero złotych',
    remainingAmount: 6000,
    remainingAmountFormatted: '6 000 zł',
    remainingAmountWords: 'sześć tysięcy złotych',
    payments: [],
  },
  package: { id: 'pkg', name: 'Video' },
}

async function main() {
  const blocks = blocksFromPlainParagraphs([
    ...nowiccyFixtureParagraphs(),
    NOWICCY_FIXTURE.clientContactCell,
    NOWICCY_FIXTURE.para37Remuneration,
  ])

  const { response } = await analyzeContractForStructuredMapping({
    blocks,
    packageName: 'Video',
    packageId: 'pkg',
  })

  const validatedBase = validateStructuredMapping({
    response,
    blocks,
    generationInput,
    experimentRunId: TEST_RUN_ID,
  }).map((m) => ({
    ...m,
    id:
      m.id ??
      createMappingId({
        experimentRunId: TEST_RUN_ID,
        fieldKey: m.fieldKey,
        blockId: m.blockId,
        start: m.start,
        end: m.end,
      }),
  }))

  const supplemented = supplementOccurrenceMappings({
    mappings: validatedBase,
    blocks,
    generationInput,
    experimentRunId: TEST_RUN_ID,
  })

  let graph = buildOccurrenceGraphFromMappings({
    experimentRunId: TEST_RUN_ID,
    mappings: supplemented,
    blocks,
    generationInput,
    supplement: false,
  })

  assert(graph.occurrences.length >= 7, 'graph has Nowiccy occurrences')

  const prose = graph.occurrences.find(
    (o) =>
      o.fieldKey === 'reception_location' &&
      o.replacementStrategy === 'CUSTOM_TEXT_REQUIRED',
  )
  assert(!!prose, 'inflected reception prose detected')

  graph = approveAllAutoOccurrences(graph)
  assertEq(evaluateGraphReadiness(graph), 'needs_review', 'blocked until custom text')

  graph = setOccurrenceCustomReplacement({
    graph,
    occurrenceId: prose!.id,
    value: 'Izdebniku',
  })
  graph = approveOccurrence({ graph, occurrenceId: prose!.id })

  const plan = buildRenderPlan(graph)
  assert(isPlanExecutable(plan), 'plan executable after custom approval')
  assertEq(evaluateGraphReadiness(graph), 'ready', 'graph ready')

  const readyOps = plan.operations.filter((op) => op.status === 'READY')
  assert(readyOps.length >= 6, 'ready operations count')
  for (const op of readyOps) {
    assert(op.replacementText.trim().length > 0, `operation ${op.operationId} has replacementText`)
  }

  const paragraphTexts = blocks.map((b) => b.text)
  const sourceBytes = await buildMinimalDocxFromParagraphs(paragraphTexts)
  const rendered = await executeRenderPlan({
    plan,
    sourceBytes,
    blocks,
  })

  const audit = auditRenderPlan({
    plan,
    sourceBlocks: blocks,
    outputParagraphs: rendered.appliedParagraphs,
    replacementTraces: rendered.replacementTraces,
  })
  assert(
    rendered.executedOperationIds.length === readyOps.length,
    'all ready operations executed',
  )
  assert(audit.replacementChecks?.every((c) => c.replacementApplied) ?? false, 'audit confirms replacements')

  const ignoredGraph = ignoreOccurrence({
    graph: buildOccurrenceGraphFromMappings({
      experimentRunId: TEST_RUN_ID,
      mappings: supplemented,
      blocks,
      generationInput,
      supplement: false,
    }),
    occurrenceId: prose!.id,
  })
  const ignoredPlan = buildRenderPlan(ignoredGraph)
  assert(
    ignoredPlan.operations.some((op) => op.status === 'SKIPPED'),
    'ignored occurrence skipped in plan',
  )

  console.log('ok — pipelineE2E')
}

void main()
