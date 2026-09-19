/**
 * K3 live product inventory snapshot (code-audited against Sidebar/router/settings).
 * Counts are for reporting — capabilities themselves are feature-owned.
 */

export const K3_LIVE_INVENTORY = {
  auditedAt: '2026-09-19',
  sourcePhase: 'k2-1-contract-readiness-parity',
  classifications: {
    LIVE_CURRENT: 94,
    PARTIAL: 8,
    HIDDEN_INTERNAL: 12,
    DEAD_LEGACY: 6,
    EXPERIMENTAL: 7,
    PLANNED_ONLY: 4,
  },
  notes: [
    'LIVE_CURRENT ≈ user-facing routes/actions from Sidebar, settingsNav, wedding workspace tabs, finance, questionnaires, sessions, calendar, guide.',
    'EXPERIMENTAL includes AI contract lab / transform / comparison routes — not taught.',
    'DEAD_LEGACY includes dashboard-v2 redirects and document settings redirects to packages.',
    'PARTIAL includes surfaces with Classic/Modern label variance (documented in notes).',
  ],
  excludedExamples: [
    '/laboratorium-umow-ai',
    '/eksperymenty/umowy-ai-transform',
    '/dev/contract-analysis-eval',
    'exact_fact',
    'ResourceQuery',
  ],
} as const

/** Contextual capabilities and their canonical sources (K3 audit). */
export const K3_CONTEXTUAL_AUDIT = [
  {
    id: 'contracts.generate',
    question: 'Czy mogę już wygenerować umowę dla X? / Co jeszcze brakuje?',
    requiredState: 'contract generation readiness',
    canonicalSource: 'mayGenerateContract → validateContractGeneration',
    assistantSource: 'CONTRACT.READINESS (inspect)',
    parity: 'CANONICAL_SHARED',
  },
  {
    id: 'contracts.generation_page',
    question: 'Gdzie jest strona generowania umowy dla X?',
    requiredState: 'weddingId + readiness',
    canonicalSource: 'mayGenerateContract + router /umowy/nowa',
    assistantSource: 'CONTRACT.READINESS + wedding resolve',
    parity: 'CANONICAL_SHARED',
  },
  {
    id: 'contracts.status',
    question: 'Jaki jest status umowy dla X?',
    requiredState: 'contract status',
    canonicalSource: 'contractService / wedding.contract',
    assistantSource: 'CONTRACT.SIGNED / contract.status',
    parity: 'DETERMINISTIC_FACTS',
  },
  {
    id: 'travel.resolve_fee',
    question: 'Czy dojazd jest ustalony dla X?',
    requiredState: 'travel fee resolution',
    canonicalSource: 'isTravelFeeResolved (also in validateContractGeneration)',
    assistantSource: 'TRAVEL.RESOLVED / CONTRACT.READINESS',
    parity: 'CANONICAL_SHARED',
  },
  {
    id: 'q.prewedding.send',
    question: 'Jaki jest status / jak wysłać ankietę przedślubną dla X?',
    requiredState: 'prewedding questionnaire status',
    canonicalSource: 'wedding questionnaires / prewedding service',
    assistantSource: 'q.prewedding_status',
    parity: 'DETERMINISTIC_FACTS',
  },
  {
    id: 'q.prewedding.status',
    question: 'Czy para uzupełniła ankietę przedślubną?',
    requiredState: 'prewedding status',
    canonicalSource: 'prewedding questionnaire status',
    assistantSource: 'q.prewedding_status',
    parity: 'DETERMINISTIC_FACTS',
  },
  {
    id: 'finance.remaining',
    question: 'Ile zostało do zapłaty u X?',
    requiredState: 'finance remaining',
    canonicalSource: 'financeAuthority getRemainingToPay',
    assistantSource: 'FIN.* CRM concepts',
    parity: 'DETERMINISTIC_FACTS',
  },
  {
    id: 'payments.add',
    question: 'Jak dodać wpłatę do X?',
    requiredState: 'weddingId (procedure + optional CRM identity)',
    canonicalSource: 'UI AddPaymentModal on contract_finance tab',
    assistantSource: 'knowledge + wedding resolve',
    parity: 'DETERMINISTIC_FACTS',
  },
] as const
