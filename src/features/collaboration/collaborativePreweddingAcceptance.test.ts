import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCollaborativePreweddingProjection } from './collaborativePreweddingService'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const service = read('src/features/collaboration/collaborativePreweddingService.ts')
const page = read('src/pages/WeddingDetailModernPage.tsx')
const shared = read('src/features/weddings/modern-detail/SharedV3PreweddingWorkspace.tsx')
const owner = read('src/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace.tsx')
const ownerHook = read('src/features/prewedding/usePreWeddingQuestionnaireWorkspace.ts')
const logistics = read('src/features/weddings/modern-detail/SharedV3LogisticsWorkspace.tsx')
const publicForm = read('src/features/prewedding/PreWeddingPublicFormPage.tsx')
const canonicalFields = read('src/features/prewedding/CanonicalQuestionFields.tsx')
const canonicalAnswer = read('src/features/prewedding/CanonicalQuestionAnswer.tsx')
const dayPlan = read('src/features/prewedding/PreWeddingDayPlan.tsx')
const api = read('src/lib/api/preweddingQuestionnaireService.ts')
const migration = read('supabase/migrations/20261016132505_collaboration_v3_prewedding_shared.sql')
const authority = read('src/features/weddings/detail/weddingDetailAuthority.ts')

assert.match(service, /get_my_collaborative_prewedding_v3/, 'shared adapter reads only the narrow Pre-Wedding RPC')
assert.match(service, /exactKeys\(value, \['wedding_id', 'access_version', 'prewedding_level', 'questionnaire', 'plan_day'\]\)/, 'root projection parser rejects extra fields')
assert.match(service, /questionById\.get\(id\)/, 'answer keys are validated against the frozen schema question definitions')
assert.match(service, /validAnswer\(question, answer\)/, 'answer values are checked against frozen field types')
assert.match(service, /update_my_collaborative_prewedding_answer_v3/, 'answer editor uses the scoped answer command')
assert.match(service, /update_my_collaborative_prewedding_time_v3/, 'time editor uses the scoped time command')
assert.match(shared, /if \(level === 0\) return null/, 'level zero returns before mounting the query component')
assert.match(shared, /capabilities=\{\{ canEditTimes: level >= 2, canReorderPlaces: false, canRecalculateRoute: false \}\}/, 'level one is read-only and level two edits only operational times')
assert.match(shared, /sharedData=\{projection\.plan_day\}/, 'shared workspace feeds the narrow projection into canonical Plan Day')
assert.match(shared, /<PreWeddingDayPlan/, 'shared workspace reuses the canonical Plan Day presentation')
assert.doesNotMatch(shared, /mutate_collaborative_wedding_logistics_v3|recalculate\(/, 'Pre-Wedding does not call Logistics mutations or route recalculation')
assert.doesNotMatch(shared, /useWeddingDetailHost|useModernWeddingDetailContext|usePreWeddingQuestionnaireWorkspace|applyWeddingDaySync|public_token_hash|prefill_json/, 'shared component does not mount owner graph or token/apply data')
assert.match(shared, /<CanonicalQuestionAnswer[^>]+mode="read"/, 'shared level one uses canonical answer presentation')
assert.match(shared, /<CanonicalQuestionAnswer[^>]+mode="edit"/, 'shared level two uses canonical answer editor')
assert.match(owner, /<CanonicalQuestionAnswer[^>]+mode="edit"/, 'owner uses the same canonical answer editor')
assert.match(owner, /<PreWeddingDayPlan/, 'owner preserves the canonical Plan Day presentation')
assert.match(owner, /saveOwnerAnswer/, 'owner answer writes use explicit owner authority')
assert.match(ownerHook, /questionnaire\?\.status !== 'draft' && questionnaire\?\.status !== 'archived'/, 'owner answer editor is available before the first response')
assert.match(dayPlan, /sharedData\?:/, 'canonical Plan Day accepts a narrow shared data adapter')
assert.match(dayPlan, /if \(!capabilities\.canReorderPlaces \|\| sharedData\) return/, 'shared Plan Day cannot reorder Logistics places')
assert.match(dayPlan, /capabilities\.canRecalculateRoute &&/, 'route recalculation is capability-gated')
assert.match(dayPlan, /disabled=\{!capabilities\.canEditTimes/, 'operational-time editor is capability-gated')
assert.match(canonicalFields, /export function QuestionFieldRouter/, 'canonical field layer owns question-type rendering')
assert.match(canonicalAnswer, /QuestionFieldRouter/, 'canonical answer editor delegates to canonical fields')
assert.match(publicForm, /CanonicalQuestionFields/, 'public controller reuses canonical fields')
assert.match(page, /authority\.effectiveAreas\.prewedding/, 'navigation level comes from resolved V3 authority')
assert.match(page, /activeTab === 'pre_wedding_questionnaire'/, 'deep link mounts Pre-Wedding only after shared authority resolution')
assert.match(page, /label: 'Ankieta przedślubna'/, 'shared nav uses canonical Pre-Wedding label')
assert.match(authority, /effectiveAreas\.prewedding === 0 \|\| query\.queryKey\[3\] !== authority\.accessVersion/, 'downgrade and access-version changes evict shared Pre-Wedding cache')
assert.match(logistics, /canEdit=\{level >= 2\}/, 'existing shared Logistics editor remains independently scoped')
assert.match(publicForm, /autosaveAnswer\(token, key/, 'public form sends only locally changed answers')
assert.match(publicForm, /overlaps\.length/, 'public autosave refuses automatic overwrite when the same field changed remotely')
assert.match(publicForm, /const rebased = \{ \.\.\.hydrated \}/, 'public autosave refetches and rebases local edits on the latest server snapshot')
assert.match(publicForm, /blockedConflictKeysRef\.current\.add\(key\)/, 'overlapping public fields remain blocked from automatic retry')
assert.match(publicForm, /for \(const key of dirty\).*autosaveAnswer/s, 'disjoint public edits retry against the refreshed response revision')
assert.match(publicForm, /responseRevisionRef\.current = latest\.responseRevision/, 'public conflict recovery advances its revision only from the refetched server state')
assert.match(publicForm, /publicPreWeddingService\.submit\(token, answers, answeredReq, totalReq, responseRevisionRef\.current\)/, 'public submit supplies the current CAS revision')
assert.match(api, /public_get_prewedding_questionnaire_v2/, 'public load returns response revision')
assert.match(migration, /collaboration_revision bigint not null default 1/, 'server uses monotonic response revision')
assert.match(migration, /pg_advisory_xact_lock/, 'operational-time write serializes missing-row CAS')
assert.match(migration, /revoke all on function public\.public_autosave_prewedding_questionnaire\(text,jsonb,integer,integer\) from public,anon,authenticated,service_role/, 'blind legacy public autosave is disabled')
assert.match(migration, /resolve_wedding_area_level\(p_wedding_id,'prewedding'\)/, 'read access is derived from current V3 area authority')
assert.match(migration, /answers_json=v_answers/, 'answer updates patch the current server answer object')
assert.match(migration, /prewedding_response_revisions/, 'owner, collaborator, and public writes share the monotonic revision ledger')
assert.match(migration, /notify_prewedding_questionnaire_completed/, 'versioned public submit retains the established notification lifecycle')
assert.doesNotMatch(migration, /create policy .*collaborat/i, 'migration does not widen raw table RLS')

const validProjection = {
  wedding_id: '11111111-1111-4111-8111-111111111111', access_version: 'owner', prewedding_level: 2,
  questionnaire: {
    id: '22222222-2222-4222-8222-222222222222', status: 'in_progress', title: 'Ankieta', introduction: '',
    schema: { sections: [{ id: 's1', title: 'Sekcja', questions: [
      { id: 'q-text', label: 'Tekst', type: 'short_text', required: false },
      { id: 'q-choice', label: 'Wybór', type: 'single_choice', required: false, options: ['A', 'B'] },
      { id: 'q-family', label: 'Rodzina', type: 'long_text', required: false, weddingDayMapping: 'sensitiveFamilyNotes' },
      { id: 'q-address', label: 'Adres', type: 'address', required: false },
    ] }] }, response_id: null, answers: { 'q-text': 'Wartość', 'q-choice': 'A', 'q-family': 'Notatka', 'q-address': { formattedAddress: 'Warszawa', placeId: null, latitude: null, longitude: null, label: null, provider: null } },
    response_revision: '1', answered_required: 0, total_required: 0, submitted_at: null,
  },
  plan_day: { places: [], times: [] },
}
assert.equal(parseCollaborativePreweddingProjection(validProjection).questionnaire?.answers['q-family'], 'Notatka', 'valid schema-matched answers parse')
assert.throws(() => parseCollaborativePreweddingProjection({ ...validProjection, questionnaire: { ...validProjection.questionnaire, answers: { 'q-choice': 'Not an option' } } }), /INVALID_PROJECTION/, 'choice answer outside frozen options is rejected')
assert.throws(() => parseCollaborativePreweddingProjection({ ...validProjection, questionnaire: { ...validProjection.questionnaire, answers: { 'q-text': true } } }), /INVALID_PROJECTION/, 'wrong answer value type is rejected')
assert.throws(() => parseCollaborativePreweddingProjection({ ...validProjection, questionnaire: { ...validProjection.questionnaire, schema: { sections: [{ id: 's1', title: 'Sekcja', questions: [{ id: 'q-text', label: 'Tekst', type: 'short_text', required: false, helpText: 8 }] }] }, answers: {} } }), /INVALID_PROJECTION/, 'malformed optional schema text is rejected')

console.log('Collaboration V3 Pre-Wedding acceptance checks passed')
