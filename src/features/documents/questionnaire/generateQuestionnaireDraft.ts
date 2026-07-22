/**
 * Builds a QuestionnaireDraft from classified contract detections.
 * Independent of UI — call after analysis (or when regenerating).
 */

import type { DetectedField } from '@/features/documents/mapping/types'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { QuestionOption } from '@/types/form'
import { classifyDetectedFields, countBySource } from './classifyVariables'
import {
  ensurePackageSelectQuestion,
  generateQuestionsFromClassification,
} from './reuseEngine'
import { applyAskClientDefaults } from './askDefaults'
import {
  defaultQuestionnaireName,
  detectSuggestedPackage,
} from './packageDetection'
import type { ClassifiedVariable, QuestionnaireDraft } from './types'

export function generateQuestionnaireDraft(input: {
  fields: DetectedField[]
  ai?: AiDocumentAnalysisResult | null
  sourceText?: string | null
  templateName?: string | null
  linkedPackageId?: string | null
  /** Active studio packages — required for package Select (never free-text). */
  packageOptions?: QuestionOption[]
}): QuestionnaireDraft {
  const packageOptions = input.packageOptions ?? []
  let classification = classifyDetectedFields(input.fields)

  const pkg = detectSuggestedPackage({
    ai: input.ai,
    sourceText: input.sourceText,
    templateName: input.templateName,
  })

  const hasPackageClassified = classification.some(
    (c) =>
      c.source === 'ourwed_configuration' ||
      c.registryKey === 'package.name',
  )

  if (pkg.mentioned && !hasPackageClassified) {
    const synthetic: ClassifiedVariable = {
      fieldId: 'synthetic-package',
      registryKey: 'package.name',
      label: 'Pakiet',
      source: 'ourwed_configuration',
      confidence: 0.85,
    }
    classification = [...classification, synthetic]
  }

  let questions = generateQuestionsFromClassification(
    classification,
    input.fields,
    packageOptions,
  )

  if (pkg.mentioned || hasPackageClassified) {
    questions = ensurePackageSelectQuestion(questions, packageOptions)
  }

  questions = applyAskClientDefaults(questions)

  // Re-count after synthetic package injection.
  const counts = countBySource(classification)
  if (
    (pkg.mentioned || hasPackageClassified) &&
    counts.ourwedConfiguration === 0
  ) {
    counts.ourwedConfiguration = 1
  }

  return {
    name: defaultQuestionnaireName(pkg.label),
    description:
      'Ankieta wygenerowana automatycznie z kontraktu. Para uzupełnia tylko informacje, których umowa wymaga od nich.',
    suggestedPackageKind: pkg.kind,
    suggestedPackageLabel: pkg.label,
    linkedPackageId: input.linkedPackageId ?? null,
    classification,
    counts,
    questions,
    generatedAt: new Date().toISOString(),
    savedFormId: null,
    savedInstanceId: null,
    savedFormUrl: null,
  }
}
