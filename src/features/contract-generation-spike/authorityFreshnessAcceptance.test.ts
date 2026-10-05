import assert from 'node:assert/strict'
import type { Wedding } from '@/types/wedding'
import type { ContractGenerationSession } from './generationSession'
import { authorityFingerprintPayload } from './authorityFreshness'
import { buildContractGenerationInput, type ContractGenerationInput } from './contractGenerationInput'
import { createContractGenerationBoundary, type ServerBoundaryDependencies } from './serverBoundary'

const wedding: Wedding = {
  id: 'ce475d46-c572-4499-acba-bd568f3dde4b',
  couple: {
    partner1: 'Karolina Kuś', partner2: 'Andrzej Nowacki',
    partner1FirstName: 'Karolina', partner1LastName: 'Kuś', partner2FirstName: 'Andrzej', partner2LastName: 'Nowacki',
    partner1Phone: '666777888', partner2Phone: '999777222', partner1Email: 'ka@example.test',
    partner1Address: 'Address A', email: 'ka@example.test', phone: '666777888', venue: 'Villa Love', city: '',
  },
  date: '2026-11-01', status: 'active', workflowStage: 'reservation', packageName: 'Video Standard', packageId: 'package-video-standard',
  price: 13200, depositAmount: 1000, currency: 'PLN', packageItems: [{ sourceItemId: 'item-1', title: 'Film', description: null, sortOrder: 0, enabled: true }],
  travelFeeStatus: 'charged', travelFeeAmount: 100, finalPaymentTerms: { mode: 'wedding_day' }, finalPaymentDueDate: '2026-11-01',
  payments: [], finances: [], questionnaires: { contractData: { status: 'completed' }, weddingQuestionnaire: { status: 'not_sent' } },
  contract: { status: 'none' }, checklist: [], schedule: [], notes: [], deliverables: [], timeline: [], accentColor: '#000', createdAt: '2026-09-29',
}
const extra = { id: 'extra-row', weddingId: wedding.id, extraServiceId: 'drone', nameSnapshot: 'Drone', priceSnapshot: 800, quantity: 1, createdAt: '2026-09-29' }
const questionnaireFields = { 'partner1.address': 'Contract address A', 'partner1.firstName': 'Karolina' }
const currentContext = {
  package: { id: 'package-video-standard' }, packageItems: [{ id: 'item-1', title: 'Film' }], payments: [{ amount: 1000 }],
  extras: [extra], places: [{ role: 'ceremony', formattedAddress: 'Place A' }], contract: { status: 'none' },
  submittedQuestionnaireFields: questionnaireFields,
}

function authority(options: { wedding?: Wedding; extras?: typeof extra[]; questionnaire?: Record<string, unknown>; price?: number; selected?: ContractGenerationInput['selectedEntityBindings'] } = {}) {
  return buildContractGenerationInput({
    wedding: { ...wedding, ...(options.wedding ?? {}), price: options.price ?? wedding.price },
    weddingPlaces: [{ id: 'place-1', weddingId: wedding.id, role: 'ceremony', label: 'Ceremony', formattedAddress: 'Place A', sortOrder: 0, createdAt: '2026-09-29', updatedAt: '2026-09-29' }],
    extras: options.extras ?? [extra], generationDate: '2026-10-05', questionnaireFields: options.questionnaire ?? questionnaireFields,
    selectedEntityBindings: options.selected ?? [],
  })
}

function fingerprint(authorityValue: ContractGenerationInput, current = currentContext) {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]))
      : value
  return JSON.stringify(normalize(authorityFingerprintPayload(authorityValue, current)))
}

const emptyBinding = authority()
const selectedBinding = authority({ selected: [{ requirementId: 'choice-role', optionId: 'issued-option', partyKey: 'partner1' }] })
assert.equal(fingerprint(emptyBinding), fingerprint(selectedBinding), 'run-local selectedEntityBindings do not affect freshness')
assert.notEqual(fingerprint(emptyBinding), fingerprint(authority({ wedding: { ...wedding, date: '2026-11-02' } })), 'a real wedding fact change affects freshness')
assert.notEqual(fingerprint(emptyBinding), fingerprint(authority({ questionnaire: { ...questionnaireFields, 'partner1.address': 'Contract address B' } })), 'contract address changes affect freshness')
assert.notEqual(fingerprint(emptyBinding), fingerprint(authority({ price: 14500 })), 'commercial changes affect freshness')
assert.notEqual(fingerprint(emptyBinding), fingerprint(authority({ extras: [{ ...extra, quantity: 2 }] })), 'extras changes affect freshness')
assert.notEqual(fingerprint(emptyBinding), fingerprint(authority(), { ...currentContext, submittedQuestionnaireFields: { ...questionnaireFields, 'partner1.firstName': 'Different' } }), 'questionnaire authority changes affect freshness')

const choice = { id: 'choice-role', kind: 'choice' as const, label: 'Select the authoritative party', options: [{ id: 'issued-option', label: 'Candidate One' }, { id: 'other-option', label: 'Candidate Two' }] }
const now = new Date(Date.now() + 60_000).toISOString()
let session: ContractGenerationSession = {
  id: 'freshness-session', ownerUserId: 'owner', weddingId: wedding.id, templateId: 'template', templateVersionId: 'version',
  sourceSha256: 'a'.repeat(64), state: 'processing', missingInputs: [], missingInputHistory: [], answers: [], choiceBindings: {},
  expiresAt: now, createdAt: now, updatedAt: now,
}
const scope = { ownerUserId: 'owner', weddingId: wedding.id, templateId: 'template', templateVersionId: 'version', sourceSha256: 'a'.repeat(64) }
const calls: string[] = []
const observedGeneratorBindings: unknown[] = []
let generatorCalls = 0
const loadContext = async (_owner: string, _weddingId: string, _answers: unknown[], selectedEntities: Array<{ requirementId: string; optionId: string; partyKey: string }> = []) => {
  const input = authority({ selected: selectedEntities.filter((binding) => binding.partyKey === 'partner1' || binding.partyKey === 'partner2') as ContractGenerationInput['selectedEntityBindings'] })
  return { scope, sourceBytes: new ArrayBuffer(1), sourceSha256: scope.sourceSha256, authorityFingerprint: fingerprint(input), authority: input }
}
const deps: ServerBoundaryDependencies = {
  newId: () => `execution-${generatorCalls}`,
  loadContext,
  createSession: async () => session,
  getSession: async () => session,
  getSessionByIdempotencyKey: async () => null,
  expireSession: async () => {},
  claimContinuation: async ({ answers, missingInputHistory }) => { session = { ...session, state: 'processing', answers, missingInputHistory }; return session },
  saveMissing: async ({ missingInputs, missingInputHistory, answers, choiceBindings }) => {
    session = { ...session, state: 'awaiting_input', missingInputs, missingInputHistory, answers, choiceBindings }
    return true
  },
  persistAcceptedCandidate: async () => { calls.push('preview'); return 'candidate-id' },
  markFailure: async () => { calls.push('failure'); session = { ...session, state: 'failed' } },
  generate: async (context) => {
    calls.push('generate')
    generatorCalls++
    const bindings = (context.authority as ContractGenerationInput).selectedEntityBindings
    observedGeneratorBindings.push(bindings)
    if (generatorCalls === 1) return { status: 'MISSING_INPUT', missingInputs: [choice], choiceBindings: { [choice.id]: { 'issued-option': 'partner1', 'other-option': 'partner2' } } }
    // This mock represents the normal Generator + mechanical-validation pass.
    return { status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } }
  },
  verifyConflict: async () => 'confirmed',
  review: async () => { calls.push('reviewer'); return 'pass' },
}

const boundary = createContractGenerationBoundary(deps)
const started = await boundary.start('owner', { weddingId: wedding.id, requestId: '00000000-0000-4000-8000-000000000001' })
assert.equal(started.status, 'awaiting_input')
const continued = await boundary.continue('owner', { sessionId: session.id, answers: [{ missingInputId: choice.id, optionId: 'issued-option' }] })
assert.equal(continued.status, 'ready', 'unchanged authority reaches Reviewer/Preview path rather than false stale')
assert.deepEqual(observedGeneratorBindings[1], [{ requirementId: choice.id, optionId: 'issued-option', partyKey: 'partner1' }], 'selected choice remains in continuation Generator authority')
assert.deepEqual(calls, ['generate', 'generate', 'reviewer', 'preview'], 'valid continuation reaches READY, Reviewer, and private Preview persistence')
