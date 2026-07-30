/**
 * Pure helpers for questionnaire template schemas (no Supabase).
 */

import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'

/** Count answerable (non-information) questions in a schema. */
export function countAnswerableQuestions(schema: PreWeddingTemplateSchema): number {
  let n = 0
  for (const section of schema.sections ?? []) {
    for (const q of section.questions ?? []) {
      if (!q.hidden && q.type !== 'information') n++
    }
  }
  return n
}

/** Deep-copy schema with new question and section IDs. */
export function regenerateSchemaIds(
  schema: PreWeddingTemplateSchema,
): PreWeddingTemplateSchema {
  return {
    sections: (schema.sections ?? []).map((section) => ({
      ...section,
      id: `s_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      questions: (section.questions ?? []).map((q) => ({
        ...q,
        id: `q_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      })),
    })),
  }
}
