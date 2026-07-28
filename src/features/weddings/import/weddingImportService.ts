import { weddingService } from '@/lib/api/weddingService'
import { reviewRowToCreateInput } from './buildReviewRows'
import type { WeddingImportResult, WeddingImportReviewRow } from './types'

const BATCH_SIZE = 5

export function createImportSessionId(): string {
  return crypto.randomUUID()
}

function shouldImportRow(row: WeddingImportReviewRow): boolean {
  if (!row.selectedForImport || row.status === 'excluded' || row.status === 'invalid') {
    return false
  }
  if (row.status === 'possible_duplicate' && row.duplicateDecision !== 'import_anyway') {
    return false
  }
  return true
}

export async function executeWeddingImport(input: {
  importSessionId: string
  rows: WeddingImportReviewRow[]
  importedRowIds?: Set<string>
}): Promise<WeddingImportResult> {
  const records: WeddingImportResult['records'] = []
  let importedCount = 0
  let failedCount = 0
  let skippedCount = 0

  const pending = input.rows.filter(
    (row) => shouldImportRow(row) && !input.importedRowIds?.has(row.id),
  )

  for (const row of input.rows) {
    if (input.importedRowIds?.has(row.id)) continue
    if (shouldImportRow(row)) continue

    skippedCount += 1
    records.push({
      reviewRowId: row.id,
      sourceRowNumber: row.sourceRowNumber,
      status: 'skipped',
      errorCode:
        row.status === 'possible_duplicate' ? 'POSSIBLE_DUPLICATE' : 'NOT_SELECTED',
      message:
        row.status === 'possible_duplicate'
          ? 'Możliwy duplikat — pominięto.'
          : row.status === 'invalid'
            ? 'Rekord wymaga poprawy przed importem.'
            : 'Nie wybrano do importu.',
    })
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (row) => {
        try {
          if (!row.weddingDate) {
            throw new Error('Brak daty ślubu.')
          }
          const wedding = await weddingService.create(reviewRowToCreateInput(row))
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
