/**
 * Builds a QuestionnaireDraft from classified contract detections.
 */

import type { DetectedField } from '@/features/documents/mapping/types'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { QuestionOption } from '@/types/form'
import { classifyDetectedFields, countBySource } from './classifyVariables'
import { buildPackageVariablesFromAi } from './buildPackageVariables'
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
  packageOptions?: QuestionOption[]
}): QuestionnaireDraft {
  const packageOptions = input.packageOptions ?? []
  let classification = classifyDetectedFields(input.fields)
  const packageVariables = buildPackageVariablesFromAi(input.ai)

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

  // If AI found any package business slots, ensure package selection exists.
  const needsPackageSelect =
    pkg.mentioned || hasPackageClassified || packageVariables.length > 0

  if (needsPackageSelect && !hasPackageClassified) {
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

  if (needsPackageSelect) {
    questions = ensurePackageSelectQuestion(questions, packageOptions)
  }

  questions = applyAskClientDefaults(questions)

  const counts = countBySource(classification, packageVariables.length)
  if (needsPackageSelect && counts.ourwedConfiguration === 0) {
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
    packageVariables,
    templateDefaults: [],
    generatedAt: new Date().toISOString(),
    savedFormId: null,
    savedInstanceId: null,
    savedFormUrl: null,
  }
}
