/**
 * Immutable audit tests.
 * Run: npm run test:experimental-immutable-audit
 */

import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import { buildContractGenerationInput } from './contractGenerationInput'
import { auditExperimentalImmutable } from './experimentalImmutableAudit'
import { renderExperimentalDocx } from './experimentalDocxRenderer'
import { auditReplacementTraces } from './experimentalReplacementTraceAudit'
import { buildExperimentalPhysicalBindings } from './experimentalPhysicalBindings'
import { blocksFromPlainParagraphs } from './experimentService'
import { approveAllValidMappings } from './experimentalMappingApproval'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { validateStructuredMapping } from './mappingValidator'
import { analyzeContractForStructuredMapping } from './mockAdapters'
import { readExperimentStore } from './experimentStorage'
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
  const bindings = buildExperimentalPhysicalBindings({
    experimentRunId: 'run-1',
    mappings: approveAllValidMappings(
      validateStructuredMapping({ response, blocks, generationInput }),
    ),
    blocks,
    generationInput,
  })
  const rendered = await renderExperimentalDocx({ sourceBytes, blocks, bindings })
  const replacementChecks = auditReplacementTraces({
    bindings,
    traces: rendered.replacementTraces,
    resultingParagraphs: rendered.appliedParagraphs,
  })

  const audit = auditExperimentalImmutable({
    sourceBlocks: blocks,
    outputParagraphs: rendered.appliedParagraphs,
    bindings,
    replacementTraces: rendered.replacementTraces,
    replacementChecks,
  })
  assert(audit.status === 'safe' || audit.status === 'warning', 'immutable safe/warning')

  const tampered = rendered.appliedParagraphs.map((p) =>
    p.text.includes('FilmGrafia')
      ? { ...p, text: p.text.replace('FilmGrafia', 'HackerStudio') }
      : p,
  )
  const critical = auditExperimentalImmutable({
    sourceBlocks: blocks,
    outputParagraphs: tampered,
    bindings,
  })
  assert(critical.status === 'critical', '23 critical blocks download')

  const store = readExperimentStore()
  assert(!JSON.stringify(store).includes('activeContract'), '24 no production writes')

  console.log('ok — experimentalImmutableAudit')
}

void main()
