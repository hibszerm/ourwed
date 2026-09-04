/**
 * Settings Phase 3 — Integrations + Subscription presentation.
 * Does not change calendar sync, entitlement, checkout, or Settings IA.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  settings-phase3 — ${msg}`)
}

const integrations = read('src/pages/CalendarIntegrationsPage.tsx')
const integrationsCss = read('src/pages/CalendarIntegrationsPage.module.css')
const subscription = read('src/pages/SubscriptionSettingsPage.tsx')
const subscriptionCss = read(
  'src/features/billing/SubscriptionSettingsPage.module.css',
)
const catalog = read('src/lib/billing/planCatalog.ts')
const nav = read('src/features/settings/settingsNav.ts')
const layout = read('src/features/settings/SettingsLayout.tsx')
const layoutCss = read('src/features/settings/SettingsLayout.module.css')
const account = read('src/pages/AccountSettingsPage.tsx')
const company = read('src/pages/CompanyDetailsPage.tsx')
const queryKeys = read('src/features/calendar-integrations/queryKeys.ts')
const entitlement = read('src/lib/billing/entitlement.ts')
const provider = read('src/lib/billing/provider.ts')

assert(integrations.includes('SettingsWorkspace'), 'integrations workspace')
assert(integrations.includes('title="Integracje"'), 'Integracje page title')
assert(
  integrations.includes(
    'Połącz OurWed z narzędziami, których używasz na co dzień.',
  ),
  'integrations subtitle',
)
assert(integrations.includes('Połącz z Google Calendar'), 'Google connect CTA')
assert(integrations.includes('Aktywuj kalendarz Apple'), 'Apple activate CTA')
assert(
  integrations.includes(
    'Automatycznie dodawaj śluby i sesje z OurWed do swojego',
  ),
  'Google human lead',
)
assert(
  integrations.includes(
    'Subskrybuj prywatny kalendarz OurWed w aplikacji Kalendarz',
  ),
  'Apple human lead',
)
assert(integrations.includes('Pierwsza synchronizacja'), 'backfill choice kept')
assert(integrations.includes('Odłącz Google Calendar'), 'Google disconnect kept')
assert(integrations.includes('Wygeneruj nowy link'), 'Apple rotate kept')
assert(integrations.includes('Wyłącz kalendarz'), 'Apple disable kept')
assert(integrations.includes('dangerText'), 'destructive actions visually secondary')
assert(!integrations.includes('OurWed jest źródłem prawdy'), 'no source-of-truth lecture')
assert(!integrations.includes('subskrypcja ICS'), 'no ICS jargon in UI')
assert(!integrations.includes('from \'@/components/ui/Card\''), 'no generic Card stack')
assert(integrationsCss.includes('@media (max-width: 767px)'), 'integrations mobile')
assert(integrationsCss.includes('min-height: var(--touch-target)'), '44px targets')

assert(subscription.includes('SettingsWorkspace'), 'subscription workspace')
assert(subscription.includes('canChooseSubscriptionPlan'), 'purchase gated by entitlement')
assert(subscription.includes("data-tone=\"premium\""), 'active PRO premium surface')
assert(subscription.includes('Dostęp przyznany bezterminowo'), 'indefinite copy')
assert(subscription.includes('PRO_WORKFLOW_VALUE'), 'workflow value section')
assert(!subscription.includes('startCheckout'), 'trial offer does not invoke checkout')
assert(!subscription.includes('Porównanie planów'), 'no comparison table')
assert(!subscription.includes('Historia płatności'), 'no fake invoices')
assert(!subscription.includes('Manage billing'), 'no invented portal')
assert(subscription.includes('Okres próbny PRO'), 'A trial state heading')
assert(subscription.includes('trial-remaining'), 'B days remaining')
assert(subscription.includes('plan-annual') && subscription.includes('plan-monthly'), 'C both plan options')
assert(subscription.includes('recommendedBadge'), 'D annual recommended')
assert(subscription.includes('savingLabel'), 'E annual savings from catalog')
assert(!subscription.includes('Visa') && !subscription.includes('Mastercard'), 'F no fake card brands')
assert(subscription.includes("source === 'admin_override'"), 'G indefinite funnel gated')
assert(subscription.includes("data-state=\"manual\""), 'H indefinite active state')
assert(subscription.includes('Dostęp przyznany bezterminowo'), 'I indefinite access copy')
assert(subscription.includes("data-state=\"paid\""), 'J paid PRO is not Trial')
assert(subscription.includes("data-state=\"expired\""), 'K expired purchasing path')
assert(!subscription.includes('Porównanie planów'), 'L comparison table remains removed')
assert(subscription.includes('Organizacja pracy'), 'M workflow value grouped')
assert(subscription.includes('Co zyskujesz z OurWed PRO'), 'purchase value heading')
assert(subscription.includes('Co obejmuje Twój PRO'), 'owner value heading')
assert(subscription.includes('Zostań z OurWed PRO'), 'product-led trial commercial heading')
assert(subscription.includes('Zakup PRO wkrótce'), 'honest unavailable purchase CTA')
assert(/disabled[\s\S]{0,120}Zakup PRO wkrótce/.test(subscription), 'purchase CTA is disabled')
assert(!subscription.includes('Przejdź na PRO'), 'no live-looking purchase CTA')
assert(!subscription.includes('PLAN_REASSURANCE'), 'no payment-reassurance list on offer')
assert(!subscription.includes('Bez karty płatniczej'), 'no card claim on offer')
assert(!subscription.includes('Płatność dopiero po wyborze planu'), 'no payment-timing claim')
assert(subscription.includes('Wybierz rozliczenie'), 'billing decision is oriented without a new chapter')
assert(subscription.includes('Zakup planu online będzie dostępny wkrótce.'), 'checkout unavailable remains visible')
assert(subscriptionCss.includes('container-type: inline-size'), 'plans respond to content width')
assert(subscriptionCss.includes('cadenceAnnual'), 'annual cadence is visually distinct')
assert(subscriptionCss.includes('cadenceMonthly'), 'monthly is a quieter alternative')
assert(!subscriptionCss.includes('grid-template-columns: 1fr 1fr'), 'no 50/50 billing split')
assert(!subscriptionCss.includes('border-left:'), 'countdown uses whitespace not a rule')
assert(subscriptionCss.includes('--surface-inverse'), 'semantic premium surface')
assert(subscriptionCss.includes('prefers-reduced-motion'), 'reduced motion')
assert(subscriptionCss.includes('@media (max-width: 767px)'), 'subscription mobile')
assert(subscription.includes('offerValueCopy'), 'purchase value pillars use a media-row copy column')
assert(subscription.includes('valueCopy'), 'owner value pillars use a media-row copy column')
assert(
  subscriptionCss.includes('grid-template-columns: 20px minmax(0, 1fr)'),
  'narrow owner value pillars are compact media rows',
)
assert(
  subscriptionCss.includes('grid-template-columns: 16px minmax(0, 1fr)'),
  'narrow purchase value pillars are compact media rows',
)
assert(!subscriptionCss.includes('#b48c46'), 'no gold')
assert(!subscriptionCss.includes('linear-gradient(90deg, #c49a4f'), 'no gold rail')
assert(integrations.includes('title="Integracje"'), 'N integrations page untouched this pass')
assert(layoutCss.includes('max-width: 72rem'), 'O settings shell width untouched')

assert(catalog.includes('PRO_WORKFLOW_VALUE'), 'workflow copy lives in catalog')
assert(catalog.includes('amountPln: 49'), 'monthly price source of truth')
assert(catalog.includes('amountPln: 490'), 'annual price source of truth')
assert(catalog.includes('Najlepsza wartość'), 'annual recommendation copy')

assert(nav.includes("label: 'Kalendarze'"), 'mobile destination label unchanged')
assert(nav.includes("primaryLabel: 'Subskrypcja'"), 'subscription taxonomy unchanged')
assert(layout.includes('SettingsPrimaryNavigation'), 'shell primary nav unchanged')
assert(layoutCss.includes('max-width: 72rem'), 'shell width unchanged')
assert(account.includes('title="Profil"'), 'Account page not redesigned')
assert(
  company.includes('title="Profil studia"'),
  'Studio page remains in Settings shell as Profil studia',
)

assert(queryKeys.includes("['calendar-integrations']"), 'calendar query keys frozen')
assert(provider.includes('UnavailableBillingProvider'), 'checkout still unavailable')
assert(entitlement.includes('buildSubscriptionHistory'), 'history still derived')

console.log('PASS  settings-phase3 presentation')
