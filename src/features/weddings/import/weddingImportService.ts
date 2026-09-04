import { weddingService } from '@/lib/api/weddingService'
import { reviewRowToCreateInput } from './buildReviewRows'
import type { WeddingImportResult, WeddingImportReviewRow } from './types'
import type { CreateWeddingInput } from '@/types/wedding'
import type { Wedding } from '@/types/wedding'
import { createBrowserSafeId } from '@/lib/utils/createBrowserSafeId'

const BATCH_SIZE = 5

export function createImportSessionId(): string {
  return createBrowserSafeId()
}

/**
 * V1 retry after full reload is duplicate-protected, not transactionally idempotent.
 * Same-session retry uses importedRowIds and writes only remaining failed rows.
 */
export function isWritableImportRow(row: WeddingImportReviewRow): boolean {
  if (!row.selectedForImport || row.status === 'excluded') return false
  if (row.status === 'invalid') return false
  if (row.issues.some((issue) => issue.severity === 'error')) return false
  if (!row.weddingDate) return false
  if (row.priceState === 'invalid') return false
  if (
    row.status === 'possible_duplicate' &&
    row.duplicateDecision !== 'import_anyway'
  ) {
    return false
  }
  return true
}

function skipReason(row: WeddingImportReviewRow): {
  errorCode: string
  message: string
} {
  if (row.status === 'invalid' || row.issues.some((issue) => issue.severity === 'error')) {
    return {
      errorCode: 'NOT_IMPORTABLE',
      message: 'Rekord wymaga poprawy przed importem.',
    }
  }
  if (row.status === 'possible_duplicate' && row.duplicateDecision !== 'import_anyway') {
    return {
      errorCode: row.issues.some((issue) => issue.code === 'DUPLICATE_IN_FILE')
        ? 'DUPLICATE_IN_FILE'
        : 'DUPLICATE_EXISTING_WEDDING',
      message: row.issues.some((issue) => issue.code === 'DUPLICATE_IN_FILE')
        ? 'Ten rekord powtarza się w tym pliku.'
        : 'Podobne zlecenie jest już w OurWed.',
    }
  }
  return {
    errorCode: 'NOT_SELECTED',
    message: 'Nie wybrano do importu.',
  }
}

export type CreateImportedWedding = (
  input: CreateWeddingInput,
) => Promise<Pick<Wedding, 'id'>>

export async function executeWeddingImport(input: {
  importSessionId: string
  rows: WeddingImportReviewRow[]
  importedRowIds?: Set<string>
  createWedding?: CreateImportedWedding
}): Promise<WeddingImportResult> {
  const records: WeddingImportResult['records'] = []
  let importedCount = 0
  let failedCount = 0
  let skippedCount = 0
  const createWedding = input.createWedding ?? ((payload) => weddingService.create(payload))

  const pending = input.rows.filter(
    (row) => isWritableImportRow(row) && !input.importedRowIds?.has(row.id),
  )

  for (const row of input.rows) {
    if (input.importedRowIds?.has(row.id)) continue
    if (isWritableImportRow(row)) continue

    skippedCount += 1
    const reason = skipReason(row)
    records.push({
      reviewRowId: row.id,
      sourceRowNumber: row.sourceRowNumber,
      status: 'skipped',
      errorCode: reason.errorCode,
      message: reason.message,
    })
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (row) => {
        try {
          if (!isWritableImportRow(row) || !row.weddingDate) {
            throw new Error('Rekord wymaga poprawy przed importem.')
          }
          const wedding = await createWedding(reviewRowToCreateInput(row))
          importedCount += 1
          records.push({
            reviewRowId: row.id,
            sourceRowNumber: row.sourceRowNumber,
            status: 'imported',
            weddingId: wedding.id,
          })
        } catch (err) {
          failedCount += 1
          records.push({
            reviewRowId: row.id,
            sourceRowNumber: row.sourceRowNumber,
            status: 'failed',
            errorCode: 'CREATE_FAILED',
            message:
              err instanceof Error
                ? err.message
                : 'Nie udało się utworzyć ślubu.',
          })
        }
      }),
    )
  }

  return {
    importSessionId: input.importSessionId,
    requestedCount: pending.length,
    importedCount,
    failedCount,
    skippedCount,
    records,
  }
}
