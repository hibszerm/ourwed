import type {
  ContractTemplateConfiguration,
  TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import type { DocumentTemplateSummary } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import type {
  CompletenessField,
  ContractCompletenessReport,
} from './buildContractCompleteness'
import {
  buildGenerationReviewState,
  enforceConfigurationOnCompleteness,
  persistManualOverridesToWedding,
  registryKeysForConfiguredField,
  runConfigurationAwarePreflight,
  selectGenerationTemplates,
} from './WeddingContractGenerationService'
import {
  GenerationPipelineError,
  userFacingGenerationErrorMessage,
} from './generationPipelineError'
import type { TemplateSlot, TemplateSlotMap } from './types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

async function run(name: string, test: () => void | Promise<void>) {
  try {
    await test()
    console.log(`PASS  ${name}`)
  } catch (error) {
    console.error(`FAIL  ${name}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

function template(
  id: string,
  input: Partial<DocumentTemplateSummary> = {},
): DocumentTemplateSummary {
  return {
    id,
    userId: 'user',
    name: id,
    description: null,
    docType: 'contract',
    category: 'Film Premium',
    status: 'ready',
    isDefault: false,
    currentVersionId: `${id}-version`,
    aiAnalyzedAt: '2026-01-01',
    questionnaireFormId: null,
    meta: {
      version: 1,
      slotBindingsReady: true,
      fieldConfigurationStatus: 'ready',
      slotCounters: {
        detectedSlotCount: 1,
        requiredSlotCount: 1,
        optionalSlotCount: 0,
        boundRequiredSlotCount: 1,
        unresolvedRequiredSlotCount: 0,
        ambiguousSlotCount: 0,
        falsePositiveCount: 0,
        safeBindingsCount: 1,
      },
    },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 1,
    usageCount: 0,
    sourceFileName: `${id}.docx`,
    sourceDocxPath: `${id}.docx`,
    generationReady: true,
    detectedFieldCount: 1,
    safeBindingCount: 1,
    unresolvedCount: 0,
    ...input,
  }
}

function configuredField(
  input: Partial<TemplateFieldConfiguration> & {
    id: string
    semanticRole: string
    mode: TemplateFieldConfiguration['mode']
  },
): TemplateFieldConfiguration {
  return {
    templateId: 'template',
    displayName: input.semanticRole,
    category: 'other',
    requiredWhenVariable: false,
    detectedAnchorIds: [],
    sourceExamples: [],
    configuredBy: 'user',
    ...input,
  }
}

function configuration(
  fields: TemplateFieldConfiguration[],
  sharedLocationPolicy?: ContractTemplateConfiguration['sharedLocationPolicy'],
): ContractTemplateConfiguration {
  return {
    templateId: 'template',
    configurationVersion: 1,
    status: 'configured',
    fields,
    sharedLocationPolicy,
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

function slot(
  id: string,
  registryKey: string,
  input: Partial<TemplateSlot> = {},
): TemplateSlot {
  return {
    id,
    registryKey,
    label: registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 5,
    originalText: 'stare',
    requirement: 'required',
    ...input,
  }
}

function field(
  slotId: string,
  registryKey: string,
  missing: boolean,
): CompletenessField {
  return {
    slotId,
    registryKey,
    label: registryKey,
    group: registryKey.includes('location') ? 'wedding' : 'couple',
    value: missing ? '' : 'wartość',
    missing,
    source: missing ? 'missing' : 'wedding',
    sourceLabel: missing ? 'Brak' : 'Ślub',
  }
}

function report(
  slots: TemplateSlot[],
  fields: CompletenessField[],
): ContractCompletenessReport {
  const slotMap: TemplateSlotMap = {
    version: 1,
    slots,
    unmappedDynamics: [],
  }
  return {
    templateId: 'template',
    templateName: 'Umowa',
    slotMap,
    resolved: Object.fromEntries(fields.map((item) => [item.registryKey, item.value])),
    packageSnapshot: {
      packageId: null,
      name: '',
      currency: 'PLN',
      items: [],
    },
    questionnaireAnswers: {},
    sourceParagraphs: [],
    groups: [
      {
        id: 'couple',
        label: 'Para',
        complete: fields.every((item) => !item.missing),
        fields,
      },
    ],
    fields,
    missing: fields.filter((item) => item.missing),
    allComplete: fields.every((item) => !item.missing),
  }
}

function wedding(): Wedding {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    couple: {
      partner1: 'Anna Nowak',
      partner2: 'Jan Nowak',
      email: 'anna@example.com',
      phone: '500500500',
      venue: '',
      city: '',
    },
    date: '2026-08-01',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Film Premium',
    packageId: null,
    price: 9000,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [],
    accentColor: '#111111',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
  }
}

await run('ready selection excludes archived and unconfigured templates', () => {
  const result = selectGenerationTemplates(
    [
      template('ready'),
      template('archived', { status: 'archived' }),
      template('unconfigured', {
        meta: {
          ...template('base').meta,
          fieldConfigurationStatus: 'unconfigured',
        },
      }),
    ],
    null,
  )
  equal(
    result.classification.selectable.map((item) => item.template.id),
    ['ready'],
    'selectable templates',
  )
  assert(
    result.classification.incomplete.some(
      (item) => item.template.id === 'unconfigured',
    ),
    'unconfigured template should be diagnosed',
  )
})

await run('matching package is preselected while alternatives remain available', () => {
  const result = selectGenerationTemplates(
    [
      template('photo', { category: 'Foto' }),
      template('film', { category: 'Film Premium' }),
    ],
    'Film Premium 10h',
  )
  equal(result.preselectedTemplateId, 'film', 'package preselection')
  equal(
    result.alternatives.map((item) => item.template.id),
    ['photo'],
    'alternative remains selectable',
  )
})

await run('configuration adapter is deterministic and explicit modes win', () => {
  const fixed = configuredField({
    id: 'fixed',
    semanticRole: 'bride_name',
    canonicalFieldKey: 'bride.full_name',
    displayName: 'Imię i nazwisko klientki',
    mode: 'fixed',
  })
  const required = configuredField({
    id: 'required',
    semanticRole: 'groom_phone',
    canonicalFieldKey: 'groom.phone',
    displayName: 'Telefon klienta',
    mode: 'variable',
    requiredWhenVariable: true,
  })
  const ignored = configuredField({
    id: 'ignored',
    semanticRole: 'company_name',
    canonicalFieldKey: 'company.legal_name',
    mode: 'ignored',
  })
  equal(
    registryKeysForConfiguredField(fixed),
    ['bride_full_name'],
    'canonical registry adapter',
  )

  const base = report(
    [
      slot('bride', 'bride_full_name'),
      slot('phone', 'groom_phone'),
      slot('company', 'company_name'),
    ],
    [
      field('bride', 'bride_full_name', true),
      field('phone', 'groom_phone', true),
      field('company', 'company_name', true),
    ],
  )
  const enforced = enforceConfigurationOnCompleteness(
    base,
    configuration([fixed, required, ignored]),
  )
  equal(
    enforced.fields.map((item) => item.registryKey),
    ['groom_phone'],
    'only variable fields are user-facing',
  )
  equal(
    enforced.missing.map((item) => item.registryKey),
    ['groom_phone'],
    'only required variable is blocking',
  )
  equal(enforced.fixedRegistryKeys, ['bride_full_name'], 'fixed field retained')
  equal(enforced.ignoredRegistryKeys, ['company_name'], 'ignored field retained')
})

await run('unmapped slots preserve template text and never surface mapping diagnostics', () => {
  const configured = enforceConfigurationOnCompleteness(
    report(
      [slot('orphan', 'orphan_key', { originalText: 'Zachowany tekst' })],
      [
        {
          slotId: 'orphan',
          registryKey: 'orphan_key',
          label: 'Orphan',
          group: 'other',
          value: '',
          missing: false,
          source: 'manual',
          sourceLabel: 'Ręcznie',
        },
      ],
    ),
    configuration([]),
  )
  const preflight = runConfigurationAwarePreflight({
    report: configured,
    overrides: {},
  })
  assert(preflight.ok, preflight.errors.join(', '))
  assert(
    !preflight.errors.some((error) => /powiązania|semantic|konfiguracj/i.test(error)),
    'no engine diagnostics',
  )
  assert(preflight.omittedKeys.includes('orphan_key'), 'preserved via omit')
})

await run('missing required data blocks and preflight preserves overrides', () => {
  const required = configuredField({
    id: 'required',
    semanticRole: 'groom_phone',
    canonicalFieldKey: 'groom.phone',
    displayName: 'Telefon klienta',
    mode: 'variable',
    requiredWhenVariable: true,
  })
  const configured = enforceConfigurationOnCompleteness(
    report([slot('phone', 'groom_phone')], [field('phone', 'groom_phone', true)]),
    configuration([required]),
  )
  const overrides = { other: 'zachowaj' }
  const before = JSON.stringify(overrides)
  const preflight = runConfigurationAwarePreflight({
    report: configured,
    overrides,
  })
  assert(!preflight.ok, 'preflight should block')
  assert(preflight.errors[0]?.includes('Telefon klienta'), 'Polish field error')
  equal(JSON.stringify(overrides), before, 'input overrides unchanged')
})

await run('local overrides never call update; explicit safe scope calls once', async () => {
  let calls = 0
  const update = async (next: Wedding) => {
    calls += 1
    return next
  }
  const base = wedding()
  const local = await persistManualOverridesToWedding({
    wedding: base,
    overrides: { wedding_date: '2026-09-02' },
    scope: 'local_only',
    update,
  })
  assert(local === base, 'local-only returns original wedding')
  equal(calls, 0, 'local-only update calls')

  const updated = await persistManualOverridesToWedding({
    wedding: base,
    overrides: { wedding_date: '2026-09-02' },
    scope: 'update_wedding',
    update,
  })
  equal(calls, 1, 'explicit update calls')
  equal(updated.date, '2026-09-02', 'safe date persisted')

  let blocked = false
  try {
    await persistManualOverridesToWedding({
      wedding: base,
      overrides: { bride_address: 'Nowy adres' },
      scope: 'update_wedding',
      update,
    })
  } catch {
    blocked = true
  }
  assert(blocked, 'unsafe broad persistence should be blocked')
  equal(calls, 1, 'blocked update does not call service')
})

await run('shared location policy emits one logical value or asks explicitly', () => {
  const fields = [
    configuredField({
      id: 'prep',
      semanticRole: 'preparation_location',
      canonicalFieldKey: 'location.bride_preparation',
      mode: 'variable',
    }),
    configuredField({
      id: 'ceremony',
      semanticRole: 'ceremony_location',
      canonicalFieldKey: 'location.ceremony',
      mode: 'variable',
    }),
    configuredField({
      id: 'reception',
      semanticRole: 'reception_location',
      canonicalFieldKey: 'location.reception',
      mode: 'variable',
    }),
  ]
  const slots = [
    slot('prep', 'preparation_location'),
    slot('ceremony', 'ceremony_location'),
    slot('reception', 'reception_location'),
  ]
  const base = report(slots, [
    { ...field('prep', 'preparation_location', false), value: 'Dom' },
    { ...field('ceremony', 'ceremony_location', false), value: 'Kościół' },
    { ...field('reception', 'reception_location', false), value: 'Pałac' },
  ])
  base.resolved = {
    preparation_location: 'Dom',
    ceremony_location: 'Kościół',
    reception_location: 'Pałac',
  }

  const ask = enforceConfigurationOnCompleteness(
    base,
    configuration(fields, { mode: 'ask_each_time' }),
  )
  const blocked = runConfigurationAwarePreflight({ report: ask, overrides: {} })
  assert(!blocked.ok, 'ask-each-time should require a decision')

  const combined = enforceConfigurationOnCompleteness(
    base,
    configuration(fields, {
      mode: 'combine_locations',
      combinedFormat: '{preparation} / {ceremony} / {reception}',
    }),
  )
  const safe = runConfigurationAwarePreflight({
    report: combined,
    overrides: {},
  })
  assert(safe.ok, safe.errors.join(', '))
  const values = slots.map(
    (item) => safe.effectiveOverrides[item.registryKey!],
  )
  equal(values, ['Dom / Kościół / Pałac', 'Dom / Kościół / Pałac', 'Dom / Kościół / Pałac'], 'single logical location')
})

await run('GenerationReviewState — no editable fields allows generation', () => {
  const configured = enforceConfigurationOnCompleteness(
    report(
      [slot('bride', 'bride_full_name', { originalText: 'Anna' })],
      [{ ...field('bride', 'bride_full_name', false), value: 'Anna' }],
    ),
    configuration([
      configuredField({
        id: 'bride',
        semanticRole: 'bride_name',
        canonicalFieldKey: 'bride.full_name',
        mode: 'variable',
        requiredWhenVariable: true,
      }),
    ]),
  )
  const review = buildGenerationReviewState({
    report: configured,
    overrides: {},
  })
  assert(review.editableMissingFields.length === 0, 'no editable fields')
  assert(review.blockingUserInputs.length === 0, 'no blockers')
  assert(review.generationAllowed, 'generation allowed')
})

await run('GenerationReviewState — suppressed diagnostics do not block', () => {
  const configured = enforceConfigurationOnCompleteness(
    report(
      [slot('orphan', 'orphan_key', { originalText: 'Zachowany' })],
      [],
    ),
    configuration([]),
  )
  // Simulate internal missing that photographer UI hides.
  configured.missing = [
    {
      slotId: 'internal',
      registryKey: 'contract_execution_date',
      label: 'Data zawarcia',
      group: 'other',
      value: '',
      missing: true,
      source: 'system',
      sourceLabel: 'System',
    },
  ]
  const review = buildGenerationReviewState({
    report: configured,
    overrides: {},
  })
  assert(
    !review.editableMissingFields.some(
      (field) => field.registryKey === 'contract_execution_date',
    ),
    'derived execution date not editable',
  )
  assert(review.generationAllowed, 'derived/suppressed must not block')
  assert(runConfigurationAwarePreflight({ report: configured, overrides: {} }).ok, 'preflight shares state')
})

await run('GenerationReviewState — template invariant / preserved do not block', () => {
  const configured = enforceConfigurationOnCompleteness(
    report(
      [slot('legal', 'legal_clause', { originalText: '§ 1' })],
      [field('legal', 'legal_clause', true)],
    ),
    configuration([
      configuredField({
        id: 'legal',
        semanticRole: 'legal_clause',
        mode: 'fixed',
      }),
    ]),
  )
  const review = buildGenerationReviewState({
    report: configured,
    overrides: {},
  })
  assert(review.editableMissingFields.length === 0, 'fixed not editable')
  assert(review.generationAllowed, 'invariant does not block')
})

await run('GenerationReviewState — contextual question blocks only until answered', () => {
  const fields = [
    configuredField({
      id: 'prep',
      semanticRole: 'preparation_location',
      canonicalFieldKey: 'location.bride_preparation',
      mode: 'variable',
    }),
    configuredField({
      id: 'ceremony',
      semanticRole: 'ceremony_location',
      canonicalFieldKey: 'location.ceremony',
      mode: 'variable',
    }),
    configuredField({
      id: 'reception',
      semanticRole: 'reception_location',
      canonicalFieldKey: 'location.reception',
      mode: 'variable',
    }),
  ]
  const slots = [
    slot('prep', 'preparation_location', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
      originalText: 'Dom',
    }),
    slot('ceremony', 'ceremony_location', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
      originalText: 'Kościół',
    }),
    slot('reception', 'reception_location', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
      originalText: 'Pałac',
    }),
  ]
  const base = report(slots, [
    { ...field('prep', 'preparation_location', false), value: 'Dom' },
    { ...field('ceremony', 'ceremony_location', false), value: 'Kościół' },
    { ...field('reception', 'reception_location', false), value: 'Pałac' },
  ])
  base.resolved = {
    preparation_location: 'Dom',
    ceremony_location: 'Kościół',
    reception_location: 'Pałac',
  }
  const ask = enforceConfigurationOnCompleteness(
    base,
    configuration(fields, { mode: 'ask_each_time' }),
  )
  const blocked = buildGenerationReviewState({
    report: ask,
    overrides: {},
    sharedLocationDecision: null,
  })
  assert(blocked.editableMissingFields.length === 0, 'no editable fields')
  assert(blocked.contextualQuestions.length === 1, 'question present')
  assert(!blocked.generationAllowed, 'unanswered question blocks')

  const answered = buildGenerationReviewState({
    report: ask,
    overrides: {},
    sharedLocationDecision: 'combine',
  })
  assert(answered.generationAllowed, 'answered question allows generation')
  assert(
    answered.blockingUserInputs.length === 0,
    'no blockers after answer',
  )
})

await run('GenerationReviewState — UI and validation share the same object', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(page.includes('buildGenerationReviewState'), 'page builds review state')
  assert(page.includes('reviewState.editableMissingFields'), 'UI uses review fields')
  assert(page.includes('reviewState.generationAllowed'), 'Generate uses review gate')
  assert(
    page.includes('Wymagane uzupełnienie') &&
      page.includes('generatePending') &&
      page.includes('Uzupełnij dane'),
    'review UI shows required completion + pending guard',
  )
  assert(!page.includes('photographerFacingGenerationErrors'), 'no fallback filter path')
})

await run('GenerationReviewState — shared location all-locations is a deterministic string', () => {
  const fields = [
    configuredField({
      id: 'prep',
      semanticRole: 'preparation_location',
      canonicalFieldKey: 'location.bride_preparation',
      mode: 'variable',
      detectedAnchorIds: ['prep'],
    }),
    configuredField({
      id: 'ceremony',
      semanticRole: 'ceremony_location',
      canonicalFieldKey: 'location.ceremony',
      mode: 'variable',
      detectedAnchorIds: ['ceremony'],
    }),
    configuredField({
      id: 'reception',
      semanticRole: 'reception_location',
      canonicalFieldKey: 'location.reception',
      mode: 'variable',
      detectedAnchorIds: ['reception'],
    }),
  ]
  const slots = [
    slot('prep', 'preparation_location', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
    }),
    slot('ceremony', 'ceremony_location', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
    }),
    slot('reception', 'reception_location', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
    }),
  ]
  const base = report(slots, [
    { ...field('prep', 'preparation_location', false), value: 'Dom' },
    { ...field('ceremony', 'ceremony_location', false), value: 'Kościół' },
    { ...field('reception', 'reception_location', false), value: 'Pałac' },
  ])
  base.resolved = {
    preparation_location: 'Dom',
    ceremony_location: 'Kościół',
    reception_location: 'Pałac',
  }
  const ask = enforceConfigurationOnCompleteness(
    base,
    configuration(fields, {
      mode: 'ask_each_time',
      combinedFormat: '{preparation} / {ceremony} / {reception}',
    }),
  )
  const review = buildGenerationReviewState({
    report: ask,
    overrides: {},
    sharedLocationDecision: 'combine',
  })
  assert(review.generationAllowed, 'answered combine allows generation')
  equal(
    review.effectiveOverrides.preparation_location,
    'Dom / Kościół / Pałac',
    'combine string for preparation',
  )
  equal(
    review.effectiveOverrides.ceremony_location,
    'Dom / Kościół / Pałac',
    'combine string for ceremony',
  )
  assert(
    typeof review.effectiveOverrides.reception_location === 'string',
    'renderer receives a string, not an array',
  )
})

await run('legacy incomplete status is no longer a transform hard-gate', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/documents/template/ContractTransformationService.ts',
    ),
    'utf8',
  )
  assert(
    !src.includes("template.status === 'incomplete'"),
    'incomplete status must not hard-block generation',
  )
  assert(
    !src.includes("slotBindingsReady !== true"),
    'slotBindingsReady must not hard-block generation',
  )
  assert(
    src.includes('boundSlots.length === 0'),
    'still requires at least one physical binding',
  )
})

await run('typed generation errors preserve stage and correlation id', () => {
  const err = new GenerationPipelineError({
    code: 'docx_render_failed',
    stage: 'docx_render',
    message: 'renderer exploded',
    correlationId: 'ABC12345',
    templateId: 't1',
    weddingId: 'w1',
    cause: new Error('span missing'),
  })
  const json = err.toJSON()
  equal(json.stage, 'docx_render', 'stage retained')
  equal(json.correlationId, 'ABC12345', 'correlation retained')
  assert(json.cause != null, 'cause retained')
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(page.includes('userFacingGenerationErrorMessage'), 'UI maps typed errors')
  assert(page.includes('err.toJSON()'), 'UI logs full diagnostic')
  assert(
    typeof userFacingGenerationErrorMessage(err) === 'string',
    'friendly message available',
  )
})

await run('Umowa GP incomplete flags remain selectable for Video Mini wedding', () => {
  const gp = template('umowa-gp-aleksandra-b', {
    name: 'Umowa GP - Aleksandra B doc',
    status: 'incomplete',
    category: 'Foto',
    generationReady: false,
    safeBindingCount: 0,
    meta: {
      version: 1,
      slotBindingsReady: false,
      generationReady: false,
      fieldConfigurationStatus: 'ready',
      automaticReadinessStatus: 'ready',
      fieldConfiguration: { templateId: 'umowa-gp-aleksandra-b', fields: [] },
    },
  })
  const selection = selectGenerationTemplates([gp], 'Video Mini')
  assert(selection.classification.selectable.length === 1, 'GP selectable')
  assert(
    selection.preselectedTemplateId === gp.id,
    'preselected when only ready template',
  )
  assert(
    selection.alternatives.length + selection.recommended.length >= 1,
    'visible in ranked lists',
  )
})

console.log('\nwedding contract generation service: done')
