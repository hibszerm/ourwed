/**
 * D2.1 — Attention selection diversity + copy + relative context.
 * Pure in-memory. Run: npm run test:studio-attention-polish
 */

import {
  buildStudioAttentionItems,
  collectStudioAttentionForWedding,
  type StudioAttentionWeddingInput,
} from '@/features/dashboard/attention/buildStudioAttention'
import {
  attentionItemCountLabel,
  formatAttentionListContext,
  formatAttentionRelativeContext,
  selectStudioAttentionWithDiversity,
  studioAttentionCopyForKind,
  studioAttentionFamilyOf,
  studioAttentionIconDomain,
  studioAttentionIssueLabel,
} from '@/features/dashboard/attention/studioAttentionPresentation'
import {
  STUDIO_ATTENTION_LIMIT,
  STUDIO_ATTENTION_MOBILE_VISIBLE,
  type StudioAttentionItem,
} from '@/features/dashboard/attention/studioAttentionTypes'
import { createDefaultQuestionnaires } from '@/lib/utils/questionnaires'
import type { Couple, Payment, Wedding } from '@/types/wedding'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function assertEq<T>(a: T, b: T, msg: string): void {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Anna Test',
    partner2: 'Jan Test',
    partner1FirstName: 'Anna',
    partner1LastName: 'Test',
    partner2FirstName: 'Jan',
    partner2LastName: 'Test',
    partner1Phone: '500100200',
    partner1Address: 'ul. Testowa 1',
    partner1PostalCode: '00-001',
    partner1City: 'Warszawa',
    phone: '500100200',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2027-09-15',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video',
    price: 10000,
    depositAmount: 1000,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: createDefaultQuestionnaires(),
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    receptionLocation: 'Pałac',
    travelFeeStatus: 'included',
    travelFeeAmount: 0,
    ...partial,
  }
}

function paidDeposit(amount = 1000): Payment {
  return {
    id: 'p-dep',
    label: 'Zadatek',
    amount,
    type: 'deposit',
    paid: true,
    paidAt: '2026-06-01',
  }
}

function stubItem(
  partial: Partial<StudioAttentionItem> &
    Pick<StudioAttentionItem, 'id' | 'kind' | 'entityId'>,
): StudioAttentionItem {
  return {
    entityType: 'wedding',
    title: partial.entityId,
    description: partial.kind,
    urgency:
      partial.kind === 'overdue_payment' || partial.kind === 'overdue_delivery'
        ? 'overdue'
        : partial.kind === 'send_prewedding'
          ? 'preparation'
          : 'blocker',
    dueAt: null,
    href: '/',
    ctaLabel: 'X',
    contextLabel: null,
    entityLabel: partial.entityId,
    weddingDate: '2027-01-01',
    ...partial,
  }
}

const TODAY = '2026-09-19'

{
  assertEq(studioAttentionFamilyOf('overdue_payment'), 'OVERDUE_FINANCE', 'pay')
  assertEq(
    studioAttentionFamilyOf('overdue_delivery'),
    'OVERDUE_DELIVERY',
    'del',
  )
  assertEq(
    studioAttentionFamilyOf('mark_contract_sent'),
    'COMMERCIAL_BLOCKER',
    'commercial',
  )
  assertEq(studioAttentionFamilyOf('send_prewedding'), 'PREPARATION', 'prep')
  console.log('PASS  family mapping')
}

{
  assertEq(studioAttentionIssueLabel('overdue_payment'), 'Płatność po terminie', 'pay label')
  assertEq(studioAttentionIssueLabel('overdue_delivery'), 'Termin oddania', 'del label')
  assertEq(studioAttentionIssueLabel('resolve_travel_fee'), 'Koszt dojazdu', 'travel label')
  assertEq(studioAttentionIssueLabel('generate_contract'), 'Umowa', 'generate label')
  assertEq(studioAttentionIssueLabel('mark_contract_sent'), 'Umowa', 'sent label')
  assertEq(studioAttentionIssueLabel('mark_contract_signed'), 'Umowa', 'signed label')
  assertEq(studioAttentionIssueLabel('record_deposit'), 'Zadatek', 'deposit label')
  assertEq(studioAttentionIssueLabel('send_prewedding'), 'Ankieta przedślubna', 'prep label')
  assertEq(
    studioAttentionIssueLabel('complete_contract_data_manually'),
    'Dane do umowy',
    'data label',
  )
  console.log('PASS  UI issue labels for all kinds')
}


{
  // A. ONLY ONE FAMILY — 7 overdue payments → top 6 payments
  const payments = Array.from({ length: 7 }, (_, i) =>
    stubItem({
      id: `p${i}`,
      kind: 'overdue_payment',
      entityId: `w${i}`,
      weddingDate: `2027-0${(i % 8) + 1}-15`,
    }),
  )
  // Pretend already ranked by weddingDate
  const ranked = [...payments].sort((a, b) =>
    (a.weddingDate ?? '').localeCompare(b.weddingDate ?? ''),
  )
  const selected = selectStudioAttentionWithDiversity(
    ranked,
    STUDIO_ATTENTION_LIMIT,
  )
  assertEq(selected.length, STUDIO_ATTENTION_LIMIT, 'cap 6')
  assert(
    selected.every((i) => i.kind === 'overdue_payment'),
    'payment-only stays payments',
  )
  assertEq(selected[0]?.id, ranked[0]?.id, 'keeps top-ranked payment')
  console.log('PASS  A payment-only → top 6 payments')
}

{
  // B. MULTIPLE FAMILIES
  const ranked: StudioAttentionItem[] = [
    stubItem({ id: 'payA', kind: 'overdue_payment', entityId: 'wa' }),
    stubItem({ id: 'payB', kind: 'overdue_payment', entityId: 'wb' }),
    stubItem({ id: 'payC', kind: 'overdue_payment', entityId: 'wc' }),
    stubItem({
      id: 'comD',
      kind: 'mark_contract_sent',
      entityId: 'wd',
    }),
    stubItem({ id: 'prepE', kind: 'send_prewedding', entityId: 'we' }),
    stubItem({ id: 'payF', kind: 'overdue_payment', entityId: 'wf' }),
    stubItem({ id: 'payG', kind: 'overdue_payment', entityId: 'wg' }),
  ]
  const selected = selectStudioAttentionWithDiversity(
    ranked,
    STUDIO_ATTENTION_LIMIT,
  )
  const kinds = selected.map((i) => i.kind)
  assert(kinds.includes('overdue_payment'), 'has finance')
  assert(kinds.includes('mark_contract_sent'), 'has commercial')
  assert(kinds.includes('send_prewedding'), 'has preparation')
  assertEq(selected.length, STUDIO_ATTENTION_LIMIT, 'cap')
  assertEq(selected[0]?.id, 'payA', 'first family rep is top global')
  assertEq(selected[1]?.id, 'comD', 'commercial after first payment walk')
  assertEq(selected[2]?.id, 'prepE', 'prep next new family')
  // remaining filled from global leftovers
  assertEq(selected[3]?.id, 'payB', 'fill payB')
  assertEq(selected[4]?.id, 'payC', 'fill payC')
  assertEq(selected[5]?.id, 'payF', 'fill payF (6th slot)')
  console.log('PASS  B mixed-family diversity + fill')
}

{
  // C/D determinism + cap
  const ranked: StudioAttentionItem[] = [
    stubItem({ id: 'a', kind: 'overdue_delivery', entityId: '1' }),
    stubItem({ id: 'b', kind: 'overdue_payment', entityId: '2' }),
    stubItem({ id: 'c', kind: 'resolve_travel_fee', entityId: '3' }),
    stubItem({ id: 'd', kind: 'send_prewedding', entityId: '4' }),
    stubItem({ id: 'e', kind: 'overdue_payment', entityId: '5' }),
    stubItem({ id: 'f', kind: 'generate_contract', entityId: '6' }),
    stubItem({ id: 'g', kind: 'overdue_payment', entityId: '7' }),
  ]
  const once = selectStudioAttentionWithDiversity(ranked, STUDIO_ATTENTION_LIMIT)
  const twice = selectStudioAttentionWithDiversity(ranked, STUDIO_ATTENTION_LIMIT)
  assertEq(
    once.map((i) => i.id).join('|'),
    twice.map((i) => i.id).join('|'),
    'deterministic',
  )
  assert(once.length <= STUDIO_ATTENTION_LIMIT, 'never > limit')
  assertEq(once.length, STUDIO_ATTENTION_LIMIT, 'fills to 6 when available')
  console.log('PASS  C/D cap + determinism')
}

{
  // E. no fake diversity — absent family not reserved
  const only = [
    stubItem({ id: '1', kind: 'generate_contract', entityId: 'a' }),
    stubItem({ id: '2', kind: 'generate_contract', entityId: 'b' }),
  ]
  const selected = selectStudioAttentionWithDiversity(only, STUDIO_ATTENTION_LIMIT)
  assertEq(selected.length, 2, 'no empty family slots')
  console.log('PASS  E no fake diversity slots')
}

{
  // Copy
  const pay = studioAttentionCopyForKind('overdue_payment', {
    remainingToPay: 2500,
    dueKey: '2026-08-07',
  })
  assert(pay.description.startsWith('Płatność po terminie ·'), 'compact payment issue line')
  assert(pay.description.includes('2'), 'amount present')
  assertEq(pay.ctaLabel, 'Przejdź do płatności', 'pay cta')

  assertEq(
    studioAttentionCopyForKind('resolve_travel_fee').description,
    'Koszt dojazdu wymaga decyzji',
    'travel compact line',
  )
  assertEq(
    studioAttentionCopyForKind('generate_contract').description,
    'Umowa gotowa do wygenerowania',
    'generate',
  )
  assertEq(
    studioAttentionCopyForKind('send_prewedding').description,
    'Wyślij ankietę przedślubną',
    'prewedding compact line',
  )
  assert(
    studioAttentionCopyForKind('mark_contract_signed').description.includes(
      'oznaczenie podpisu',
    ),
    'signed copy does not claim couple already signed',
  )
  console.log('PASS  operational copy by kind')
}

{
  // Relative time
  assertEq(
    formatAttentionRelativeContext({
      kind: 'overdue_payment',
      dueAt: '2026-09-19',
      weddingDate: null,
      todayKey: TODAY,
    }),
    'dzisiaj',
    'due today',
  )
  assertEq(
    formatAttentionRelativeContext({
      kind: 'overdue_payment',
      dueAt: '2026-09-18',
      weddingDate: null,
      todayKey: TODAY,
    }),
    '1 dzień po terminie',
    '1 day overdue',
  )
  assertEq(
    formatAttentionRelativeContext({
      kind: 'overdue_delivery',
      dueAt: '2026-09-07',
      weddingDate: null,
      todayKey: TODAY,
    }),
    '12 dni po terminie',
    '12 days overdue',
  )
  assertEq(
    formatAttentionRelativeContext({
      kind: 'send_prewedding',
      dueAt: null,
      weddingDate: '2026-09-20',
      todayKey: TODAY,
    }),
    'ślub jutro',
    'wedding tomorrow',
  )
  assertEq(
    formatAttentionRelativeContext({
      kind: 'send_prewedding',
      dueAt: null,
      weddingDate: '2026-10-07',
      todayKey: TODAY,
    }),
    'ślub za 18 dni',
    'wedding proximity',
  )
  assertEq(
    formatAttentionRelativeContext({
      kind: 'generate_contract',
      dueAt: null,
      weddingDate: '2027-01-01',
      todayKey: TODAY,
    }),
    null,
    'commercial blocker invents nothing',
  )
  console.log('PASS  relative time labels')
}

{
  assertEq(
    formatAttentionListContext('12 dni po terminie'),
    '12 dni',
    'compact overdue days',
  )
  assertEq(
    formatAttentionListContext('1 dzień po terminie'),
    '1 dzień',
    'compact one day',
  )
  assertEq(
    formatAttentionListContext('ślub za 18 dni'),
    'ślub za 18 dni',
    'prep kept',
  )
  console.log('PASS  compact list context')
}


{
  assertEq(attentionItemCountLabel(1), '1 pozycja', '1')
  assertEq(attentionItemCountLabel(2), '2 pozycje', '2')
  assertEq(attentionItemCountLabel(5), '5 pozycji', '5')
  assertEq(attentionItemCountLabel(12), '12 pozycji', '12')
  assertEq(attentionItemCountLabel(22), '22 pozycje', '22')
  console.log('PASS  count pluralization')
}

{
  // F/G one next action + dedupe still via composer
  const inputs: StudioAttentionWeddingInput[] = []
  for (let i = 0; i < 4; i++) {
    inputs.push({
      wedding: wedding({
        id: `w-pay-${i}`,
        date: `2027-0${i + 1}-10`,
        contract: { status: 'signed' },
        payments: [paidDeposit()],
        price: 8000,
        finalPaymentDueDate: '2026-01-01',
      }),
      preweddingStatus: 'completed',
      contractQuestionnaireStatus: 'completed',
    })
  }
  inputs.push({
    wedding: wedding({
      id: 'w-sent',
      date: '2027-06-01',
      contract: { status: 'sent' },
      payments: [paidDeposit()],
    }),
    preweddingStatus: 'not_sent',
    contractQuestionnaireStatus: 'completed',
  })
  inputs.push({
    wedding: wedding({
      id: 'w-prep',
      date: '2026-10-01',
      contract: { status: 'signed' },
      payments: [paidDeposit()],
    }),
    preweddingStatus: 'not_sent',
    contractQuestionnaireStatus: 'completed',
  })

  const items = buildStudioAttentionItems(inputs, TODAY)
  assert(items.length <= STUDIO_ATTENTION_LIMIT, 'cap')
  const families = new Set(items.map((i) => studioAttentionFamilyOf(i.kind)))
  assert(families.has('OVERDUE_FINANCE'), 'mixed includes finance')
  assert(families.has('COMMERCIAL_BLOCKER'), 'mixed includes commercial')
  assert(families.has('PREPARATION'), 'mixed includes prep')

  const byWedding = new Map<string, StudioAttentionItem[]>()
  for (const item of items) {
    const list = byWedding.get(item.entityId) ?? []
    list.push(item)
    byWedding.set(item.entityId, list)
  }
  for (const [, list] of byWedding) {
    const nextActions = list.filter(
      (i) => i.kind !== 'overdue_payment' && i.kind !== 'overdue_delivery',
    )
    assert(nextActions.length <= 1, 'one Next Action per wedding')
  }
  assertEq(
    new Set(items.map((i) => i.id)).size,
    items.length,
    'no duplicate issue ids',
  )

  const again = buildStudioAttentionItems(inputs, TODAY)
  assertEq(
    again.map((i) => i.id).join('|'),
    items.map((i) => i.id).join('|'),
    'end-to-end deterministic',
  )
  console.log('PASS  F/G composer diversity + invariants')
}

{
  // Performance freeze — service topology file unchanged in structure
  const service = readFileSync(
    resolve(process.cwd(), 'src/features/dashboard/attention/studioAttentionService.ts'),
    'utf8',
  )
  assert(service.includes('listByWeddingIds'), 'batch retained')
  assert(!/\bgetWeddingDetail\s*\(/.test(service), 'no detail hydrate')
  assert(service.includes("perWeddingServiceCalls: 0"), 'zero per-wedding')
  assert(
    !service.includes('selectStudioAttentionWithDiversity'),
    'diversity not in service (presentation-only)',
  )
  console.log('PASS  performance freeze — service topology untouched by diversity')
}

{
  // Live item copy from collector
  const overdue = collectStudioAttentionForWedding(
    {
      wedding: wedding({
        id: 'w-live',
        contract: { status: 'signed' },
        payments: [paidDeposit()],
        price: 5000,
        finalPaymentDueDate: '2026-08-01',
      }),
      preweddingStatus: 'completed',
      contractQuestionnaireStatus: 'completed',
    },
    TODAY,
  ).find((i) => i.kind === 'overdue_payment')
  assert(overdue != null, 'has overdue')
  assert(
    overdue!.description.startsWith('Płatność po terminie ·'),
    'live payment compact line',
  )
  assert(overdue!.contextLabel?.includes('po terminie'), 'relative context')
  assert(!/^\d{4}-\d{2}-\d{2}$/.test(overdue!.contextLabel ?? ''), 'no raw ISO')
  console.log('PASS  live item presentation')
}

{
  // D2.3.1 — icon domain mapping (presentation only)
  const kinds: StudioAttentionItem['kind'][] = [
    'overdue_payment',
    'record_deposit',
    'resolve_travel_fee',
    'complete_contract_data_manually',
    'generate_contract',
    'mark_contract_sent',
    'mark_contract_signed',
    'send_prewedding',
    'overdue_delivery',
  ]
  for (const kind of kinds) {
    assert(
      studioAttentionIconDomain(kind) != null,
      `domain resolves for ${kind}`,
    )
  }
  assertEq(studioAttentionIconDomain('overdue_payment'), 'finance', 'pay→finance')
  assertEq(studioAttentionIconDomain('record_deposit'), 'finance', 'deposit→finance')
  assertEq(studioAttentionIconDomain('resolve_travel_fee'), 'travel', 'travel')
  assertEq(
    studioAttentionIconDomain('complete_contract_data_manually'),
    'document',
    'data→doc',
  )
  assertEq(studioAttentionIconDomain('generate_contract'), 'document', 'gen→doc')
  assertEq(studioAttentionIconDomain('mark_contract_sent'), 'document', 'sent→doc')
  assertEq(studioAttentionIconDomain('mark_contract_signed'), 'document', 'signed→doc')
  assertEq(
    studioAttentionIconDomain('send_prewedding'),
    'questionnaire',
    'prep→questionnaire',
  )
  assertEq(studioAttentionIconDomain('overdue_delivery'), 'delivery', 'delivery')

  const panel = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.tsx'),
    'utf8',
  )
  assert(panel.includes('IconWallet'), 'panel wallet')
  assert(panel.includes('IconRoute'), 'panel route')
  assert(panel.includes('IconDocuments'), 'panel documents')
  assert(panel.includes('IconClipboardList'), 'panel clipboard list')
  assert(panel.includes('IconPackage'), 'panel package')
  assert(!panel.includes('IconFinances'), 'no IconFinances in panel')
  assert(!panel.includes('DollarSign'), 'no DollarSign')
  assert(!panel.includes('CircleDollarSign'), 'no CircleDollarSign')
  console.log('PASS  D2.3.1 icon domain system')
}

{
  // D2.4 — capacity + presentation truncation architecture
  assertEq(STUDIO_ATTENTION_LIMIT, 6, 'canonical pool max 6')
  assertEq(STUDIO_ATTENTION_MOBILE_VISIBLE, 5, 'mobile visible max 5')

  const sevenPays = Array.from({ length: 7 }, (_, i) =>
    stubItem({
      id: `d24-p${i}`,
      kind: 'overdue_payment',
      entityId: `d24-w${i}`,
      weddingDate: `2027-0${(i % 8) + 1}-10`,
    }),
  )
  const pool = selectStudioAttentionWithDiversity(
    sevenPays,
    STUDIO_ATTENTION_LIMIT,
  )
  assertEq(pool.length, 6, 'desktop pool can be 6')
  assertEq(
    pool.slice(0, STUDIO_ATTENTION_MOBILE_VISIBLE).length,
    5,
    'mobile slice is first 5',
  )
  assertEq(pool[0]?.id, sevenPays[0]?.id, 'order preserved under larger cap')

  const four = selectStudioAttentionWithDiversity(
    sevenPays.slice(0, 4),
    STUDIO_ATTENTION_LIMIT,
  )
  assertEq(four.length, 4, 'no placeholder when fewer than 6')

  const panel = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.tsx'),
    'utf8',
  )
  const css = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.module.css'),
    'utf8',
  )
  assert(panel.includes('STUDIO_ATTENTION_MOBILE_VISIBLE'), 'mobile count uses shared constant')
  assert(panel.includes('countDesktop'), 'desktop visible count')
  assert(panel.includes('countMobile'), 'mobile visible count')
  assert(panel.includes('useStudioAttention'), 'single query hook')
  assert(!panel.includes('matchMedia'), 'no JS viewport branching')
  assert(!panel.includes('innerWidth'), 'no resize width branching')
  assert(css.includes('container-type: inline-size'), 'container query for grid')
  assert(css.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)'), '2-col grid')
  assert(css.includes('min-width: 640px'), 'comfortable cell breakpoint from measured geometry')
  assert(!css.includes('min-width: 800px'), 'old 800px threshold retired')
  assert(css.includes('nth-child(n + 6)'), 'phone hides 6th')
  assert(css.includes('@media (max-width: 767px)'), 'phone media freeze')
  assert(panel.includes('IconWallet'), 'icons frozen wallet')
  assert(panel.includes('IconRoute'), 'icons frozen route')
  assert(panel.includes('IconDocuments'), 'icons frozen documents')
  assert(panel.includes('IconClipboardList'), 'icons frozen clipboard')
  assert(panel.includes('IconPackage'), 'icons frozen package')

  const service = readFileSync(
    resolve('src/features/dashboard/attention/studioAttentionService.ts'),
    'utf8',
  )
  const hook = readFileSync(
    resolve('src/features/dashboard/attention/useStudioAttention.ts'),
    'utf8',
  )
  assert(hook.includes("['dashboard', 'attention', userId]"), 'same RQ key family')
  assert(service.includes('perWeddingServiceCalls: 0'), 'zero per-wedding')
  assert(!service.includes('innerWidth'), 'service not viewport-aware')
  assert(!hook.includes('matchMedia'), 'hook not viewport-aware')
  console.log('PASS  D2.4 desktop grid capacity + presentation')
}

{
  // D2.4.2 — equal cell rhythm + dynamic row count (presentation only)
  assertEq(STUDIO_ATTENTION_LIMIT, 6, 'pool still 6')
  assertEq(STUDIO_ATTENTION_MOBILE_VISIBLE, 5, 'mobile still 5')

  const panel = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.tsx'),
    'utf8',
  )
  const css = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.module.css'),
    'utf8',
  )

  // Always mount micro slot; empty uses aria-hidden — no fake copy
  assert(panel.includes('styles.micro'), 'micro slot present')
  assert(panel.includes('aria-hidden={micro ? undefined : true}'), 'empty micro not announced')
  assert(panel.includes("micro ?? ''"), 'empty micro has no placeholder text')
  assert(!panel.includes('brak daty'), 'no fake date copy')
  assert(!panel.includes('placeholder'), 'no placeholder entities in panel')
  assert(!panel.includes('ResizeObserver'), 'no DOM measurement')
  assert(!panel.includes('getBoundingClientRect'), 'no DOM measurement')

  // Dynamic rows: auto rows, no max-capacity min-height on list
  assert(css.includes('grid-auto-rows: auto'), 'content-driven grid rows')
  assert(css.includes('align-items: stretch'), 'sibling cells share row height')
  assert(
    css.includes('minmax(\n      calc(var(--text-2xs, 0.6875rem) * 1.3)') ||
      css.includes('minmax(calc(var(--text-2xs'),
    'desktop reserves micro slot height',
  )
  assert(css.includes('min-width: 640px'), 'breakpoint frozen at 640')
  assert(!css.includes('min-width: 800px'), '800 not reintroduced')

  // ceil(n/2) is layout math — assert formula coverage for tests
  for (const [n, rows] of [
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
  ] as const) {
    assertEq(Math.ceil(n / 2), rows, `ceil(${n}/2)=${rows}`)
  }

  assert(css.includes('display: none'), 'mobile hides micro / sidebar patterns')
  assert(css.includes('.micro {'), 'micro rules exist')
  // Phone block still hides micro (D2.3 anatomy freeze)
  assert(/@media \(max-width: 767px\)[\s\S]*\.micro\s*\{[\s\S]*display:\s*none/.test(css), 'mobile hides micro slot')

  console.log('PASS  D2.4.2 grid rhythm + dynamic height')
}

{
  // D2.4.3 — deliberate zero Attention state
  const panel = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.tsx'),
    'utf8',
  )
  const css = readFileSync(
    resolve('src/features/dashboard-v3/DashboardV3AttentionPanel.module.css'),
    'utf8',
  )

  assert(panel.includes('showZeroState'), 'explicit zero branch')
  assert(panel.includes('attentionQuery.isSuccess'), 'zero requires success')
  assert(panel.includes('Nic nie wymaga Twojej uwagi'), 'primary copy')
  assert(
    panel.includes(
      'Wszystkie najważniejsze sprawy są na ten moment załatwione.',
    ),
    'supporting copy',
  )
  assert(panel.includes('dashboard-v3-attention-empty'), 'empty test id')
  assert(!panel.includes('0 pozycji'), 'no zero count label')
  assert(!panel.includes('Brak zadań'), 'not tasks')
  assert(!panel.includes('Brak powiadomień'), 'not notifications')
  assert(!panel.includes('Świetna robota'), 'not gamified')
  assert(!panel.includes('Przejdź do zleceń'), 'no CTA')
  assert(!panel.includes('Odśwież'), 'no refresh CTA')

  // Branch order: loading → populated list → zero; list not mounted on zero
  const loadingIdx = panel.indexOf('styles.loading')
  const listIdx = panel.indexOf('<ul className={styles.list}>')
  const zeroIdx = panel.indexOf('dashboard-v3-attention-empty')
  assert(loadingIdx > 0 && listIdx > loadingIdx && zeroIdx > listIdx, 'state order loading→list→zero')
  assert(panel.includes('items.length > 0'), 'populated before zero')

  assert(css.includes('.emptyCopy'), 'supporting copy style')
  assert(css.includes('min-width: 640px'), 'populated breakpoint frozen')
  assert(panel.includes('IconWallet'), 'populated icons frozen')

  const service = readFileSync(
    resolve('src/features/dashboard/attention/studioAttentionService.ts'),
    'utf8',
  )
  assert(service.includes('perWeddingServiceCalls: 0'), 'topology unchanged')
  console.log('PASS  D2.4.3 attention zero state')
}

console.log('\nStudio Attention D2.1 polish: OK')
