import { packageService } from '@/lib/api/packageService'
import type { FormAnswerJson } from '@/types/formEngine'
import type { Wedding } from '@/types/wedding'
import {
  extractAnswerFields,
  mergeFormAnswersIntoWeddingCore,
} from './mergeFormAnswersIntoWeddingCore'

export { extractAnswerFields }

export function mergeFormAnswersIntoWedding(
  wedding: Wedding,
  answerJson: FormAnswerJson,
  meta?: { submittedAt?: string | null },
): Promise<Wedding> {
  return mergeFormAnswersIntoWeddingCore(
    wedding,
    answerJson,
    meta,
    (packageId) => packageService.get(packageId),
  )
}
