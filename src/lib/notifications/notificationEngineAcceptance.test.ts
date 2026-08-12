/**
 * Notification Engine V1 — static acceptance (wiring, privacy, idempotency contracts).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_EVENT_TYPES,
  defaultEmailEnabled,
} from '@/lib/notifications/catalog'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL notification-engine — ${msg}`)
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
assert(NOTIFICATION_EVENT_TYPES.length === 2, 'exactly two V1 event types')
assert(
  NOTIFICATION_CATALOG.every((e) => e.channels.email.userConfigurable),
  'email configurable',
)
assert(
  NOTIFICATION_CATALOG.every((e) => !e.channels.in_app.userConfigurable),
  'in-app not user-configurable',
)
assert(defaultEmailEnabled('questionnaire.contract.completed'), 'contract email default ON')
assert(defaultEmailEnabled('questionnaire.prewedding.completed'), 'prewedding email default ON')
assert(!defaultEmailEnabled('unknown.future'), 'unknown defaults OFF')

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
const migEvents = read('supabase/migrations/20260811260000_notification_engine.sql')
const migHooks = read('supabase/migrations/20260811270000_notification_engine_submit_hooks.sql')

assert(migEvents.includes('create table if not exists public.notification_events'), 'events table')
assert(migEvents.includes('notification_events_event_key_unique'), 'unique event_key')
assert(migEvents.includes('notification_deliveries_unique'), 'unique delivery constraint')
assert(migEvents.includes('create table if not exists public.notification_preferences'), 'prefs table')
assert(migEvents.includes('enqueue_notification_event'), 'enqueue helper')
assert(migEvents.includes('notification_email_enabled'), 'pref helper')
assert(migEvents.includes('request_notification_email_dispatch'), 'pg_net dispatch helper')
assert(migEvents.includes('preference_disabled'), 'skipped preference reason')
assert(migEvents.includes('ourwed/'), 'idempotency key prefix')
assert(migEvents.includes('questionnaire.contract.completed:'), 'contract event_key')
assert(migEvents.includes('questionnaire.prewedding.completed:'), 'prewedding event_key')
assert(migEvents.includes('?tab=contract_finance'), 'contract deep link tab')
assert(migEvents.includes('?tab=pre_wedding_questionnaire'), 'prewedding deep link tab')
assert(migEvents.includes('Nowe dane do umowy'), 'contract in-app title')
assert(migEvents.includes('Ankieta przedślubna uzupełniona'), 'prewedding in-app title')
assert(!migEvents.includes('answers_json'), 'no answers_json in engine migration')
assert(!migEvents.includes('public_token'), 'no public token in engine migration')
assert(!migEvents.includes('p_answers'), 'no p_answers in engine migration')
assert(!migEvents.includes('answer_json'), 'no answer_json in engine migration')

assert(migHooks.includes('notify_contract_questionnaire_completed'), 'contract hook')
assert(migHooks.includes('notify_prewedding_questionnaire_completed'), 'prewedding hook')
assert(migHooks.includes('public_submit_form_by_token'), 'contract submit RPC')
assert(migHooks.includes('public_submit_prewedding_questionnaire'), 'prewedding submit RPC')
assert(
  !migHooks.includes("insert into public.notifications"),
  'hooks do not insert notifications directly',
)

// ---------------------------------------------------------------------------
// Edge dispatcher + templates
// ---------------------------------------------------------------------------
assert(existsSync(join(ROOT, 'supabase/functions/notification-email-dispatcher/index.ts')), 'dispatcher')
assert(existsSync(join(ROOT, 'supabase/functions/notification-email-dispatcher/templates.ts')), 'templates')

const dispatcher = read('supabase/functions/notification-email-dispatcher/index.ts')
assert(dispatcher.includes('RESEND_API_KEY'), 'uses RESEND_API_KEY')
assert(!dispatcher.includes('VITE_RESEND'), 'no Vite Resend key')
assert(dispatcher.includes('Idempotency-Key'), 'Resend idempotency header')
assert(dispatcher.includes('parseDeliveryId'), 'uses shared delivery id parser')
assert(existsSync(join(ROOT, 'supabase/functions/notification-email-dispatcher/parseDeliveryRequest.ts')), 'parser module')
assert(existsSync(join(ROOT, 'supabase/functions/notification-email-dispatcher/config.toml')), 'verify_jwt config')
const fnConfig = read('supabase/functions/notification-email-dispatcher/config.toml')
assert(fnConfig.includes('verify_jwt = false'), 'verify_jwt false for webhooks')
const rootConfig = read('supabase/config.toml')
assert(rootConfig.includes('[functions.notification-email-dispatcher]'), 'root config section')
assert(rootConfig.includes('verify_jwt = false'), 'root verify_jwt false')
assert(!dispatcher.includes('toEmail = body'), 'caller cannot set recipient')
assert(dispatcher.includes('preference_disabled'), 'send-time preference skip')
assert(dispatcher.includes('NOTIFICATION_DISPATCH_SECRET'), 'dispatch secret auth')
assert(dispatcher.includes('getUserById'), 'auth email resolution')

const templates = read('supabase/functions/notification-email-dispatcher/templates.ts')
assert(templates.includes('Nowe dane do umowy w OurWed'), 'contract subject')
assert(templates.includes('Ankieta przedślubna jest gotowa'), 'prewedding subject')
assert(templates.includes('Sprawdź odpowiedzi'), 'contract CTA')
assert(templates.includes('Zobacz odpowiedzi'), 'prewedding CTA')
assert(templates.includes('ustawienia/powiadomienia'), 'prefs footer link')
assert(!templates.includes('answer_json'), 'no answer_json in templates')
assert(!templates.includes('public_token'), 'no public_token in templates')
assert(!templates.includes('answers_json'), 'no answers_json in templates')
assert(templates.includes('coupleLabel'), 'safe couple label context only')

// ---------------------------------------------------------------------------
// Webhook mapping
// ---------------------------------------------------------------------------
const webhook = read('supabase/functions/resend-webhook/index.ts')
assert(webhook.includes('notification_deliveries'), 'maps to deliveries')
assert(webhook.includes('provider_message_id'), 'match provider id')
assert(webhook.includes('email.bounced'), 'bounce mapping')

// ---------------------------------------------------------------------------
// Frontend wiring
// ---------------------------------------------------------------------------
const router = read('src/routes/router.tsx')
assert(router.includes('/ustawienia/powiadomienia'), 'prefs route')
assert(router.includes('NotificationSettingsPage'), 'prefs page import')

const settings = read('src/pages/SettingsPage.tsx')
assert(settings.includes('/ustawienia/powiadomienia'), 'settings hub link')
assert(!/title: 'Powiadomienia'[\s\S]{0,80}soon: true/.test(settings), 'powiadomienia not soon')

const prefsPage = read('src/pages/NotificationSettingsPage.tsx')
assert(prefsPage.includes('Wybierz, o czym OurWed ma informować Cię e-mailem'), 'support copy')
assert(prefsPage.includes('NOTIFICATION_CATALOG'), 'uses shared catalog')
assert(prefsPage.includes('role="switch"'), 'a11y switch')
assert(prefsPage.includes('Zapisano'), 'saved feedback')

const catalogSrc = read('src/lib/notifications/catalog.ts')
assert(catalogSrc.includes('Dane do umowy'), 'contract row label')
assert(catalogSrc.includes('Ankieta przedślubna'), 'prewedding row label')

const card = read('src/features/dashboard/components/NotificationsCard.tsx')
assert(card.includes('markRead'), 'mark read on click')
assert(card.includes('notification.link'), 'deep link navigation')

const notifService = read('src/lib/api/notificationService.ts')
assert(notifService.includes('link: row.link'), 'maps link field')
assert(notifService.includes('unreadCount'), 'unread count API')

const sidebar = read('src/layouts/Sidebar.tsx')
assert(sidebar.includes('unreadCount'), 'sidebar unread badge')
assert(sidebar.includes('nieprzeczytane powiadomienia'), 'badge a11y')

const detail = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
assert(detail.includes("searchParams.get('tab')"), 'URL tab deep link')

const envExample = read('.env.example')
assert(envExample.includes('RESEND_API_KEY'), 'env documents RESEND_API_KEY')
assert(envExample.includes('NOTIFICATION_DISPATCH_SECRET'), 'env dispatch secret')
assert(envExample.includes('notification-email-dispatcher'), 'env deploy note')
assert(!envExample.includes('VITE_RESEND_API_KEY'), 'never VITE_RESEND_API_KEY')

const docs = read('docs/notification-engine.md')
assert(docs.includes('event_key'), 'docs idempotency')
assert(docs.includes('Expired Trial'), 'docs expired trial')
assert(docs.includes('Manual production steps'), 'docs deploy')
assert(docs.includes('do not enable Resend click tracking'), 'docs tracking policy')

// ---------------------------------------------------------------------------
// Abuse / security contracts (static)
// ---------------------------------------------------------------------------
assert(!dispatcher.includes('body.to'), 'dispatcher ignores body.to')
assert(!dispatcher.includes('recipientEmail'), 'no recipientEmail param')
assert(migEvents.includes('revoke all on public.notification_events'), 'events locked from clients')
assert(migEvents.includes('revoke all on public.notification_deliveries'), 'deliveries locked')

// ---------------------------------------------------------------------------
// Regression: weddings.wedding_date (not nonexistent w.date) in notify helpers
// ---------------------------------------------------------------------------
const migWeddingDateFix = read(
  'supabase/migrations/20260812120000_fix_notification_wedding_date.sql',
)
assert(
  migWeddingDateFix.includes('notify_prewedding_questionnaire_completed'),
  'fix replaces prewedding notify',
)
assert(
  migWeddingDateFix.includes('notify_contract_questionnaire_completed'),
  'fix replaces contract notify (same stale column)',
)
assert(migWeddingDateFix.includes('w.wedding_date'), 'uses canonical wedding_date')
assert(!migWeddingDateFix.includes('w.date'), 'no nonexistent w.date')
assert(
  migWeddingDateFix.includes(
    'questionnaire.prewedding.completed:',
  ),
  'prewedding event_key preserved',
)
assert(
  migWeddingDateFix.includes("|| to_char(coalesce(p_submitted_at"),
  'event_key includes submitted_at',
)
assert(migWeddingDateFix.includes("'weddingDate', v_date"), 'payload has weddingDate')
assert(migWeddingDateFix.includes("'coupleLabel', v_couple"), 'payload has coupleLabel')
assert(!migWeddingDateFix.includes('answers_json'), 'no answers in fix migration')
assert(!migWeddingDateFix.includes('public_token'), 'no token in fix migration')
assert(!migWeddingDateFix.includes('answer_json'), 'no answer_json in fix migration')
assert(migWeddingDateFix.includes('security definer'), 'keeps SECURITY DEFINER')
assert(migWeddingDateFix.includes("set search_path = public"), 'keeps search_path')
assert(
  migWeddingDateFix.includes(
    'grant execute on function public.notify_prewedding_questionnaire_completed',
  ),
  'keeps prewedding grant',
)
assert(
  migWeddingDateFix.includes(
    'revoke all on function public.notify_prewedding_questionnaire_completed',
  ),
  'keeps prewedding revoke',
)
assert(migWeddingDateFix.includes("notify pgrst, 'reload schema'"), 'reloads PostgREST')

// Applied migration source must not keep the stale column either (fresh installs).
assert(migEvents.includes('w.wedding_date'), 'engine migration uses wedding_date')
assert(!/\bw\.date\b/.test(migEvents), 'engine migration has no w.date')
assert(!/\bw\.date\b/.test(migHooks), 'submit hooks migration has no w.date')

const schemaWeddings = read('supabase/schema.sql')
assert(
  /create table public\.weddings \([\s\S]*?wedding_date date/.test(schemaWeddings),
  'schema canonical column is wedding_date',
)
assert(
  !/create table public\.weddings \([\s\S]*?\bdate date\b/.test(schemaWeddings),
  'schema has no weddings.date column',
)

console.log('OK notification-engine acceptance')
