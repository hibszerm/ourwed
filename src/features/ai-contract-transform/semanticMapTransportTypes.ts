export type SemanticMapTransportFailure =
  | 'AUTH_FAILURE'
  | 'TRANSPORT_FAILURE'
  | 'PROVIDER_CONFIGURATION_FAILURE'
  | 'PROVIDER_FAILURE'
  | 'PROVIDER_TIMEOUT'
  | 'PROTOCOL_FAILURE'

export class SemanticMapTransportError extends Error {
  readonly failure: SemanticMapTransportFailure
  readonly diagnosticCode: string

  constructor(
    failure: SemanticMapTransportFailure,
    diagnosticCode: string,
  ) {
    super(`Semantic map transport failed: ${failure}`)
    this.name = 'SemanticMapTransportError'
    this.failure = failure
    this.diagnosticCode = diagnosticCode
  }
}
