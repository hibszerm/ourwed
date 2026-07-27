/**
 * Experiment-only DOCX byte storage (never production templates).
 */

const docxByTemplateId = new Map<string, ArrayBuffer>()

export const TXT_ONLY_FIXTURE_MESSAGE =
  'Fixture tekstowa służy wyłącznie do testu analizy. Załaduj dokument DOCX, aby przetestować renderowanie.'

export function isTxtOnlyFixture(fileName: string): boolean {
  return /\.txt$/i.test(fileName)
}

export function storeExperimentDocxBytes(
  templateId: string,
  bytes: ArrayBuffer,
): void {
  docxByTemplateId.set(templateId, bytes.slice(0))
}

export function getExperimentDocxBytes(templateId: string): ArrayBuffer | null {
  const bytes = docxByTemplateId.get(templateId)
  return bytes ? bytes.slice(0) : null
}

export function hasExperimentDocxBytes(templateId: string): boolean {
  return docxByTemplateId.has(templateId)
}

export function clearExperimentDocxBytes(templateId?: string): void {
  if (templateId) docxByTemplateId.delete(templateId)
  else docxByTemplateId.clear()
}

export function canRenderExperimentDocx(input: {
  templateId: string
  fileName: string
}): { ok: true } | { ok: false; message: string } {
  if (isTxtOnlyFixture(input.fileName)) {
    return { ok: false, message: TXT_ONLY_FIXTURE_MESSAGE }
  }
  if (!hasExperimentDocxBytes(input.templateId)) {
    return {
      ok: false,
      message: TXT_ONLY_FIXTURE_MESSAGE,
    }
  }
  return { ok: true }
}
