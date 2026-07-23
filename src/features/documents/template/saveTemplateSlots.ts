/**
 * Persist template slots + fillable DOCX after import / re-analysis.
 * Template is ready only when required variables have physical bindings.
 */

import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import { documentStorage } from '@/lib/api/documents/storage'
import { documentTemplateService } from '@/lib/api/documents'
import { requireStudioUserId } from '@/lib/api/ownership'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { DocumentTemplateStatus } from '@/types/documents'
import { insertPlaceholdersInDocx } from './insertPlaceholders'
import { validateTemplateSlotBindings } from './templateReadiness'
import type { TemplateSlotMap } from './types'

export interface SaveTemplateSlotsInput {
  templateId: string
  templateVersionId: string
  versionNumber: number
  sourceBytes: ArrayBuffer
  slotMap: TemplateSlotMap
  documentTitle?: string
}

export interface SaveTemplateSlotsResult {
  slotMap: TemplateSlotMap
  templateDocxPath: string | null
  insertedCount: number
  status: DocumentTemplateStatus
  unresolvedKeys: string[]
}

export async function saveTemplateSlots(
  input: SaveTemplateSlotsInput,
): Promise<SaveTemplateSlotsResult> {
  const userId = await requireStudioUserId()
  const enabledMap: TemplateSlotMap = {
    ...input.slotMap,
    documentTitle: input.documentTitle ?? input.slotMap.documentTitle,
    slots: input.slotMap.slots.filter((s) => s.enabled),
  }

  let templateDocxPath: string | null = null
  let finalMap = enabledMap
  let insertedCount = 0

  const sourceCopy = cloneArrayBuffer(input.sourceBytes)
  const built = await insertPlaceholdersInDocx(sourceCopy, enabledMap)
  finalMap = built.slotMap
  insertedCount = built.insertedCount

  templateDocxPath = documentStorage.paths.templateFillable(
    userId,
    input.templateId,
    input.versionNumber,
  )
  const blob = new Blob([cloneArrayBuffer(built.bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  try {
    await documentStorage.remove(templateDocxPath)
  } catch {
    /* first upload */
  }
  await documentStorage.upload(
    templateDocxPath,
    blob,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )

  const readiness = validateTemplateSlotBindings(finalMap)
  finalMap = {
    ...finalMap,
    unboundRegistryKeys: readiness.unresolvedKeys,
  }

  let status: DocumentTemplateStatus = readiness.ready
    ? 'ready'
    : 'incomplete'

  const { error } = await supabase
    .from('document_template_versions')
    .update({
      template_docx_path: templateDocxPath,
      slot_map: finalMap,
    })
    .eq('id', input.templateVersionId)
  throwOnError(error)

  const meta = {
    version: 1 as const,
    slotBindingsReady: readiness.ready,
    unresolvedSlotKeys: readiness.unresolvedKeys,
    coupleVariables: finalMap.slots
      .filter((s) => s.sourceHint === 'couple' || s.sourceHint === 'wedding')
      .map((s) => ({
        id: s.id,
        registryKey: s.registryKey,
        label: s.label,
        enabled: s.enabled,
        physicallyBound: s.physicallyBound === true,
      })),
    studioVariables: finalMap.slots
      .filter((s) => s.sourceHint === 'company')
      .map((s) => ({
        id: s.id,
        registryKey: s.registryKey,
        label: s.label,
        enabled: s.enabled,
        physicallyBound: s.physicallyBound === true,
      })),
    packageVariables: finalMap.slots
      .filter((s) => s.sourceHint === 'package' && s.registryKey)
      .map((s) => ({
        id: s.id,
        registryKey: s.registryKey!,
        label: s.label,
        enabled: s.enabled,
        physicallyBound: s.physicallyBound === true,
      })),
  }

  try {
    await documentTemplateService.update(input.templateId, {
      status,
      aiAnalyzedAt: new Date().toISOString(),
      meta,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // DB may not yet allow "incomplete" — fall back to draft while keeping meta.
    if (status === 'incomplete' && /incomplete|check|violat/i.test(message)) {
      console.warn(
        '[saveTemplateSlots] status "incomplete" rejected by DB, falling back to draft',
        message,
      )
      status = 'draft'
      await documentTemplateService.update(input.templateId, {
        status: 'draft',
        aiAnalyzedAt: new Date().toISOString(),
        meta,
      })
    } else {
      console.error('[saveTemplateSlots] template update failed', {
        templateId: input.templateId,
        status,
        message,
      })
      throw err
    }
  }

  return {
    slotMap: finalMap,
    templateDocxPath,
    insertedCount,
    status,
    unresolvedKeys: readiness.unresolvedKeys,
  }
}
