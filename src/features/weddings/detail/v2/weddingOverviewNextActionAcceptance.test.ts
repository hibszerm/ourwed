/**
 * Phase 1B — Overview Next Action wiring acceptance.
 * Run: npm run test:wedding-overview-next-action
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  dispatchWeddingNextAction,
  type WeddingNextActionHandlers,
} from '@/features/weddings/detail/v2/dispatchWeddingNextAction'
import type {
  WeddingNextAction,
  WeddingNextActionId,
} from '@/lib/workflow/resolveWeddingNextAction'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

const v2Root = resolve(process.cwd(), 'src/features/weddings/detail/v2')
const libRoot = resolve(process.cwd(), 'src/lib/workflow')

const ALL_ACTION_IDS: WeddingNextActionId[] = [
  'send_contract_questionnaire',
  'resolve_travel_fee',
  'generate_contract',
  'mark_contract_signed',
  'record_deposit',
  'send_prewedding',
  'review_apply',
  'complete_core_locations',
  'set_ceremony_time',
]

function stubAction(id: WeddingNextActionId): WeddingNextAction {
  return {
    id,
    title: id,
    priority: 'blocker',
    destination: { kind: 'wedding_tab', tab: 'overview' },
  }
}

function trackingHandlers(): {
  handlers: WeddingNextActionHandlers
  calls: Record<keyof WeddingNextActionHandlers, number>
} {
  const calls: Record<keyof WeddingNextActionHandlers, number> = {
    sendContractQuestionnaire: 0,
    resolveTravelFee: 0,
    generateContract: 0,
    openContractFinance: 0,
    recordDeposit: 0,
    openPreWedding: 0,
    editLocations: 0,
  }
  const handlers: WeddingNextActionHandlers = {
    sendContractQuestionnaire: () => {
      calls.sendContractQuestionnaire += 1
    },
    resolveTravelFee: () => {
      calls.resolveTravelFee += 1
    },
    generateContract: () => {
      calls.generateContract += 1
    },
    openContractFinance: () => {
      calls.openContractFinance += 1
    },
    recordDeposit: () => {
      calls.recordDeposit += 1
    },
    openPreWedding: () => {
      calls.openPreWedding += 1
    },
    editLocations: () => {
      calls.editLocations += 1
    },
  }
  return { handlers, calls }
}

run('1. Overview imports/uses shared resolver', () => {
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  assert(card.includes('resolveWeddingNextAction'), 'card uses resolver')
  assert(overview.includes('WeddingNextActionCard'), 'overview mounts card')
  assert(
    existsSync(resolve(libRoot, 'resolveWeddingNextAction.ts')),
    'shared resolver module',
  )
})

run('2. Overview no longer uses pickPrimaryAction as CTA source', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  const progress = readFileSync(resolve(v2Root, 'WeddingProgressCard.tsx'), 'utf8')
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  assert(!overview.includes('pickPrimaryAction'), 'overview no pick')
  assert(!progress.includes('onPrimaryAction'), 'progress no primary CTA')
  assert(!progress.includes('summary.primaryAction'), 'progress ignores field')
  assert(!card.includes('pickPrimaryAction'), 'card no pick')
  assert(card.includes('resolveWeddingNextAction'), 'card uses shared')
})

run('3. Destination adapter covers every V1 action exhaustively', () => {
  const expected: Record<WeddingNextActionId, keyof WeddingNextActionHandlers> = {
    send_contract_questionnaire: 'sendContractQuestionnaire',
    resolve_travel_fee: 'resolveTravelFee',
    generate_contract: 'generateContract',
    mark_contract_signed: 'openContractFinance',
    record_deposit: 'recordDeposit',
    send_prewedding: 'openPreWedding',
    review_apply: 'openPreWedding',
    complete_core_locations: 'editLocations',
    set_ceremony_time: 'openPreWedding',
  }

  for (const id of ALL_ACTION_IDS) {
    const { handlers, calls } = trackingHandlers()
    dispatchWeddingNextAction(stubAction(id), handlers)
    const key = expected[id]
    assertEq(calls[key], 1, `${id} → ${key}`)
    for (const [k, n] of Object.entries(calls)) {
      if (k === key) continue
      assertEq(n, 0, `${id} must not call ${k}`)
    }
  }
  assertEq(ALL_ACTION_IDS.length, 9, 'catalog size')
})

run('4–12. DetailV2 wires real destinations for each action family', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  const dispatch = readFileSync(
    resolve(v2Root, 'dispatchWeddingNextAction.ts'),
    'utf8',
  )

  assert(shell.includes("onSendQuestionnaire?.('contractData')"), '4. contract Q')
  assert(dispatch.includes("case 'resolve_travel_fee'"), '4b. travel case')
  assert(shell.includes('setTravelFeeOpen(true)'), '4c. travel opens modal')
  assert(shell.includes('TravelFeeResolveModal'), '4d. existing modal')
  assert(shell.includes("onHeroAction('generate_contract')"), '5. generate')
  assert(shell.includes("setTab('contract_finance')"), '6. mark signed tab')
  assert(dispatch.includes("case 'mark_contract_signed'"), '6b. mark signed case')
  assert(shell.includes("onHeroAction('add_deposit')"), '7. deposit')
  assert(
    shell.includes("setTab('pre_wedding_questionnaire')"),
    '8–9,11. pre-wedding / Apply / ceremony time',
  )
  assert(dispatch.includes("case 'send_prewedding'"), '8. send prewedding')
  assert(dispatch.includes("case 'review_apply'"), '9. review apply')
  assert(shell.includes("onEditSection('locations')"), '10. locations')
  assert(dispatch.includes("case 'set_ceremony_time'"), '11. ceremony time')
  assert(dispatch.includes('handlers.openPreWedding()'), '11b. time → Ankieta')
  assert(!dispatch.includes("case 'open_cockpit'"), '12b. cockpit not a Next Action')
  assert(!dispatch.includes('openCockpit'), '12c. no cockpit handler')
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(header.includes('dzien-slubu'), '12. cockpit route still in header')
})

run('13. Null action renders no fake CTA', () => {
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  assert(card.includes('if (!action) return null'), 'omit when null')
  assert(!card.includes('Wszystko gotowe'), 'no celebratory empty state')
  assert(!card.includes('Przejdź dalej'), 'no generic CTA')
  assert(!card.includes('Sprawdź status'), 'no status check CTA')
  assert(!card.includes('Otwórz ankietę'), 'no waiting open-Q CTA')
})

run('14. Attention remains separate', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  assert(overview.includes('WeddingOverviewAttention'), 'attention mounted')
  assert(overview.includes('WeddingNextActionCard'), 'next action mounted')
  const attention = readFileSync(
    resolve(v2Root, 'WeddingOverviewAttention.tsx'),
    'utf8',
  )
  assert(!attention.includes('resolveWeddingNextAction'), 'attention not resolver')
  assert(!attention.includes('dispatchWeddingNextAction'), 'attention not adapter')
})

run('15. Progress remains present', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  const progress = readFileSync(resolve(v2Root, 'WeddingProgressCard.tsx'), 'utf8')
  assert(overview.includes('WeddingProgressCard'), 'progress mounted')
  assert(progress.includes('Postęp zlecenia'), 'progress title')
  assert(progress.includes('buildWeddingProgressSummary'), 'progress summary')
})

run('16. Resolver suite remains separate module', () => {
  assert(
    existsSync(resolve(libRoot, 'resolveWeddingNextActionAcceptance.test.ts')),
    '1A suite present',
  )
})

run('17. No system task creation in Overview Next Action path', () => {
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  const dispatch = readFileSync(
    resolve(v2Root, 'dispatchWeddingNextAction.ts'),
    'utf8',
  )
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  for (const src of [card, dispatch, shell]) {
    assert(!src.includes('taskService.create'), 'no task create')
    assert(!src.includes('createTask'), 'no createTask')
  }
})

run('18. No new query architecture — reuses Ankieta + Plan dnia keys', () => {
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  assert(
    card.includes('PREWEDDING_QUERY_KEY') ||
      card.includes("['prewedding-questionnaire', wedding.id]"),
    'same Q key',
  )
  assert(
    card.includes("['prewedding-response', questionnaire?.id]"),
    'same response key',
  )
  assert(card.includes("const PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'"), 'Ankieta key const')
  assert(card.includes('operationalTimesQueryKey'), 'Plan dnia / Cockpit times key')
  assert(card.includes('weddingOperationalTimesService'), 'same times service')
  assert(card.includes('operationalTimes'), 'passes ops times to resolver')
  assert(!card.includes('weddingTask'), 'no tasks query')
  assert(!card.includes('fetchNotes'), 'no notes fetch')
})

run('19. Mobile touch target for Next Action CTA', () => {
  const css = readFileSync(resolve(v2Root, 'WeddingDetailV2.module.css'), 'utf8')
  assert(css.includes('.nextActionCard'), 'next action styles')
  assert(css.includes('.nextActionCta'), 'cta block')
  const ctaBlock = css.slice(css.indexOf('.nextActionCta'))
  assert(ctaBlock.includes('min-height: 44px'), '44px target')
})

run('20. pickPrimaryAction marked legacy; progress field still exists', () => {
  const summary = readFileSync(
    resolve(v2Root, 'buildWeddingProgressSummary.ts'),
    'utf8',
  )
  assert(summary.includes('LEGACY'), 'legacy marker')
  assert(summary.includes('pickPrimaryAction'), 'helper retained')
  assert(summary.includes('primaryAction:'), 'field retained for tests')
  assert(summary.includes('resolveWeddingNextAction'), 'points to Phase 1B')
})

run('21. Overview uses corrected shared resolver — no local priority hack', () => {
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  const resolver = readFileSync(
    resolve(libRoot, 'resolveWeddingNextAction.ts'),
    'utf8',
  )
  assert(card.includes('resolveWeddingNextAction(wedding,'), 'card calls shared')
  assert(!overview.includes('pickPrimaryAction'), 'no overview pick')
  assert(!card.includes('isImminent'), 'no local imminent policy')
  assert(!card.includes('ops >'), 'no local ops-over-commercial')
  assert(resolver.includes('PHASE A'), 'shared lifecycle A')
  assert(resolver.includes('PHASE B'), 'shared lifecycle B')
  assert(
    !resolver.includes('operational work beats commercial'),
    '1A.1 imminent bypass removed',
  )
})

run('22. No ceremony-time CTA before completed pre-wedding (shared policy)', () => {
  const resolver = readFileSync(
    resolve(libRoot, 'resolveWeddingNextAction.ts'),
    'utf8',
  )
  // Ops phase is nested under preStatus === completed in prep window.
  assert(resolver.includes("if (preStatus !== 'completed')"), 'waiting gate')
  assert(resolver.includes('set_ceremony_time'), 'ceremony id retained')
})

run('23. Manual ceremony-time save reflected via operational-times query', () => {
  const card = readFileSync(resolve(v2Root, 'WeddingNextActionCard.tsx'), 'utf8')
  const plan = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  assert(card.includes('operationalTimesQueryKey'), 'Overview shares key')
  assert(plan.includes('operationalTimesQueryKey'), 'Plan dnia shares key')
  assert(plan.includes('weddingOperationalTimesService.setTime'), 'manual save path')
  assert(plan.includes('setQueryData'), 'Plan dnia updates cache')
  assert(card.includes('operationalTimes,'), 'passed into resolver context')
})

run('24. Overview travel CTA reuses TravelFeeResolveModal; save invalidates wedding', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  const dispatch = readFileSync(
    resolve(v2Root, 'dispatchWeddingNextAction.ts'),
    'utf8',
  )
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(dispatch.includes('resolveTravelFee'), 'travel handler')
  assert(shell.includes('TravelFeeResolveModal'), 'modal mounted')
  assert(shell.includes('from \'@/features/weddings/detail/travel-fee/TravelFeeResolveModal\''), 'same module')
  assert(shell.includes('handleWeddingUpdated'), 'save refresh')
  assert(shell.includes("invalidateQueries({ queryKey: ['weddings'] })"), 'no hard reload')
  assert(!shell.includes("onHeroAction('open_cockpit')"), 'no cockpit hero')
  assert(header.includes('Otwórz tryb dnia ślubu'), 'manual cockpit kept')
  assert(!dispatch.includes('open_cockpit'), 'no cockpit dispatch')
})

console.log('\nwedding overview next action (1B / 1B.1): done')
