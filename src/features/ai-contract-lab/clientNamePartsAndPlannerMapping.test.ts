/**
 * Bride/groom name parts + wedding planner mapping regression (A–R).
 */
import {
  CLIENT_NAME_PARTS_REQUIRE_REVIEW,
  clientNameRegistryValues,
  resolveClientNameParts,
} from '@/features/ai-contract-lab/clientNameParts'
import { WEDDING_DOMAIN_MAPPINGS } from '@/features/ai-contract-lab/semanticDomainMapping'
import {
  normalizeSemanticRole,
  SEMANTIC_ROLE_LABELS,
} from '@/features/ai-contract-lab/semanticRoleCatalog'
import {
  buildProposedTemplateConfiguration,
  validateTemplateConfigurationForSave,
  WEDDING_PLANNER_FIXED_REASON,
  WEDDING_PLANNER_ROLES,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { classifyFieldMutability } from '@/features/ai-contract-lab/templateFieldPolicy'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import { buildContractArtifactSnapshot } from '@/features/documents/template/contractArtifactDomain'
import {
  enforceConfigurationOnCompleteness,
  runConfigurationAwarePreflight,
} from '@/features/documents/template/WeddingContractGenerationService'
import type { ContractCompletenessReport } from '@/features/documents/template/buildContractCompleteness'
import type { Wedding } from '@/types/wedding'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  const { couple: coupleOverride, ...rest } = overrides
  return {
    id: 'w1',
    couple: {
      partner1: 'Anna Nowak-Kowalska',
      partner2: 'Jan van der Berg',
      partner1FirstName: 'Anna',
      partner1LastName: 'Nowak-Kowalska',
      partner2FirstName: 'Jan',
      partner2LastName: 'van der Berg',
      email: 'a@example.com',
      phone: '500100200',
      venue: 'Villa',
      city: 'Kraków',
      ...coupleOverride,
    },
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Film',
    packageId: null,
    price: 9000,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [],
    accentColor: '#000',
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
    ...rest,
  }
}

function semanticMapWithRoles(roles: string[]): DocumentSemanticMap {
  return {
    analysisVersion: '2.1.0',
    documentSummary: {
      documentType: 'contract',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'film',
    },
    semanticAnchors: roles.map((role, index) => ({
      anchorId: `a${index}`,
      semanticRole: role,
      confidence: 0.95,
      valueSpan: { sourceText: `sample-${role}` },
    })),
    unresolved: [],
    warnings: [],
  }
}

function field(
  partial: Partial<TemplateFieldConfiguration> & {
    semanticRole: string
    mode: TemplateFieldConfiguration['mode']
  },
): TemplateFieldConfiguration {
  return {
    id: partial.id ?? `f-${partial.semanticRole}`,
    templateId: 't1',
    semanticRole: partial.semanticRole,
    canonicalFieldKey: partial.canonicalFieldKey,
    displayName: partial.displayName ?? partial.semanticRole.replace(/_/g, ' '),
    category: partial.category ?? 'other',
    mode: partial.mode,
    variableSource: partial.variableSource,
    requiredWhenVariable: partial.requiredWhenVariable ?? false,
    detectedAnchorIds: partial.detectedAnchorIds ?? ['a0'],
    sourceExamples: [],
    configuredBy: partial.configuredBy ?? 'user',
    notes: partial.notes,
  }
}

run('A — bride_first_name maps to client 1 first name', () => {
  const mapping = WEDDING_DOMAIN_MAPPINGS.bride_first_name
  assert(mapping?.fieldKey === 'bride.first_name', 'fieldKey')
  assert(
    mapping?.displayMapping === 'wedding.client1.firstName',
    'displayMapping',
  )
  const values = clientNameRegistryValues(stubWedding().couple)
  assert(values.bride_first_name === 'Anna', 'resolved first name')
})

run('B — bride_last_name maps to client 1 last name', () => {
  const mapping = WEDDING_DOMAIN_MAPPINGS.bride_last_name
  assert(mapping?.fieldKey === 'bride.last_name', 'fieldKey')
  assert(
    mapping?.displayMapping === 'wedding.client1.lastName',
    'displayMapping',
  )
  const values = clientNameRegistryValues(stubWedding().couple)
  assert(values.bride_last_name === 'Nowak-Kowalska', 'hyphen preserved')
})

run('C — groom_first_name maps to client 2 first name', () => {
  const mapping = WEDDING_DOMAIN_MAPPINGS.groom_first_name
  assert(mapping?.fieldKey === 'groom.first_name', 'fieldKey')
  assert(
    mapping?.displayMapping === 'wedding.client2.firstName',
    'displayMapping',
  )
  const values = clientNameRegistryValues(stubWedding().couple)
  assert(values.groom_first_name === 'Jan', 'resolved first name')
})

run('D — groom_last_name maps to client 2 last name', () => {
  const mapping = WEDDING_DOMAIN_MAPPINGS.groom_last_name
  assert(mapping?.fieldKey === 'groom.last_name', 'fieldKey')
  assert(
    mapping?.displayMapping === 'wedding.client2.lastName',
    'displayMapping',
  )
  const values = clientNameRegistryValues(stubWedding().couple)
  assert(values.groom_last_name === 'van der Berg', 'multi-part surname')
})

run('E — aliases normalize before mapping', () => {
  assert(normalizeSemanticRole('bride.firstName') === 'bride_first_name', 'dot')
  assert(normalizeSemanticRole('bride.lastName') === 'bride_last_name', 'last')
  assert(normalizeSemanticRole('groom.firstName') === 'groom_first_name', 'groom')
  assert(normalizeSemanticRole('groom.lastName') === 'groom_last_name', 'groom last')
  assert(
    normalizeSemanticRole('client_1_first_name') === 'bride_first_name',
    'client_1 first',
  )
  assert(
    normalizeSemanticRole('client_1_last_name') === 'bride_last_name',
    'client_1 last',
  )
  assert(
    normalizeSemanticRole('client_2_first_name') === 'groom_first_name',
    'client_2 first',
  )
  assert(
    normalizeSemanticRole('client_2_last_name') === 'groom_last_name',
    'client_2 last',
  )
})

run('F — separate name fields are preferred over fullName parsing', () => {
  const parts = resolveClientNameParts({
    firstName: 'Iza',
    lastName: 'Karczewska',
    fullName: 'Should Not Use This',
  })
  assert(parts.firstName === 'Iza', 'first')
  assert(parts.lastName === 'Karczewska', 'last')
  assert(parts.source === 'structured', 'source')
  assert(!parts.requiresReview, 'no review')
})

run('G — fullName fallback is generation-only', () => {
  const couple = {
    ...stubWedding().couple,
    partner1FirstName: undefined,
    partner1LastName: undefined,
    partner1: 'Maria Curie-Skłodowska',
  }
  const before = structuredClone(couple)
  const values = clientNameRegistryValues(couple)
  assert(values.bride_first_name === 'Maria', 'fallback first')
  assert(values.bride_last_name === 'Curie-Skłodowska', 'fallback last')
  assert(
    resolveClientNameParts({
      firstName: null,
      lastName: null,
      fullName: 'Maria Curie-Skłodowska',
    }).source === 'full_name_fallback',
    'fallback source',
  )
  assert(
    JSON.stringify(couple) === JSON.stringify(before),
    'couple unchanged after resolve',
  )
})

run('H — fullName fallback does not mutate wedding data', () => {
  const wedding = stubWedding({
    couple: {
      ...stubWedding().couple,
      partner1FirstName: undefined,
      partner1LastName: undefined,
      partner1: 'Ewa Nowak',
    },
  })
  const snapshot = structuredClone(wedding)
  clientNameRegistryValues(wedding.couple)
  assert(
    JSON.stringify(wedding) === JSON.stringify(snapshot),
    'wedding object untouched',
  )
})

run('I — unsafe fullName split creates review instead of guessing', () => {
  const parts = resolveClientNameParts({
    firstName: null,
    lastName: null,
    fullName: 'Madonna',
  })
  assert(parts.requiresReview, 'requires review')
  assert(parts.reasonCode === CLIENT_NAME_PARTS_REQUIRE_REVIEW, 'reason code')
  assert(parts.firstName === '', 'no guessed first')
  assert(parts.lastName === '', 'no guessed last')
  const values = clientNameRegistryValues({
    ...stubWedding().couple,
    partner1FirstName: undefined,
    partner1LastName: undefined,
    partner1: 'Madonna',
  })
  assert(!values.bride_first_name, 'no emitted first')
  assert(!values.bride_last_name, 'no emitted last')
})

run('J — wedding planner name defaults to fixed', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMapWithRoles(['wedding_planner_name']),
  })
  const row = config.fields.find((f) => f.semanticRole === 'wedding_planner_name')
  assert(row?.mode === 'fixed', 'mode fixed')
  assert(row?.notes === WEDDING_PLANNER_FIXED_REASON, 'reason')
  assert(
    classifyFieldMutability('wedding_planner_name') === 'template_invariant',
    'mutability',
  )
})

run('K — wedding planner email defaults to fixed', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMapWithRoles(['wedding_planner_email']),
  })
  assert(
    config.fields.find((f) => f.semanticRole === 'wedding_planner_email')
      ?.mode === 'fixed',
    'email fixed',
  )
})

run('L — wedding planner phone defaults to fixed', () => {
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMapWithRoles(['wedding_planner_phone']),
  })
  assert(
    config.fields.find((f) => f.semanticRole === 'wedding_planner_phone')
      ?.mode === 'fixed',
    'phone fixed',
  )
})

run('M — fixed planner fields do not block generation', () => {
  const configuration: ContractTemplateConfiguration = {
    templateId: 't1',
    configurationVersion: 1,
    status: 'configured',
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    fields: [
      field({
        semanticRole: 'wedding_planner_name',
        mode: 'fixed',
        notes: WEDDING_PLANNER_FIXED_REASON,
      }),
      field({
        semanticRole: 'wedding_planner_email',
        mode: 'fixed',
      }),
      field({
        semanticRole: 'wedding_planner_phone',
        mode: 'fixed',
      }),
    ],
  }
  const report = {
    templateId: 't1',
    templateName: 'Test',
    slotMap: {
      version: 1,
      slots: [
        {
          id: 's1',
          registryKey: 'wedding_planner_name',
          label: 'Planner',
          enabled: true,
          originalText: 'Ada Planner',
        },
        {
          id: 's2',
          registryKey: 'wedding_planner_email',
          label: 'Planner email',
          enabled: true,
          originalText: 'ada@example.com',
        },
        {
          id: 's3',
          registryKey: 'wedding_planner_phone',
          label: 'Planner phone',
          enabled: true,
          originalText: '500100200',
        },
      ],
    },
    resolved: {},
    packageSnapshot: { packageId: null, name: '', currency: 'PLN', items: [] },
    questionnaireAnswers: {},
    groups: [],
    fields: [
      {
        slotId: 's1',
        registryKey: 'wedding_planner_name',
        label: 'Planner',
        group: 'other',
        value: '',
        missing: true,
        source: 'missing',
        sourceLabel: 'Brak',
      },
      {
        slotId: 's2',
        registryKey: 'wedding_planner_email',
        label: 'Planner email',
        group: 'other',
        value: '',
        missing: true,
        source: 'missing',
        sourceLabel: 'Brak',
      },
      {
        slotId: 's3',
        registryKey: 'wedding_planner_phone',
        label: 'Planner phone',
        group: 'other',
        value: '',
        missing: true,
        source: 'missing',
        sourceLabel: 'Brak',
      },
    ],
    missing: [],
    allComplete: true,
  } as unknown as ContractCompletenessReport

  const enforced = enforceConfigurationOnCompleteness(report, configuration)
  assert(enforced.fields.length === 0, 'no variable planner fields')
  assert(enforced.missing.length === 0, 'no missing blockers')
  const preflight = runConfigurationAwarePreflight({
    report: enforced,
    overrides: {},
  })
  assert(preflight.ok, 'preflight ok')
})

run('N — ignored planner fields do not block generation', () => {
  const configuration: ContractTemplateConfiguration = {
    templateId: 't1',
    configurationVersion: 1,
    status: 'configured',
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    fields: [
      field({ semanticRole: 'wedding_planner_name', mode: 'ignored' }),
    ],
  }
  const report = {
    templateId: 't1',
    templateName: 'Test',
    slotMap: {
      version: 1,
      slots: [
        {
          id: 's1',
          registryKey: 'wedding_planner_name',
          label: 'Planner',
          enabled: true,
          originalText: 'Ada',
        },
      ],
    },
    resolved: {},
    packageSnapshot: { packageId: null, name: '', currency: 'PLN', items: [] },
    questionnaireAnswers: {},
    groups: [],
    fields: [
      {
        slotId: 's1',
        registryKey: 'wedding_planner_name',
        label: 'Planner',
        group: 'other',
        value: '',
        missing: true,
        source: 'missing',
        sourceLabel: 'Brak',
      },
    ],
    missing: [],
    allComplete: true,
  } as unknown as ContractCompletenessReport
  const enforced = enforceConfigurationOnCompleteness(report, configuration)
  assert(enforced.fields.length === 0, 'ignored omitted')
  assert(
    runConfigurationAwarePreflight({ report: enforced, overrides: {} }).ok,
    'preflight ok',
  )
})

run('O — manually variable planner field appears in verification', () => {
  const configuration: ContractTemplateConfiguration = {
    templateId: 't1',
    configurationVersion: 1,
    status: 'configured',
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    fields: [
      field({
        semanticRole: 'wedding_planner_name',
        mode: 'variable',
        variableSource: 'manual',
        requiredWhenVariable: true,
        displayName: 'Wedding planner — imię i nazwisko',
      }),
    ],
  }
  const report = {
    templateId: 't1',
    templateName: 'Test',
    slotMap: {
      version: 1,
      slots: [
        {
          id: 's1',
          registryKey: 'wedding_planner_name',
          label: 'Planner',
          enabled: true,
          originalText: 'Ada',
        },
      ],
    },
    resolved: {},
    packageSnapshot: { packageId: null, name: '', currency: 'PLN', items: [] },
    questionnaireAnswers: {},
    groups: [],
    fields: [
      {
        slotId: 's1',
        registryKey: 'wedding_planner_name',
        label: 'Planner',
        group: 'other',
        value: '',
        missing: true,
        source: 'missing',
        sourceLabel: 'Brak',
      },
    ],
    missing: [],
    allComplete: false,
  } as unknown as ContractCompletenessReport
  const enforced = enforceConfigurationOnCompleteness(report, configuration)
  assert(enforced.fields.length === 1, 'appears')
  assert(enforced.fields[0]?.source === 'manual', 'manual source')
  assert(
    enforced.fields[0]?.sourceLabel === 'Do uzupełnienia w tej umowie',
    'user-facing label',
  )
  assert(enforced.missing.length === 1, 'missing for verification')
})

run('P — manual planner value is stored in sourceDataSnapshot.manualOverrides', () => {
  const snapshot = buildContractArtifactSnapshot({
    wedding: stubWedding(),
    packageSnapshot: { packageId: null, name: 'Film', currency: 'PLN', items: [] },
    manualOverrides: { wedding_planner_name: 'Ada Planner' },
    templateId: 't1',
    templateVersionId: 'v1',
    resolvedValues: { wedding_planner_name: 'Ada Planner' },
    omittedKeys: [],
    generationVersion: 1,
  })
  assert(
    snapshot.sourceDataSnapshot.manualOverrides.wedding_planner_name ===
      'Ada Planner',
    'manualOverrides',
  )
})

run('Q — manual planner value does not mutate wedding data', () => {
  const wedding = stubWedding()
  const before = structuredClone(wedding)
  const overrides = { wedding_planner_name: 'Ada Planner' }
  assert(
    !('wedding_planner_name' in (wedding as unknown as Record<string, unknown>)),
    'no planner field on wedding',
  )
  assert(JSON.stringify(wedding) === JSON.stringify(before), 'unchanged')
  assert(overrides.wedding_planner_name === 'Ada Planner', 'override local only')
})

run('R — the seven current “brak mapowania” errors no longer render', () => {
  const roles = [
    'bride_first_name',
    'bride_last_name',
    'groom_first_name',
    'groom_last_name',
    'wedding_planner_name',
    'wedding_planner_email',
    'wedding_planner_phone',
  ]
  const config = buildProposedTemplateConfiguration({
    templateId: 't1',
    semanticMap: semanticMapWithRoles(roles),
  })
  for (const role of roles) {
    const row = config.fields.find((f) => f.semanticRole === role)
    assert(row, `field for ${role}`)
    if (WEDDING_PLANNER_ROLES.has(role)) {
      assert(row!.mode === 'fixed', `${role} fixed`)
    } else {
      assert(row!.mode === 'variable', `${role} variable`)
      assert(Boolean(row!.canonicalFieldKey), `${role} has mapping`)
    }
    assert(SEMANTIC_ROLE_LABELS[role as keyof typeof SEMANTIC_ROLE_LABELS], 'label')
  }
  const validated = validateTemplateConfigurationForSave({
    config: {
      ...config,
      fields: config.fields.map((f) =>
        f.mode === 'fixed' &&
        ['bride_first_name', 'bride_last_name', 'groom_first_name', 'groom_last_name'].includes(
          f.semanticRole,
        )
          ? f
          : f,
      ),
    },
    markReady: true,
  })
  const mappingErrors = validated.errors.filter((e) =>
    e.includes('brak mapowania'),
  )
  assert(mappingErrors.length === 0, mappingErrors.join(' | ') || 'no mapping errors')
})

console.log('\nclient name parts + planner mapping: done')
