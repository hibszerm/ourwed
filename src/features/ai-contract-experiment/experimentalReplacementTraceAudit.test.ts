/**
 * Replacement trace audit tests.
 * Run: npm run test:experimental-replacement-trace-audit
 */

import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import { buildContractGenerationInput } from './contractGenerationInput'
import { renderExperimentalDocx } from './experimentalDocxRenderer'
import {
  auditReplacementTraces,
  summarizeReplacementAudit,
} from './experimentalReplacementTraceAudit'
import {
  buildExperimentalPhysicalBindings,
} from './experimentalPhysicalBindings'
import { blocksFromPlainParagraphs } from './experimentService'
import { approveAllValidMappings } from './experimentalMappingApproval'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { validateStructuredMapping } from './mappingValidator'
import { analyzeContractForStructuredMapping } from './mockAdapters'
import type { Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function wedding(): Wedding {
  return {
    id: 'w-1',
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'contract',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      email: 'a@b.c',
      phone: '500600700',
      venue: 'X',
      city: 'Y',
    },
    packageId: 'pkg-1',
    packageName: 'Video',
    price: 10500,
    receptionLocation: 'Lwowska, 34-144 Izdebnik, Polska',
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {} as Wedding['questionnaires'],
    contract: {} as Wedding['contract'],
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: new Date().toISOString(),
  }
}

async function main() {
  const blocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
  const sourceBytes = await buildMinimalDocxFromParagraphs(nowiccyFixtureParagraphs())
  const generationInput = buildContractGenerationInput({
    wedding: wedding(),
    package: { id: 'pkg-1', name: 'Video' },
    currentDate: '27.07.2026 r.',
  })
  const { response } = await analyzeContractForStructuredMapping({
    blocks,
    packageName: 'Video',
    packageId: 'pkg-1',
  })
  const approved = approveAllValidMappings(
    validateStructuredMapping({ response, blocks, generationInput }),
  )
  const bindings = buildExperimentalPhysicalBindings({
    experimentRunId: 'run-1',
    mappings: approved,
    blocks,
    generationInput,
  })

  const rendered = await renderExperimentalDocx({
    sourceBytes,
    blocks,
    bindings,
  })
  const checks = auditReplacementTraces({
    bindings,
    traces: rendered.replacementTraces,
    resultingParagraphs: rendered.appliedParagraphs,
  })
  const summary = summarizeReplacementAudit(checks)
  assert(summary.allApplied, '19 every approved binding traced')
  assert(checks.every((c) => c.replacementApplied), '19 replacement applied')

  const pendingOnly = buildExperimentalPhysicalBindings({
    experimentRunId: 'run-2',
    mappings: validateStructuredMapping({ response, blocks, generationInput }),
    blocks,
    generationInput,
  })
  assert(pendingOnly.length === 0, '20 unapproved → no bindings')

  console.log('ok — experimentalReplacementTraceAudit')
}

void main()
