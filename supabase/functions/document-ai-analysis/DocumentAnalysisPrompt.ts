/**
 * Ultra-compact extraction prompt — Edge runtime.
 * Package business slots are presence-only (no numeric values from the contract).
 * KEEP IN SYNC with src/features/documents/ai/DocumentAnalysisPrompt.ts
 */

const COUPLE = [
  'bride_first_name',
  'bride_last_name',
  'bride_phone',
  'bride_email',
  'bride_address',
  'bride_pesel',
  'groom_first_name',
  'groom_last_name',
  'groom_phone',
  'groom_email',
  'groom_address',
  'groom_pesel',
  'wedding_date',
  'ceremony_time',
  'schedule',
  'ceremony_location',
  'reception_location',
  'preparation_location',
  'package',
  'additional_notes',
].join(',')

const STUDIO = [
  'company_name',
  'company_owner',
  'company_tax_id',
  'company_address',
  'company_email',
  'company_phone',
  'company_website',
  'company_bank_account',
  'company_regon',
  'company_vat',
  'photographer_name',
  'studio_logo',
  'studio_signature',
].join(',')

const PACKAGE = [
  'package_name',
  'package_price',
  'deposit_amount',
  'deposit_type',
  'deposit_percent',
  'remaining_payment',
  'payment_deadline',
  'payment_installments',
  'delivery_time',
  'included_services',
  'photographers_count',
  'videographers_count',
  'working_hours',
  'overtime_price',
  'mileage_limit',
  'mileage_price',
  'accommodation',
  'travel_fee',
  'album_included',
  'usb_included',
  'online_gallery',
  'engagement_session',
  'wedding_session',
  'number_of_revisions',
  'assistants',
].join(',')

export function buildDocumentAnalysisPrompt(_input?: {
  registryKeys?: string[]
  schemaVersion?: string
  promptVersion?: string
}): string {
  return `Extract wedding-contract slots as JSON only.

Rules:
- JSON only. No markdown. No comments. No prose.
- Use allow-list IDs only. Never invent IDs.
- Never return labels, descriptions, reasoning, confidence, or questionnaire text.
- Never return numeric amounts, days, prices, or percentages as values.
- packageVariables = business slots that exist in the contract wording (deposit, delivery, price…). Values come from Studio Packages later — return IDs only.
- Omit unknown. Prefer empty arrays over guesses.
- packageSuggestion: Photography | Video | Photography + Video | ""
- Keep the entire response under 400 tokens.

couple IDs: ${COUPLE}
studio IDs: ${STUDIO}
package IDs: ${PACKAGE}

Shape:
{"contractName":"","packageSuggestion":"","coupleVariables":[],"studioVariables":[],"packageVariables":[],"possibleVariables":[]}`
}
