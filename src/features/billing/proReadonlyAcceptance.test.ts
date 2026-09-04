/**
 * Static acceptance: expired Trial read-only final hardening.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL pro-readonly — ${msg}`)
}

const gate = read('src/features/billing/ProAccessGate.tsx')
assert(gate.includes('UpgradeRequiredDialog'), 'upgrade dialog wired')
assert(gate.includes('expired_trial'), 'expired variant')
assert(gate.includes('pro_required_action'), 'action variant')
assert(gate.includes('autoShownRef'), 'session auto-modal')
assert(gate.includes('canUseProFeatures'), 'canonical gate field')
assert(gate.includes('ProGateAction'), 'ProGateAction export')
assert(gate.includes('autoDismissed'), 'session dismissal state')
assert(gate.includes('bannerHiddenForSession'), 'banner session hide')
assert(gate.includes('hideReadOnlyBanner'), 'banner hide API')
assert(gate.includes('actionKey'), 'action key support')
assert(gate.includes('canUsePro !== true'), 'admin recovery clears dialog')

const dialog = read('src/features/billing/UpgradeRequiredDialog.tsx')
assert(dialog.includes('Wybierz PRO Roczny'), 'annual CTA')
assert(dialog.includes('Wybierz plan miesięczny'), 'monthly CTA')
assert(dialog.includes('Może później'), 'dismiss CTA')
assert(dialog.includes('startCheckout'), 'provider boundary')
assert(dialog.includes('odblokowane automatycznie'), 'recovery copy')
assert(dialog.includes('getProGateActionContext'), 'action context')

const banner = read('src/features/billing/ReadOnlyBanner.tsx')
assert(banner.includes('Tryb tylko do odczytu'), 'banner heading')
assert(banner.includes('Nadal możesz przeglądać'), 'banner body')
assert(banner.includes('Ukryj'), 'banner hide')
assert(banner.includes('ProLockIcon'), 'banner lock icon')

const affordance = read('src/features/billing/ProLockedAffordance.tsx')
assert(affordance.includes('PRO_LOCKED_HINT'), 'shared hint')
assert(affordance.includes('ProLockIcon'), 'shared lock')

const hint = read('src/features/billing/proGateActions.ts')
assert(hint.includes('Dostępne w planie PRO'), 'standardized hint copy')
assert(hint.includes('generate_questionnaire_link'), 'questionnaire action keys')

const err = read('src/features/billing/proAccessError.ts')
assert(err.includes('PRO_ACCESS_REQUIRED'), 'domain error')
assert(err.includes('isProAccessRequiredError'), 'error detector')

const layout = read('src/layouts/AppLayout.tsx')
assert(layout.includes('ReadOnlyBanner'), 'banner in shell')
assert(layout.includes('bannerHiddenForSession'), 'banner hide wired')
assert(layout.includes('hideReadOnlyBanner'), 'hide handler')

const hook = read('src/lib/billing/useMySubscription.ts')
assert(hook.includes('focus'), 'refresh on focus')
assert(hook.includes('60_000') || hook.includes('setInterval'), 'periodic revalidation')

const weddings = read('src/pages/WeddingsPage.tsx')
assert(weddings.includes('ProGateNavButton'), 'Classic weddings create gated')
const weddingsModern = read('src/pages/WeddingsModernPage.tsx')
assert(weddingsModern.includes('ProGateNavButton'), 'Modern weddings create gated')

const sessions = read('src/pages/SessionsPage.tsx')
assert(sessions.includes('ProGateNavButton'), 'Classic sessions create gated')
const sessionsModern = read('src/pages/SessionsModernPage.tsx')
assert(sessionsModern.includes('ProGateNavButton'), 'Modern sessions create gated')

const calendar = read('src/pages/CalendarPage.tsx')
assert(calendar.includes('requirePro'), 'Classic calendar add gated')
const calendarModern = read('src/pages/CalendarModernPage.tsx')
assert(calendarModern.includes('requirePro'), 'Modern calendar add gated')

/* Classic + Modern Wedding Detail share Pro gates in the host (save/archive/hero). */
const weddingDetailHost = read('src/features/weddings/detail/useWeddingDetailHost.ts')
assert(weddingDetailHost.includes('requirePro'), 'shared wedding detail host gated')
assert(weddingDetailHost.includes('useProAccessGate'), 'shared host uses ProAccessGate')
const classicDetail = read('src/pages/WeddingDetailPage.tsx')
const modernDetail = read('src/pages/WeddingDetailModernPage.tsx')
assert(classicDetail.includes('useWeddingDetailHost'), 'Classic detail uses shared host')
assert(modernDetail.includes('useWeddingDetailHost'), 'Modern detail uses shared host')
const modernDetailHeader = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx',
)
assert(modernDetailHeader.includes('requirePro'), 'Modern detail header actions gated')
const modernDetailFinance = read(
  'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx',
)
assert(modernDetailFinance.includes('requirePro'), 'Modern detail payment delete gated')

const library =
  read('src/pages/QuestionnaireLibraryPage.tsx') +
  read('src/features/prewedding/modern/ModernQuestionnaireLibrary.tsx')
assert(library.includes('requirePro'), 'ankiety library gated')

const subPage = read('src/pages/SubscriptionSettingsPage.tsx')
assert(subPage.includes('trybie tylko do odczytu'), 'expired subscription copy')
assert(subPage.includes('odblokują się automatycznie'), 'subscription recovery line')

const account = read('src/pages/AccountSettingsPage.tsx')
assert(!account.includes('requirePro'), 'account settings not pro-gated')

const migration = read('supabase/migrations/20260811230000_pro_mutation_gate.sql')
assert(migration.includes('account_has_pro_access'), 'server access fn')
assert(migration.includes('assert_account_can_mutate_pro_data'), 'assert fn')

const migrationQ = read(
  'supabase/migrations/20260811250000_pro_questionnaire_mutation_gate.sql',
)
assert(migrationQ.includes('generate_prewedding_token'), 'token RPC gated')
assert(migrationQ.includes('questionnaire_templates'), 'templates gated')

const matrix = read('docs/pro-access-matrix.md')
assert(matrix.includes('Public questionnaires'), 'public form decision')
assert(matrix.includes('Ankiety'), 'ankiety inventory')
assert(matrix.includes('PRO_ACCESS_REQUIRED'), 'error contract documented')

console.log('PASS  pro-readonly acceptance')
