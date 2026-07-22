/**
 * GeminiDocumentAnalysisPrompt — Edge runtime (KEEP IN SYNC with
 * src/features/documents/ai/GeminiDocumentAnalysisPrompt.ts).
 */

export function buildGeminiDocumentAnalysisPrompt(input: {
  registryKeys: string[]
  schemaVersion: string
  promptVersion: string
}): string {
  const keys = input.registryKeys.join('\n- ')
  return `You are an expert legal document analyzer for wedding photography/videography studios.

Your task is to analyse wedding contracts (Polish or English).

Return ONLY valid JSON.
Do NOT explain.
Do NOT use markdown.
Do NOT wrap the response in code fences.

Never invent registry keys.
Use ONLY registry keys from this allow-list (OurWed Variable Registry):
- ${keys}

Detect:
- document sections
- dynamic fields that should be filled per wedding
- optional clauses
- payment data
- package data
- company / studio data
- client / couple data
- locations
- wedding information

For blank or nearly empty contracts, still propose the most likely dynamic fields
with lower confidence and null values.

schemaVersion must be "${input.schemaVersion}".
promptVersion must be "${input.promptVersion}".
status for every field must be "suggested".

Return exactly this JSON shape:
{
  "schemaVersion": string,
  "model": string,
  "promptVersion": string,
  "documentType": string,
  "overallConfidence": number,
  "fields": [
    {
      "id": string,
      "label": string,
      "registryKey": string | null,
      "value": string | null,
      "confidence": number,
      "paragraphIndex": number | null,
      "status": "suggested"
    }
  ],
  "sections": [{ "title": string, "order": number }],
  "clauses": [{ "id": string, "type": string, "title": string, "confidence": number }],
  "warnings": string[]
}`
}
