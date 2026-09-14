/**
 * Phase 3A.1 — ephemeral session + page-context seed acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/execution/phase3a1PageContextAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyWorkingContext } from '../../api/workingContext'
import { makeTaskSpec } from '../expect'
import { adaptWorkingContextToV4ShadowContext } from '../resolver/adaptV3'
import { applyPageContextToV4ShadowContext } from '../resolver/pageContext'
import { resolveTaskSpec } from '../resolver/resolve'
import {
  applyAssistantV4ShadowTransition,
  clearAssistantV4ShadowSession,
  getAssistantV4LastFinanceExecution,
  getAssistantV4ShadowSessionSnapshot,
  mergeShadowOverlay,
} from '../resolver/shadowState'
import { emptyV4ShadowContext } from '../resolver/types'
import { selectPhase3AFinanceTask } from './financeEligibility'
import { clearAssistantV4ShadowSessionAndPending } from '../shadow'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const WEDDING_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WEDDING_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

console.log('Phase 3A.1 page-context / ephemeral session acceptance')

// --- Close fully resets V4 session ---
{
  const merged = makeTaskSpec({
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'active_resource' },
  })
  applyAssistantV4ShadowTransition({
    taskSpec: merged,
    resolution: {
      status: 'resolved',
      op: 'get_amount',
      subject: 'remaining',
      resource: { kind: 'wedding', id: WEDDING_A, label: 'A' },
      participant: null,
      temporal: null,
      qualifiers: merged.qualifiers,
      sequence: null,
      collection: null,
      sourceTaskSpec: merged,
      mergedTaskSpec: merged,
    },
    financeExecution: {
      status: 'success',
      resourceType: 'wedding',
      weddingId: WEDDING_A,
      metric: 'remaining',
      amount: 100,
      currency: 'PLN',
    },
  })
  const before = getAssistantV4ShadowSessionSnapshot()
  assert(before.previousTaskSpec != null, 'session had previousTask')
  assert(before.contextOverlay.activeResource?.id === WEDDING_A, 'had A')
  assert(getAssistantV4LastFinanceExecution()?.status === 'success', 'had finance')

  clearAssistantV4ShadowSessionAndPending()
  const after = getAssistantV4ShadowSessionSnapshot()
  assert(after.previousTaskSpec === null, 'previousTask cleared')
  assert(after.lastResolution === null, 'lastResolution cleared')
  assert(after.lastFinanceExecution === null, 'lastFinance cleared')
  assert(after.contextOverlay.activeResource == null, 'overlay resource cleared')
  assert(after.contextOverlay.activeCollection == null, 'collection cleared')
  assert(after.contextOverlay.sequenceCursor == null, 'sequence cleared')
  assert(after.contextOverlay.activeParticipant == null, 'participant cleared')
}

// --- Fresh open: empty conversation + page B → resolve B ---
{
  clearAssistantV4ShadowSession()
  const emptyConv = adaptWorkingContextToV4ShadowContext({
    workingContext: emptyWorkingContext(),
  })
  assert(emptyConv.activeResource === null, 'conversation activeResource null')

  const seeded = applyPageContextToV4ShadowContext(
    mergeShadowOverlay(emptyConv),
    { resourceType: 'wedding', resourceId: WEDDING_B },
  )
  assert(seeded.activeResource?.id === WEDDING_B, 'page seeds Wedding B')
  assert(seeded.activeResource?.kind === 'wedding', 'page kind wedding')

  const spec = makeTaskSpec({
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'active_resource' },
  })
  const resolution = resolveTaskSpec(spec, seeded)
  assert(resolution.status === 'resolved', 'first remaining resolves')
  if (resolution.status === 'resolved') {
    assert(resolution.resource?.id === WEDDING_B, 'binds Wedding B')
    assert(resolution.subject === 'remaining', 'subject remaining')
  }
  const elig = selectPhase3AFinanceTask(resolution)
  assert(elig.eligible === true, 'Phase 3A finance eligible on B')
  if (elig.eligible) assert(elig.task.resource?.id === WEDDING_B, 'finance B')
}

// --- Page must not override in-session conversational resource ---
{
  clearAssistantV4ShadowSession()
  const conv = emptyV4ShadowContext()
  conv.activeResource = { kind: 'wedding', id: WEDDING_A, label: 'A' }
  const kept = applyPageContextToV4ShadowContext(conv, {
    resourceType: 'wedding',
    resourceId: WEDDING_B,
  })
  assert(kept.activeResource?.id === WEDDING_A, 'conversation wins over page')
}

// --- Non-wedding fresh open: no page seed, old A must not survive ---
{
  clearAssistantV4ShadowSessionAndPending()
  const emptyConv = adaptWorkingContextToV4ShadowContext({
    workingContext: emptyWorkingContext(),
  })
  const seeded = applyPageContextToV4ShadowContext(
    mergeShadowOverlay(emptyConv),
    null,
  )
  assert(seeded.activeResource === null, 'non-wedding page: no resource')
  const spec = makeTaskSpec({
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'active_resource' },
  })
  const resolution = resolveTaskSpec(spec, seeded)
  assert(
    resolution.status === 'needs_clarification' ||
      resolution.status === 'requires_discovery',
    'no phantom wedding without page/conversation',
  )
  if (resolution.status === 'needs_clarification') {
    assert(resolution.missingSlot === 'resource', 'missing resource')
  }
}

// --- Same-session follow-up continuity on B ---
{
  clearAssistantV4ShadowSession()
  let ctx = applyPageContextToV4ShadowContext(emptyV4ShadowContext(), {
    resourceType: 'wedding',
    resourceId: WEDDING_B,
  })
  for (const subject of ['remaining', 'paid', 'contract_value'] as const) {
    const spec = makeTaskSpec({
      op: 'get_amount',
      subject,
      resource: { kind: 'active_resource' },
    })
    const resolution = resolveTaskSpec(spec, ctx)
    assert(resolution.status === 'resolved', `${subject} resolved`)
    if (resolution.status === 'resolved') {
      assert(resolution.resource?.id === WEDDING_B, `${subject} stays on B`)
      applyAssistantV4ShadowTransition({
        taskSpec: spec,
        resolution,
      })
      ctx = mergeShadowOverlay(
        adaptWorkingContextToV4ShadowContext({
          workingContext: emptyWorkingContext(),
        }),
      )
      // After first resolve, overlay holds B; page still B — stays B
      ctx = applyPageContextToV4ShadowContext(ctx, {
        resourceType: 'wedding',
        resourceId: WEDDING_B,
      })
    }
  }
}

// --- Architecture: no persistence of chat history ---
{
  const host = read('src/features/assistant/AssistantHost.tsx')
  assert(host.includes('clearSession'), 'clear on close')
  assert(host.includes('Ephemeral'), 'ephemeral documented')
  assert(!host.includes('localStorage'), 'no localStorage assistant history')
  assert(
    !host.includes('sessionStorage'),
    'no sessionStorage assistant history',
  )
  const pageSrc = read('src/features/assistant/v4/resolver/pageContext.ts')
  assert(pageSrc.includes('PAGE CONTEXT'), 'page vs conversation documented')
  assert(
    pageSrc.includes('Never overrides in-session'),
    'conversation precedence',
  )
}

console.log('Phase 3A.1 page-context acceptance — ALL PASS')
