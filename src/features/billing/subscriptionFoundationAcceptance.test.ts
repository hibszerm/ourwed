/**
 * Static acceptance: subscription foundation UI wiring + visual redesign.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL subscription-ui — ${msg}`)
}

const router = read('src/routes/router.tsx')
assert(router.includes('/ustawienia/subskrypcja'), 'subscription route')
assert(router.includes('SubscriptionSettingsPage'), 'subscription page import')

const settingsNav = read('src/features/settings/settingsNav.ts')
assert(settingsNav.includes("label: 'Subskrypcja'"), 'settings hub label')
assert(!settingsNav.includes('Abonament'), 'no Abonament label')

const sidebar = read('src/layouts/Sidebar.tsx')
assert(sidebar.includes('SidebarSubscriptionBlock'), 'sidebar block')

const sidebarBlock = read('src/features/billing/SidebarSubscriptionBlock.tsx')
assert(sidebarBlock.includes('ctaLabel'), 'sidebar compact CTA')

const protectedRoute = read('src/features/auth/ProtectedRoute.tsx')
assert(protectedRoute.includes('ProAccessGateProvider'), 'gate provider')

const page = read('src/pages/SubscriptionSettingsPage.tsx')
assert(page.includes('PRO_PLAN'), 'uses plan catalog')
assert(page.includes('recommendedBadge'), 'annual badge from catalog')
assert(!page.includes('startCheckout'), 'settings offer does not invoke checkout')
assert(!page.includes('onChoose'), 'settings offer has no purchase handler')
assert(page.includes('trybie tylko do odczytu') || page.includes('Okres próbny zakończony'), 'expired state copy')
assert(!page.includes('W PRO masz wszystko'), 'old features section removed')
assert(page.includes('Okres próbny PRO'), 'Polish trial heading')
assert(page.includes('Co zyskujesz z OurWed PRO'), 'workflow value heading')
assert(!page.includes('Porównanie planów'), 'no identical-check comparison table')
assert(page.includes('Historia'), 'history heading')
assert(page.includes('trial-remaining'), 'remaining days presentation')
assert(!page.includes('trial-remaining-ring'), 'no decorative trial ring')
assert(!page.includes('trial-progress-rail'), 'no decorative trial progress rail')
assert(page.includes('trial-ends-at'), 'trial end date')
assert(page.includes('buildSubscriptionHistory'), 'derived history')
assert(!page.includes('PLAN_REASSURANCE'), 'payment reassurance not shown on settings offer')
assert(!page.includes('Bez karty płatniczej'), 'no card claim on settings page')
assert(!page.includes('Płatność dopiero po wyborze planu'), 'no payment-timing claim')
assert(page.includes('canChooseSubscriptionPlan'), 'purchase funnel is gated')
assert(page.includes('Zostań z OurWed PRO'), 'product-led commercial heading')
assert(page.includes('Zakup PRO wkrótce'), 'honest unavailable purchase CTA')
assert(page.includes('data-testid="pro-purchase-cta"'), 'purchase CTA test id')
assert(/disabled[\s\S]{0,120}Zakup PRO wkrótce/.test(page), 'purchase CTA is disabled')
assert(!page.includes('Przejdź na PRO'), 'no live-looking purchase CTA')
assert(!page.includes('checkout-note'), 'no payments_unavailable error from CTA')
assert(page.includes('Wybierz rozliczenie'), 'quiet billing orientation label')
assert(page.includes('cadenceBody'), 'shared cadence body grammar')
assert(page.includes('cadenceMeta'), 'price-supporting line, not a second column')
assert(page.includes('Organizacja pracy'), 'grouped workflow pillar')
assert(page.includes('IconDashboard'), 'workflow icon is work management, not a heart')
assert(!page.includes('Bez limitu'), 'no unlimited paid duration')
assert(page.includes('Bez długiego zobowiązania'), 'monthly neutral copy')
assert(!page.includes('Anulujesz w dowolnym momencie'), 'no cancel claim on page')
assert(page.includes('Dostęp przyznany bezterminowo'), 'manual indefinite copy')
assert(page.includes('Plan miesięczny') && page.includes('Plan roczny'), 'paid plan secondary copy')
assert(page.includes('paymentsUnavailableHint'), 'payments hint helper')
assert(page.includes('Zakup planu online będzie dostępny wkrótce.'), 'coming-soon truth remains')
assert(page.includes('Pełny dostęp do OurWed.'), 'paid/manual lead copy')
assert(page.includes('PRO_WORKFLOW_VALUE'), 'workflow value from catalog')
assert(!page.includes('Manage billing'), 'no invented billing portal')
assert(!page.includes('Historia płatności'), 'no fake invoice history')
assert(
  !page.includes('Po zakończeniu okresu próbnego nadal będziesz mieć dostęp'),
  'redundant trial data-retention paragraph removed',
)

const css = read('src/features/billing/SubscriptionSettingsPage.module.css')
assert(css.includes('cadenceAnnual'), 'annual visual weight')
assert(css.includes('cadenceMark'), 'quiet radio marks for mutually exclusive cadence')
assert(
  css.includes('flex-direction: column;\n  gap: 8px;'),
  'annual/monthly stay related without merging',
)
assert(css.includes('commercial'), 'single PRO commercial surface')
assert(css.includes('@media (max-width: 767px)'), 'mobile breakpoint')
assert(css.includes('--surface-inverse'), 'premium PRO uses semantic inverse')
assert(!css.includes('#b48c46'), 'no gold hardcoded accent')
assert(!css.includes('#1d272b'), 'no Graphite-hardcoded surface')

const catalog = read('src/lib/billing/planCatalog.ts')
assert(catalog.includes('Elastyczny wybór'), 'benefit flexible choice')
assert(!catalog.includes('Bez zobowiązań'), 'old benefit removed')
assert(!catalog.includes('Anulujesz w dowolnym momencie'), 'no cancel in benefits')
assert(catalog.includes('Bez karty płatniczej'), 'benefit: no card')
assert(catalog.includes('Pełny dostęp'), 'benefit: full access')
assert(catalog.includes('amountPln: 49'), 'monthly 49')
assert(catalog.includes('amountPln: 490'), 'annual 490')
assert(catalog.includes('savingPln: 98'), 'saving 98')
assert(catalog.includes('savingPercent: 17'), '17%')
assert(catalog.includes('Najlepsza wartość'), 'best value badge')
assert(catalog.includes('Ankiety dla klientów'), 'real feature naming')

const entitlement = read('src/lib/billing/entitlement.ts')
assert(entitlement.includes('dni pozostało'), 'sidebar remaining copy')
assert(entitlement.includes('Dostęp bezterminowy'), 'sidebar indefinite')
assert(entitlement.includes('PRO Miesięczny'), 'sidebar monthly title')
assert(entitlement.includes('buildSubscriptionHistory'), 'history helper')
assert(!entitlement.includes('Wymaga akcji'), 'no action_required history label')
assert(!entitlement.includes("'Zapisane'"), 'no Zapisane history label')

const provider = read('src/lib/billing/provider.ts')
assert(provider.includes('UnavailableBillingProvider'), 'unavailable provider')
assert(!/from ['"]stripe/.test(provider), 'no stripe SDK import')

const adminShell = read('src/admin/shell/AdminShell.tsx')
assert(adminShell.includes("to: '/subscriptions'"), 'admin subscriptions link')
assert(!adminShell.includes("badge: 'Niepodłączone'"), 'disabled billing badge removed')

const adminApp = read('src/admin/AdminApp.tsx')
assert(adminApp.includes('/subscriptions'), 'admin subscriptions route')

const wedding = read('src/pages/NewWeddingPage.tsx')
assert(wedding.includes('requirePro'), 'wedding create gated')

const session = read('src/pages/NewSessionPage.tsx')
assert(session.includes('requirePro'), 'session create gated')

const migration = read(
  'supabase/migrations/20260811200000_subscription_foundation.sql',
)
assert(migration.includes('billing_accounts'), 'billing_accounts table')
assert(migration.includes('account_subscriptions'), 'account_subscriptions table')
assert(migration.includes('resolve_account_entitlement'), 'resolver')
assert(migration.includes('get_my_subscription_summary'), 'customer rpc')
assert(migration.includes('initialize_trial_subscription'), 'trial init')

console.log('PASS  subscription-ui acceptance')
