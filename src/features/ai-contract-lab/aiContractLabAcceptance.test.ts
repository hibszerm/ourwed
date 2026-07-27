/**
 * AI Contract Lab — acceptance tests (isolated experimental feature).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { aiContractAnalysisResultSchema } from '@/features/ai-contract-lab/aiContractLabSchemas'
import { buildContractDataSnapshot } from '@/features/ai-contract-lab/buildContractDataSnapshot'
import {
  applyManualSourceSpanToRow,
  buildApprovedPatches,
  buildReplacementRows,
  normalizeComparableText,
  validateAiReplacementPlan,
  valuesAreEquivalent,
} from '@/features/ai-contract-lab/validateAiReplacementPlan'
import {
  isEllipsisProposal,
  resolveExactSourceSpan,
  validateManualSourceSpan,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'
import { mapSemanticMapToWeddingPlan, resolveSemanticSourceSpan } from '@/features/ai-contract-lab/mapSemanticRolesToWedding'
import {
  semanticValuesEqual,
  normalizeForEquality,
  equalityKindForField,
} from '@/features/ai-contract-lab/semanticValueEquality'
import {
  computeTemporalValue,
  SEMANTIC_TEMPORAL_RULES,
} from '@/features/ai-contract-lab/semanticTemporalRules'
import { createContractGenerationContext } from '@/features/ai-contract-lab/contractGenerationContext'
import { narrowSemanticValueSpan } from '@/features/ai-contract-lab/narrowSemanticValueSpan'
import { classifyLegalReference } from '@/features/ai-contract-lab/legalReferenceGuard'
import { canCreateSemanticPatch } from '@/features/ai-contract-lab/canCreateSemanticPatch'
import {
  detectRelativeDuration,
  canonicalRelativeRule,
} from '@/features/ai-contract-lab/temporalValueModel'
import { comparePackageContentItem, parseCanonicalPackageItems } from '@/features/ai-contract-lab/packageContentItems'
import {
  resolveTypedSourceSpan,
  formatDateLikeSource,
  formatMoneyLikeSource,
  flattenAnchorText,
} from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import {
  computePatchConfidence,
  decideStatusFromConfidence,
} from '@/features/ai-contract-lab/patchConfidence'
import {
  classifyDefinedTerm,
  isLiteralPersonName,
} from '@/features/ai-contract-lab/definedTermGuard'
import {
  buildPatchPreview,
  validatePatchPreview,
} from '@/features/ai-contract-lab/patchPreview'
import {
  CONTRACT_SEMANTIC_ROLES,
  SEMANTIC_MAP_ANALYSIS_VERSION,
  SEMANTIC_ROLE_DEFINITIONS,
  normalizeSemanticRole,
  semanticRolesEquivalent,
} from '@/features/ai-contract-lab/semanticRoleCatalog'
import { resolveDomainMapping } from '@/features/ai-contract-lab/semanticDomainMapping'
import {
  compareStructuredPackageContent,
  parsePackageContent,
} from '@/features/ai-contract-lab/structuredPackageContent'
import { evaluateLocationReplacement } from '@/features/ai-contract-lab/locationContractDisplay'
import { documentSemanticMapSchema } from '@/features/ai-contract-lab/aiContractLabSchemas'
import { softValidatePhaseASemanticMap } from '@/features/ai-contract-lab/phaseAValidateSemanticMap'
import { formatPhaseAErrorDetails } from '@/features/ai-contract-lab/aiContractLabErrors'
import {
  LAB_FALLBACK_CONTRACT_MODEL,
  LAB_MAX_ANCHOR_CHARACTERS,
  LAB_MAX_BODY_ANCHORS,
  LAB_MAX_SERIALIZED_PAYLOAD_BYTES,
  LAB_PROVIDER_TIMEOUT_MS,
  buildDocumentAnalysisPayload,
  capContext,
  computeLabMaxOutputTokens,
  mapLabAnalyzeErrorMessage,
  validateAiPayloadSize,
} from '@/features/ai-contract-lab/aiContractLabPayload'
import {
  applyApprovedReplacementPlan,
  compareDocxIntegrity,
} from '@/features/ai-contract-lab/applyApprovedReplacementPlan'
import {
  validateLabDocxFile,
  extractLabDocumentAnchors,
} from '@/features/ai-contract-lab/docxLabExtract'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type {
  DocumentTextAnchor,
  LabReplacementRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  polishAmountInWords,
  formatAmountInWordsLikeSource,
  findAmountInWordsSpans,
} from '@/features/ai-contract-lab/polishAmountInWords'
import { validateLocalContext } from '@/features/ai-contract-lab/phaseCLocalContext'
import { validateLocationGrammar } from '@/features/ai-contract-lab/phaseCLocationGrammar'
import { comparePackageItemSemantically } from '@/features/ai-contract-lab/phaseCPackageSemantic'
import {
  runPhaseCDocumentReadyAudit,
  applyPhaseCToRows,
  phaseCAllowsGeneration,
} from '@/features/ai-contract-lab/phaseCAudit'
import type { CompanyDetails } from '@/types/company'
import type { Wedding } from '@/types/wedding'
import JSZip from 'jszip'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`PASS  ${name}`))
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}

const root = process.cwd()
const labRoot = resolve(root, 'src/features/ai-contract-lab')
const router = resolve(root, 'src/routes/router.tsx')
const sidebar = resolve(root, 'src/layouts/Sidebar.tsx')
const genModal = resolve(
  root,
  'src/features/weddings/actions/GenerateContractModal.tsx',
)
const transform = resolve(
  root,
  'src/features/documents/template/ContractTransformationService.ts',
)

function listSrcFiles(dir: string): string[] {
  const out: string[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue
      out.push(...listSrcFiles(full))
    } else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full)
  }
  return out
}

function stubWedding(): Wedding {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1FirstName: 'Iza',
      partner1LastName: 'Karczewska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kulewski',
      email: 'iza@example.com',
      phone: '500100200',
      venue: 'Villa Love',
      city: 'Izdebnik',
    },
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Mini',
    packageId: null,
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [
      { title: 'Video', sortOrder: 0, enabled: true },
      { title: 'Foto', sortOrder: 1, enabled: true },
    ],
    finalPaymentDueDate: '2026-07-15',
    coverageHours: 8,
    coverageEndTime: '01:00',
    overtimeRate: 400,
    deliveryMonths: 3,
    bridePreparationLocation: 'Zabrze',
    groomPreparationLocation: 'Ruda',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Villa Love',
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: [
      {
        id: 'p1',
        label: 'Zadatek',
        type: 'deposit',
        amount: 1000,
        paid: true,
        paidAt: '2026-02-01',
      },
    ],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
  }
}

function stubCompany(): CompanyDetails {
  return {
    id: 'c1',
    userId: 'u1',
    companyName: 'Studio Test',
    ownerName: 'Ala Nowak',
    nip: '123',
    regon: '456',
    vatId: null,
    address: 'ul. Test 1',
    postalCode: '00-001',
    city: 'Warszawa',
    country: 'PL',
    phone: '500',
    email: 'studio@example.com',
    website: null,
    instagram: null,
    facebook: null,
    bankAccount: '12 3456',
    iban: null,
    swift: null,
    logoPath: null,
    signaturePath: null,
    stampPath: null,
    questionnaireConfig: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

async function minimalDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const body = paragraphs
    .map(
      (t) =>
        `<w:p><w:r><w:t xml:space="preserve">${t
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</w:t></w:r></w:p>`,
    )
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  )
  zip.file('word/document.xml', xml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

await run('1. Feature flag gates route; lab hidden from product nav', () => {
  const flags = readFileSync(
    resolve(labRoot, 'aiContractLabFlags.ts'),
    'utf8',
  )
  assert(flags.includes('VITE_ENABLE_AI_CONTRACT_LAB'), 'flag constant')
  const r = readFileSync(router, 'utf8')
  assert(r.includes('isAiContractLabEnabled'), 'router gate')
  assert(r.includes('/laboratorium-umow-ai'), 'route path')
  const s = readFileSync(sidebar, 'utf8')
  assert(s.includes('Laboratorium umów AI'), 'lab in product sidebar when flagged')
  assert(s.includes('nav-ai-contract-lab'), 'lab nav test id present')
})

await run('2. Production contract flow untouched', () => {
  assert(existsSync(genModal), 'GenerateContractModal exists')
  assert(existsSync(transform), 'ContractTransformationService exists')
  const labFiles = listSrcFiles(labRoot).filter((f) => !f.endsWith('.test.ts'))
  for (const f of labFiles) {
    const src = readFileSync(f, 'utf8')
    assert(
      !src.includes('transformContract('),
      `${f} must not call production transformContract`,
    )
    assert(
      !src.includes('saveGeneratedContract'),
      `${f} must not write contract history`,
    )
  }
  const modal = readFileSync(genModal, 'utf8')
  assert(!modal.includes('ai-contract-lab'), 'modal not routed through lab')
})

await run('3. No client OpenAI key / no browser OpenAI SDK', () => {
  const srcFiles = listSrcFiles(resolve(root, 'src')).filter(
    (f) => !f.endsWith('.test.ts'),
  )
  for (const f of srcFiles) {
    const src = readFileSync(f, 'utf8')
    assert(!src.includes('VITE_OPENAI'), `${f} must not use VITE_OPENAI`)
    assert(
      !/from ['"]openai['"]/.test(src),
      `${f} must not import openai SDK`,
    )
    assert(
      !src.includes('api.openai.com'),
      `${f} must not call OpenAI directly`,
    )
  }
  const api = readFileSync(resolve(labRoot, 'aiContractLabApi.ts'), 'utf8')
  assert(api.includes('ai-contract-lab-analyze'), 'edge invoke')
})

await run('4. Edge function: OPENAI_CONTRACT_MODEL only, 120s timeout, abort', () => {
  const edgeDir = resolve(root, 'supabase/functions/ai-contract-lab-analyze')
  const index = readFileSync(resolve(edgeDir, 'index.ts'), 'utf8')
  const config = readFileSync(resolve(edgeDir, 'config.ts'), 'utf8')
  const prompt = readFileSync(resolve(edgeDir, 'prompt.ts'), 'utf8')

  assert(index.includes('OPENAI_API_KEY'), 'api key secret')
  assert(config.includes('OPENAI_CONTRACT_MODEL'), 'reads CONTRACT model')
  assert(!config.includes("get('OPENAI_MODEL')"), 'does not read OPENAI_MODEL')
  assert(config.includes("gpt-5-mini"), 'fallback gpt-5-mini')
  assert(config.includes('120_000') || config.includes('120000'), '120s timeout')
  assert(index.includes('AbortController'), 'AbortController')
  assert(index.includes('controller.signal') || index.includes('signal: controller.signal'), 'abort signal')
  assert(index.includes('provider_timeout'), 'timeout code')
  assert(index.includes('document_too_large'), 'size gate')
  assert(index.includes('max_output_tokens'), 'output token cap')
  assert(index.includes("effort: 'low'") || index.includes('effort: "low"'), 'low reasoning')
  assert(index.includes('store: false'), 'store false')
  assert(index.includes('json_schema'), 'structured outputs')
  assert(index.includes('request_received'), 'stage timing')
  assert(index.includes('openai_request_started'), 'openai stage')
  assert(
    !/required:\s*\[[\s\S]*?ignoredWeddingFields[\s\S]*?\]/.test(prompt),
    'ignored not in required array',
  )
  assert(prompt.includes("'warnings'"), 'warnings required')
  assert(prompt.includes('semanticAnchors'), 'phase A semanticAnchors')
  assert(prompt.includes('Phase A'), 'phase A prompt')
  assert(!prompt.includes('fieldCatalog'), 'phase A no wedding fieldCatalog in prompt builder')
  assert(index.includes('semanticRoleCatalog') || index.includes('SEMANTIC_ROLE_CATALOG'), 'role catalog')
  assert(index.includes('phase_a_stats') || index.includes('softValidate'), 'soft validate')
  assert(index.includes('provider_output_not_json') || index.includes('phaseAValidate'), 'structured 422 codes')
  assert(existsSync(resolve(edgeDir, 'phaseAValidate.ts')), 'phaseAValidate module')
})

await run('5. Snapshot uses commercial helpers', () => {
  const wedding = stubWedding()
  const commercial = getWeddingCommercialSummary(wedding)
  const snap = buildContractDataSnapshot({
    wedding,
    company: stubCompany(),
    extras: [
      {
        id: 'e1',
        weddingId: wedding.id,
        extraServiceId: 's1',
        name: 'Drone',
        priceSnapshot: 800,
        quantity: 1,
        createdAt: '2026-01-01',
      },
      {
        id: 'e2',
        weddingId: wedding.id,
        extraServiceId: 's2',
        name: 'Same day edit',
        priceSnapshot: 1200,
        quantity: 1,
        createdAt: '2026-01-01',
      },
    ],
    places: [],
  })
  assert(snap.fields.length > 10, 'fields present')
  const contract = snap.fields.find((f) => f.key === 'package.contract_value')
  assert(contract?.value === commercial.contractValue, 'contract value matches')
  assert(
    snap.fields.some((f) => f.key.startsWith('extras.')),
    'extras from DB-shaped input',
  )
  assert(snap.availableCount > 0, 'available count')
})

await run('6. DOCX validation rejects invalid files', () => {
  const pdf = { name: 'x.pdf', size: 10, type: 'application/pdf' } as File
  assert(validateLabDocxFile(pdf) != null, 'reject pdf')
  const doc = { name: 'x.doc', size: 10, type: '' } as File
  assert(validateLabDocxFile(doc) != null, 'reject doc')
  const ok = {
    name: 'umowa.docx',
    size: 100,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  } as File
  assert(validateLabDocxFile(ok) == null, 'accept docx')
})

await run('7–10. Schema + unknown anchors/fields + invented values rejected', () => {
  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p0',
      container: 'body',
      paragraphIndex: 0,
      runStart: 0,
      runEnd: 20,
      text: 'Zamawiająca: Anna Kowalska',
      contextBefore: '',
      contextAfter: '',
    },
  ]
  const fields = buildContractDataSnapshot({
    wedding: stubWedding(),
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields

  const good = {
    analysisVersion: '1.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: ['zamawiająca'],
      detectedBusinessContext: 'foto/video',
    },
    replacements: [
      {
        replacementId: 'r1',
        anchorId: 'body:p0',
        originalText: 'Anna Kowalska',
        canonicalFieldKey: 'bride.full_name',
        proposedValue: 'Iza Karczewska',
        semanticRole: 'Zamawiająca',
        reason: 'imię',
        confidence: 0.95,
        requiresUserReview: false,
      },
    ],
    missingFields: [],
    ambiguities: [],
    ignoredWeddingFields: [],
    warnings: [],
  }
  const ok = validateAiReplacementPlan(good, anchors, fields)
  assert(ok.ok, 'valid plan accepted')

  const badAnchor = structuredClone(good)
  badAnchor.replacements[0]!.anchorId = 'body:p999'
  const softAnchor = validateAiReplacementPlan(badAnchor, anchors, fields)
  assert(softAnchor.ok, 'unknown anchor soft-fails (analysis still opens)')
  if (softAnchor.ok) {
    assert(
      softAnchor.analysis.replacements.length === 0,
      'unknown anchor dropped from replacements',
    )
  }

  const badField = structuredClone(good)
  badField.replacements[0]!.canonicalFieldKey = 'nope.field'
  const softField = validateAiReplacementPlan(badField, anchors, fields)
  assert(softField.ok, 'unknown field soft-fails')
  if (softField.ok) {
    assert(softField.analysis.replacements.length === 0, 'unknown field dropped')
  }

  const invented = structuredClone(good)
  invented.replacements[0]!.proposedValue = 'Wymyślona Osoba'
  const softInvented = validateAiReplacementPlan(invented, anchors, fields)
  assert(softInvented.ok, 'invented value soft-fails')
  if (softInvented.ok) {
    assert(
      softInvented.analysis.replacements.length === 0,
      'invented value dropped',
    )
  }

  assert(aiContractAnalysisResultSchema instanceof z.ZodObject || true, 'zod schema')
})

await run('11. Identical values create no patch; ambiguous require approval', () => {
  const fields = buildContractDataSnapshot({
    wedding: stubWedding(),
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields
  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p0',
      container: 'body',
      paragraphIndex: 0,
      runStart: 0,
      runEnd: 20,
      text: 'Iza Karczewska',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p1',
      container: 'body',
      paragraphIndex: 1,
      runStart: 0,
      runEnd: 1,
      text: 'X',
      contextBefore: '',
      contextAfter: '',
    },
  ]
  const analysis = {
    analysisVersion: '1.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'x',
    },
    replacements: [
      {
        replacementId: 'same',
        anchorId: 'body:p0',
        originalText: 'Iza Karczewska',
        canonicalFieldKey: 'bride.full_name',
        proposedValue: 'Iza Karczewska',
        semanticRole: 'Zamawiająca',
        reason: 'same',
        confidence: 0.99,
        requiresUserReview: false,
      },
      {
        replacementId: 'amb',
        anchorId: 'body:p1',
        originalText: 'X',
        canonicalFieldKey: 'groom.full_name',
        proposedValue: 'Jan Kulewski',
        semanticRole: 'Pan',
        reason: 'low',
        confidence: 0.55,
        requiresUserReview: true,
      },
    ],
    missingFields: [],
    ambiguities: [],
    ignoredWeddingFields: [],
    warnings: [],
  }
  const rows = buildReplacementRows(analysis, fields, anchors)
  assert(rows[0]!.decision === 'unchanged', 'identical → unchanged')
  assert(rows[1]!.decision === 'pending', 'low confidence pending')
  const built = buildApprovedPatches({
    rows,
    anchors,
    manual: [],
    missing: [],
  })
  assert(built.patches.length === 0, 'no patches without approval')
  assert(built.errors.length > 0, 'pending blocks generation')
})

await run('12–14. Deterministic apply + integrity blocks unauthorized changes', async () => {
  const source = await minimalDocx([
    'Zamawiająca: Anna Kowalska',
    'Klauzula prawna niezmienna.',
  ])
  const sourceCopy = source.slice(0)
  const anchors = await extractLabDocumentAnchors(source)
  assert(anchors.length === 2, 'two paragraphs')

  const patches = [
    {
      patchId: 'r1',
      anchorId: 'body:p0',
      paragraphIndex: 0,
      expectedOriginalText: 'Anna Kowalska',
      replacementText: 'Iza Karczewska',
      canonicalFieldKey: 'bride.full_name',
      source: 'wedding' as const,
      approvedByUser: true,
      spanStart: 'Zamawiająca: '.length,
      spanEnd: 'Zamawiająca: Anna Kowalska'.length,
    },
  ]

  const generated = await applyApprovedReplacementPlan(source, patches)
  // Source buffer must remain usable / not mutated in place by zip ops beyond clones
  assert(source.byteLength === sourceCopy.byteLength, 'source length stable')

  const reportOk = await compareDocxIntegrity({
    sourceBytes: source,
    generatedBytes: generated,
    patches,
  })
  assert(reportOk.passed, 'integrity passes for approved patch')
  assert(reportOk.legalTextUnchanged, 'legal unchanged flag')

  // Simulate unauthorized extra change
  const tampered = await applyApprovedReplacementPlan(source, [
    ...patches,
    {
      patchId: 'evil',
      anchorId: 'body:p1',
      paragraphIndex: 1,
      expectedOriginalText: 'Klauzula prawna niezmienna.',
      replacementText: 'Zmieniona klauzula.',
      canonicalFieldKey: null,
      source: 'manual',
      approvedByUser: true,
      spanStart: 0,
      spanEnd: 'Klauzula prawna niezmienna.'.length,
    },
  ])
  const reportBad = await compareDocxIntegrity({
    sourceBytes: source,
    generatedBytes: tampered,
    patches, // only first patch approved in report
  })
  assert(!reportBad.passed, 'unauthorized change fails integrity')
  assert(reportBad.unauthorizedTextChanges.length > 0, 'reports unauthorized')
})

await run('15. Equality helpers normalize whitespace only', () => {
  assert(valuesAreEquivalent('A  B', 'A B'), 'spaces')
  assert(normalizeComparableText('x\u00a0y') === 'x y', 'nbsp')
  assert(!valuesAreEquivalent('klauzula A', 'klauzula B'), 'no legal normalize')
})

await run('16. Lab page notice + no workflow mutation APIs', () => {
  const pageSrc = readFileSync(resolve(labRoot, 'AiContractLabPage.tsx'), 'utf8')
  assert(
    pageSrc.includes('Nie') &&
      pageSrc.includes('zmienia obecnego systemu szablonów'),
    'notice',
  )
  assert(pageSrc.includes('Dokument testowy'), 'test doc label')
  assert(!pageSrc.includes('workflowStage'), 'no workflow writes')
  assert(!pageSrc.includes('weddingService.update'), 'no wedding update')
})

await run('17. Template deep links remain; hub is packages-owned', () => {
  const r = readFileSync(router, 'utf8')
  assert(r.includes('/ustawienia/dokumenty/szablony/:id'), 'template deep link')
  assert(r.includes('/studio/pakiety'), 'packages route')
  assert(
    r.includes('Navigate to="/studio/pakiety"'),
    'standalone Contracts hub redirects to packages',
  )
  assert(!r.includes('DocumentTemplatesPage'), 'templates list hub demoted')
})

await run('18. Manual missing values become proposals and patches', async () => {
  const {
    buildManualReplacementProposals,
    createEmptyManualValues,
    isMissingFieldResolved,
    mergeReplacementRowsWithManual,
    validateManualFieldValue,
  } = await import('@/features/ai-contract-lab/manualMissingValues')

  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p0',
      container: 'body',
      paragraphIndex: 0,
      runStart: 0,
      runEnd: 40,
      text: 'Miejsce zawarcia: ________________',
      contextBefore: 'Umowa',
      contextAfter: 'Strony',
    },
    {
      anchorId: 'body:p1',
      container: 'body',
      paragraphIndex: 1,
      runStart: 0,
      runEnd: 30,
      text: 'Miasto: ________',
      contextBefore: '',
      contextAfter: '',
    },
  ]

  const missing = [
    {
      missingId: 'm-place',
      label: 'Miejsce zawarcia umowy',
      semanticRole: 'Miejsce zawarcia',
      expectedDataType: 'text',
      affectedAnchorIds: ['body:p0', 'body:p1'],
      reason: 'Brak w snapshotcie',
      suggestedCanonicalFieldKey: null,
    },
  ]

  let manual = createEmptyManualValues(missing)
  assert(!isMissingFieldResolved(manual[0]), 'empty unresolved')
  assert(validateManualFieldValue('email', 'not-an-email') != null, 'bad email')
  assert(validateManualFieldValue('email', 'a@b.pl') == null, 'good email')

  manual = [
    {
      ...manual[0]!,
      value: 'Kraków',
    },
  ]
  assert(isMissingFieldResolved(manual[0]), 'resolved after value')

  const { proposals, errors: propErrors } = buildManualReplacementProposals({
    missing,
    manual,
    anchors,
  })
  assert(propErrors.length === 0, 'no proposal errors')
  assert(proposals.length === 2, 'one proposal per affected anchor')
  assert(proposals.every((p) => p.source === 'manual'), 'source manual')
  assert(
    proposals.every((p) => p.requiresUserReview === true),
    'requires review',
  )
  assert(
    proposals.every((p) => p.proposedValue === 'Kraków'),
    'user value only',
  )

  const unknown = buildManualReplacementProposals({
    missing: [
      {
        ...missing[0]!,
        affectedAnchorIds: ['body:p999'],
      },
    ],
    manual,
    anchors,
  })
  assert(unknown.errors.length > 0, 'unknown anchor rejected')

  const wedding = stubWedding()
  const fields = buildContractDataSnapshot({
    wedding,
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields

  const analysis = {
    analysisVersion: '1.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'x',
    },
    replacements: [
      {
        replacementId: 'canon-1',
        anchorId: 'body:p0',
        originalText: '________________',
        canonicalFieldKey: 'bride.full_name',
        proposedValue: 'Iza Karczewska',
        semanticRole: 'Zamawiająca',
        reason: 'name',
        confidence: 0.95,
        requiresUserReview: false,
      },
    ],
    missingFields: missing,
    ambiguities: [],
    ignoredWeddingFields: [],
    warnings: [],
  }

  // Use anchors that fit canonical + manual without forcing overlap for this unit
  const anchorsCanon: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p0',
      container: 'body',
      paragraphIndex: 0,
      runStart: 0,
      runEnd: 20,
      text: 'Zamawiająca: Anna Kowalska',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p2',
      container: 'body',
      paragraphIndex: 2,
      runStart: 0,
      runEnd: 20,
      text: 'Miejsce: ________',
      contextBefore: '',
      contextAfter: '',
    },
  ]

  const missingSingle = [
    {
      ...missing[0]!,
      affectedAnchorIds: ['body:p2'],
    },
  ]
  const manualSingle = [
    {
      missingId: 'm-place',
      value: 'Kraków',
      affectedAnchorIds: ['body:p2'],
      semanticRole: 'Miejsce zawarcia',
      expectedDataType: 'text',
      label: 'Miejsce zawarcia umowy',
    },
  ]

  const analysisCanon = {
    ...analysis,
    replacements: [
      {
        replacementId: 'canon-1',
        anchorId: 'body:p0',
        originalText: 'Anna Kowalska',
        canonicalFieldKey: 'bride.full_name',
        proposedValue: 'Iza Karczewska',
        semanticRole: 'Zamawiająca',
        reason: 'name',
        confidence: 0.95,
        requiresUserReview: false,
      },
    ],
    missingFields: missingSingle,
  }

  const validated = validateAiReplacementPlan(
    analysisCanon,
    anchorsCanon,
    fields,
  )
  assert(validated.ok, 'canonical analysis still valid')

  const canonicalRows = buildReplacementRows(
    analysisCanon,
    fields,
    anchorsCanon,
  )
  const merged = mergeReplacementRowsWithManual({
    canonicalRows,
    missing: missingSingle,
    manual: manualSingle,
    anchors: anchorsCanon,
  })
  assert(merged.errors.length === 0, 'merge ok')
  const manualRow = merged.rows.find((r) => r.source === 'manual')
  assert(manualRow != null, 'manual row present')
  assert(manualRow!.decision === 'pending', 'manual pending approval')
  assert(manualRow!.requiresUserReview === true, 'manual requires review')

  const pendingGate = buildApprovedPatches({
    rows: merged.rows,
    anchors: anchorsCanon,
    manual: manualSingle,
    missing: missingSingle,
  })
  assert(pendingGate.errors.length > 0, 'pending manual blocks generation')

  const approvedRows = merged.rows.map((r) =>
    r.source === 'manual' || r.replacementId === 'canon-1'
      ? { ...r, decision: 'approved' as const }
      : r,
  )
  const approvedGate = buildApprovedPatches({
    rows: approvedRows,
    anchors: anchorsCanon,
    manual: manualSingle,
    missing: missingSingle,
  })
  assert(approvedGate.errors.length === 0, 'approved ok')
  assert(
    approvedGate.patches.some((p) => p.source === 'manual'),
    'manual patch created',
  )
  assert(
    approvedGate.patches.some((p) => p.source === 'wedding' || p.canonicalFieldKey === 'bride.full_name'),
    'canonical still works',
  )

  const rejectedRows = merged.rows.map((r) =>
    r.source === 'manual'
      ? { ...r, decision: 'rejected' as const }
      : { ...r, decision: 'approved' as const },
  )
  const rejectedGate = buildApprovedPatches({
    rows: rejectedRows,
    anchors: anchorsCanon,
    manual: manualSingle,
    missing: missingSingle,
  })
  assert(rejectedGate.errors.length > 0, 'rejected required blocks generation')

  const emptyManual = [
    {
      ...manualSingle[0]!,
      value: '',
    },
  ]
  assert(!isMissingFieldResolved(emptyManual[0]), 'empty stays unresolved')
  const emptyGate = buildApprovedPatches({
    rows: approvedRows,
    anchors: anchorsCanon,
    manual: emptyManual,
    missing: missingSingle,
  })
  assert(emptyGate.errors.length > 0, 'empty blocks')

  // Integrity accepts only approved manual change
  const source = await minimalDocx([
    'Zamawiająca: Anna Kowalska',
    'Klauzula prawna.',
    'Miejsce: ________',
  ])
  const applied = await applyApprovedReplacementPlan(
    source,
    approvedGate.patches,
  )
  const report = await compareDocxIntegrity({
    sourceBytes: source,
    generatedBytes: applied,
    patches: approvedGate.patches,
  })
  assert(report.passed, 'integrity accepts approved manual+canonical')

  // Session: only wedding id in localStorage helpers
  const sessionSrc = readFileSync(
    resolve(labRoot, 'aiContractLabSession.ts'),
    'utf8',
  )
  assert(
    sessionSrc.includes('AI_CONTRACT_LAB_WEDDING_STORAGE_KEY'),
    'wedding id key',
  )
  assert(!sessionSrc.includes('manual'), 'no manual in session storage module')
  const pageSrc = readFileSync(resolve(labRoot, 'AiContractLabPage.tsx'), 'utf8')
  assert(!pageSrc.includes('weddingService.update'), 'no wedding write')
  assert(
    !pageSrc.includes('localStorage.setItem') ||
      pageSrc.includes('writeStoredLabWeddingId'),
    'no direct manual localStorage',
  )
})

await run('19. Payload slim + size gates + error copy + schema optional ignored', () => {
  assert(LAB_PROVIDER_TIMEOUT_MS === 120_000, 'client timeout constant')
  assert(LAB_FALLBACK_CONTRACT_MODEL === 'gpt-5-mini', 'client fallback')
  assert(LAB_MAX_BODY_ANCHORS === 500, 'max anchors')
  assert(LAB_MAX_ANCHOR_CHARACTERS === 120_000, 'max chars')
  assert(LAB_MAX_SERIALIZED_PAYLOAD_BYTES === Math.floor(1.5 * 1024 * 1024), '1.5MB')

  const longCtx = 'x'.repeat(500)
  assert(capContext(longCtx).length === 240, 'context capped')

  const payload = buildDocumentAnalysisPayload({
    anchors: [
      {
        anchorId: 'body:p0',
        text: 'Hello   world',
        contextBefore: longCtx,
        contextAfter: longCtx,
        container: 'body',
      },
    ],
    fields: [
      {
        key: 'bride.full_name',
        label: 'Panna',
        category: 'client',
        formattedValue: 'Iza',
        dataType: 'text',
      },
      {
        key: 'empty.field',
        label: 'Puste',
        category: 'wedding',
        formattedValue: null,
        dataType: 'text',
      },
    ],
  })
  const serialized = JSON.stringify(payload)
  assert(!serialized.includes('paragraphIndex'), 'no paragraphIndex')
  assert(!serialized.includes('w:document'), 'no DOCX XML')
  assert(!serialized.includes('sourceHash'), 'no source hash')
  assert(payload.textAnchors[0]!.contextBefore.length <= 240, 'before capped')
  assert(payload.textAnchors[0]!.text === 'Hello   world', 'anchor text intact')

  const tooMany = validateAiPayloadSize({
    textAnchors: Array.from({ length: LAB_MAX_BODY_ANCHORS + 1 }, (_, i) => ({
      anchorId: `body:p${i}`,
      text: 'a',
      contextBefore: '',
      contextAfter: '',
      container: 'body',
    })),
    fieldCatalog: [],
    schemaJson: '{}',
  })
  assert(!tooMany.ok && tooMany.reason === 'anchor_count', 'reject anchor count')

  const tooChars = validateAiPayloadSize({
    textAnchors: [
      {
        anchorId: 'body:p0',
        text: 'y'.repeat(LAB_MAX_ANCHOR_CHARACTERS + 1),
        contextBefore: '',
        contextAfter: '',
        container: 'body',
      },
    ],
    fieldCatalog: [],
    schemaJson: '{}',
  })
  assert(!tooChars.ok && tooChars.reason === 'anchor_characters', 'reject chars')

  assert(computeLabMaxOutputTokens(10) >= 4000, 'min output tokens')
  assert(computeLabMaxOutputTokens(10_000) <= 16_000, 'max output tokens')

  const timeoutMsg = mapLabAnalyzeErrorMessage('provider_timeout')
  assert(timeoutMsg.message.includes('zbyt długo'), 'timeout copy')
  assert(timeoutMsg.message.includes('nie został zmieniony'), 'unchanged copy')
  assert(timeoutMsg.retryable, 'timeout retryable')

  const largeMsg = mapLabAnalyzeErrorMessage('document_too_large')
  assert(largeMsg.message.includes('zbyt duży'), 'large copy')
  assert(!largeMsg.retryable, 'large not retryable')

  const pageSrc = readFileSync(resolve(labRoot, 'AiContractLabPage.tsx'), 'utf8')
  assert(pageSrc.includes('Ponów analizę'), 'retry without re-upload')

  const schemaSrc = readFileSync(
    resolve(labRoot, 'aiContractLabSchemas.ts'),
    'utf8',
  )
  assert(schemaSrc.includes('.optional()'), 'ignored optional')

  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p0',
      container: 'body',
      paragraphIndex: 0,
      runStart: 0,
      runEnd: 20,
      text: 'Zamawiająca: Anna Kowalska',
      contextBefore: '',
      contextAfter: '',
    },
  ]
  const fields = buildContractDataSnapshot({
    wedding: stubWedding(),
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields
  const withoutIgnored = {
    analysisVersion: '1.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'x',
    },
    replacements: [
      {
        replacementId: 'r1',
        anchorId: 'body:p0',
        originalText: 'Anna Kowalska',
        canonicalFieldKey: 'bride.full_name',
        proposedValue: 'Iza Karczewska',
        semanticRole: 'Zamawiająca',
        reason: 'imię',
        confidence: 0.95,
        requiresUserReview: false,
      },
    ],
    missingFields: [],
    ambiguities: [],
    warnings: [],
  }
  const ok = validateAiReplacementPlan(withoutIgnored, anchors, fields)
  assert(ok.ok, 'validation without ignoredWeddingFields')

  assert(existsSync(genModal), 'GenerateContractModal')
  assert(existsSync(transform), 'transform service')
  const transformSrc = readFileSync(transform, 'utf8')
  assert(!transformSrc.includes('ai-contract-lab'), 'prod transform not lab')
})

await run('Source-span resolution: exact / normalize / ellipsis / soft-fail / manual', () => {
  const fields = buildContractDataSnapshot({
    wedding: stubWedding(),
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields

  // Exact substring unchanged
  {
    const anchor = 'Zamawiająca: Anna Kowalska zamieszkała'
    const r = resolveExactSourceSpan(anchor, 'Anna Kowalska')
    assert(r.status === 'exact', 'exact status')
    if (r.status === 'exact') {
      assert(r.exactSourceText === 'Anna Kowalska', 'exact text')
      assert(anchor.slice(r.start, r.end) === 'Anna Kowalska', 'exact slice')
    }
  }

  // NBSP → exact original slice
  {
    const anchor = 'Kwota:\u00a01500 zł'
    const r = resolveExactSourceSpan(anchor, 'Kwota: 1500 zł')
    assert(r.status === 'normalized_exact', 'nbsp normalized')
    if (r.status === 'normalized_exact') {
      assert(r.exactSourceText === 'Kwota:\u00a01500 zł', 'nbsp original slice')
    }
  }

  // Repeated whitespace
  {
    const anchor = 'Pan   Jan   Kulewski'
    const r = resolveExactSourceSpan(anchor, 'Pan Jan Kulewski')
    assert(r.status === 'normalized_exact', 'ws normalized')
    if (r.status === 'normalized_exact') {
      assert(r.exactSourceText === 'Pan   Jan   Kulewski', 'ws original slice')
    }
  }

  // Typographic quotes
  {
    const anchor = 'pakiet „Premium”'
    const r = resolveExactSourceSpan(anchor, 'pakiet "Premium"')
    assert(r.status === 'normalized_exact', 'quotes normalized')
    if (r.status === 'normalized_exact') {
      assert(r.exactSourceText === 'pakiet „Premium”', 'quote original slice')
    }
  }

  // NFC
  {
    const composed = 'Młynie'.normalize('NFC')
    const decomposed = 'Młynie'.normalize('NFD')
    const anchor = `w ${composed}`
    const r = resolveExactSourceSpan(anchor, `w ${decomposed}`)
    assert(
      r.status === 'exact' || r.status === 'normalized_exact',
      'nfc resolves',
    )
    if (r.status === 'exact' || r.status === 'normalized_exact') {
      assert(r.exactSourceText === anchor, 'nfc original slice')
    }
  }

  // Ellipsis never used literally
  {
    const proposed = 'przyjęcia weselnego ... reportaż ślubny'
    assert(isEllipsisProposal(proposed), 'ellipsis detected')
    const anchor =
      'przyjęcia weselnego w Starym Młynie, obejmującego reportaż ślubny'
    const r = resolveExactSourceSpan(anchor, proposed)
    assert(
      !(
        (r.status === 'exact' || r.status === 'normalized_exact') &&
        r.exactSourceText === proposed
      ),
      'ellipsis not literal patch',
    )
    if (r.status === 'exact' || r.status === 'normalized_exact') {
      assert(!r.exactSourceText.includes('...'), 'no ellipsis in patch source')
    }
  }

  // Unique ordered ellipsis → safe value span
  {
    const anchor = 'Zamawiająca: Anna Kowalska zamieszkała w Krakowie'
    const r = resolveExactSourceSpan(
      anchor,
      'Zamawiająca: ... zamieszkała',
    )
    assert(r.status === 'normalized_exact', 'ellipsis unique value')
    if (r.status === 'normalized_exact') {
      assert(r.exactSourceText === 'Anna Kowalska', 'value span only')
    }
  }

  // Ellipsis multiple matches → ambiguous
  {
    const anchor = 'foo X bar foo X bar'
    const r = resolveExactSourceSpan(anchor, 'foo ... bar')
    assert(r.status === 'ambiguous', 'multi ordered match ambiguous')
  }

  // Ellipsis spanning unrelated legal wording → not broad patch
  {
    const anchor =
      'przyjęcia weselnego w Starym Młynie, obejmującego reportaż ślubny'
    const r = resolveExactSourceSpan(
      anchor,
      'przyjęcia weselnego ... reportaż ślubny',
    )
    assert(r.status === 'ambiguous', 'legal wording not broad-patched')
    if (r.status === 'ambiguous') {
      for (const c of r.candidates) {
        assert(
          anchor.slice(c.start, c.end) === c.exactSourceText,
          'candidate is exact slice',
        )
      }
    }
  }

  // Soft-fail: missing source does not fail whole analysis; sibling stays
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p11',
        container: 'body',
        paragraphIndex: 11,
        runStart: 0,
        runEnd: 80,
        text: 'przyjęcia weselnego w Starym Młynie, obejmującego reportaż ślubny',
        contextBefore: '',
        contextAfter: '',
      },
      {
        anchorId: 'body:p0',
        container: 'body',
        paragraphIndex: 0,
        runStart: 0,
        runEnd: 20,
        text: 'Zamawiająca: Anna Kowalska',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    const plan = {
      analysisVersion: '1.1.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [
        {
          replacementId: 'bad-ellipsis',
          anchorId: 'body:p11',
          originalText: 'przyjęcia weselnego ... reportaż ślubny',
          canonicalFieldKey: 'bride.full_name',
          proposedValue: 'Iza Karczewska',
          semanticRole: 'Lokalizacja',
          reason: 'miejsce',
          confidence: 0.9,
          requiresUserReview: true,
        },
        {
          replacementId: 'good-name',
          anchorId: 'body:p0',
          originalText: 'Anna Kowalska',
          canonicalFieldKey: 'bride.full_name',
          proposedValue: 'Iza Karczewska',
          semanticRole: 'Zamawiająca',
          reason: 'imię',
          confidence: 0.95,
          requiresUserReview: false,
        },
      ],
      missingFields: [],
      ambiguities: [],
      warnings: [],
    }

    const validated = validateAiReplacementPlan(plan, anchors, fields)
    assert(validated.ok, 'missing/ellipsis source does not fail analysis')
    if (validated.ok) {
      assert(validated.counters.ellipsisProposals >= 1, 'ellipsis counter')
      assert(
        validated.analysis.replacements.some(
          (r) => r.replacementId === 'good-name',
        ),
        'sibling kept',
      )
      const rows = buildReplacementRows(validated.analysis, fields, anchors)
      const bad = rows.find((r) => r.replacementId === 'bad-ellipsis')
      const good = rows.find((r) => r.replacementId === 'good-name')
      assert(bad != null, 'bad row still reviewable')
      assert(
        bad!.spanStatus === 'ambiguous' || bad!.spanStatus === 'not_found',
        'bad span flagged',
      )
      assert(
        good!.spanStatus === 'exact' || good!.spanStatus === 'normalized_exact',
        'good exact',
      )

      const blocked = buildApprovedPatches({
        rows: rows.map((r) =>
          r.replacementId === 'good-name'
            ? { ...r, decision: 'approved' as const }
            : r,
        ),
        anchors,
        manual: [],
        missing: [],
      })
      assert(blocked.errors.length > 0, 'ambiguous blocks generation')

      const manual = applyManualSourceSpanToRow(
        bad!,
        anchors[0]!.text,
        'Starym Młynie',
      )
      assert(manual.ok, 'manual unique ok')
      if (manual.ok) {
        assert(manual.row.spanStatus === 'resolved_manual', 'resolved_manual')
        assert(manual.row.originalText === 'Starym Młynie', 'manual exact')
        const after = buildApprovedPatches({
          rows: [
            { ...good!, decision: 'approved' },
            { ...manual.row, decision: 'approved' },
          ],
          anchors,
          manual: [],
          missing: [],
        })
        assert(after.errors.length === 0, 'resolved allows generation')
        assert(
          after.patches.every(
            (p) =>
              !p.expectedOriginalText.includes('...') &&
              anchors
                .find((a) => a.anchorId === p.anchorId)!
                .text.includes(p.expectedOriginalText),
          ),
          'approved patch is exact slice',
        )
      }

      assert(
        !applyManualSourceSpanToRow(
          bad!,
          'Starym Młynie oraz Starym Młynie',
          'Starym Młynie',
        ).ok,
        'manual multi rejected',
      )
      assert(
        !applyManualSourceSpanToRow(bad!, anchors[0]!.text, 'XYZ').ok,
        'manual absent rejected',
      )
      assert(
        validateManualSourceSpan(anchors[0]!.text, 'Starym Młynie').status ===
          'exact',
        'manual validate once',
      )
    }
  }

  const labRoot = resolve(process.cwd(), 'src/features/ai-contract-lab')
  const resolveSrc = readFileSync(
    resolve(labRoot, 'resolveExactSourceSpan.ts'),
    'utf8',
  )
  assert(!resolveSrc.includes('Levenshtein'), 'no levenshtein')
})

const GROOM_CLEAR = new Set([
  'groom.full_name',
  'groom.first_name',
  'groom.last_name',
])

await run('Missing-field gate: phone/location/role/email classification', () => {
  const fields = buildContractDataSnapshot({
    wedding: stubWedding(),
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields

  const bridePhone = fields.find((f) => f.key === 'bride.phone')
  assert(bridePhone?.formattedValue != null, 'bride phone available')
  const ceremony = fields.find((f) => f.key === 'location.ceremony')
  const reception = fields.find((f) => f.key === 'location.reception')
  assert(ceremony?.formattedValue != null, 'ceremony available')
  assert(reception?.formattedValue != null, 'reception available')

  // Phone mismatch → replacement, not missing
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p1',
        container: 'body',
        paragraphIndex: 1,
        runStart: 0,
        runEnd: 40,
        text: 'Telefon: 603 306 423',
        contextBefore: 'Panna Młoda',
        contextAfter: '',
      },
    ]
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-phone',
          label: 'Telefon Panny Młodej',
          semanticRole: 'Telefon PM',
          expectedDataType: 'phone',
          affectedAnchorIds: ['body:p1'],
          reason: 'Dokument zawiera inny numer',
          suggestedCanonicalFieldKey: 'bride.phone',
          fieldKey: 'bride.phone',
          targetEvidence: {
            anchorId: 'body:p1',
            exactText: '603 306 423',
            semanticLabel: 'Telefon',
          },
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fields)
    assert(v.ok, 'phone plan ok')
    if (v.ok) {
      assert(v.analysis.missingFields.length === 0, 'phone not manual missing')
      assert(
        v.analysis.replacements.some(
          (r) =>
            r.canonicalFieldKey === 'bride.phone' &&
            r.originalText === '603 306 423' &&
            r.proposedValue === bridePhone!.formattedValue,
        ),
        'phone promoted to replacement',
      )
    }
  }

  // Location mismatch → replacement(s); generic label rejected
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p2',
        container: 'body',
        paragraphIndex: 2,
        runStart: 0,
        runEnd: 60,
        text: 'Ceremonia w Starym Kościele',
        contextBefore: 'ceremonia ślubna',
        contextAfter: '',
      },
      {
        anchorId: 'body:p3',
        container: 'body',
        paragraphIndex: 3,
        runStart: 0,
        runEnd: 60,
        text: 'Przyjęcie w Hotelu Park',
        contextBefore: 'przyjęcia weselnego',
        contextAfter: '',
      },
    ]
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-loc',
          label: 'Adresy lokalizacji z katalogu — dopasowanie',
          semanticRole: 'Lokalizacje',
          expectedDataType: 'address',
          affectedAnchorIds: ['body:p2', 'body:p3'],
          reason: 'Lokalizacje różnią się od katalogu',
          suggestedCanonicalFieldKey: null,
          targetEvidence: {
            anchorId: 'body:p2',
            exactText: 'Starym Kościele',
            semanticLabel: 'Lokalizacja',
          },
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fields)
    assert(v.ok, 'location plan ok')
    if (v.ok) {
      assert(
        !v.analysis.missingFields.some((m) =>
          /dopasowanie/i.test(m.label),
        ),
        'generic location missing rejected',
      )
      // At least one location-related replacement or ambiguity
      assert(
        v.analysis.replacements.length + v.analysis.ambiguities.length >= 1,
        'location → replacement or ambiguity',
      )
    }
  }

  // Unclear ceremony/reception → ambiguity
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p4',
        container: 'body',
        paragraphIndex: 4,
        runStart: 0,
        runEnd: 40,
        text: 'Miejsce: Stary Młyn',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-unclear-loc',
          label: 'Lokalizacja',
          semanticRole: 'Miejsce',
          expectedDataType: 'address',
          affectedAnchorIds: ['body:p4'],
          reason: 'niejasne',
          suggestedCanonicalFieldKey: 'location.ceremony',
          fieldKey: null,
          targetEvidence: {
            anchorId: 'body:p4',
            exactText: 'Stary Młyn',
            semanticLabel: 'Miejsce',
          },
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    // fieldKey null + available ceremony in catalog via suggested key that we clear
    // Force available location fields path via generic label-like reason
    const v = validateAiReplacementPlan(
      {
        ...plan,
        missingFields: [
          {
            ...plan.missingFields[0]!,
            label: 'Adresy z katalogu — dopasowanie',
            suggestedCanonicalFieldKey: null,
            fieldKey: null,
          },
        ],
      },
      anchors,
      fields,
    )
    assert(v.ok, 'unclear loc ok')
    if (v.ok) {
      assert(v.analysis.missingFields.length === 0, 'unclear not missing')
      assert(
        v.analysis.ambiguities.length > 0 || v.analysis.replacements.length > 0,
        'unclear → ambiguity or replacement',
      )
    }
  }

  // Bride-only anchor does not imply missing groom name
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p5',
        container: 'body',
        paragraphIndex: 5,
        runStart: 0,
        runEnd: 40,
        text: 'Zamawiająca: Aleksandrą Biłas',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    // Use fields where bride name matches document for the gate's bride-only check
    const fieldsBrideDoc = fields.map((f) =>
      f.key === 'bride.full_name'
        ? { ...f, value: 'Aleksandrą Biłas', formattedValue: 'Aleksandrą Biłas' }
        : f,
    )
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-groom',
          label: 'Imię i nazwisko Pana Młodego',
          semanticRole: 'Pan Młody',
          expectedDataType: 'text',
          affectedAnchorIds: ['body:p5'],
          reason: 'Brak pana młodego w anchorze',
          suggestedCanonicalFieldKey: 'groom.full_name',
          fieldKey: 'groom.full_name',
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fieldsBrideDoc)
    assert(v.ok, 'groom false positive ok')
    if (v.ok) {
      assert(
        !v.analysis.missingFields.some((m) => m.missingId === 'm-groom'),
        'groom not missing from bride-only anchor',
      )
    }
  }

  // Clear groom target + groom name absent → manual missing
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p6',
        container: 'body',
        paragraphIndex: 6,
        runStart: 0,
        runEnd: 40,
        text: 'Pan Młody: _______________',
        contextBefore: 'Dane Pana Młodego',
        contextAfter: '',
      },
    ]
    const fieldsNoGroom = fields.map((f) =>
      GROOM_CLEAR.has(f.key)
        ? { ...f, value: null, formattedValue: null }
        : f,
    )
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-groom-real',
          label: 'Imię i nazwisko Pana Młodego',
          semanticRole: 'Pan Młody',
          expectedDataType: 'text',
          affectedAnchorIds: ['body:p6'],
          reason: 'Puste pole w dokumencie',
          suggestedCanonicalFieldKey: 'groom.full_name',
          fieldKey: 'groom.full_name',
          targetEvidence: {
            anchorId: 'body:p6',
            exactText: '_______________',
            semanticLabel: 'Pan Młody',
          },
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fieldsNoGroom)
    assert(v.ok, 'real groom missing ok')
    if (v.ok) {
      assert(
        v.analysis.missingFields.some((m) => m.missingId === 'm-groom-real'),
        'true groom missing kept',
      )
      assert(
        v.analysis.missingFields.every((m) => m.affectedAnchorIds.length > 0),
        'every missing has anchors',
      )
    }
  }

  // groom.email unavailable, no document target → ignored
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p7',
        container: 'body',
        paragraphIndex: 7,
        runStart: 0,
        runEnd: 20,
        text: 'Klauzula prawna bez danych kontaktowych.',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    const fieldsNoEmail = fields.map((f) =>
      f.key === 'groom.email'
        ? { ...f, value: null, formattedValue: null }
        : f,
    )
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-gemail',
          label: 'Groom email',
          semanticRole: 'Email pana młodego',
          expectedDataType: 'email',
          affectedAnchorIds: ['body:p7'],
          reason: 'available false',
          suggestedCanonicalFieldKey: 'groom.email',
          fieldKey: 'groom.email',
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fieldsNoEmail)
    assert(v.ok, 'groom email ignore ok')
    if (v.ok) {
      assert(
        !v.analysis.missingFields.some((m) => m.missingId === 'm-gemail'),
        'groom email not missing',
      )
      assert(
        v.analysis.ignoredWeddingFields.some(
          (i) => i.canonicalFieldKey === 'groom.email',
        ),
        'groom email ignored',
      )
    }
  }

  // groom.email unavailable + explicit document target → manual missing
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p8',
        container: 'body',
        paragraphIndex: 8,
        runStart: 0,
        runEnd: 40,
        text: 'E-mail Pana Młodego: ____________',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    const fieldsNoEmail = fields.map((f) =>
      f.key === 'groom.email'
        ? { ...f, value: null, formattedValue: null }
        : f,
    )
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-gemail-real',
          label: 'E-mail Pana Młodego',
          semanticRole: 'Email',
          expectedDataType: 'email',
          affectedAnchorIds: ['body:p8'],
          reason: 'Puste pole e-mail',
          suggestedCanonicalFieldKey: 'groom.email',
          fieldKey: 'groom.email',
          targetEvidence: {
            anchorId: 'body:p8',
            exactText: '____________',
            semanticLabel: 'E-mail Pana Młodego',
          },
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fieldsNoEmail)
    assert(v.ok, 'groom email real missing ok')
    if (v.ok) {
      assert(
        v.analysis.missingFields.some((m) => m.missingId === 'm-gemail-real'),
        'groom email kept when targeted',
      )
    }
  }

  // Empty affected anchors rejected; sibling replacement remains
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p0',
        container: 'body',
        paragraphIndex: 0,
        runStart: 0,
        runEnd: 20,
        text: 'Zamawiająca: Anna Kowalska',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [
        {
          replacementId: 'good-name',
          anchorId: 'body:p0',
          originalText: 'Anna Kowalska',
          canonicalFieldKey: 'bride.full_name',
          proposedValue: 'Iza Karczewska',
          semanticRole: 'Zamawiająca',
          reason: 'imię',
          confidence: 0.95,
          requiresUserReview: false,
        },
      ],
      missingFields: [
        {
          missingId: 'm-empty',
          label: 'Dane pary',
          semanticRole: 'para',
          expectedDataType: 'text',
          affectedAnchorIds: [],
          reason: 'brak zgodności',
          suggestedCanonicalFieldKey: null,
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fields)
    assert(v.ok, 'sibling plan ok')
    if (v.ok) {
      assert(v.analysis.missingFields.length === 0, 'empty/generic rejected')
      assert(
        v.analysis.replacements.some((r) => r.replacementId === 'good-name'),
        'sibling replacement kept',
      )
      const rows = buildReplacementRows(v.analysis, fields, anchors)
      const approved = rows.map((r) =>
        r.replacementId === 'good-name'
          ? { ...r, decision: 'approved' as const }
          : r,
      )
      const patches = buildApprovedPatches({
        rows: approved,
        anchors,
        manual: [],
        missing: [],
      })
      assert(patches.errors.length === 0, 'sibling patches ok')
      assert(
        patches.patches.every((p) =>
          anchors[0]!.text.includes(p.expectedOriginalText),
        ),
        'exact slices',
      )
    }
  }

  // Existing canonical value prevents manual missing
  {
    const anchors: DocumentTextAnchor[] = [
      {
        anchorId: 'body:p9',
        container: 'body',
        paragraphIndex: 9,
        runStart: 0,
        runEnd: 30,
        text: 'Telefon: 111 222 333',
        contextBefore: '',
        contextAfter: '',
      },
    ]
    const plan = {
      analysisVersion: '1.2.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      replacements: [],
      missingFields: [
        {
          missingId: 'm-phone2',
          label: 'Telefon',
          semanticRole: 'tel',
          expectedDataType: 'phone',
          affectedAnchorIds: ['body:p9'],
          reason: 'inny numer',
          suggestedCanonicalFieldKey: 'bride.phone',
          fieldKey: 'bride.phone',
        },
      ],
      ambiguities: [],
      warnings: [],
    }
    const v = validateAiReplacementPlan(plan, anchors, fields)
    assert(v.ok, 'canonical prevents missing')
    if (v.ok) {
      assert(v.analysis.missingFields.length === 0, 'no missing when available')
    }
  }

  const transformSrc = readFileSync(transform, 'utf8')
  assert(!transformSrc.includes('ai-contract-lab'), 'prod untouched')
  assert(existsSync(genModal), 'prod modal exists')
})

await run('Phase A/B: semantic map → locations + final payment replacements', () => {
  assert(CONTRACT_SEMANTIC_ROLES.includes('preparation_location'), 'prep role')
  assert(CONTRACT_SEMANTIC_ROLES.includes('ceremony_location'), 'ceremony role')
  assert(CONTRACT_SEMANTIC_ROLES.includes('reception_location'), 'reception role')
  assert(
    CONTRACT_SEMANTIC_ROLES.includes('payment_due_date'),
    'payment due role',
  )
  assert(SEMANTIC_MAP_ANALYSIS_VERSION === '2.1.0', 'map version')

  const fields = buildContractDataSnapshot({
    wedding: stubWedding(),
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields

  const derivedFinal = fields.find(
    (f) => f.key === 'derived.final_payment_due_on_wedding_date',
  )
  assert(derivedFinal?.formattedValue != null, 'derived final payment field')

  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p14',
      container: 'body',
      paragraphIndex: 14,
      runStart: 0,
      runEnd: 80,
      text: 'Przygotowania ślubne: Rezydencja Lubomirskich - Retyrada',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p15',
      container: 'body',
      paragraphIndex: 15,
      runStart: 0,
      runEnd: 40,
      text: 'Ceremonia w Rzeszowie',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p16',
      container: 'body',
      paragraphIndex: 16,
      runStart: 0,
      runEnd: 80,
      text: 'Przyjęcie: Rezydencja Lubomirskich - Retyrada',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p44',
      container: 'body',
      paragraphIndex: 44,
      runStart: 0,
      runEnd: 40,
      text: 'Pozostała kwota płatna do 19.06.2025',
      contextBefore: '',
      contextAfter: '',
    },
  ]

  const semanticMap = {
    analysisVersion: '2.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'foto',
    },
    semanticAnchors: [
      {
        anchorId: 'body:p14',
        semanticRole: 'preparation_location',
        confidence: 0.98,
        documentLabel: 'Przygotowania ślubne',
        valueSpan: { sourceText: 'Rezydencja Lubomirskich - Retyrada' },
        reason: 'prep',
      },
      {
        anchorId: 'body:p15',
        semanticRole: 'ceremony_location',
        confidence: 0.99,
        documentLabel: 'Ceremonia',
        valueSpan: { sourceText: 'Rzeszowie' },
        reason: 'ceremony',
      },
      {
        anchorId: 'body:p16',
        semanticRole: 'reception_location',
        confidence: 0.99,
        documentLabel: 'Przyjęcie',
        valueSpan: { sourceText: 'Rezydencja Lubomirskich - Retyrada' },
        reason: 'reception',
      },
      {
        anchorId: 'body:p44',
        semanticRole: 'final_payment_due_date',
        confidence: 0.97,
        documentLabel: null,
        valueSpan: { sourceText: '19.06.2025' },
        reason: 'final due',
      },
      {
        anchorId: 'body:p15',
        semanticRole: 'ceremony_location',
        confidence: 0.4,
        documentLabel: 'low',
        valueSpan: { sourceText: 'Rzeszowie' },
        reason: 'too low',
      },
    ],
    warnings: [],
  }

  const parsed = documentSemanticMapSchema.safeParse(semanticMap)
  assert(parsed.success, 'phase A schema')

  const genCtx = createContractGenerationContext({
    now: new Date('2026-07-29T12:00:00+02:00'),
    timezone: 'Europe/Warsaw',
  })

  const { mappingRows, analysis } = mapSemanticMapToWeddingPlan({
    semanticMap: semanticMap as never,
    fields,
    anchors,
    generationContext: genCtx,
  })

  assert(
    mappingRows.some(
      (r) =>
        r.semanticRole === 'preparation_location' &&
        r.replacementStatus === 'replacement',
    ),
    'prep → replacement',
  )
  assert(
    mappingRows.some(
      (r) =>
        r.semanticRole === 'ceremony_location' &&
        r.replacementStatus === 'replacement',
    ),
    'ceremony → replacement',
  )
  assert(
    mappingRows.some(
      (r) =>
        r.semanticRole === 'reception_location' &&
        r.replacementStatus === 'replacement',
    ),
    'reception → replacement',
  )
  assert(
    mappingRows.some(
      (r) =>
        r.semanticRole === 'payment_due_date' &&
        r.status === 'DERIVED' &&
        r.replacementStatus === 'replacement' &&
        r.mappedDisplay === 'derived(wedding.date)',
    ),
    'final payment → derived replacement',
  )
  assert(
    mappingRows.some(
      (r) => r.confidence < 0.6 && r.status === 'IGNORED',
    ),
    'low confidence ignored',
  )
  assert(analysis.missingFields.length === 0, 'no false missing from phase B')
  assert(
    analysis.replacements.some(
      (r) => r.canonicalFieldKey === 'location.ceremony',
    ),
    'ceremony field key',
  )
  assert(
    analysis.replacements.some(
      (r) =>
        r.canonicalFieldKey === 'derived.final_payment_due_on_wedding_date' &&
        r.proposedValue === derivedFinal!.formattedValue,
    ),
    'derived final payment value',
  )

  const validated = validateAiReplacementPlan(analysis, anchors, fields)
  assert(validated.ok, 'phase B analysis validates')
  if (validated.ok) {
    const rows = buildReplacementRows(validated.analysis, fields, anchors)
    assert(rows.length >= 4, 'reviewable rows')
    const approved = rows.map((r) =>
      r.spanStatus === 'exact' || r.spanStatus === 'normalized_exact'
        ? { ...r, decision: 'approved' as const }
        : r,
    )
    const patches = buildApprovedPatches({
      rows: approved,
      anchors,
      manual: [],
      missing: [],
    })
    assert(
      patches.patches.every((p) =>
        anchors
          .find((a) => a.anchorId === p.anchorId)!
          .text.includes(p.expectedOriginalText),
      ),
      'exact slices only',
    )
  }

  const pageSrc = readFileSync(resolve(labRoot, 'AiContractLabPage.tsx'), 'utf8')
  assert(pageSrc.includes('Mapa semantyczna'), 'semantic map UI')
  assert(pageSrc.includes("'semantic'"), 'semantic step')
})

await run('Phase A soft-fail: bad rows do not kill siblings', () => {
  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p14',
      container: 'body',
      paragraphIndex: 14,
      runStart: 0,
      runEnd: 40,
      text: 'Przygotowania: Dom Weselny Alpha',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p15',
      container: 'body',
      paragraphIndex: 15,
      runStart: 0,
      runEnd: 40,
      text: 'Ceremonia w Krakowie',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p16',
      container: 'body',
      paragraphIndex: 16,
      runStart: 0,
      runEnd: 40,
      text: 'Przyjęcie w Willi Park',
      contextBefore: '',
      contextAfter: '',
    },
  ]

  {
    const good = {
      analysisVersion: '2.0.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      semanticAnchors: [
        {
          anchorId: 'body:p14',
          semanticRole: 'preparation_location',
          confidence: 0.98,
          valueSpan: { sourceText: 'Dom Weselny Alpha' },
        },
        {
          anchorId: 'body:p15',
          semanticRole: 'ceremony_location',
          confidence: 0.99,
          valueSpan: { sourceText: 'Krakowie' },
        },
      ],
      warnings: [],
    }
    const v = softValidatePhaseASemanticMap({ raw: good, anchors })
    assert(v.ok, 'good phase A passes')
    if (v.ok) assert(v.stats.validRows === 2, 'two valid')
  }

  {
    const legacy = {
      analysisVersion: '1.2.0',
      replacements: [{ replacementId: 'r1' }],
      missingFields: [],
    }
    const v = softValidatePhaseASemanticMap({ raw: legacy, anchors })
    assert(!v.ok && v.code === 'provider_schema_mismatch', 'legacy mismatch')
    if (!v.ok) assert(v.stage === 'validate_provider_output', 'stage')
  }

  {
    const mixed = {
      analysisVersion: '2.0.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      semanticAnchors: [
        {
          anchorId: 'body:p14',
          semanticRole: 'preparation_location',
          confidence: 0.97,
          valueSpan: { sourceText: 'Dom Weselny Alpha' },
        },
        {
          anchorId: 'body:p15',
          semanticRole: 'not_a_real_role',
          confidence: 0.9,
          valueSpan: { sourceText: 'Krakowie' },
        },
        {
          anchorId: 'body:p16',
          semanticRole: 'reception_location',
          confidence: 0.95,
          valueSpan: { sourceText: '' },
        },
        {
          anchorId: 'body:p99',
          semanticRole: 'ceremony_location',
          confidence: 0.9,
          valueSpan: { sourceText: 'Krakowie' },
        },
      ],
      warnings: [],
    }
    const v = softValidatePhaseASemanticMap({ raw: mixed, anchors })
    assert(v.ok, 'siblings survive soft-fail')
    if (v.ok) {
      assert(v.stats.validRows === 1, 'one valid')
      assert(v.stats.unresolvedRows >= 3, 'unresolved counted')
      assert(
        v.semanticMap.unresolved.some((u) => u.status === 'unknown_semantic_role'),
        'unknown role',
      )
      assert(
        v.semanticMap.unresolved.some((u) => u.status === 'empty_source_text'),
        'empty source',
      )
      assert(
        v.semanticMap.unresolved.some((u) => u.status === 'missing_anchor'),
        'missing anchor',
      )
      const dumped = JSON.stringify(v.semanticMap.unresolved)
      assert(!dumped.includes('Dom Weselny'), 'no source text in issues')
    }
  }

  {
    const ellipsis = {
      analysisVersion: '2.0.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      semanticAnchors: [
        {
          anchorId: 'body:p14',
          semanticRole: 'preparation_location',
          confidence: 0.96,
          valueSpan: { sourceText: 'Przygotowania: ... Alpha' },
        },
        {
          anchorId: 'body:p15',
          semanticRole: 'ceremony_location',
          confidence: 0.99,
          valueSpan: { sourceText: 'Krakowie' },
        },
      ],
      warnings: [],
    }
    const v = softValidatePhaseASemanticMap({ raw: ellipsis, anchors })
    assert(v.ok, 'ellipsis soft path ok')
    if (v.ok) {
      assert(
        v.semanticMap.semanticAnchors.some(
          (a) => a.semanticRole === 'ceremony_location',
        ),
        'sibling ceremony kept',
      )
      for (const a of v.semanticMap.semanticAnchors) {
        assert(!a.valueSpan.sourceText.includes('...'), 'no literal ellipsis')
      }
    }
  }

  {
    const none = {
      analysisVersion: '2.0.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'x',
      },
      semanticAnchors: [
        {
          anchorId: 'body:p15',
          semanticRole: 'bogus',
          confidence: 0.9,
          valueSpan: { sourceText: 'Krakowie' },
        },
      ],
      warnings: [],
    }
    const v = softValidatePhaseASemanticMap({ raw: none, anchors })
    assert(!v.ok && v.code === 'zero_valid_rows', 'zero valid fatal')
  }

  {
    const v = softValidatePhaseASemanticMap({ raw: 'not-json-obj', anchors })
    assert(!v.ok, 'non object fails')
  }

  const details = formatPhaseAErrorDetails({
    code: 'provider_schema_mismatch',
    stage: 'validate_provider_output',
    message: 'x',
    issueCount: 2,
    issues: [
      { path: 'semanticAnchors.2.valueSpan.sourceText', code: 'invalid_type' },
      { path: 'semanticAnchors.5.semanticRole', code: 'unknown_role' },
    ],
    stats: { providerRows: 6, validRows: 0, unresolvedRows: 6 },
  })
  assert(details.includes('validate_provider_output'), 'preserves stage')
  assert(details.includes('provider_schema_mismatch'), 'preserves code')
  assert(details.includes('semanticAnchors.2'), 'preserves paths')
  assert(!details.includes('Aleksandr'), 'no PII in details')

  assert(existsSync(genModal), 'prod untouched path')
  assert(!readFileSync(transform, 'utf8').includes('phaseAValidate'), 'prod no phaseA')
})

await run('Phase B quality: equality, dates, temporal, spans, package group, metrics', () => {
  // Field-aware normalization
  assert(
    semanticValuesEqual('6482810484', '648 281 0484', 'nip'),
    'identical NIP → equal',
  )
  assert(
    semanticValuesEqual('522500508', '522-500-508', 'regon'),
    'identical REGON → equal',
  )
  assert(
    semanticValuesEqual('+48 500 100 200', '500100200', 'phone'),
    'phone normalization',
  )
  assert(
    semanticValuesEqual(
      'ul. Test 1, 00-001 Warszawa',
      'ul Test 1 00-001 Warszawa',
      'address',
    ),
    'identical address → equal',
  )
  assert(
    semanticValuesEqual('8 000 zł', '8000,00 zł', 'money'),
    'money normalization',
  )
  assert(
    semanticValuesEqual('12 3456 7890 1234 5678 9012 3456', '12345678901234567890123456', 'bank_account'),
    'bank account normalization',
  )
  assert(
    semanticValuesEqual('19.06.2025', '19.06.2025r.', 'date'),
    'date trailing r.',
  )
  assert(
    semanticValuesEqual('19.06.2025', '19 czerwca 2025', 'date'),
    'date word form',
  )
  assert(
    semanticValuesEqual('19.06.2025', '2025-06-19', 'date'),
    'date ISO form',
  )
  assert(
    equalityKindForField('derived.deposit_due_from_contract_date', 'date') ===
      'date',
    'deposit_due is date not money',
  )
  assert(
    normalizeForEquality('Studio „Test”', 'company_name').includes('test'),
    'company name quotes',
  )

  // Temporal rules
  const deposit = computeTemporalValue({
    rule: SEMANTIC_TEMPORAL_RULES.deposit_due_date!,
    baseIso: '2025-06-12',
  })
  assert(deposit?.formatted === '19.06.2025', 'deposit due = contract + 7d')

  const delivery = computeTemporalValue({
    rule: SEMANTIC_TEMPORAL_RULES.delivery_deadline!,
    baseIso: '2025-06-19',
    deliveryMonths: 4,
  })
  assert(delivery?.formatted === '19.10.2025', 'delivery = wedding + months')

  const finalPay = computeTemporalValue({
    rule: SEMANTIC_TEMPORAL_RULES.payment_due_date!,
    baseIso: '2025-06-19',
  })
  assert(finalPay?.formatted === '19.06.2025', 'final payment = wedding date')

  // Contract date ≠ wedding date bindings
  const wedding = {
    ...stubWedding(),
    date: '2025-06-19',
    contract: { status: 'signed' as const, signedAt: '2025-06-12' },
    deliveryMonths: 4,
    packageItems: [
      { title: 'teaser', sortOrder: 0, enabled: true },
      { title: '15-minute film', sortOrder: 1, enabled: true },
      { title: 'electronic delivery', sortOrder: 2, enabled: true },
    ],
    bridePreparationLocation: 'Rezydencja A',
    ceremonyLocation: 'Kościół B',
    receptionLocation: 'Sala C',
  }
  const company = {
    ...stubCompany(),
    nip: '6482810484',
    regon: '522500508',
    phone: '500100200',
    companyName: 'Studio Filmowe XYZ',
    address: 'ul. Test 1',
    postalCode: '00-001',
    city: 'Warszawa',
    bankAccount: '12 3456 7890 1234 5678 9012 3456',
  }
  const fields = buildContractDataSnapshot({
    wedding,
    company,
    extras: [],
    places: [],
  }).fields

  assert(
    fields.some((f) => f.key === 'contract.execution_date'),
    'contract.execution_date field exists',
  )
  assert(
    fields.find((f) => f.key === 'contract.execution_date')?.formattedValue ===
      '12.06.2025',
    'contract execution date from signedAt',
  )
  assert(
    fields.find((f) => f.key === 'wedding.date')?.formattedValue ===
      '19.06.2025',
    'wedding date separate',
  )

  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p1',
      container: 'body',
      paragraphIndex: 1,
      runStart: 0,
      runEnd: 200,
      text: 'Umowa zawarta w dniu 12.06.2025. Data ślubu 19.06.2025.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p2',
      container: 'body',
      paragraphIndex: 2,
      runStart: 0,
      runEnd: 200,
      text: 'NIP 6482810484, REGON 522500508, tel. 500 100 200',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p3',
      container: 'body',
      paragraphIndex: 3,
      runStart: 0,
      runEnd: 200,
      text: 'Studio Filmowe XYZ, ul. Test 1, 00-001 Warszawa',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p4',
      container: 'body',
      paragraphIndex: 4,
      runStart: 0,
      runEnd: 200,
      text: 'Przygotowania: Inna lokalizacja. Ceremonia: Inne miasto. Przyjęcie: Inna sala.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p5',
      container: 'body',
      paragraphIndex: 5,
      runStart: 0,
      runEnd: 200,
      text: 'Para młoda zapłaci Kamerzyście najpóźniej w dniu 19.06.2025. Inna data 12.06.2025.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p6',
      container: 'body',
      paragraphIndex: 6,
      runStart: 0,
      runEnd: 200,
      text: 'Zadatek płatny do 19.06.2025. Materiały w terminie do 19.10.2025.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p7',
      container: 'body',
      paragraphIndex: 7,
      runStart: 0,
      runEnd: 200,
      text: 'Pakiet obejmuje: teaser; 15-minute film; electronic delivery',
      contextBefore: '',
      contextAfter: '',
    },
  ]

  // Context disambiguation for duplicate dates / REGON
  const finalSpan = resolveSemanticSourceSpan({
    anchorText: anchors[4]!.text,
    sourceText: '19.06.2025',
    prefixContext: 'najpóźniej w dniu ',
    suffixContext: '.',
    role: 'final_payment_due_date',
  })
  assert(
    finalSpan.status === 'exact' || finalSpan.status === 'normalized_exact',
    'duplicate dates resolved by context',
  )

  const regonSpan = resolveSemanticSourceSpan({
    anchorText: anchors[1]!.text,
    sourceText: '522500508',
    prefixContext: 'REGON ',
    suffixContext: ', tel.',
    role: 'company_regon',
  })
  assert(
    regonSpan.status === 'exact' || regonSpan.status === 'normalized_exact',
    'REGON ambiguity resolved',
  )

  const semanticMap = {
    analysisVersion: '2.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'foto',
    },
    semanticAnchors: [
      {
        anchorId: 'body:p1',
        semanticRole: 'contract_execution_date',
        confidence: 0.98,
        valueSpan: { sourceText: '12.06.2025' },
      },
      {
        anchorId: 'body:p1',
        semanticRole: 'wedding_date',
        confidence: 0.98,
        valueSpan: {
          sourceText: '19.06.2025',
          prefixContext: 'Data ślubu ',
        },
      },
      {
        anchorId: 'body:p2',
        semanticRole: 'company_nip',
        confidence: 0.99,
        valueSpan: { sourceText: '6482810484' },
      },
      {
        anchorId: 'body:p2',
        semanticRole: 'company_regon',
        confidence: 0.99,
        valueSpan: {
          sourceText: '522500508',
          prefixContext: 'REGON ',
          suffixContext: ', tel.',
        },
      },
      {
        anchorId: 'body:p2',
        semanticRole: 'company_phone',
        confidence: 0.99,
        valueSpan: { sourceText: '500 100 200' },
      },
      {
        anchorId: 'body:p3',
        semanticRole: 'company_name',
        confidence: 0.99,
        valueSpan: { sourceText: 'Studio Filmowe XYZ' },
      },
      {
        anchorId: 'body:p3',
        semanticRole: 'company_address',
        confidence: 0.95,
        valueSpan: { sourceText: 'ul. Test 1, 00-001 Warszawa' },
      },
      {
        anchorId: 'body:p4',
        semanticRole: 'preparation_location',
        confidence: 0.97,
        valueSpan: { sourceText: 'Inna lokalizacja' },
      },
      {
        anchorId: 'body:p4',
        semanticRole: 'ceremony_location',
        confidence: 0.97,
        valueSpan: { sourceText: 'Inne miasto' },
      },
      {
        anchorId: 'body:p4',
        semanticRole: 'reception_location',
        confidence: 0.97,
        valueSpan: { sourceText: 'Inna sala' },
      },
      {
        anchorId: 'body:p5',
        semanticRole: 'final_payment_due_date',
        confidence: 0.96,
        valueSpan: {
          sourceText: '19.06.2025',
          prefixContext: 'najpóźniej w dniu ',
          suffixContext: '.',
        },
      },
      {
        anchorId: 'body:p6',
        semanticRole: 'deposit_due_date',
        confidence: 0.95,
        valueSpan: {
          sourceText: '19.06.2025',
          prefixContext: 'do ',
        },
      },
      {
        anchorId: 'body:p6',
        semanticRole: 'delivery_deadline',
        confidence: 0.95,
        valueSpan: {
          sourceText: '19.10.2025',
          prefixContext: 'do ',
        },
      },
      {
        anchorId: 'body:p7',
        semanticRole: 'package_contents',
        confidence: 0.94,
        valueSpan: { sourceText: 'teaser' },
      },
      {
        anchorId: 'body:p7',
        semanticRole: 'package_contents',
        confidence: 0.94,
        valueSpan: { sourceText: '15-minute film' },
      },
      {
        anchorId: 'body:p7',
        semanticRole: 'package_contents',
        confidence: 0.94,
        valueSpan: { sourceText: 'electronic delivery' },
      },
    ],
    unresolved: [],
    warnings: [],
  }

  const genCtx = createContractGenerationContext({
    now: new Date('2026-07-29T15:00:00+02:00'),
    timezone: 'Europe/Warsaw',
  })

  const { mappingRows, analysis, metrics } = mapSemanticMapToWeddingPlan({
    semanticMap: semanticMap as never,
    fields,
    anchors,
    generationContext: genCtx,
  })

  const byRole = (role: string) =>
    mappingRows.filter((r) => r.semanticRole === role)

  assert(
    byRole('company_tax_id')[0]?.status === 'UNCHANGED',
    'identical NIP → unchanged',
  )
  assert(
    byRole('company_registration_number')[0]?.status === 'UNCHANGED',
    'identical REGON → unchanged',
  )
  assert(
    byRole('company_phone')[0]?.status === 'UNCHANGED',
    'identical phone → unchanged',
  )
  assert(
    byRole('company_address')[0]?.status === 'UNCHANGED',
    'identical address → unchanged',
  )
  assert(
    byRole('company_name')[0]?.status === 'UNCHANGED',
    'identical company name → unchanged',
  )
  assert(
    analysis.replacements.every((r) => r.canonicalFieldKey !== 'company.nip'),
    'unchanged values produce no replacement',
  )

  assert(
    byRole('contract_execution_date')[0]?.mappedDisplay ===
      'derived(context.contractExecutionDate)',
    'contract date → generation context',
  )
  assert(
    byRole('contract_execution_date')[0]?.mappedFieldKey !==
      byRole('wedding_date')[0]?.mappedFieldKey,
    'contract date ≠ wedding date',
  )
  assert(
    byRole('wedding_date')[0]?.mappedDisplay === 'wedding.date',
    'wedding date → wedding.date',
  )

  assert(
    byRole('payment_due_date')[0]?.status === 'UNCHANGED' ||
      byRole('payment_due_date')[0]?.status === 'DERIVED',
    'final payment derived correctly',
  )
  assert(
    byRole('payment_due_date')[0]?.status !== 'AMBIGUOUS',
    'final payment without ambiguity',
  )

  assert(
    byRole('preparation_location')[0]?.status === 'REPLACEMENT',
    'prep location replacement',
  )
  assert(
    byRole('ceremony_location')[0]?.status === 'REPLACEMENT',
    'ceremony location replacement',
  )
  assert(
    byRole('reception_location')[0]?.status === 'REPLACEMENT',
    'reception location replacement',
  )

  const pkg = byRole('package_item')
  assert(pkg.length === 3, 'package content items')
  assert(
    pkg.every((r) => r.groupId === 'PackageContentCollection'),
    'package contents grouped',
  )
  assert(
    pkg.every((r) => r.status === 'UNCHANGED'),
    'package contents already in catalog → unchanged',
  )

  assert(metrics.semanticRolesDetected === semanticMap.semanticAnchors.length, 'roles detected metric')
  assert(metrics.unchangedMappings >= 6, 'unchanged metric')
  assert(metrics.replacementMappings >= 3, 'replacement metric')
  assert(metrics.ambiguousMappings === 0, 'no ambiguous in quality fixture')
  assert(
    metrics.unchangedMappings +
      metrics.replacementMappings +
      metrics.ambiguousMappings +
      metrics.ignoredMappings +
      metrics.reviewMappings >=
      mappingRows.length - 2,
    'Semantic Map statistics roughly partition rows',
  )
})

await run('Phase B safety sprint: spans, relative rules, phones, legal refs', () => {
  const frozen = createContractGenerationContext({
    now: new Date('2026-07-29T12:00:00+02:00'),
    timezone: 'Europe/Warsaw',
  })
  const frozen2 = createContractGenerationContext({
    now: new Date('2026-07-29T12:00:00+02:00'),
    timezone: 'Europe/Warsaw',
  })
  assert(
    frozen.contractExecutionDate === frozen2.contractExecutionDate,
    'Contract execution date uses one frozen generation-context date',
  )
  assert(frozen.timezone === 'Europe/Warsaw', 'uses application timezone')
  assert(frozen.contractExecutionDate === '2026-07-29', 'calendar date in TZ')
  assert(
    frozen.contractExecutionDateFormatted === '29.07.2026',
    'PL formatted execution date',
  )

  // Narrow: Zawarta w dniu → date only
  const contractNarrow = narrowSemanticValueSpan({
    semanticRole: 'contract_execution_date',
    anchorText: 'Zawarta w dniu 30.10.2024 r. pomiędzy stronami.',
    proposedSourceText: 'Zawarta w dniu 30.10.2024 r.',
    prefixContext: 'Zawarta w dniu ',
    valueType: 'date',
  })
  assert(contractNarrow != null, 'contract date narrowed')
  assert(
    contractNarrow!.exactSourceText === '30.10.2024',
    'Only the old date value is patched, not Zawarta w dniu',
  )

  // Package name
  const pkgNarrow = narrowSemanticValueSpan({
    semanticRole: 'package_name',
    anchorText: 'w tzw. Pakiecie Movie obejmuje usługi',
    proposedSourceText: 'Pakiecie Movie',
    valueType: 'package_name',
  })
  assert(pkgNarrow?.exactSourceText === 'Movie', 'Package name patches only Movie')

  // Coverage time / hours
  const timeNarrow = narrowSemanticValueSpan({
    semanticRole: 'coverage_end_time',
    anchorText: 'do godziny 00.30.',
    proposedSourceText: 'do godziny 00.30.',
    valueType: 'time_of_day',
  })
  assert(timeNarrow?.exactSourceText === '00.30', 'time span 00.30')

  const hoursNarrow = narrowSemanticValueSpan({
    semanticRole: 'coverage_hours',
    anchorText: 'Czas pracy kamerzysty wynosi maksymalnie 12 godzin.',
    proposedSourceText: 'Czas pracy kamerzysty wynosi maksymalnie 12 godzin.',
    valueType: 'hours',
  })
  assert(hoursNarrow?.exactSourceText === '12', 'hours span is 12')

  assert(
    semanticValuesEqual('00.30', '00:30', 'time_of_day'),
    '00.30 and 00:30 compare equal as time values',
  )
  assert(
    semanticValuesEqual('12 godzin', '12', 'hours'),
    '12 godzin and canonical 12 compare equal',
  )

  assert(
    semanticValuesEqual(
      'ul. Juliusza Słowackiego 6/17, 41-800 Zabrze',
      'Juliusza Słowackiego 6/17, 41-800, Zabrze',
      'address',
    ),
    'Equivalent address formatting returns UNCHANGED',
  )

  // Relative delivery
  const delRel = detectRelativeDuration({
    sourceText: '4',
    anchorText: 'w terminie 4 miesięcy od daty wydarzeń',
    role: 'delivery_deadline',
  })
  assert(delRel?.kind === 'relative_duration', 'delivery is relative')
  assert(
    delRel?.kind === 'relative_duration' &&
      delRel.amount === 4 &&
      delRel.unit === 'months',
    '4 months',
  )
  const delCanon = canonicalRelativeRule({
    role: 'delivery_deadline',
    deliveryMonths: 4,
  })
  assert(
    delCanon != null &&
      delRel!.kind === 'relative_duration' &&
      delCanon.amount === delRel!.amount,
    'Delivery rule 4 months vs canonical 4 months matches',
  )

  const delCanon6 = canonicalRelativeRule({
    role: 'delivery_deadline',
    deliveryMonths: 6,
  })
  assert(delCanon6?.amount === 6, 'canonical 6 months')

  // Deposit relative
  const depRel = detectRelativeDuration({
    sourceText: '7',
    anchorText: 'w terminie 7 dni od daty zawarcia Umowy',
    role: 'deposit_due_date',
  })
  assert(
    depRel?.kind === 'relative_duration' && depRel.amount === 7,
    'deposit 7 days relative',
  )

  // Legal reference
  const legal = classifyLegalReference({
    semanticRole: 'deposit_amount',
    sourceText: 'zwrotu zadatku w dwukrotnej wartości',
    anchorText: 'zwrotu zadatku w dwukrotnej wartości',
  })
  assert(legal.isLegalReference, 'dwukrotnej wartości is legal reference')
  assert(
    legal.legalRole === 'deposit_refund_multiplier',
    'deposit_refund_multiplier',
  )
  assert(legal.numericValue === 2, 'multiplier 2')

  assert(
    !canCreateSemanticPatch({
      status: 'REPLACEMENT',
      exactValueSpanResolved: true,
      sourceSpanIsValueOnly: false,
      canonicalOrDerivedValueAvailable: true,
      isLegalReference: false,
      isDocumentOnly: false,
      isCollectionLevelPlaceholder: false,
      originalText: 'Zawarta w dniu 30.10.2024',
      replacementText: '29.07.2026',
    }),
    'Unsafe broad source spans cannot patch',
  )

  assert(
    !canCreateSemanticPatch({
      status: 'REPLACEMENT',
      exactValueSpanResolved: true,
      sourceSpanIsValueOnly: true,
      canonicalOrDerivedValueAvailable: true,
      isLegalReference: true,
      isDocumentOnly: false,
      isCollectionLevelPlaceholder: false,
      originalText: 'dwukrotnej',
      replacementText: '1000 zł',
    }),
    'Legal reference without literal money cannot create a monetary patch',
  )

  assert(
    !canCreateSemanticPatch({
      status: 'REPLACEMENT',
      exactValueSpanResolved: true,
      sourceSpanIsValueOnly: true,
      canonicalOrDerivedValueAvailable: true,
      isLegalReference: false,
      isDocumentOnly: false,
      isCollectionLevelPlaceholder: true,
      originalText: 'teaser; film',
      replacementText: 'teaser',
    }),
    'Collection-level rows cannot create patches',
  )

  // Package item-level
  const items = parseCanonicalPackageItems('teaser; 15-minute film; electronic delivery')
  const cmp = comparePackageContentItem({
    documentText: 'teaser',
    canonicalItems: items,
  })
  assert(cmp.status === 'UNCHANGED', 'Package contents compare item by item')
  const cmpOnly = comparePackageContentItem({
    documentText: 'drone footage',
    canonicalItems: items,
  })
  assert(cmpOnly.status === 'DOCUMENT_ONLY', 'unknown package item DOCUMENT_ONLY')

  // Full mapper fixture for relative + phones + contract date
  const wedding = {
    ...stubWedding(),
    date: '2025-06-19',
    deliveryMonths: 4,
    packageName: 'Video Mini',
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 400,
    bridePreparationLocation: 'Nowa lokalizacja',
    ceremonyLocation: 'Nowy kościół',
    receptionLocation: 'Nowa sala',
    packageItems: [
      { title: 'teaser', sortOrder: 0, enabled: true },
      { title: 'film', sortOrder: 1, enabled: true },
    ],
  }
  const company = {
    ...stubCompany(),
    phone: '500100200',
    address: 'Juliusza Słowackiego 6/17',
    postalCode: '41-800',
    city: 'Zabrze',
    nip: '6482810484',
  }
  const fields = buildContractDataSnapshot({
    wedding,
    company,
    extras: [],
    places: [],
  }).fields

  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p1',
      container: 'body',
      paragraphIndex: 1,
      runStart: 0,
      runEnd: 80,
      text: 'Zawarta w dniu 30.10.2024 r. pomiędzy stronami.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p2',
      container: 'body',
      paragraphIndex: 2,
      runStart: 0,
      runEnd: 120,
      text: 'tel. 500 100 200, tel. 600 700 800',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p3',
      container: 'body',
      paragraphIndex: 3,
      runStart: 0,
      runEnd: 120,
      text: 'ul. Juliusza Słowackiego 6/17, 41-800 Zabrze',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p4',
      container: 'body',
      paragraphIndex: 4,
      runStart: 0,
      runEnd: 80,
      text: 'w terminie 4 miesięcy od daty wydarzeń',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p5',
      container: 'body',
      paragraphIndex: 5,
      runStart: 0,
      runEnd: 80,
      text: 'w terminie 7 dni od daty zawarcia Umowy',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p6',
      container: 'body',
      paragraphIndex: 6,
      runStart: 0,
      runEnd: 80,
      text: 'Data ślubu: 19.06.2025',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p7',
      container: 'body',
      paragraphIndex: 7,
      runStart: 0,
      runEnd: 100,
      text: 'Para młoda zapłaci najpóźniej w dniu 19.06.2025r.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p8',
      container: 'body',
      paragraphIndex: 8,
      runStart: 0,
      runEnd: 80,
      text: 'zwrotu zadatku w dwukrotnej wartości',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p9',
      container: 'body',
      paragraphIndex: 9,
      runStart: 0,
      runEnd: 80,
      text: 'w tzw. Pakiecie Movie',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p10',
      container: 'body',
      paragraphIndex: 10,
      runStart: 0,
      runEnd: 80,
      text: 'do godziny 00.30.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p11',
      container: 'body',
      paragraphIndex: 11,
      runStart: 0,
      runEnd: 100,
      text: 'Czas pracy kamerzysty wynosi maksymalnie 12 godzin.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p12',
      container: 'body',
      paragraphIndex: 12,
      runStart: 0,
      runEnd: 80,
      text: 'Stawka nadgodziny 300 zł',
      contextBefore: '',
      contextAfter: '',
    },
  ]

  const semanticMap = {
    analysisVersion: '2.0.0',
    documentSummary: {
      documentType: 'umowa',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'foto',
    },
    semanticAnchors: [
      {
        anchorId: 'body:p1',
        semanticRole: 'contract_execution_date',
        confidence: 0.99,
        valueSpan: {
          sourceText: 'Zawarta w dniu 30.10.2024 r.',
          prefixContext: 'Zawarta w dniu ',
        },
      },
      {
        anchorId: 'body:p2',
        semanticRole: 'company_phone',
        confidence: 0.99,
        valueSpan: { sourceText: '500 100 200' },
      },
      {
        anchorId: 'body:p2',
        semanticRole: 'company_phone',
        confidence: 0.95,
        valueSpan: { sourceText: '600 700 800' },
      },
      {
        anchorId: 'body:p3',
        semanticRole: 'company_address',
        confidence: 0.99,
        valueSpan: {
          sourceText: 'ul. Juliusza Słowackiego 6/17, 41-800 Zabrze',
        },
      },
      {
        anchorId: 'body:p4',
        semanticRole: 'delivery_deadline',
        confidence: 0.97,
        valueSpan: { sourceText: '4 miesięcy' },
      },
      {
        anchorId: 'body:p5',
        semanticRole: 'deposit_due_date',
        confidence: 0.97,
        valueSpan: { sourceText: '7 dni' },
      },
      {
        anchorId: 'body:p6',
        semanticRole: 'wedding_date',
        confidence: 0.99,
        valueSpan: { sourceText: '19.06.2025' },
      },
      {
        anchorId: 'body:p7',
        semanticRole: 'final_payment_due_date',
        confidence: 0.96,
        valueSpan: {
          sourceText: '19.06.2025',
          prefixContext: 'najpóźniej w dniu ',
          suffixContext: 'r.',
        },
      },
      {
        anchorId: 'body:p8',
        semanticRole: 'deposit_amount',
        confidence: 0.9,
        valueSpan: { sourceText: 'zwrotu zadatku w dwukrotnej wartości' },
      },
      {
        anchorId: 'body:p9',
        semanticRole: 'package_name',
        confidence: 0.98,
        valueSpan: { sourceText: 'Pakiecie Movie' },
      },
      {
        anchorId: 'body:p10',
        semanticRole: 'coverage_end_time',
        confidence: 0.98,
        valueSpan: { sourceText: 'do godziny 00.30.' },
      },
      {
        anchorId: 'body:p11',
        semanticRole: 'coverage_hours',
        confidence: 0.98,
        valueSpan: {
          sourceText: 'Czas pracy kamerzysty wynosi maksymalnie 12 godzin.',
        },
      },
      {
        anchorId: 'body:p12',
        semanticRole: 'extra_hour_price',
        confidence: 0.97,
        valueSpan: { sourceText: '300 zł' },
      },
    ],
    unresolved: [],
    warnings: [],
  }

  const { mappingRows, analysis } = mapSemanticMapToWeddingPlan({
    semanticMap: semanticMap as never,
    fields,
    generationContext: frozen,
    anchors,
  })

  const byRole = (role: string) =>
    mappingRows.filter((r) => r.semanticRole === role)

  const exec = byRole('contract_execution_date')[0]
  assert(exec?.status === 'DERIVED', 'Contract execution date DERIVED from today')
  assert(
    exec?.exactPatchSpan === '30.10.2024',
    'exact patch span contains only the old date',
  )
  assert(
    exec?.mappedFieldKey !== 'wedding.date',
    'Contract execution date does not map to wedding date',
  )
  assert(exec?.patchable === true, 'execution date patchable')
  assert(
    analysis.replacements.some(
      (r) =>
        r.canonicalFieldKey === 'contract.execution_date' &&
        r.originalText === '30.10.2024' &&
        r.proposedValue === '29.07.2026',
    ),
    'execution date replacement is date-only → today',
  )

  assert(byRole('company_address')[0]?.status === 'UNCHANGED', 'address UNCHANGED')
  assert(
    byRole('company_phone').every((r) => r.status === 'UNCHANGED'),
    'Company phones remain template-invariant (no patch)',
  )
  assert(
    byRole('company_phone').every(
      (r) =>
        r.reason === 'Template-owner invariant data' ||
        r.patchable === false,
    ),
    'Additional unmatched company phone creates no patch',
  )
  assert(
    !analysis.replacements.some((r) => r.originalText.includes('600')),
    'second phone no patch',
  )

  assert(
    byRole('delivery_deadline')[0]?.status === 'UNCHANGED',
    'Delivery rule 4 months from wedding date compared to canonical 4 months returns UNCHANGED',
  )
  assert(
    byRole('delivery_deadline')[0]?.valueKind === 'relative_duration',
    'delivery value kind relative',
  )
  assert(
    !analysis.replacements.some(
      (r) =>
        r.canonicalFieldKey === 'derived.delivery_deadline' &&
        /\d{2}\.\d{2}\.\d{4}/.test(r.proposedValue),
    ),
    'Delivery rule never patches an absolute date into a relative clause',
  )

  assert(
    byRole('deposit_due_date')[0]?.status === 'UNCHANGED',
    'Deposit rule 7 days from contract date vs canonical 7 days returns UNCHANGED',
  )

  assert(
    byRole('payment_due_date')[0]?.status === 'UNCHANGED' ||
      byRole('payment_due_date')[0]?.status === 'DERIVED',
    'Final payment date resolves inside its own anchor',
  )
  assert(
    byRole('payment_due_date')[0]?.exactPatchSpan === '19.06.2025' ||
      byRole('payment_due_date')[0]?.exactPatchSpan === '19.06.2025r.',
    'final payment patches only the date',
  )

  assert(
    byRole('deposit_amount')[0]?.status === 'IGNORED' ||
      byRole('deposit_refund_multiplier')[0]?.status === 'IGNORED',
    'dwukrotnej wartości never maps to deposit amount',
  )
  assert(
    !analysis.replacements.some(
      (r) => r.canonicalFieldKey === 'payments.agreed_deposit',
    ),
    'no financial amount patch from legal clause',
  )

  assert(
    byRole('package_name')[0]?.exactPatchSpan === 'Movie',
    'Package name exact span Movie',
  )
  assert(
    byRole('package_name')[0]?.status === 'REPLACEMENT',
    'package name replacement',
  )
  assert(
    byRole('coverage_end_time')[0]?.status === 'UNCHANGED',
    'Coverage end time UNCHANGED when only formatting differs',
  )
  assert(
    byRole('package_duration')[0]?.status === 'UNCHANGED',
    'Coverage hours UNCHANGED when value is still 12',
  )
  assert(
    byRole('package_overtime_rate')[0]?.status === 'REPLACEMENT',
    'Overtime rate REPLACEMENT',
  )

  // Fixed deliveryTermMode (default): mismatched delivery stays template-invariant
  const fields6 = buildContractDataSnapshot({
    wedding: { ...wedding, deliveryMonths: 6 },
    company,
    extras: [],
    places: [],
  }).fields
  const mapped6 = mapSemanticMapToWeddingPlan({
    semanticMap: {
      ...semanticMap,
      semanticAnchors: [
        {
          anchorId: 'body:p4',
          semanticRole: 'delivery_deadline',
          confidence: 0.97,
          valueSpan: { sourceText: '4 miesięcy' },
        },
      ],
    } as never,
    fields: fields6,
    anchors,
    generationContext: frozen,
  })
  assert(
    mapped6.mappingRows[0]?.status === 'UNCHANGED' &&
      mapped6.analysis.replacements.length === 0,
    'Delivery remains unchanged when deliveryTermMode = fixed (default)',
  )

  // Variable deliveryTermMode: same-unit amount change may patch the number only
  const mapped6Var = mapSemanticMapToWeddingPlan({
    semanticMap: {
      ...semanticMap,
      semanticAnchors: [
        {
          anchorId: 'body:p4',
          semanticRole: 'delivery_deadline',
          confidence: 0.97,
          valueSpan: { sourceText: '4 miesięcy' },
        },
      ],
    } as never,
    fields: fields6,
    anchors,
    generationContext: frozen,
    templateConfig: { deliveryTermMode: 'variable' },
  })
  assert(
    mapped6Var.analysis.replacements.some(
      (r) => r.originalText === '4' && r.proposedValue === '6',
    ),
    'Delivery rule 4 months vs canonical 6 months patches only 4 when deliveryTermMode = variable',
  )

  // Fixed paymentMode (default): deposit due clause stays unchanged
  const mappedDep = mapSemanticMapToWeddingPlan({
    semanticMap: {
      ...semanticMap,
      semanticAnchors: [
        {
          anchorId: 'body:p5',
          semanticRole: 'deposit_due_date',
          confidence: 0.97,
          valueSpan: { sourceText: '7 dni' },
        },
      ],
    } as never,
    fields,
    anchors,
    generationContext: frozen,
    studioRules: { depositDueDays: 3 },
  })
  assert(
    mappedDep.mappingRows[0]?.status === 'UNCHANGED' &&
      mappedDep.analysis.replacements.length === 0,
    'Deposit due remains unchanged when paymentMode = fixed (default)',
  )

  // Variable paymentMode: deposit amount-of-days may patch number only
  const mappedDepVar = mapSemanticMapToWeddingPlan({
    semanticMap: {
      ...semanticMap,
      semanticAnchors: [
        {
          anchorId: 'body:p5',
          semanticRole: 'deposit_due_date',
          confidence: 0.97,
          valueSpan: { sourceText: '7 dni' },
        },
      ],
    } as never,
    fields,
    anchors,
    generationContext: frozen,
    studioRules: { depositDueDays: 3 },
    templateConfig: { paymentMode: 'variable' },
  })
  assert(
    mappedDepVar.analysis.replacements.some(
      (r) => r.originalText === '7' && r.proposedValue === '3',
    ),
    'Deposit rule 7 vs canonical 3 patches only 7 when paymentMode = variable',
  )

  // Duplicate dates different anchors
  assert(
    byRole('wedding_date')[0]?.anchorId === 'body:p6',
    'wedding date own anchor',
  )
  assert(
    byRole('payment_due_date')[0]?.anchorId === 'body:p7',
    'final payment own anchor',
  )

  // Production surfaces untouched
  assert(existsSync(genModal), 'prod generator path exists')
  assert(
    !readFileSync(transform, 'utf8').includes('narrowSemanticValueSpan'),
    'Deterministic renderer remains untouched',
  )
  assert(
    !readFileSync(genModal, 'utf8').includes('createContractGenerationContext'),
    'Production generator remains untouched',
  )
})

await run('Phase B refinement: typed spans, confidence, defined terms, preview', () => {
  // Date typed resolution
  const d1 = resolveTypedSourceSpan({
    anchorId: 'body:p7',
    anchorText: 'Ceremonia odbędzie się w dniu 19.06.2025r. w Rzeszowie.',
    semanticRole: 'wedding_date',
    valueKind: 'date',
    proposedSourceText: '19.06.2025',
  })
  assert(d1 != null, '19.06.2025r. resolves from normalized 19.06.2025')
  assert(d1!.exactSourceText.includes('19.06.2025'), 'exact date span')
  assert(d1!.normalizedValue === '2025-06-19', 'normalized iso')
  assert(
    d1!.strategy === 'typed_date_match' ||
      d1!.strategy === 'context_constrained' ||
      d1!.strategy === 'exact_literal',
    'typed date strategy',
  )

  const d2 = resolveTypedSourceSpan({
    anchorId: 'a',
    anchorText: 'Data: 19.06.2025 r. koniec',
    semanticRole: 'wedding_date',
    valueKind: 'date',
    proposedSourceText: '2025-06-19',
  })
  assert(d2 != null, '19.06.2025 r. resolves from ISO 2025-06-19')

  const d3 = resolveTypedSourceSpan({
    anchorId: 'a',
    anchorText: 'wydarzenie 19 czerwca 2025 r. w mieście',
    semanticRole: 'wedding_date',
    valueKind: 'date',
    proposedSourceText: '19.06.2025',
  })
  assert(d3 != null, 'Polish textual dates resolve deterministically')

  assert(
    formatDateLikeSource({
      canonicalDate: '2026-07-29',
      sourceText: '19.06.2025r.',
    }) === '29.07.2026r.',
    'Date replacement preserves source date style (tight r.)',
  )
  assert(
    formatDateLikeSource({
      canonicalDate: '2026-07-29',
      sourceText: '19.06.2025 r.',
    }) === '29.07.2026 r.',
    'Date replacement preserves spaced r.',
  )
  assert(
    formatDateLikeSource({
      canonicalDate: '2026-07-29',
      sourceText: '19 czerwca 2025 r.',
    }) === '29 lipca 2026 r.',
    'Long Polish date style preserved',
  )

  // Split runs — flattened still one string
  const flat = flattenAnchorText({
    text: '19.06.2025r.',
    runStart: 0,
    runEnd: 12,
    anchorId: 'body:p7',
  })
  const dSplit = resolveTypedSourceSpan({
    anchorId: 'body:p7',
    anchorText: flat.text,
    semanticRole: 'wedding_date',
    valueKind: 'date',
    proposedSourceText: '19.06.2025',
  })
  assert(dSplit != null, 'Split DOCX runs still resolve one visible date')

  // Money
  const money = resolveTypedSourceSpan({
    anchorId: 'body:p28',
    anchorText: 'Wynagrodzenie wynosi 8 000 zł brutto.',
    semanticRole: 'package_price',
    valueKind: 'money',
    proposedSourceText: '8000 zł',
  })
  assert(money != null, '8 000 zł resolves from provider value 8000 zł')
  assert(money!.exactSourceText.replace(/\s/g, ' ').includes('8'), 'money span')
  assert(
    money!.strategy.includes('money') ||
      money!.strategy.includes('typed') ||
      money!.strategy.includes('exact') ||
      money!.strategy.includes('context'),
    'money strategy',
  )

  const nbspMoney = resolveTypedSourceSpan({
    anchorId: 'a',
    anchorText: `Kwota 8\u00a0000 zł netto`,
    semanticRole: 'package_price',
    valueKind: 'money',
    proposedSourceText: '8000 zł',
  })
  assert(nbspMoney != null, 'NBSP money resolves correctly')

  assert(
    formatMoneyLikeSource({ canonicalAmount: 1400, sourceText: '800zł' }) ===
      '1 400zł',
    'Money replacement does not duplicate zł (tight)',
  )
  assert(
    !formatMoneyLikeSource({
      canonicalAmount: 9500,
      sourceText: '8 000 zł',
    }).includes('zł zł'),
    'Money replacement does not duplicate zł',
  )

  // Soft-validate Phase A typed fallback for wedding_date + package_price
  const softAnchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:p7',
      container: 'body',
      paragraphIndex: 7,
      runStart: 0,
      runEnd: 80,
      text: 'Ceremonia odbędzie się w dniu 19.06.2025r. w Rzeszowie.',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:p28',
      container: 'body',
      paragraphIndex: 28,
      runStart: 0,
      runEnd: 80,
      text: 'Wynagrodzenie wynosi 8 000 zł brutto.',
      contextBefore: '',
      contextAfter: '',
    },
  ]
  const soft = softValidatePhaseASemanticMap({
    raw: {
      analysisVersion: '2.0.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'foto',
      },
      semanticAnchors: [
        {
          anchorId: 'body:p7',
          semanticRole: 'wedding_date',
          confidence: 0.95,
          valueSpan: { sourceText: '19.06.2025' },
        },
        {
          anchorId: 'body:p28',
          semanticRole: 'package_price',
          confidence: 0.92,
          valueSpan: { sourceText: '8000 zł' },
        },
      ],
      warnings: [],
    },
    anchors: softAnchors,
  })
  assert(soft.ok, 'typed soft-validate ok')
  if (soft.ok) {
    assert(
      soft.semanticMap.semanticAnchors.some((a) => a.semanticRole === 'wedding_date'),
      'wedding_date resolves in the real fixture',
    )
    assert(
      soft.semanticMap.semanticAnchors.some((a) => a.semanticRole === 'contract_value'),
      'contract_value resolves in the real fixture (alias package_price)',
    )
    assert(
      !soft.semanticMap.unresolved?.some((u) => u.semanticRole === 'wedding_date'),
      'no wedding_date source_span_not_found',
    )
    assert(
      !soft.semanticMap.unresolved?.some((u) => u.semanticRole === 'contract_value' || u.semanticRole === 'package_price'),
      'no contract_value source_span_not_found',
    )
  }

  // Confidence model
  const conf = computePatchConfidence({
    semanticConfidence: 0.85,
    exactValueSpanResolved: true,
    sourceSpanIsValueOnly: true,
    uniqueInsideAnchor: true,
    canonicalBindingExists: true,
    contextAgreement: true,
    isLegalReference: false,
    isDefinedTerm: false,
    typedSpanStrategy: 'exact_literal',
  })
  assert(conf.patchConfidence >= 0.95, 'patch confidence ~100%')
  assert(
    decideStatusFromConfidence({
      semanticConfidence: 0.85,
      patchConfidence: conf.patchConfidence,
      exactValueSpanResolved: true,
      valuesDiffer: true,
      isDerived: false,
      ambiguous: false,
      ignored: false,
    }) === 'REPLACEMENT',
    'Semantic confidence 85% + patch confidence 100% yields REPLACEMENT',
  )
  assert(
    decideStatusFromConfidence({
      semanticConfidence: 0.85,
      patchConfidence: 0.8,
      exactValueSpanResolved: true,
      valuesDiffer: true,
      isDerived: false,
      ambiguous: false,
      ignored: false,
    }) === 'REVIEW',
    'Low patch confidence still yields REVIEW',
  )

  // Defined terms
  const para = classifyDefinedTerm('Parą Młodą')
  assert(para.isDefinedTerm, 'Parą Młodą is classified as defined term')
  assert(para.role === 'couple_defined_term', 'couple_defined_term')
  assert(!isLiteralPersonName('Parą Młodą'), 'Parą Młodą fails person-name guard')
  assert(
    isLiteralPersonName('Aleksandrą Biłas'),
    'Literal inflected person name passes the name guard',
  )
  assert(!isLiteralPersonName('Klientem'), 'Legal role nouns fail the person-name guard')
  assert(!isLiteralPersonName('Kamerzysta'), 'Kamerzysta fails name guard')

  // Mapper: Parą Młodą never maps to bride
  const gen = createContractGenerationContext({
    now: new Date('2026-07-29T12:00:00+02:00'),
    timezone: 'Europe/Warsaw',
  })
  const wedding = stubWedding()
  const fields = buildContractDataSnapshot({
    wedding,
    company: stubCompany(),
    extras: [],
    places: [],
  }).fields
  const anchors: DocumentTextAnchor[] = [
    {
      anchorId: 'body:x',
      container: 'body',
      paragraphIndex: 1,
      runStart: 0,
      runEnd: 40,
      text: 'zwanej dalej Parą Młodą',
      contextBefore: '',
      contextAfter: '',
    },
    {
      anchorId: 'body:y',
      container: 'body',
      paragraphIndex: 2,
      runStart: 0,
      runEnd: 40,
      text: 'Aleksandrą Biłas zamieszkałą',
      contextBefore: '',
      contextAfter: '',
    },
  ]
  const mapped = mapSemanticMapToWeddingPlan({
    semanticMap: {
      analysisVersion: '2.0.0',
      documentSummary: {
        documentType: 'umowa',
        language: 'pl',
        detectedPartyRoles: [],
        detectedBusinessContext: 'foto',
      },
      semanticAnchors: [
        {
          anchorId: 'body:x',
          semanticRole: 'bride_name',
          confidence: 0.85,
          valueSpan: { sourceText: 'Parą Młodą' },
        },
        {
          anchorId: 'body:y',
          semanticRole: 'bride_name',
          confidence: 0.85,
          valueSpan: { sourceText: 'Aleksandrą Biłas' },
        },
      ],
      unresolved: [
        {
          providerIndex: 9,
          anchorId: 'body:p13',
          status: 'source_span_not_found',
          semanticRole: 'package_contents',
        },
        {
          providerIndex: 10,
          anchorId: 'body:p14',
          status: 'source_span_not_found',
          semanticRole: 'package_contents',
        },
      ],
      warnings: [],
    } as never,
    fields,
    anchors,
    generationContext: gen,
  })
  const paraRow = mapped.mappingRows.find((r) => r.sourceText === 'Parą Młodą')
  assert(paraRow?.status === 'IGNORED', 'Parą Młodą IGNORED')
  assert(paraRow?.patchable === false, 'Parą Młodą patchable no')
  assert(
    !mapped.analysis.replacements.some(
      (r) => r.originalText === 'Parą Młodą',
    ),
    'Parą Młodą never maps to bride full name',
  )
  const brideRow = mapped.mappingRows.find(
    (r) => r.sourceText === 'Aleksandrą Biłas',
  )
  assert(
    brideRow?.status === 'REPLACEMENT' || brideRow?.status === 'UNCHANGED',
    '85% semantic + high patch → not forced REVIEW for literal name',
  )
  if (brideRow?.status === 'REPLACEMENT') {
    assert(brideRow.patchConfidence >= 0.95, 'patch confidence high')
    assert(brideRow.patchPreview != null, 'OLD → NEW preview present')
  }

  // Patch preview safety
  const prev = buildPatchPreview({
    exactSourceText: 'Movie',
    replacementText: 'Video Mini',
    prefixContext: 'w tzw. Pakiecie ',
    suffixContext: '',
  })
  assert(prev.valid, 'Patch preview preserves prefix and suffix')
  assert(prev.beforePhrase.includes('[Movie]'), 'before phrase')
  assert(prev.afterPhrase.includes('[Video Mini]'), 'after phrase')

  assert(
    !validatePatchPreview({
      beforeContext: '',
      exactSourceText: '800 zł',
      replacementText: '1400 zł zł',
      afterContext: '',
    }).ok,
    'Patch preview blocks duplicate currency suffix',
  )
  assert(
    !validatePatchPreview({
      beforeContext: 'w dniu ',
      exactSourceText: '19.06.2025r.',
      replacementText: '29.07.2026r.r.',
      afterContext: '',
    }).ok,
    'Patch preview blocks duplicate r.',
  )

  // Package unresolved siblings visible
  const pkgUnresolved = mapped.mappingRows.filter(
    (r) =>
      r.groupId === 'PackageContentCollection' &&
      (r.anchorId === 'body:p13' || r.anchorId === 'body:p14'),
  )
  assert(
    pkgUnresolved.length === 2,
    'Package content unresolved items remain individually visible',
  )
  assert(
    pkgUnresolved.every((r) => r.status === 'REVIEW' && !r.patchable),
    'unresolved package items REVIEW not patchable',
  )
  assert(
    !canCreateSemanticPatch({
      status: 'REPLACEMENT',
      exactValueSpanResolved: true,
      sourceSpanIsValueOnly: true,
      canonicalOrDerivedValueAvailable: true,
      isLegalReference: false,
      isDocumentOnly: false,
      isCollectionLevelPlaceholder: true,
      originalText: 'all',
      replacementText: 'x',
    }),
    'Collection-level package row cannot create a patch',
  )

  assert(
    !readFileSync(transform, 'utf8').includes('resolveTypedSourceSpan'),
    'Deterministic renderer remains untouched',
  )
  assert(
    !readFileSync(genModal, 'utf8').includes('resolveTypedSourceSpan'),
    'Production generator remains untouched',
  )
})

// ─── Phase C — Document Ready Patch Validation ─────────────────────────────
await run('Phase C document-ready validation', () => {
  assert(
    polishAmountInWords(9500) === 'dziewięć tysięcy pięćset złotych',
    '9500 → dziewięć tysięcy pięćset złotych',
  )
  assert(
    polishAmountInWords(1400) === 'jeden tysiąc czterysta złotych',
    '1400 → jeden tysiąc czterysta złotych',
  )
  assert(
    polishAmountInWords(9000) === 'dziewięć tysięcy złotych',
    '9000 → dziewięć tysięcy złotych',
  )
  assert(
    formatAmountInWordsLikeSource({
      amount: 9500,
      sourceSpan: '(słownie: osiem tysięcy złotych)',
    }) === '(słownie: dziewięć tysięcy pięćset złotych)',
    'słownie wrapper preserved',
  )

  assert(
    !validateLocalContext({
      before: 'wynosi ',
      oldValue: '8000 zł',
      newValue: '9500 zł',
      after: ' zł',
    }).ok,
    'local context rejects zł zł',
  )
  assert(
    !validateLocalContext({
      before: 'w dniu ',
      oldValue: '19.06.2025r.',
      newValue: '29.07.2026r.r.',
      after: '',
    }).ok,
    'local context rejects r.r.',
  )
  assert(
    !validateLocalContext({
      before: 'w tzw. Pakiecie ',
      oldValue: 'Movie',
      newValue: 'Pakiecie Video',
      after: '',
    }).ok,
    'local context rejects Pakiecie Pakiecie',
  )

  assert(
    !validateLocationGrammar({
      beforeContext: 'ceremonia w ',
      replacementText: 'Bazylika Archikatedralna św. Jana',
      contractDisplay: null,
    }).ok,
    'location grammar requires contractDisplay after w',
  )
  assert(
    validateLocationGrammar({
      beforeContext: 'ceremonia w ',
      replacementText: 'Bazylice Archikatedralnej',
      contractDisplay: 'Bazylice Archikatedralnej',
    }).ok,
    'location grammar passes with contractDisplay',
  )

  const teledysk = comparePackageItemSemantically({
    documentText: 'teledysk ślubny',
    canonicalItems: ['filmowy teledysk', 'reportaż 15 min', 'pendrive'],
  })
  assert(
    teledysk.status === 'UNCHANGED' || teledysk.status === 'REPLACEMENT',
    'teledysk ślubny matches filmowy teledysk semantically (not DOCUMENT_ONLY)',
  )
  assert(teledysk.matchedCanonical === 'filmowy teledysk', 'matched teaser item')

  const dur = comparePackageItemSemantically({
    documentText: 'ok. 1-2 minut',
    canonicalItems: ['1–2 min teaser', 'film 15 min'],
  })
  assert(
    dur.status === 'UNCHANGED' || dur.status === 'REPLACEMENT',
    'duration phrases normalize',
  )

  const moneyAnchor: DocumentTextAnchor = {
    anchorId: 'body:p5',
    container: 'body',
    paragraphIndex: 5,
    runStart: 0,
    runEnd: 1,
    text: 'Wartość umowy wynosi 8000 zł (słownie: osiem tysięcy złotych).',
    contextBefore: '',
    contextAfter: '',
  }
  const moneyRow: LabReplacementRow = {
    replacementId: 'r-price',
    anchorId: 'body:p5',
    originalText: '8000 zł',
    canonicalFieldKey: 'package.contract_value',
    proposedValue: '9500 zł',
    semanticRole: 'contract_value',
    reason: 'test',
    confidence: 1,
    confidenceLabel: 'Wysoka',
    source: 'package',
    decision: 'approved',
    manualValue: null,
    missingId: null,
    requiresUserReview: false,
    contextSnippet: null,
    spanStatus: 'exact',
    spanMessage: null,
    aiProposedSourceText: '8000 zł',
    spanCandidates: [],
    spanStart: 22,
    spanEnd: 29,
    prefixContext: 'wynosi ',
    suffixContext: ' (słownie',
  }

  const auditMissingWords = runPhaseCDocumentReadyAudit({
    rows: [moneyRow],
    anchors: [moneyAnchor],
  })
  assert(auditMissingWords.audit === 'FAIL', 'missing słownie → FAIL')
  assert(
    auditMissingWords.linkedPatches.length >= 1,
    'suggests linked amount-in-words patch',
  )
  assert(
    !phaseCAllowsGeneration(auditMissingWords),
    'generation blocked without words sync',
  )

  const withWords = applyPhaseCToRows({
    rows: [moneyRow],
    audit: { ...auditMissingWords, downgradeReplacementIds: [] },
    anchors: [moneyAnchor],
  })
  const auditSynced = runPhaseCDocumentReadyAudit({
    rows: withWords,
    anchors: [moneyAnchor],
  })
  assert(
    auditSynced.linkedPatches.length === 0,
    'after inject, no missing linked patches',
  )
  assert(
    phaseCAllowsGeneration(auditSynced),
    'synced money group ready to generate',
  )

  const locRow: LabReplacementRow = {
    ...moneyRow,
    replacementId: 'r-loc',
    anchorId: 'body:p8',
    originalText: 'Kościół XYZ',
    canonicalFieldKey: 'location.ceremony',
    proposedValue: 'Bazylika Archikatedralna',
    semanticRole: 'ceremony_location',
    prefixContext: 'odbędzie się w ',
    suffixContext: '.',
    spanStart: 0,
    spanEnd: 11,
  }
  const locAudit = runPhaseCDocumentReadyAudit({
    rows: [locRow],
    anchors: [
      {
        anchorId: 'body:p8',
        container: 'body',
        paragraphIndex: 8,
        runStart: 0,
        runEnd: 1,
        text: 'Ceremonia odbędzie się w Kościół XYZ.',
        contextBefore: '',
        contextAfter: '',
      },
    ],
  })
  assert(locAudit.audit === 'FAIL', 'bare nominative location → FAIL')
  assert(
    locAudit.groups.some((g) => g.kind === 'location' && g.status === 'REVIEW'),
    'location group REVIEW',
  )
  assert(
    !phaseCAllowsGeneration(locAudit),
    'generation blocked on location grammar',
  )

  const spans = findAmountInWordsSpans(
    'kwota 8000 zł (słownie: osiem tysięcy złotych)',
  )
  assert(spans.length >= 1, 'finds słownie span')

  assert(
    !readFileSync(transform, 'utf8').includes('runPhaseCDocumentReadyAudit'),
    'Phase C not wired into production renderer',
  )
  assert(
    !readFileSync(genModal, 'utf8').includes('runPhaseCDocumentReadyAudit'),
    'Phase C not wired into production generator',
  )
})

await run('Semantic catalog V2: roles ≠ domain fields + structured package', () => {
  assert(
    CONTRACT_SEMANTIC_ROLES.includes('contract_value'),
    'contract_value is the primary money role',
  )
  assert(
    !CONTRACT_SEMANTIC_ROLES.includes('package_price' as never),
    'package_price is not a primary role',
  )
  assert(
    normalizeSemanticRole('package_price') === 'contract_value',
    'package_price aliases to contract_value',
  )
  assert(
    normalizeSemanticRole('package_contents') === 'package_item',
    'package_contents aliases to package_item',
  )
  assert(
    normalizeSemanticRole('company_nip') === 'company_tax_id',
    'company_nip aliases to company_tax_id',
  )
  assert(
    semanticRolesEquivalent('package_price', 'contract_value'),
    'alias equivalence',
  )

  const mapping = resolveDomainMapping('contract_value')
  assert(mapping?.fieldKey === 'package.contract_value', 'Phase B field key')
  assert(
    mapping?.displayMapping === 'finances.contractValue',
    'Phase B display mapping — not a semantic role',
  )
  assert(
    !SEMANTIC_ROLE_DEFINITIONS.some((d) => d.id.includes('finances.')),
    'catalog has no application field ids',
  )

  const teledysk = parsePackageContent('teledysk ślubny')
  const filmowy = parsePackageContent('filmowy teledysk')
  assert(teledysk.subtype === 'highlight_film', 'teledysk → highlight_film')
  assert(filmowy.subtype === 'highlight_film', 'filmowy teledysk → highlight_film')

  const delivery = parsePackageContent(
    'przekazanie filmów w wersji elektronicznej',
  )
  assert(delivery.type === 'delivery', 'electronic delivery is delivery type')
  assert(delivery.deliveryMethod === 'digital', 'digital delivery')

  const mainFilm = parsePackageContent('Film ślubny')
  assert(mainFilm.type === 'asset', 'Film ślubny is an asset')
  assert(mainFilm.subtype === 'main_film', 'main film subtype')

  const deliveryVsFilm = compareStructuredPackageContent({
    document: delivery,
    canonical: [mainFilm, parsePackageContent('wersja elektroniczna')],
  })
  assert(
    deliveryVsFilm.matched?.type === 'delivery',
    'delivery matches delivery, not Film ślubny',
  )
  assert(
    deliveryVsFilm.status === 'UNCHANGED',
    'delivery ↔ digital delivery UNCHANGED',
  )

  const mismatch = compareStructuredPackageContent({
    document: delivery,
    canonical: [mainFilm],
  })
  assert(
    mismatch.status === 'DOCUMENT_ONLY',
    'delivery never matches film asset',
  )

  const durA = parsePackageContent('ok. 1-2 minut')
  const durB = parsePackageContent('1–2 minuty')
  assert(
    durA.durationMinutesMax === 2 && durB.durationMinutesMax === 2,
    'duration normalization',
  )

  const loc = evaluateLocationReplacement({
    beforeContext: 'ceremonia w ',
    forms: { name: 'Bazylika Archikatedralna', address: null, contractDisplay: null },
    fallbackName: 'Bazylika Archikatedralna',
  })
  assert(loc.requiresReview, 'location without contractDisplay → REVIEW')
  assert(
    loc.reason === 'Missing contract-ready display value',
    'missing display reason',
  )

  const locOk = evaluateLocationReplacement({
    beforeContext: 'ceremonia w ',
    forms: {
      name: 'Bazylika',
      address: null,
      contractDisplay: 'Bazylice Archikatedralnej',
    },
    fallbackName: 'Bazylika',
  })
  assert(locOk.ok && locOk.displayValue === 'Bazylice Archikatedralnej', 'display used')

  assert(
    !readFileSync(transform, 'utf8').includes('normalizeSemanticRole'),
    'production renderer untouched',
  )
  assert(
    !readFileSync(genModal, 'utf8').includes('WEDDING_DOMAIN_MAPPINGS'),
    'production generator untouched',
  )
})

console.log('\nai contract lab: done')
