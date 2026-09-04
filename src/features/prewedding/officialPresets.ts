/**
 * Official OurWed V1 pre-wedding questionnaire presets.
 *
 * Frozen from the approved live owned templates. source_key is provenance
 * of the original copy only — never a live-sync pointer.
 * Future revisions must use a new *_v2 source_key and a new copied row.
 * Never UPDATE an existing owned template because a preset definition changed.
 */

import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'
import photoPreset from '@/features/prewedding/officialPresets/schemas/pre_wedding_photo_v1.json'
import photoVideoPreset from '@/features/prewedding/officialPresets/schemas/pre_wedding_photo_video_v1.json'
import videoPreset from '@/features/prewedding/officialPresets/schemas/pre_wedding_video_v1.json'

export const OFFICIAL_PRESET_SOURCE_KEY_VIDEO = 'pre_wedding_video_v1'
export const OFFICIAL_PRESET_SOURCE_KEY_PHOTO = 'pre_wedding_photo_v1'
export const OFFICIAL_PRESET_SOURCE_KEY_PHOTO_VIDEO = 'pre_wedding_photo_video_v1'

export const OFFICIAL_PRESET_SOURCE_KEYS = [
  OFFICIAL_PRESET_SOURCE_KEY_VIDEO,
  OFFICIAL_PRESET_SOURCE_KEY_PHOTO,
  OFFICIAL_PRESET_SOURCE_KEY_PHOTO_VIDEO,
] as const

export type OfficialPresetSourceKey = (typeof OFFICIAL_PRESET_SOURCE_KEYS)[number]

export type OfficialPresetDefinition = {
  sourceKey: OfficialPresetSourceKey
  name: string
  title: string
  introduction: string
  isDefault: boolean
  schema: PreWeddingTemplateSchema
}

function asDefinition(
  raw: {
    sourceKey: string
    name: string
    title: string
    introduction: string
    schema: unknown
  },
  isDefault: boolean,
): OfficialPresetDefinition {
  return {
    sourceKey: raw.sourceKey as OfficialPresetSourceKey,
    name: raw.name,
    title: raw.title,
    introduction: raw.introduction,
    isDefault,
    schema: raw.schema as PreWeddingTemplateSchema,
  }
}

/** Signup order: non-defaults first, photo+video default last. */
export const OFFICIAL_PRE_WEDDING_PRESETS: OfficialPresetDefinition[] = [
  asDefinition(videoPreset, false),
  asDefinition(photoPreset, false),
  asDefinition(photoVideoPreset, true),
]

export function isOfficialPresetSourceKey(value: string | null | undefined): boolean {
  return OFFICIAL_PRESET_SOURCE_KEYS.includes(value as OfficialPresetSourceKey)
}

export function countPresetQuestions(schema: PreWeddingTemplateSchema): number {
  return schema.sections.reduce((n, section) => n + section.questions.length, 0)
}

export function collectPresetQuestionIds(schema: PreWeddingTemplateSchema): string[] {
  return schema.sections.flatMap((section) => section.questions.map((q) => q.id))
}

export function hasPresetOption(schema: PreWeddingTemplateSchema, option: string): boolean {
  return schema.sections.some((section) =>
    section.questions.some((q) => (q.options ?? []).includes(option)),
  )
}

export type OfficialPresetInsertPlan = {
  sourceKey: OfficialPresetSourceKey
  name: string
  title: string
  introduction: string
  isDefault: boolean
  isArchived: false
  type: 'pre_wedding'
  schema: PreWeddingTemplateSchema
}

/**
 * Pure signup insert plan. Existing source_keys are skipped — retries and
 * later user edits are never overwritten.
 */
export function planOfficialPresetProvisioning(
  existingSourceKeys: readonly string[],
): OfficialPresetInsertPlan[] {
  const existing = new Set(existingSourceKeys)
  return OFFICIAL_PRE_WEDDING_PRESETS.filter((preset) => !existing.has(preset.sourceKey)).map(
    (preset) => ({
      sourceKey: preset.sourceKey,
      name: preset.name,
      title: preset.title,
      introduction: preset.introduction,
      isDefault: preset.isDefault,
      isArchived: false,
      type: 'pre_wedding',
      schema: preset.schema,
    }),
  )
}
