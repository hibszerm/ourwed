import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type ProviderOutputCaptureMetadata = {
  goldenId: string
  model: string
  reasoningEffort: string
  sourceSha256: string
  contractVersion: string
  callOrdinal?: number
  timestamp?: string
}

export type ProviderOutputCapture = ProviderOutputCaptureMetadata & {
  outputText: string
}

/** Persist the exact text supplied to the strict semantic-map parser. */
export function captureProviderOutputText(
  directory: string,
  metadata: ProviderOutputCaptureMetadata,
  outputText: string,
): string {
  if (typeof outputText !== 'string') throw new TypeError('provider output text must be a string')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${metadata.goldenId}-provider-output.json`)
  writeFileSync(path, JSON.stringify({ ...metadata, outputText }) + '\n', { encoding: 'utf8', flag: 'wx' })
  return path
}

export function readCapturedProviderOutput(path: string): ProviderOutputCapture {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProviderOutputCapture>
  if (!value || typeof value.outputText !== 'string') throw new Error('captured provider output is invalid')
  return value as ProviderOutputCapture
}
