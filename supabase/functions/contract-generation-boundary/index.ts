import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { requireAuthenticatedUser } from '../_shared/requireAuthenticatedUser.ts'
import { buildRestrictedCorsHeaders } from '../_shared/security/browserCors.ts'
import { mapWeddingRowToModel, type WeddingRow } from '@/lib/api/weddings/weddingMappers.ts'
import { mergeFormAnswersIntoWeddingCore } from '@/lib/forms/mergeFormAnswersIntoWeddingCore.ts'
import { buildContractGenerationInput, type ContractGenerationInput, type GenerationPartyKey } from '@/features/contract-generation-spike/contractGenerationInput.ts'
import { authorityFingerprintPayload } from '@/features/contract-generation-spike/authorityFreshness.ts'
import { applyOptionBGenerationResponse, createGenerationSourceView, readSource, validateOptionBInput, generationInstructionsForLocale, GENERIC_CONTRACT_PRODUCT_RULES, CONFLICT_REVIEW_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from '@/features/contract-generation-spike/generator.ts'
import { diagnoseGenerationResponse, isCandidateReviewResponse, isGenerationResponse, isReviewResponse, REVIEWER_FINDING_CATEGORIES, REVIEWER_FINDING_RULE_IDS, safeReviewerFindingSummary, type CandidateReviewResponse, type ReviewResponse, type ContractGenerationAnswer } from '@/features/contract-generation-spike/generationProtocol.ts'
import { createContractGenerationBoundary, parseContractGenerationAction, ProviderOperationError, type BoundaryDiagnostic, type BoundaryReviewerResult, type ServerBoundaryContext } from '@/features/contract-generation-spike/serverBoundary.ts'
import { safeTerminalFailure } from '@/features/contract-generation-spike/terminalFailureDiagnostics.ts'
import { callStructuredProvider } from '@/features/contract-generation-spike/providerRequest.ts'
import { isTravelFeeResolved } from '@/lib/utils/travelFeeCommercial.ts'
import type { FormAnswerJson } from '@/types/formEngine'
import type { PaymentMethod, PaymentType } from '@/types/wedding'
import type { WeddingPlaceRole } from '@/types/travel'
import { authorizeMissingInputChoiceOptions, choiceBindingMapMatchesHistory, isChoiceBindingMap, readMissingInputState, sessionMatchesScope, storeMissingInputState, type ContractGenerationSession, type ResolvedMissingInput } from '@/features/contract-generation-spike/generationSession.ts'

type GenericRelationship = { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }
type GenericTable = { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: GenericRelationship[] }
type GenericSchema = {
  Tables: Record<string, GenericTable>
  Views: Record<string, { Row: Record<string, unknown>; Relationships: GenericRelationship[] }>
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
}
type DatabaseSchema = { public: GenericSchema }
type SupabaseClient = ReturnType<typeof createClient<DatabaseSchema, 'public', GenericSchema>>
type RunRow = Record<string, unknown>
type DbRow = Record<string, unknown>
type PackageRow = DbRow & { active_contract_template_id?: string | null; active_contract_template_version_id?: string | null }
type TemplateRow = DbRow & { id: string; doc_type: string; current_version_id: string | null }
type VersionRow = DbRow & { id: string; template_id: string; version_number: number; source_docx_path: string | null }
type ContractRow = DbRow & { id: string; status: string }
type FormInstanceRow = DbRow & { id: string; submitted_at: string | null }
type FormAnswerRow = DbRow & { answer_json: unknown }

function createAdminClient(supabaseUrl = Deno.env.get('SUPABASE_URL')): SupabaseClient {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) throw new Error('service_role_unavailable')
  return createClient<DatabaseSchema>(supabaseUrl, serviceRoleKey)
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const OPTION_B_ACTIVE_TTL_MS = 30 * 60 * 1000
const GENERATION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['status', 'edits', 'missingInputs', 'conflicts'],
  properties: {
    status: { enum: ['READY', 'MISSING_INPUT', 'CONFLICT_INPUT'] },
    edits: { anyOf: [{ type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'blockId', 'text', 'supersedesSourceBlockId', 'supersededSourceText'], properties: { kind: { enum: ['replace', 'insert_after'] }, blockId: { type: 'string' }, text: { type: 'string' }, supersedesSourceBlockId: { anyOf: [{ type: 'string' }, { type: 'null' }] }, supersededSourceText: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } }, { type: 'null' }] },
    missingInputs: { anyOf: [{ type: 'array', minItems: 1, items: { anyOf: [
      { type: 'object', additionalProperties: false, required: ['id', 'label', 'answerKind', 'subject'], properties: { id: { type: 'string' }, label: { type: 'string' }, answerKind: { enum: ['text', 'multiline', 'date', 'number', 'email', 'phone'] }, subject: { anyOf: [{ type: 'object', additionalProperties: false, required: ['participantKey', 'displayName'], properties: { participantKey: { type: 'string' }, displayName: { anyOf: [{ type: 'string' }, { type: 'null' }] } } }, { type: 'null' }] } } },
      { type: 'object', additionalProperties: false, required: ['id', 'kind', 'label', 'options'], properties: { id: { type: 'string' }, kind: { enum: ['choice'] }, label: { type: 'string' }, options: { type: 'array', minItems: 2, items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string' }, label: { type: 'string' } } } } } },
    ] } }, { type: 'null' }] },
    conflicts: { anyOf: [{ type: 'array', minItems: 1, items: { type: 'string' } }, { type: 'null' }] },
  },
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['status', 'findings'],
  properties: { status: { enum: ['PASS', 'FAIL'] }, findings: { anyOf: [{ type: 'array', minItems: 1, items: { type: 'string' } }, { type: 'null' }] } },
}
const CANDIDATE_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['status', 'findings'],
  properties: {
    status: { enum: ['PASS', 'FAIL'] },
    findings: { anyOf: [{ type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['category', 'ruleId', 'message'], properties: { category: { enum: [...REVIEWER_FINDING_CATEGORIES] }, ruleId: { enum: [...REVIEWER_FINDING_RULE_IDS] }, message: { type: 'string', minLength: 1 } } } }, { type: 'null' }] },
  },
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Headers(headers)
  result.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers: result })
}

function assertQuery<T>(data: T | null, error: unknown): T | null {
  if (error) throw new Error('database_read_failed')
  return data
}

function sortedJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]))
    return item
  }
  return JSON.stringify(normalize(value))
}

async function sha256(bytes: ArrayBuffer | Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer as ArrayBuffer)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function fieldsFromAnswerJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const fields = (value as Record<string, unknown>).fields
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? fields as Record<string, unknown> : {}
}

function normalizeGenerationEnvelope(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const result = value as Record<string, unknown>
  if (result.status === 'READY' && Array.isArray(result.edits) && result.missingInputs === null && result.conflicts === null) {
    return { status: 'READY', edits: result.edits }
  }
  if (result.status === 'CONFLICT_INPUT' && Array.isArray(result.conflicts) && result.edits === null && result.missingInputs === null) {
    return { status: 'CONFLICT_INPUT', conflicts: result.conflicts }
  }
  if (result.status === 'MISSING_INPUT' && Array.isArray(result.missingInputs) && result.edits === null && result.conflicts === null) {
    const missingInputs = result.missingInputs.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
      const input = { ...(raw as Record<string, unknown>) }
      if (input.subject === null) delete input.subject
      else if (input.subject && typeof input.subject === 'object' && !Array.isArray(input.subject)) {
        const subject = { ...(input.subject as Record<string, unknown>) }
        if (subject.displayName === null) delete subject.displayName
        input.subject = subject
      }
      return input
    })
    return { status: 'MISSING_INPUT', missingInputs }
  }
  return value
}

function normalizeReviewEnvelope(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const result = value as Record<string, unknown>
  if (result.status === 'PASS' && result.findings === null) return { status: 'PASS' }
  if (result.status === 'FAIL' && Array.isArray(result.findings)) return { status: 'FAIL', findings: result.findings }
  return value
}

function normalizeCandidateReviewEnvelope(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const result = value as Record<string, unknown>
  if (result.status === 'PASS' && result.findings === null) return { status: 'PASS' }
  if (result.status === 'FAIL' && Array.isArray(result.findings)) return { status: 'FAIL', findings: result.findings }
  return value
}

function sourcePathIsOwned(path: string, ownerId: string, templateId: string, versionNumber: number): boolean {
  return path === `${ownerId}/templates/${templateId}/v${versionNumber}/source.docx`
}

function mapPlace(row: DbRow) {
  const roles: WeddingPlaceRole[] = ['bride_preparation', 'groom_preparation', 'ceremony', 'reception', 'hotel', 'airport', 'other', 'preparation']
  const rawRole = row.role === 'preparation' ? 'bride_preparation' : row.role
  const role: WeddingPlaceRole = typeof rawRole === 'string' && roles.includes(rawRole as WeddingPlaceRole)
    ? rawRole as WeddingPlaceRole
    : 'other'
  return {
    id: String(row.id), weddingId: String(row.wedding_id), role,
    placeId: typeof row.place_id === 'string' ? row.place_id : null,
    formattedAddress: String(row.formatted_address ?? ''),
    label: typeof row.label === 'string' ? row.label : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    sortOrder: Number(row.sort_order ?? 0), createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
  }
}

function mapExtra(row: DbRow, fallbackName?: string) {
  const snapshotName = typeof row.name_snapshot === 'string' ? row.name_snapshot.trim() : ''
  const name = snapshotName || fallbackName?.trim() || ''
  return {
    id: String(row.id), weddingId: String(row.wedding_id), extraServiceId: String(row.extra_service_id),
    priceSnapshot: Number(row.price_snapshot), quantity: Number(row.quantity),
    createdAt: String(row.created_at ?? ''), nameSnapshot: name || undefined, name: name || undefined,
  }
}

function mapPayment(row: DbRow) {
  const amount = Number(row.amount)
  const paidAt = row.payment_date ? String(row.payment_date).slice(0, 10) : undefined
  const paymentTypes: PaymentType[] = ['deposit', 'installment', 'final', 'other']
  const paymentType: PaymentType = typeof row.type === 'string' && paymentTypes.includes(row.type as PaymentType)
    ? row.type as PaymentType
    : 'other'
  const labels: Record<PaymentType, string> = { deposit: 'Zadatek', installment: 'Wpłata', final: 'Płatność końcowa', other: 'Inne' }
  const paymentMethods: PaymentMethod[] = ['transfer', 'cash', 'blik', 'other']
  const method = typeof row.method === 'string' && paymentMethods.includes(row.method as PaymentMethod)
    ? row.method as PaymentMethod
    : undefined
  return {
    id: String(row.id), amount: Number.isFinite(amount) ? amount : 0, type: paymentType,
    label: labels[paymentType], paid: Boolean(paidAt), ...(paidAt ? { paidAt } : {}),
    ...(method ? { method } : {}),
    ...(typeof row.note === 'string' && row.note ? { note: row.note } : {}),
  }
}

function canonicalAuthorityFingerprint(authority: ContractGenerationInput, currentContext: unknown): string {
  return sortedJson(authorityFingerprintPayload(authority, currentContext))
}

async function loadServerContext(
  supabase: SupabaseClient,
  userId: string,
  weddingId: string,
  answers: ContractGenerationAnswer[],
  selectedEntities: Array<{ requirementId: string; optionId: string; partyKey: string }> = [],
): Promise<ServerBoundaryContext | null> {
  const weddingResult = await supabase.from('weddings').select('*').eq('id', weddingId).eq('user_id', userId).maybeSingle()
  const weddingRow = assertQuery(weddingResult.data, weddingResult.error)
  if (!weddingRow) return null
  const wedding = mapWeddingRowToModel(weddingRow as unknown as WeddingRow)
  const packageId = wedding.packageId
  if (!packageId) return null

  const packageResult = await supabase.from('packages').select('*').eq('id', packageId).eq('user_id', userId).maybeSingle()
  const pkg = assertQuery<PackageRow>(packageResult.data, packageResult.error)
  if (!pkg?.active_contract_template_id) return null
  const packageItemsResult = await supabase.from('package_items').select('*').eq('package_id', packageId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  const packageItems = assertQuery(packageItemsResult.data, packageItemsResult.error) ?? []

  const templateResult = await supabase.from('document_templates').select('id,user_id,name,doc_type,current_version_id,status').eq('id', pkg.active_contract_template_id).eq('user_id', userId).maybeSingle()
  const template = assertQuery(templateResult.data as TemplateRow | null, templateResult.error)
  if (!template || template.doc_type !== 'contract') return null
  const versionId = pkg.active_contract_template_version_id || template.current_version_id
  if (!versionId) return null
  const versionResult = await supabase.from('document_template_versions').select('id,template_id,version_number,source_file_name,source_docx_path').eq('id', versionId).eq('template_id', template.id).maybeSingle()
  const version = assertQuery(versionResult.data as VersionRow | null, versionResult.error)
  if (!version?.source_docx_path || !sourcePathIsOwned(version.source_docx_path, userId, template.id, Number(version.version_number))) return null

  const [paymentsResult, extrasResult, placesResult, contractResult, formsResult] = await Promise.all([
    supabase.from('payments').select('*').eq('wedding_id', weddingId).order('payment_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
    supabase.from('wedding_extra_services').select('*').eq('wedding_id', weddingId).order('created_at', { ascending: true }),
    supabase.from('wedding_places').select('*').eq('wedding_id', weddingId).order('sort_order', { ascending: true }),
    supabase.from('contracts').select('id,status').eq('wedding_id', weddingId).maybeSingle(),
    supabase.from('forms').select('id').eq('category', 'contract'),
  ])
  const payments = assertQuery(paymentsResult.data, paymentsResult.error) ?? []
  const extras = assertQuery(extrasResult.data, extrasResult.error) ?? []
  const places = assertQuery(placesResult.data, placesResult.error) ?? []
  const contract = assertQuery(contractResult.data as ContractRow | null, contractResult.error)
  const formRows = assertQuery(formsResult.data, formsResult.error) ?? []
  const formIds = formRows.map((row: DbRow) => String(row.id))
  let fields: Record<string, unknown> = {}
  if (formIds.length) {
    const instanceResult = await supabase.from('form_instances').select('id,submitted_at').eq('wedding_id', weddingId).in('form_id', formIds).in('status', ['submitted', 'approved']).order('submitted_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
    const instance = assertQuery(instanceResult.data as FormInstanceRow | null, instanceResult.error)
    if (instance?.id) {
      const answerResult = await supabase.from('form_answers').select('answer_json').eq('instance_id', instance.id).maybeSingle()
      const answer = assertQuery<FormAnswerRow>(answerResult.data, answerResult.error)
      fields = fieldsFromAnswerJson(answer?.answer_json)
      if (answer?.answer_json) {
        const hydrated = await mergeFormAnswersIntoWeddingCore(wedding, answer.answer_json as FormAnswerJson, { submittedAt: instance.submitted_at })
        Object.assign(wedding, hydrated)
      }
    }
  }
  wedding.payments = payments.map(mapPayment)
  wedding.contract = contract ? { status: contract.status } as typeof wedding.contract : { status: 'none' }
  const weddingPlaces = places.map(mapPlace)
  let fallbackNames = new Map<string, string>()
  const extraIds = [...new Set(extras.map((row: DbRow) => String(row.extra_service_id)))]
  if (extraIds.length) {
    const catalogResult = await supabase.from('extra_services').select('id,name').eq('user_id', userId).in('id', extraIds)
    const catalog = assertQuery(catalogResult.data, catalogResult.error) ?? []
    fallbackNames = new Map(catalog.map((row: DbRow) => [String(row.id), String(row.name ?? '')]))
  }
  const weddingExtras = extras.map((row: DbRow) => mapExtra(row, fallbackNames.get(String(row.extra_service_id))))
  if (!isTravelFeeResolved(wedding)) return null

  const sourceResult = await supabase.storage.from('document-files').download(version.source_docx_path)
  if (sourceResult.error || !sourceResult.data) throw new Error('source_download_failed')
  const sourceBytes = await sourceResult.data.arrayBuffer()
  if (sourceBytes.byteLength < 4) throw new Error('source_invalid')
  const sourceSha256 = await sha256(sourceBytes)

  const authority = buildContractGenerationInput({
    wedding, weddingPlaces, extras: weddingExtras,
    generationDate: new Date().toISOString().slice(0, 10),
    questionnaireFields: fields,
    userProvidedAnswers: answers.flatMap((answer) => 'value' in answer ? [{ id: answer.missingInputId, value: answer.value }] : []),
    participantAssociations: [],
    selectedEntityBindings: selectedEntities.flatMap((binding) =>
      (binding.partyKey === 'partner1' || binding.partyKey === 'partner2')
        ? [{ requirementId: binding.requirementId, optionId: binding.optionId, partyKey: binding.partyKey as GenerationPartyKey }]
        : []),
    contractRecordId: contract?.id ?? null,
    genericContractAddress: wedding.contractAddress ?? null,
  })
  const freshnessAuthority = answers.length ? buildContractGenerationInput({
    wedding, weddingPlaces, extras: weddingExtras,
    generationDate: new Date().toISOString().slice(0, 10),
    questionnaireFields: fields,
    userProvidedAnswers: [],
    participantAssociations: [],
    selectedEntityBindings: selectedEntities.flatMap((binding) =>
      (binding.partyKey === 'partner1' || binding.partyKey === 'partner2')
        ? [{ requirementId: binding.requirementId, optionId: binding.optionId, partyKey: binding.partyKey as GenerationPartyKey }]
        : []),
    contractRecordId: contract?.id ?? null,
    genericContractAddress: wedding.contractAddress ?? null,
  }) : authority
  // Answers are bound to server-held MissingInput definitions during the active
  // flow. Keep the persisted freshness fingerprint answer-free so answers can be
  // erased after preview while current wedding/source authority remains checkable.
  const authorityFingerprint = await sha256(canonicalAuthorityFingerprint(freshnessAuthority, {
    package: pkg, packageItems, payments, extras, places, contract,
    submittedQuestionnaireFields: fields,
  }))
  return {
    scope: { ownerUserId: userId, weddingId, templateId: template.id, templateVersionId: version.id, sourceSha256 },
    sourceBytes, sourceSha256, authorityFingerprint, authority,
  }
}

function mapSession(row: RunRow): ContractGenerationSession {
  const missingInputState = readMissingInputState(row.missing_inputs_json)
  const resolvedState = row.resolved_values_json && typeof row.resolved_values_json === 'object' && !Array.isArray(row.resolved_values_json)
    ? row.resolved_values_json as Record<string, unknown>
    : {}
  const choiceBindings = isChoiceBindingMap(resolvedState.choiceBindings) ? resolvedState.choiceBindings : {}
  const choiceBindingsValid = missingInputState !== null
    && choiceBindingMapMatchesHistory(missingInputState.history, choiceBindings)
  return {
    id: String(row.id), ownerUserId: String(row.owner_user_id), weddingId: String(row.wedding_id),
    templateId: String(row.template_id), templateVersionId: String(row.template_version_id),
    sourceSha256: String(row.source_sha256), state: row.session_state as ContractGenerationSession['state'],
    missingInputs: missingInputState?.pending ?? [],
    missingInputHistory: missingInputState?.history ?? [],
    missingInputHistoryValid: choiceBindingsValid,
    answers: Array.isArray(row.user_answers_json) ? row.user_answers_json as ContractGenerationSession['answers'] : [],
    choiceBindings,
    expiresAt: String(row.expires_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function temporaryCandidatePath(ownerId: string, weddingId: string, sessionId: string): string {
  return `${ownerId}/weddings/${weddingId}/drafts/${sessionId}/option-b-reviewed-candidate.docx`
}

async function removeTemporaryCandidate(
  supabase: SupabaseClient,
  ownerId: string,
  weddingId: string,
  sessionId: string,
  storedPath: unknown,
): Promise<boolean> {
  const expectedPath = temporaryCandidatePath(ownerId, weddingId, sessionId)
  if (typeof storedPath === 'string' && storedPath !== expectedPath) return false
  const { error } = await supabase.storage.from('document-files').remove([expectedPath])
  const statusCode = error && 'statusCode' in error ? String(error.statusCode) : ''
  const errorMessage = error instanceof Error ? error.message : ''
  const missingObject = statusCode === '404' || /not found|does not exist/i.test(errorMessage)
  if (error && !missingObject) return false
  await supabase.from('wedding_contract_generation_runs').update({ intermediate_docx_path: null })
    .eq('id', sessionId).eq('owner_user_id', ownerId).eq('wedding_id', weddingId)
    .eq('session_kind', 'option_b').in('session_state', ['abandoned', 'failed'])
  return true
}

async function cleanupExpiredOptionBRuns(supabaseUrl: string): Promise<void> {
  const admin = createAdminClient(supabaseUrl)
  const now = new Date()
  const [expiredResult, terminalCandidateResult] = await Promise.all([
    admin.from('wedding_contract_generation_runs')
      .select('id,wedding_id,owner_user_id,session_state,intermediate_docx_path,expires_at')
      .eq('session_kind', 'option_b').eq('ephemeral_lifecycle_version', 1)
      .lte('expires_at', now.toISOString()).limit(100),
    admin.from('wedding_contract_generation_runs')
      .select('id,wedding_id,owner_user_id,session_state,intermediate_docx_path,expires_at')
      .eq('session_kind', 'option_b').eq('ephemeral_lifecycle_version', 1)
      .in('session_state', ['failed', 'abandoned'])
      .not('intermediate_docx_path', 'is', null).limit(100),
  ])
  const { data: dueRuns, error } = expiredResult
  const { data: terminalCandidateRuns, error: terminalCandidateError } = terminalCandidateResult
  if (error || terminalCandidateError) throw new Error('cleanup_read_failed')
  const runById = new Map<string, RunRow>()
  for (const row of [...(dueRuns ?? []), ...(terminalCandidateRuns ?? [])] as RunRow[]) runById.set(String(row.id), row)
  let terminalized = 0
  let removed = 0

  for (const row of runById.values()) {
    const id = String(row.id)
    const weddingId = String(row.wedding_id)
    const ownerId = String(row.owner_user_id)
    const state = String(row.session_state)
    if (state === 'processing' || state === 'awaiting_input' || state === 'completed') {
      const { data, error: updateError } = await admin.from('wedding_contract_generation_runs').update({
        session_state: 'abandoned', generation_status: 'failed', missing_inputs_json: [], user_answers_json: [],
        resolved_values_json: {}, authority_fingerprint: null,
        expires_at: new Date(now.getTime() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
      }).eq('id', id).eq('session_kind', 'option_b').eq('ephemeral_lifecycle_version', 1).eq('session_state', state)
        .lte('expires_at', now.toISOString()).select('id').maybeSingle()
      if (updateError || !data) continue
      terminalized += 1
      if (await removeTemporaryCandidate(admin, ownerId, weddingId, id, row.intermediate_docx_path)) removed += 1
      continue
    }

    if (state === 'failed' || state === 'abandoned') {
      const candidateRemoved = await removeTemporaryCandidate(admin, ownerId, weddingId, id, row.intermediate_docx_path)
      if (!candidateRemoved) continue
      const { error: deleteError } = await admin.from('wedding_contract_generation_runs').delete()
        .eq('id', id).eq('session_kind', 'option_b').eq('ephemeral_lifecycle_version', 1)
        .in('session_state', ['failed', 'abandoned'])
        .lte('expires_at', now.toISOString())
      if (!deleteError) removed += 1
    }
  }
  console.info(JSON.stringify({ event: 'contract_generation_lifecycle', action: 'cleanup', terminalized, cleaned: removed }))
}

async function finalizeOptionBRun(
  supabase: SupabaseClient,
  ownerId: string,
  request: { weddingId: string; sessionId?: string; requestId?: string; saveToken?: string; reason: 'saved' | 'discarded' | 'abandoned' },
  corsHeaders: HeadersInit,
): Promise<Response> {
  let query = supabase.from('wedding_contract_generation_runs')
    .select('id,wedding_id,owner_user_id,session_state,generation_status,execution_id,intermediate_docx_path')
    .eq('owner_user_id', ownerId).eq('wedding_id', request.weddingId).eq('session_kind', 'option_b')
  query = request.sessionId ? query.eq('id', request.sessionId) : query.eq('idempotency_key', request.requestId!)
  const { data: run, error } = await query.maybeSingle()
  if (error) return json({ status: 'failure', code: 'temporary_failure' }, 200, corsHeaders)
  if (!run) return json({ status: 'finalized' }, 200, corsHeaders)
  const saveClaimed = run.session_state === 'processing' && run.generation_status === 'ready'
  if ((request.reason === 'saved' && !saveClaimed)
    || (saveClaimed && request.saveToken !== run.execution_id)
    || (!saveClaimed && request.saveToken)) {
    return json({ status: 'stale', code: 'session_invalid' }, 200, corsHeaders)
  }
  if (run.session_state === 'processing' || run.session_state === 'awaiting_input' || run.session_state === 'completed') {
    let terminalQuery = supabase.from('wedding_contract_generation_runs').update({
      session_state: 'abandoned', generation_status: request.reason === 'saved' ? 'ready' : 'failed',
      missing_inputs_json: [], user_answers_json: [], resolved_values_json: {}, authority_fingerprint: null,
      expires_at: new Date(Date.now() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
    }).eq('id', String(run.id)).eq('owner_user_id', ownerId).eq('session_kind', 'option_b')
      .eq('session_state', String(run.session_state))
    terminalQuery = typeof run.execution_id === 'string'
      ? terminalQuery.eq('execution_id', run.execution_id)
      : terminalQuery.is('execution_id', null)
    const { data: terminal, error: updateError } = await terminalQuery.select('id').maybeSingle()
    if (updateError || !terminal) return json({ status: 'stale', code: 'session_invalid' }, 200, corsHeaders)
  }
  await removeTemporaryCandidate(createAdminClient(), ownerId, request.weddingId, String(run.id), run.intermediate_docx_path)
  console.info(JSON.stringify({ event: 'contract_generation_lifecycle', action: request.reason, category: 'terminalized' }))
  return json({ status: 'finalized' }, 200, corsHeaders)
}

async function validateOptionBCandidate(
  supabase: SupabaseClient,
  ownerId: string,
  request: { weddingId: string; sessionId: string; saveToken: string },
  corsHeaders: HeadersInit,
): Promise<Response> {
  const { data, error } = await supabase.from('wedding_contract_generation_runs').select('*')
    .eq('id', request.sessionId).eq('wedding_id', request.weddingId).eq('owner_user_id', ownerId)
    .eq('session_kind', 'option_b').eq('session_state', 'completed')
    .gt('expires_at', new Date().toISOString()).maybeSingle()
  if (error) return json({ status: 'failure', code: 'temporary_failure' }, 200, corsHeaders)
  if (!data || data.intermediate_docx_path !== temporaryCandidatePath(ownerId, request.weddingId, request.sessionId)) {
    return json({ status: 'stale', code: 'session_invalid' }, 200, corsHeaders)
  }
  const session = mapSession(data as RunRow)
  const [context, savedFingerprint] = await Promise.all([
    loadServerContext(supabase, ownerId, request.weddingId, []),
    Promise.resolve(typeof data.authority_fingerprint === 'string' ? data.authority_fingerprint : null),
  ])
  if (!context || !sessionMatchesScope(session, context.scope) || context.sourceSha256 !== session.sourceSha256
    || !savedFingerprint || context.authorityFingerprint !== savedFingerprint) {
    await finalizeOptionBRun(supabase, ownerId, { ...request, reason: 'abandoned' }, corsHeaders)
    return json({ status: 'stale', code: 'authority_changed' }, 200, corsHeaders)
  }
  const { data: claim, error: claimError } = await createAdminClient().rpc('claim_option_b_generation_save', {
    p_owner_id: ownerId,
    p_wedding_id: request.weddingId,
    p_session_id: request.sessionId,
    p_save_token: request.saveToken,
    p_authority_fingerprint: savedFingerprint,
  })
  if (claimError) return json({ status: 'failure', code: 'temporary_failure' }, 200, corsHeaders)
  if (claim !== true) return json({ status: 'stale', code: 'session_invalid' }, 200, corsHeaders)
  return json({ status: 'candidate_valid' }, 200, corsHeaders)
}

function getProviderConfig() {
  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  const generatorModel = Deno.env.get('OPENAI_CONTRACT_GENERATOR_MODEL')?.trim()
  const reviewerModel = Deno.env.get('OPENAI_CONTRACT_REVIEWER_MODEL')?.trim()
  if (!apiKey || !generatorModel || !reviewerModel) throw new Error('provider_configuration')
  return { apiKey, generatorModel, reviewerModel }
}

function responseAuthority(context: ServerBoundaryContext) {
  return context.authority as ContractGenerationInput
}

function sourcePresentation(context: ServerBoundaryContext, fileName: string) {
  return readSource(context.sourceBytes, fileName)
}

function providerAdapters() {
  async function generator(context: ServerBoundaryContext, answers: ContractGenerationAnswer[], resolvedInputs: ResolvedMissingInput[]) {
    const authority = responseAuthority(context)
    if (validateOptionBInput(authority).length) return { status: 'FAILED' as const, category: 'input_validation_failure' as const }
    const source = await sourcePresentation(context, 'contract.docx')
    const view = createGenerationSourceView(source)
    let config: ReturnType<typeof getProviderConfig>
    try { config = getProviderConfig() } catch { return { status: 'FAILED' as const, category: 'provider_configuration_failure' as const } }
    let rawResult: unknown
    try {
      rawResult = await callStructuredProvider({
        system: generationInstructionsForLocale(authority.locale),
        user: { source: view.blocks, authorityContext: authority, resolvedMissingInputs: resolvedInputs, productRules: GENERIC_CONTRACT_PRODUCT_RULES },
        schemaName: 'option_b_generation_response_v2', schema: GENERATION_SCHEMA,
        model: config.generatorModel, apiKey: config.apiKey,
        effort: Deno.env.get('OPENAI_CONTRACT_GENERATOR_REASONING')?.trim() || 'medium',
      })
    } catch (error) {
      const category = error instanceof ProviderOperationError ? error.category : 'provider_failure'
      const failureStage = error instanceof ProviderOperationError ? error.providerFailureStage : undefined
      return {
        status: 'FAILED' as const,
        category,
        ...(failureStage || category === 'provider_failure' ? { providerFailureStage: failureStage ?? 'unknown_provider_failure' as const } : {}),
        ...(error instanceof ProviderOperationError ? {
          ...(error.failureOrigin ? { failureOrigin: error.failureOrigin } : {}),
          ...(error.providerFailureClass ? { providerFailureClass: error.providerFailureClass } : {}),
          ...(error.providerHttpStatus !== undefined ? { providerHttpStatus: error.providerHttpStatus } : {}),
        } : {}),
      }
    }
    let result: unknown
    try {
      result = normalizeGenerationEnvelope(rawResult)
      const participantKeys = new Set([...authority.parties.map((party) => party.sourceKey), ...authority.participantAssociations.map((association) => association.participant)])
      if (!isGenerationResponse(result, participantKeys)) {
        let validation: ReturnType<typeof diagnoseGenerationResponse> = null
        try { validation = diagnoseGenerationResponse(result, participantKeys) } catch { /* diagnostics must not affect the existing rejection */ }
        return {
          status: 'FAILED' as const, category: 'invalid_response' as const, providerFailureStage: 'structured_output' as const,
          failureOrigin: 'GENERATION_RESPONSE_VALIDATION_FAILED' as const,
          ...(validation ? {
            responseBranch: validation.responseBranch,
            schemaErrorCode: validation.schemaErrorCode,
            ...(validation.schemaPath ? { schemaPath: validation.schemaPath } : {}),
          } : {}),
        }
      }
    } catch {
      return { status: 'FAILED' as const, category: 'provider_failure' as const, providerFailureStage: 'adapter_mapping' as const, failureOrigin: 'GENERATION_RESPONSE_NORMALIZATION_FAILED' as const }
    }
    let applied: Awaited<ReturnType<typeof applyOptionBGenerationResponse>>
    try { applied = await applyOptionBGenerationResponse(context.sourceBytes, source, authority, view.sourceBlockIds, result) }
    catch { return { status: 'FAILED' as const, category: 'mechanical_validation_failure' as const, mechanicalFailure: { gateId: 'internal', reasonCode: 'internal_validation_failure' } as const } }
    if (applied.status === 'MISSING_INPUT') {
      const authorized = authorizeMissingInputChoiceOptions(
        applied.missingInputs,
        authority.parties.flatMap((party) => party.fullName?.value.trim()
          ? [{ key: party.sourceKey, label: party.fullName.value }]
          : []),
        () => crypto.randomUUID(),
      )
      return authorized
        ? { status: 'MISSING_INPUT' as const, ...authorized }
        : { status: 'FAILED' as const, category: 'invalid_response' as const }
    }
    if (applied.status === 'CONFLICT_INPUT') return applied
    if (applied.status !== 'READY') return {
      status: 'FAILED' as const,
      category: 'mechanical_validation_failure' as const,
      mechanicalFailure: applied.mechanicalFailure ?? { gateId: 'internal' as const, reasonCode: 'internal_validation_failure' as const },
    }
    return { status: 'READY' as const, candidate: { bytes: applied.candidateBytes, changedBlocks: applied.changedBlocks } }
  }

  async function reviewResponse(context: ServerBoundaryContext, answers: ContractGenerationAnswer[], system: string, user: unknown): Promise<ReviewResponse> {
    let config: ReturnType<typeof getProviderConfig>
    try { config = getProviderConfig() } catch { throw new ProviderOperationError('provider_configuration_failure') }
    const rawResult = await callStructuredProvider({
      system, user: { ...(user as Record<string, unknown>), authorityContext: responseAuthority(context), accumulatedAnswers: answers, productRules: GENERIC_CONTRACT_PRODUCT_RULES },
      schemaName: 'option_b_review_response_v1', schema: REVIEW_SCHEMA,
      model: config.reviewerModel, apiKey: config.apiKey,
      effort: Deno.env.get('OPENAI_CONTRACT_REVIEWER_REASONING')?.trim() || 'medium',
    })
    let result: unknown
    try { result = normalizeReviewEnvelope(rawResult) } catch { throw new ProviderOperationError('provider_failure', { providerFailureStage: 'adapter_mapping' }) }
    if (!isReviewResponse(result)) throw new ProviderOperationError('invalid_response', { providerFailureStage: 'structured_output' })
    return result
  }

  async function candidateReviewResponse(context: ServerBoundaryContext, answers: ContractGenerationAnswer[], user: unknown): Promise<CandidateReviewResponse> {
    let config: ReturnType<typeof getProviderConfig>
    try { config = getProviderConfig() } catch { throw new ProviderOperationError('provider_configuration_failure') }
    const rawResult = await callStructuredProvider({
      system: REVIEW_INSTRUCTIONS, user: { ...(user as Record<string, unknown>), authorityContext: responseAuthority(context), accumulatedAnswers: answers, productRules: GENERIC_CONTRACT_PRODUCT_RULES },
      schemaName: 'option_b_candidate_review_response_v1', schema: CANDIDATE_REVIEW_SCHEMA,
      model: config.reviewerModel, apiKey: config.apiKey,
      effort: Deno.env.get('OPENAI_CONTRACT_REVIEWER_REASONING')?.trim() || 'medium',
    })
    let result: unknown
    try { result = normalizeCandidateReviewEnvelope(rawResult) } catch { throw new ProviderOperationError('provider_failure', { providerFailureStage: 'adapter_mapping' }) }
    if (!isCandidateReviewResponse(result)) throw new ProviderOperationError('invalid_response', { providerFailureStage: 'structured_output' })
    return result
  }

  return {
    generate: generator,
    async verifyConflict(context: ServerBoundaryContext, answers: ContractGenerationAnswer[], conflicts: string[]) {
      const source = await sourcePresentation(context, 'contract.docx')
      const result = await reviewResponse(context, answers, CONFLICT_REVIEW_INSTRUCTIONS, {
        source: source.blocks.map(({ kind, text }) => ({ kind, text })),
        generationOutcome: { status: 'CONFLICT_INPUT', conflicts },
      })
      return result.status === 'PASS' ? 'confirmed' as const : 'rejected' as const
    },
    async review(context: ServerBoundaryContext, answers: ContractGenerationAnswer[], candidate: { bytes: ArrayBuffer; changedBlocks: unknown[] }): Promise<BoundaryReviewerResult> {
      const [source, candidateDoc] = await Promise.all([
        sourcePresentation(context, 'contract.docx'),
        readSource(candidate.bytes, 'candidate.docx'),
      ])
      const result = await candidateReviewResponse(context, answers, {
        source: source.blocks.map(({ kind, text }) => ({ kind, text })),
        candidate: candidateDoc.blocks.map(({ kind, text }) => ({ kind, text })),
        mechanicalDiff: candidate.changedBlocks,
      })
      if (result.status === 'PASS') return 'pass'
      const summary = safeReviewerFindingSummary(result)
      return summary ? { status: 'fail', ...summary } : { status: 'fail', findingCount: 0, findingCategories: [], findingRuleIds: [] }
    },
  }
}

function createBoundary(supabase: SupabaseClient, ownerId: string) {
  const provider = providerAdapters()
  const admin = createAdminClient()
  return createContractGenerationBoundary({
    newId: () => crypto.randomUUID(),
    loadContext: (userId, weddingId, answers, selectedEntities) => loadServerContext(supabase, userId, weddingId, answers, selectedEntities),
    async createSession(input) {
      if (input.userId !== ownerId || input.scope.ownerUserId !== ownerId) return null
      const { data, error } = await admin.rpc('begin_option_b_generation', {
        p_owner_id: ownerId,
        p_wedding_id: input.weddingId,
        p_template_id: input.scope.templateId,
        p_template_version_id: input.scope.templateVersionId,
        p_source_sha256: input.sourceSha256,
        p_authority_fingerprint: input.authorityFingerprint,
        p_execution_id: input.executionId,
        p_request_id: input.requestId,
      })
      const reply = (Array.isArray(data) ? data[0] : data) as DbRow | null
      const row = reply?.session_row as DbRow | undefined
      if (error || !reply || !row) return null
      if (reply?.replay === true) return null
      const superseded = Array.isArray(reply.superseded_candidates) ? reply.superseded_candidates as DbRow[] : []
      for (const candidate of superseded) {
        const candidateId = typeof candidate.sessionId === 'string' ? candidate.sessionId : ''
        const candidatePath = candidate.path
        if (candidateId) await removeTemporaryCandidate(admin, ownerId, input.weddingId, candidateId, candidatePath)
      }
      return mapSession(row)
    },
    async getSession(sessionId) {
      const { data, error } = await supabase.from('wedding_contract_generation_runs').select('*').eq('id', sessionId).eq('session_kind', 'option_b').eq('owner_user_id', ownerId).maybeSingle()
      if (error || !data) return null
      return mapSession(data as RunRow)
    },
    async getSessionByIdempotencyKey(userId, requestId) {
      const { data, error } = await supabase.from('wedding_contract_generation_runs').select('*').eq('owner_user_id', userId).eq('session_kind', 'option_b').eq('idempotency_key', requestId).maybeSingle()
      if (error || !data) return null
      return mapSession(data as RunRow)
    },
    async expireSession(sessionId, userId) {
      const { data, error } = await supabase.from('wedding_contract_generation_runs').update({
        session_state: 'abandoned', generation_status: 'failed', missing_inputs_json: [], user_answers_json: [],
        resolved_values_json: {}, authority_fingerprint: null,
        expires_at: new Date(Date.now() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
      }).eq('id', sessionId).eq('owner_user_id', userId).eq('session_kind', 'option_b')
        .eq('session_state', 'awaiting_input').lte('expires_at', new Date().toISOString())
        .select('id,wedding_id,owner_user_id,intermediate_docx_path').maybeSingle()
      if (error || !data) return
      await removeTemporaryCandidate(admin, userId, String(data.wedding_id), sessionId, data.intermediate_docx_path)
      console.info(JSON.stringify({ event: 'contract_generation_lifecycle', action: 'expired', category: 'timeout' }))
    },
    async claimContinuation(input) {
      const changes: DbRow = {
        session_state: 'processing', generation_status: 'processing', execution_id: input.executionId,
        user_answers_json: input.answers,
        expires_at: new Date(Date.now() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
      }
      if (input.missingInputHistoryValid) {
        const current = await supabase.from('wedding_contract_generation_runs').select('missing_inputs_json').eq('id', input.sessionId)
          .eq('owner_user_id', input.userId).eq('session_kind', 'option_b').eq('session_state', 'awaiting_input').gt('expires_at', new Date().toISOString()).maybeSingle()
        if (current.error || !current.data) return null
        const stored = readMissingInputState(current.data.missing_inputs_json)
        if (!stored || JSON.stringify(stored.history) !== JSON.stringify(input.missingInputHistory)) return null
        changes.missing_inputs_json = storeMissingInputState(stored.pending, input.missingInputHistory)
      }
      const { data, error } = await supabase.from('wedding_contract_generation_runs').update(changes).eq('id', input.sessionId).eq('owner_user_id', input.userId).eq('session_kind', 'option_b').eq('session_state', 'awaiting_input').gt('expires_at', new Date().toISOString()).select('*').maybeSingle()
      if (error || !data) return null
      return mapSession(data as RunRow)
    },
    async saveMissing(input) {
      const { data, error } = await supabase.from('wedding_contract_generation_runs').update({
        session_state: 'awaiting_input', generation_status: 'manual_input_required',
        missing_inputs_json: storeMissingInputState(input.missingInputs, input.missingInputHistory), user_answers_json: input.answers,
        resolved_values_json: { choiceBindings: input.choiceBindings },
        authority_fingerprint: input.authorityFingerprint,
        expires_at: new Date(Date.now() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
      }).eq('id', input.sessionId).eq('execution_id', input.executionId).eq('session_state', 'processing').select('id').maybeSingle()
      return !error && Boolean(data)
    },
    async persistAcceptedCandidate(input) {
      const { data: run, error: runError } = await supabase.from('wedding_contract_generation_runs').select('id,wedding_id,owner_user_id').eq('id', input.sessionId).eq('execution_id', input.executionId).eq('session_state', 'processing').eq('session_kind', 'option_b').maybeSingle()
      if (runError || !run || run.owner_user_id !== ownerId) return null
      const path = `${ownerId}/weddings/${run.wedding_id}/drafts/${run.id}/option-b-reviewed-candidate.docx`
      const { error: uploadError } = await admin.storage.from('document-files').upload(path, new Blob([input.candidate.bytes], { type: DOCX_TYPE }), { upsert: false, contentType: DOCX_TYPE })
      if (uploadError) return null
      const { data, error } = await supabase.from('wedding_contract_generation_runs').update({
        session_state: 'completed', generation_status: 'ready', missing_inputs_json: [], user_answers_json: [],
        intermediate_docx_path: path, authority_fingerprint: input.authorityFingerprint,
        expires_at: new Date(Date.now() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
      }).eq('id', String(run.id)).eq('execution_id', input.executionId).eq('session_state', 'processing').select('id').maybeSingle()
      if (error || !data) {
        await admin.storage.from('document-files').remove([path])
        return null
      }
      return String(run.id)
    },
    async markFailure(sessionId, executionId, code, terminalFailure) {
      const safeFailure = safeTerminalFailure(terminalFailure)
      const { data } = await supabase.from('wedding_contract_generation_runs').update({
        session_state: code === 'stale' ? 'abandoned' : 'failed', generation_status: 'failed',
        missing_inputs_json: [], user_answers_json: [], resolved_values_json: {}, authority_fingerprint: null,
        quality_summary_json: { terminalFailure: safeFailure },
        expires_at: new Date(Date.now() + OPTION_B_ACTIVE_TTL_MS).toISOString(),
      }).eq('id', sessionId).eq('execution_id', executionId).eq('session_kind', 'option_b').eq('session_state', 'processing')
        .select('id,wedding_id,owner_user_id,intermediate_docx_path').maybeSingle()
      if (data) await removeTemporaryCandidate(admin, ownerId, String(data.wedding_id), sessionId, data.intermediate_docx_path)
    },
    diagnose(diagnostic: BoundaryDiagnostic) {
      console.info(JSON.stringify({ event: 'contract_generation_diagnostic', ...diagnostic }))
    },
    ...provider,
  })
}

async function handleRequest(request: Request): Promise<Response> {
  const corsHeaders = buildRestrictedCorsHeaders(request, (name) => Deno.env.get(name) ?? null, 'POST, OPTIONS')
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ status: 'failure', code: 'generation_safety' }, 405, corsHeaders)
  let payload: unknown
  try { payload = await request.json() } catch { return json({ status: 'failure', code: 'generation_safety' }, 400, corsHeaders) }
  const parsed = parseContractGenerationAction(payload)
  if (!parsed) return json({ status: 'failure', code: 'generation_safety' }, 400, corsHeaders)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return json({ status: 'failure', code: 'temporary_failure' }, 503, corsHeaders)
  if (parsed.action === 'cleanup_expired') {
    const cleanupToken = Deno.env.get('OPTION_B_CLEANUP_TOKEN')
    if (!cleanupToken || request.headers.get('Authorization') !== `Bearer ${cleanupToken}`) {
      return json({ status: 'error', code: 'unauthorized' }, 401, corsHeaders)
    }
    try {
      await cleanupExpiredOptionBRuns(supabaseUrl)
      return json({ status: 'cleanup_complete' }, 200, corsHeaders)
    } catch {
      console.warn(JSON.stringify({ event: 'contract_generation_lifecycle', action: 'cleanup', category: 'cleanup_failure' }))
      return json({ status: 'cleanup_unavailable' }, 503, corsHeaders)
    }
  }

  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth.status === 401
    ? json({ status: 'error', code: 'unauthorized' }, 401, corsHeaders)
    : json({ status: 'failure', code: 'temporary_failure' }, 503, corsHeaders)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return json({ status: 'failure', code: 'temporary_failure' }, 503, corsHeaders)
  const supabase = createClient<DatabaseSchema>(supabaseUrl, anonKey, { global: { headers: { Authorization: auth.authHeader } } })
  if (parsed.action === 'start') {
    const { data, error } = await supabase.from('weddings').select('id').eq('id', parsed.request.weddingId).eq('user_id', auth.userId).maybeSingle()
    if (error) return json({ status: 'failure', code: 'temporary_failure' }, 503, corsHeaders)
    if (!data) return json({ status: 'error', code: 'forbidden' }, 403, corsHeaders)
  }
  if (parsed.action === 'candidate') {
    const { data: run, error } = await supabase.from('wedding_contract_generation_runs')
      .select('id,wedding_id,owner_user_id,session_state,intermediate_docx_path')
      .eq('id', parsed.request.candidateId).eq('wedding_id', parsed.request.weddingId)
      .eq('owner_user_id', auth.userId).eq('session_kind', 'option_b').eq('session_state', 'completed')
      .gt('expires_at', new Date().toISOString()).maybeSingle()
    if (error) return json({ status: 'failure', code: 'temporary_failure' }, 503, corsHeaders)
    if (!run || run.owner_user_id !== auth.userId) return json({ status: 'stale', code: 'session_invalid' }, 200, corsHeaders)
    const candidatePath = temporaryCandidatePath(auth.userId, parsed.request.weddingId, parsed.request.candidateId)
    if (run.intermediate_docx_path !== candidatePath) return json({ status: 'failure', code: 'generation_safety' }, 200, corsHeaders)
    const { data: candidate, error: downloadError } = await supabase.storage.from('document-files').download(candidatePath)
    if (downloadError || !candidate) return json({ status: 'failure', code: 'temporary_failure' }, 503, corsHeaders)
    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', 'application/octet-stream')
    headers.set('Cache-Control', 'no-store')
    return new Response(candidate, { status: 200, headers })
  }
  if (parsed.action === 'finalize') {
    return finalizeOptionBRun(supabase, auth.userId, parsed.request, corsHeaders)
  }
  if (parsed.action === 'validate_candidate') {
    return validateOptionBCandidate(supabase, auth.userId, parsed.request, corsHeaders)
  }
  const boundary = createBoundary(supabase, auth.userId)
  const result = parsed.action === 'start'
    ? await boundary.start(auth.userId, parsed.request)
    : await boundary.continue(auth.userId, parsed.request)
  console.info(JSON.stringify({ event: 'contract_generation_boundary', action: parsed.action, sessionId: 'sessionId' in result ? result.sessionId : undefined, result: result.status }))
  return json(result, 200, corsHeaders)
}

Deno.serve(async (request) => {
  try { return await handleRequest(request) }
  catch {
    // Never return provider, database, prompt, or personal-data details.
    return json({ status: 'failure', code: 'temporary_failure' }, 200)
  }
})
