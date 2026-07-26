export const ANALYSIS_VERSION = '2.0.0'

/**
 * Phase A only: understand what document fragments describe.
 * No wedding field mapping. No replacements.
 */
export const SYSTEM_PROMPT = `Jesteś prawnikiem czytającym polską umowę fotograficzną / filmową weselną.

TWOJA JEDYNA ROLA (Phase A — mapa semantyczna):
- zrozumieć, CO opisuje każdy istotny fragment dokumentu,
- przypisać mu rolę z katalogu semanticRole,
- wskazać dokładny valueSpan.sourceText (ciągły podciąg z anchora),
- podać confidence 0–1.

ZAKAZY:
- NIE mapuj na pola wesela / CRM,
- NIE proponuj zamian (replacements),
- NIE wymyślaj brakujących danych wesela,
- NIE przepisuj umowy,
- NIE zwracaj DOCX.

Myśl: „Co ten fragment opisuje?” — NIE: „Co zamienić?”.

KATALOG RÓL (semanticRole) — używaj wyłącznie tych identyfikatorów:
contract_date, contract_execution_date, wedding_date,
preparation_location, ceremony_location, reception_location, civil_office, church,
package_name, package_price, deposit_amount, remaining_amount, bank_account,
photographer_name, videographer_name,
company_name, company_nip, company_regon, company_address, company_phone, company_email,
client_name, bride_name, groom_name,
client_phone, client_email, bride_phone, groom_phone, bride_email, groom_email,
bride_address, groom_address,
delivery_deadline, preview_deadline, working_hours, extra_hour_price,
final_payment_due_date, deposit_due_date,
coverage_hours, coverage_end_time, package_contents,
deposit_refund_multiplier, deposit_forfeiture_clause,
amount_reference_without_literal_value, legal_clause_reference

PRZYKŁADY:
- „Przygotowania ślubne … Rezydencja Lubomirskich - Retyrada” → preparation_location, valueSpan=„Rezydencja Lubomirskich - Retyrada”
- „Ceremonia … Rzeszowie” → ceremony_location, valueSpan=„Rzeszowie”
- „Przyjęcie … Rezydencja …” → reception_location
- data zawarcia umowy (nie data ślubu) → contract_execution_date lub contract_date
  valueSpan = tylko data, np. „30.10.2024” (NIE „Zawarta w dniu 30.10.2024 r.”)
- data ślubu / reportażu → wedding_date
- „w terminie 4 miesięcy od daty wydarzeń” → delivery_deadline, valueSpan=„4”
- „w terminie 7 dni od daty zawarcia Umowy” → deposit_due_date, valueSpan=„7”
- data dopłaty / płatności końcowej „19.06.2025” → final_payment_due_date
  (dodaj prefixContext/suffixContext z klauzuli, np. „najpóźniej w dniu ” / „.”)
- „zwrotu zadatku w dwukrotnej wartości” → deposit_refund_multiplier (NIE deposit_amount)
- REGON w bloku NIP/REGON/tel → company_regon + prefixContext „REGON ” + suffixContext „, tel.”
- „Pakiecie Movie” → package_name, valueSpan=„Movie” (bez „Pakiecie”)
- „do godziny 00.30.” → coverage_end_time, valueSpan=„00.30”
- „maksymalnie 12 godzin” → coverage_hours, valueSpan=„12”
- każdy element zawartości pakietu osobno → package_contents
- „Parą Młodą” / „Klientem” / „Kamerzysta” → couple_defined_term / client_defined_term / contractor_defined_term
  (NIE bride_name / client_name — to terminy prawne, nie imiona)

valueSpan.sourceText:
- DOSŁOWNY ciągły podciąg z textAnchors[].text,
- bez "...", bez "…", bez parafraz,
- najkrótszy unikalny span wartości.

Ta sama rola może wystąpić w wielu anchorach — zwróć wszystkie.
confidence < 0.60: nie dodawaj anchora.
Zwróć wyłącznie JSON.`

export function buildUserPrompt(payload: {
  textAnchors: unknown
  semanticRoleCatalog: unknown
}): string {
  return [
    'Zbuduj mapę semantyczną dokumentu (Phase A).',
    'Dla każdego istotnego fragmentu: semanticRole + valueSpan.sourceText + confidence.',
    'NIE mapuj na pola wesela. NIE twórz replacements.',
    `analysisVersion = "${ANALYSIS_VERSION}".`,
    '',
    JSON.stringify({
      textAnchors: payload.textAnchors,
      semanticRoleCatalog: payload.semanticRoleCatalog,
    }),
  ].join('\n')
}

export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'analysisVersion',
    'documentSummary',
    'semanticAnchors',
    'warnings',
  ],
  properties: {
    analysisVersion: { type: 'string' },
    documentSummary: {
      type: 'object',
      additionalProperties: false,
      required: [
        'documentType',
        'language',
        'detectedPartyRoles',
        'detectedBusinessContext',
      ],
      properties: {
        documentType: { type: 'string', maxLength: 240 },
        language: { type: 'string', maxLength: 240 },
        detectedPartyRoles: {
          type: 'array',
          items: { type: 'string', maxLength: 120 },
        },
        detectedBusinessContext: { type: 'string', maxLength: 240 },
      },
    },
    semanticAnchors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'anchorId',
          'semanticRole',
          'confidence',
          'documentLabel',
          'valueSpan',
          'reason',
        ],
        properties: {
          anchorId: {
            type: 'string',
            description: 'Must reference one supplied textAnchors[].anchorId',
          },
          semanticRole: {
            type: 'string',
            description: 'Role id from the semantic role catalog',
          },
          confidence: { type: 'number' },
          documentLabel: {
            type: ['string', 'null'],
            maxLength: 120,
            description: 'Heading/label near the value in the document',
          },
          valueSpan: {
            type: 'object',
            additionalProperties: false,
            required: ['sourceText', 'prefixContext', 'suffixContext'],
            properties: {
              sourceText: {
                type: 'string',
                maxLength: 500,
                description:
                  'Exact contiguous substring from the anchor. No ellipses.',
              },
              prefixContext: { type: ['string', 'null'], maxLength: 240 },
              suffixContext: { type: ['string', 'null'], maxLength: 240 },
            },
          },
          reason: { type: 'string', maxLength: 240 },
        },
      },
    },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message', 'anchorIds'],
        properties: {
          code: { type: 'string', maxLength: 120 },
          message: { type: 'string', maxLength: 240 },
          anchorIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const
