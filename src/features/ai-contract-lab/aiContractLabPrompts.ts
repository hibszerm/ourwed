/** Prompt boundaries for AI Contract Lab — Phase A semantic map only. */

export const AI_CONTRACT_LAB_ANALYSIS_VERSION = '2.0.0'

export const AI_CONTRACT_LAB_SYSTEM_PROMPT = `Jesteś prawnikiem czytającym polską umowę fotograficzną / filmową weselną.

Phase A: zbuduj mapę semantyczną — CO opisuje fragment (semanticRole + valueSpan).
NIE mapuj na pola wesela. NIE proponuj zamian.

Myśl: „Co ten fragment opisuje?” — nie „Co zamienić?”.`

export function buildAiContractLabUserPrompt(payload: {
  textAnchors: unknown
  semanticRoleCatalog: unknown
}): string {
  return [
    'Zbuduj mapę semantyczną dokumentu.',
    'semanticRole + valueSpan.sourceText (dokładny podciąg) + confidence.',
    `analysisVersion = "${AI_CONTRACT_LAB_ANALYSIS_VERSION}".`,
    '',
    JSON.stringify(payload),
  ].join('\n')
}
