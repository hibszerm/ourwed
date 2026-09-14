/**
 * Assistant V1 — security + protocol acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantSecurityAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ASSISTANT_MAX_TOOL_ITERATIONS,
  ASSISTANT_TOOL_NAMES,
  FORBIDDEN_TOOL_IDENTITY_KEYS,
} from './types'
import {
  assertNoForbiddenKeysInObject,
  validateToolCall,
} from './tools/allowlist'
import { ASSISTANT_MUTATING_TOOLS } from './tools/executeTool'
import {
  ASSISTANT_EXAMPLES,
  ASSISTANT_NO_MATCH,
  ASSISTANT_TITLE,
} from './copy'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('Assistant security acceptance')

assert(ASSISTANT_TITLE === 'Zapytaj OurWed', 'product name')
assert(!ASSISTANT_TITLE.toLowerCase().includes('ai'), 'no AI in title')
assert(
  ASSISTANT_EXAMPLES.every((e) => !/ai|sparkle|magi/i.test(e)),
  'examples clean',
)

for (const name of ASSISTANT_TOOL_NAMES) {
  assert(typeof name === 'string' && name.length > 0, `tool ${name}`)
}

assert(ASSISTANT_MUTATING_TOOLS.length === 0, 'no mutating tools')
assert(ASSISTANT_MAX_TOOL_ITERATIONS >= 2 && ASSISTANT_MAX_TOOL_ITERATIONS <= 6, 'loop cap')

assert(
  validateToolCall({ name: 'drop_table', args: {} }).ok === false,
  'unknown tool rejected',
)
assert(
  validateToolCall({
    name: 'search_weddings',
    args: { query: 'x', userId: 'evil' },
  }).ok === false,
  'userId rejected',
)
assert(
  validateToolCall({
    name: 'search_weddings',
    args: { query: 'x', ownerId: 'evil' },
  }).ok === false,
  'ownerId rejected',
)
assert(
  validateToolCall({
    name: 'search_weddings',
    args: { query: 'Natalia' },
  }).ok === true,
  'valid search allowed',
)

assert(
  assertNoForbiddenKeysInObject({ nested: { tenantId: 'x' } }) === false,
  'nested tenantId rejected',
)

const executeSrc = read('src/features/assistant/tools/executeTool.ts')
assert(!executeSrc.includes('service_role'), 'no service_role in tools')
assert(!/noteService/.test(executeSrc), 'noteService unused')
assert(!/questionnaire/i.test(executeSrc), 'no questionnaire dumps')
assert(!/docx|DOCX/.test(executeSrc), 'no contract docx')

const edge = read('supabase/functions/ai-assistant/index.ts')
assert(edge.includes('requireAuthenticatedUser'), 'edge auth')
assert(!edge.includes('SERVICE_ROLE'), 'edge no SERVICE_ROLE')
assert(!edge.includes('SUPABASE_SERVICE_ROLE'), 'edge no service role key')
assert(edge.includes('parseFlatSemanticPayload'), 'semantic parse')
assert(edge.includes('response_format'), 'structured output')
assert(!edge.includes('ASSISTANT_TOOLS'), 'no CRM tools in Edge')
assert(
  edge.includes("status: 'domain'") || edge.includes("status: 'semantic'"),
  'domain/semantic response status',
)
assert(edge.includes('workingContext'), 'edge accepts workingContext')
assert(
  edge.includes('No CRM tools') || edge.includes('No service_role'),
  'documents no CRM/service_role',
)

const schema = read('supabase/functions/ai-assistant/schema.ts')
assert(schema.includes('userId|ownerId|tenantId'), 'schema strips identity')
assert(schema.includes('assistant_semantic') || schema.includes('wedding_finances'), 'schema kinds')

const api = read('src/features/assistant/api/assistantApi.ts')
assert(api.includes('validateAssistantSemanticRequest'), 'semantic validate')
assert(api.includes('executeAssistantSemanticRequest'), 'common orchestrator')
assert(api.includes('executeAssistantQueryPlan'), 'query plan executor')
assert(api.includes('validateAssistantDomainRequest'), 'domain validate')
assert(api.includes('buildCreateWeddingInput'), 'create payload helper')
assert(!api.includes('weddingService.create'), 'api does not mutate directly')
assert(api.includes('forceProductionBehavior'), 'prod force hook')
assert(api.includes('resolveAssistantTransport'), 'transport resolver')
assert(api.includes('runLocalAssistantOrchestrator'), 'dev orchestrator')
assert(api.includes("transport === 'local'"), 'local short-circuit')
assert(api.includes("transport=edge"), 'edge log')
assert(!api.includes('devEdgeKnownUnavailable'), 'no edge-probe cache')
assert(
  !api.includes('needs_tools') || api.includes('obsolete'),
  'hybrid tool loop not primary',
)

const qp = read('src/features/assistant/api/queryPlanSchema.ts')
assert(qp.includes('userId|ownerId|tenantId'), 'qp rejects identity')
assert(qp.includes('ASSISTANT_QUERY_LIST_LIMIT'), 'list limit')

const execQp = read('src/features/assistant/api/executeQueryPlan.ts')
assert(!execQp.includes('service_role'), 'qp no service_role')
assert(!/weddingService\.getById\s*\(/.test(execQp), 'qp no N× getById')
assert(execQp.includes('getContractValue'), 'qp uses CV SoT')
assert(execQp.includes('getTotalPaid'), 'qp uses paid SoT')
assert(execQp.includes('getRemainingToPay'), 'qp uses remaining SoT')

const transport = read('src/features/assistant/api/transport.ts')
assert(transport.includes("AssistantTransport = 'local' | 'edge'"), 'transport union')

const intent = read('src/features/assistant/api/intentParse.ts')
assert(intent.includes('extractPersonName'), 'person extract')
assert(intent.includes('polishPersonSearchQueries'), 'case variants')
assert(intent.includes('weddingMatchesDateHint'), 'date hint')
assert(intent.includes('open_resource'), 'generic open')

const surface = read('src/features/assistant/components/AssistantSurface.tsx')
assert(surface.includes('ArrowUp'), 'icon send')
assert(surface.includes('ArrowRight'), 'suggestion arrows')
assert(!surface.includes('userBubble'), 'no chat bubbles')
assert(surface.includes('queryRef'), 'muted query ref')
assert(surface.includes('ASSISTANT_EXAMPLE_GROUPS'), 'grouped examples')
assert(surface.includes('data-motion'), 'open/close motion state')
assert(!/Sparkles|Wand|Bot|Brain|Star/.test(surface), 'no magic icons in surface')

const css = read('src/features/assistant/components/Assistant.module.css')
assert(css.includes('sendIconButton'), 'icon send style')
assert(!css.includes('.sendButton {'), 'no heavy Wyślij button style')
assert(css.includes('overflow: hidden'), 'composer no scrollbar')
assert(css.includes('sidebarLauncher'), 'sidebar launcher styles')
assert(css.includes('border-radius: 24px'), 'premium panel radius')
assert(css.includes('heroMoney'), 'finance hero emphasis')
assert(css.includes('heroCount'), 'aggregate count hero')
assert(css.includes('contextHeader'), 'context header')
assert(css.includes('confirmCard'), 'confirm containment')
assert(css.includes('prefers-reduced-motion'), 'reduced motion')
assert(css.includes('assistantPanelIn'), 'panel enter motion')

const host = read('src/features/assistant/AssistantHost.tsx')
assert(host.includes('contextHeader'), 'context header state')
assert(host.includes('setTurns([{ id'), 'result replacement model')
assert(host.includes('clearSession'), 'ephemeral clear')
assert(host.includes('useCreateWedding'), 'canonical create wedding')
assert(host.includes('taskService.create'), 'canonical create task')
assert(host.includes('localStorage') === false, 'no localStorage chat')
assert(host.includes('sessionStorage') === false, 'no sessionStorage chat')
assert(host.includes('metaKey') && host.includes("'k'"), 'cmd/ctrl+k')
assert(host.includes('onCancelConfirm'), 'cancel confirm wired')

const ctx = read('src/features/assistant/assistantContext.ts')
assert(ctx.includes('useAssistantOptional'), 'optional hook')

const layout = read('src/layouts/AppLayout.tsx')
assert(layout.includes('useAssistantOptional'), 'mobile launcher wired')
assert(layout.includes('mobileAssistantSlot'), 'right-side slot')
assert(layout.includes('assistantContext'), 'context import')

const sidebar = read('src/layouts/Sidebar.tsx')
assert(sidebar.includes('SidebarLauncher'), 'desktop launcher')
assert(sidebar.includes('assistantContext'), 'sidebar context')

const launcher = read('src/features/assistant/components/AssistantLauncher.tsx')
assert(launcher.includes('Search'), 'Search icon')
assert(!/Sparkles|Wand|Bot|Brain/.test(launcher), 'no magic icons')

const copyAll = read('src/features/assistant/copy.ts')
  .split('\n')
  .filter(
    (line) =>
      !line.trim().startsWith('//') &&
      !line.trim().startsWith('*') &&
      !line.trim().startsWith('/**'),
  )
  .join('\n')
assert(!/\bAI\b/.test(copyAll), 'no AI marketing copy')
assert(copyAll.includes(ASSISTANT_NO_MATCH), 'neutral no-match')
assert(copyAll.includes('ASSISTANT_UNRECOGNIZED'), 'unrecognized copy')

for (const key of FORBIDDEN_TOOL_IDENTITY_KEYS) {
  assert(
    !ASSISTANT_TOOL_NAMES.some((n) => n.includes(key)),
    `tool name free of ${key}`,
  )
}

const protectedRoute = read('src/features/auth/ProtectedRoute.tsx')
assert(protectedRoute.includes('AssistantProvider'), 'global host')

console.log('OK assistant security acceptance')
