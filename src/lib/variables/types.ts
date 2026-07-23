/**
 * Shared variable resolution for documents, contracts, templates, and future modules.
 * Consumers call VariableResolver.resolve() — they never choose data sources themselves.
 */

export type VariableSourceId =
  | 'questionnaire'
  | 'wedding'
  | 'crm'
  | 'travel'
  | 'package'
  | 'company'
  | 'invoice'
  | 'automation'

export interface VariableResolveContext {
  /** Existing draft / form values (non-authoritative for company keys). */
  base?: Record<string, string>
  weddingId?: string
  packageId?: string
  /** Snapshot attached to a document draft — package provider reads this. */
  packageSnapshot?: unknown
  /** Submitted questionnaire answers keyed by registry / field key. */
  questionnaireAnswers?: Record<string, string>
  /** Optional preloaded wedding field map (avoids N+1 when caller already has data). */
  weddingValues?: Record<string, string>
  /** Optional travel field map. */
  travelValues?: Record<string, string>
  /** Optional CRM field map. */
  crmValues?: Record<string, string>
  /** Limit which providers run (default: all registered). */
  sources?: VariableSourceId[]
}

export interface VariableProvider {
  readonly id: VariableSourceId
  resolve(ctx: VariableResolveContext): Promise<Record<string, string>>
}

export interface VariableResolverApi {
  register(provider: VariableProvider): void
  /** Resolve all registered sources into a flat key→value map. */
  resolve(ctx?: VariableResolveContext): Promise<Record<string, string>>
  /**
   * Resolve a single variable by canonical ID or alias.
   * Documents should call this — never choose providers themselves.
   */
  resolveId(
    id: string,
    ctx?: VariableResolveContext,
  ): Promise<string | null>
  resolveIds(
    ids: string[],
    ctx?: VariableResolveContext,
  ): Promise<Record<string, string>>
}
