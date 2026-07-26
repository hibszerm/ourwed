import type {
  PhaseAErrorCode,
  PhaseAStage,
  PhaseAValidationStats,
} from '@/features/ai-contract-lab/phaseAValidateSemanticMap'

export type AiContractLabAnalyzeError = {
  code: PhaseAErrorCode | string
  message: string
  stage?: PhaseAStage | string
  analysisVersion?: string | null
  issueCount?: number
  issues?: Array<{ path: string; code: string }>
  stats?: PhaseAValidationStats
  retryable?: boolean
  status?: number
}

export function formatPhaseAErrorDetails(error: AiContractLabAnalyzeError): string {
  const lines = [
    `Etap: ${error.stage ?? '—'}`,
    `Kod: ${error.code}`,
  ]
  if (error.stats) {
    lines.push(
      `Wiersze: provider=${error.stats.providerRows}, valid=${error.stats.validRows}, unresolved=${error.stats.unresolvedRows}`,
    )
  }
  if (error.issueCount != null) {
    lines.push(`Nieprawidłowe rekordy / issues: ${error.issueCount}`)
  }
  for (const issue of (error.issues ?? []).slice(0, 12)) {
    lines.push(`${issue.path} — ${issue.code}`)
  }
  return lines.join('\n')
}

export class AiContractLabApiError extends Error {
  readonly status: number
  readonly code: string
  readonly stage?: string
  readonly issues: Array<{ path: string; code: string }>
  readonly analysisVersion?: string | null
  readonly stats?: PhaseAValidationStats

  constructor(input: {
    status: number
    code: string
    stage?: string
    message?: string
    issues?: Array<{ path: string; code: string }>
    analysisVersion?: string | null
    stats?: PhaseAValidationStats
  }) {
    super(input.message || input.code)
    this.name = 'AiContractLabApiError'
    this.status = input.status
    this.code = input.code
    this.stage = input.stage
    this.issues = input.issues ?? []
    this.analysisVersion = input.analysisVersion
    this.stats = input.stats
  }
}
