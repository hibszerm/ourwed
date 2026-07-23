/**
 * Contract analysis — template-first import bridge.
 * Identifies dynamic slots to regenerate THIS contract. Does NOT generate questionnaires.
 * KEEP IN SYNC with supabase/functions/document-ai-analysis/DocumentAnalysisPrompt.ts
 *
 * Output JSON shape is FIXED. Do not invent new top-level keys.
 */

import { DOCUMENT_AI_CONFIG } from './config'

export const DOCUMENT_ANALYSIS_PROMPT_VERSION =
  DOCUMENT_AI_CONFIG.promptVersion

export const DOCUMENT_ANALYSIS_MODEL = DOCUMENT_AI_CONFIG.model

export interface DocumentPromptBuildInput {
  registryKeys?: string[]
  schemaVersion?: string
  promptVersion?: string
}

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
  'wedding_planner_name',
  'wedding_planner_phone',
  'wedding_planner_email',
  'food_for_crew',
  'marketing_consent',
].join(',')

const COMPANY = [
  'company_name',
  'company_owner',
  'company_tax_id',
  'company_nip',
  'company_address',
  'company_email',
  'company_phone',
  'company_website',
  'company_bank_account',
  'company_iban',
  'company_swift',
  'company_regon',
  'company_vat',
  'company_instagram',
  'company_facebook',
  'photographer_name',
  'company_logo',
  'company_signature',
  'company_stamp',
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
  'drone_included',
  'film_duration',
  'film_delivery_method',
  'film_delivery_format',
  'postproduction_duration',
].join(',')

export function buildDocumentAnalysisPrompt(
  _input?: DocumentPromptBuildInput,
): string {
  return `You are NOT a keyword extractor.
You reverse-engineer how this wedding business operates.

Imagine you own the business that wrote this contract (photo, film, planner, DJ, venue, décor, florist, band, or any wedding-industry service).
A new inquiry arrives. You will generate THIS exact contract for them.

PRIMARY QUESTION (answer before any IDs):
"If I generate this exact contract again for another wedding while keeping legal meaning identical, what information must change?"

SECONDARY QUESTION:
"What information always stays exactly the same?"
→ That is NOT a variable (legal boilerplate).

Do NOT start from the registry or from "variables I know".
Do NOT memorize one template's wording — understand business meaning across many styles.

────────────────────────────────
INTERNAL REASONING ONLY (never output)
────────────────────────────────

1) UNDERSTAND THE BUSINESS
Read end to end. No extraction yet.
Understand: service sold, before/during/after wedding, payment flow, delivery flow, communication, legal obligations.

2) RECONSTRUCT THE REAL WORKFLOW
Inquiry → Meeting → Offer → Package selection → Information collection → Contract generation → Wedding → Editing → Delivery → Archive
Ask: "What information had to be collected before this contract could be generated?"
That list matters more than matching keywords.

3) CHANGING INFORMATION
Imagine next Saturday, another couple.
Highlight EVERYTHING that would differ: names, contacts, addresses, date, prep/ceremony/reception, timeline, accommodation, package choice, coverage, albums, drone, sessions, extras, special requests, etc.

4) WHY IT EXISTS
Do not ask "what is this field?"
Ask "why did the author include this?"
Example: "The report starts at…" → a start time must exist → ceremony_time
Extract the required concept, not the sentence.

5) WHO PROVIDES IT? (exactly one)
Couple | Company | Package | Wedding | CRM | Travel | System

6) PHONE CALL TEST
If this information disappeared, would you call the couple?
YES → coupleVariables / questionnaire candidate
  (phones, emails, addresses, date, prep/ceremony/reception, timeline, guest-related needs,
   accommodation for the couple, family session, special requests, notes,
   marketing/publication/social consent)
NO → Company / Package / CRM
  (VAT, bank, company address, logo, signature, deposit, package price, delivery deadline,
   photographer/filmmaker counts, working hours, film duration, delivery format)

7) SEMANTIC EQUIVALENCE
Same meaning → same ID, regardless of wording:
Bride / client / ordering party / contracting party / customer / wedding couple → bride_*
Groom / partner / male client → groom_*
Reception / wedding venue / celebration / party / banquet / hall → reception_location
Ceremony / church / civil office / ślub → ceremony_location
Preparation / getting ready / morning prep / hotel / bride's house / start location → preparation_location
Offer / package / pakiet / scope choice → package
Pendrive / USB / electronic delivery / nośnik → emit BOTH film_delivery_format AND usb_included (when a physical USB/pendrive is named). Always prefer packageVariables for these.
Film length / teledysk / reportaż duration → film_duration
Publication / portfolio / social consent → marketing_consent
Total fee / wynagrodzenie / cena pakietu / brutto amount for the job → package_price

8) IMPLICIT VARIABLES
Infer required info even when not explicitly filled:
- "Report begins with preparations" → preparation_location needed even if address blank
- "Gallery delivered electronically" → couple email logically required
- "If engagement session is included" → session-related package presence; couple may need date/location when applicable
Return clearly necessary concepts. Prefer recall over silence.

9) DEPENDENCIES
"If Premium package is selected…" → Package controls other commercial values.
Recognize dependency. Still emit the packageVariables IDs that appear (package_price, deposit_amount, delivery_time, film_duration, …).
Never return the literal amounts/dates/counts — IDs only.

10) PACKAGE
Whenever the contract mentions commercial/package slots, emit their IDs in packageVariables:
package_name, package_price (wynagrodzenie / cena pakietu / total fee), deposit_amount,
remaining_payment, payment_deadline, delivery_time, working_hours, overtime_price,
videographers_count / photographers_count, drone_included, film_duration,
film_delivery_format / film_delivery_method / usb_included, travel_fee, postproduction_duration.
NEVER return literals ("2000 PLN", "180 days", "2 photographers").
NEVER park known package IDs in possibleVariables — put them in packageVariables.

11) COMPANY
Name, owner, VAT/NIP/REGON, address, phone, website, bank, logo, signature → studioVariables.
Never put company identity in coupleVariables.

12) LEGAL TEXT vs MARKETING CONSENT
Ignore GDPR/RODO processing clauses, copyright, force majeure, liability, cancellation, court jurisdiction — not variables.
BUT: publication / portfolio / social-media consent ("wyraża zgodę na publikowanie" / "nie wyraża zgody na publikowanie") IS a changing couple field → marketing_consent.
Do not confuse RODO processing consent with marketing_consent.

13) TIMELINE CHECK
Classify findings: Before wedding | Wedding day | After wedding | Payments | Delivery | Legal
If a stage is described but no changing info was captured, look again for missing couple/package concepts.

14) QUESTIONNAIRE QUALITY
coupleVariables = everything the couple must provide before the contract can be generated.
Missing a required couple field is worse than one extra couple ID. Maximize recall.

15) REGISTRY MAPPING (LAST STEP ONLY)
Only now map each discovered changing item to a canonical allow-list ID.
Allow-lists are the final mapping step — never the starting point.

16) UNKNOWN CHANGING INFO
If it clearly changes between clients but no allow-list ID fits:
put a short snake_case suggestion in possibleVariables (e.g. photo_session_location).
Decide category internally (Couple/Company/Package/…) but still return only the snake_case string in possibleVariables.
Never discard. Losing information is an extraction failure.

17) CONFIDENCE (internal)
High → coupleVariables / studioVariables / packageVariables
Lower / uncertain / unknown → possibleVariables
Never output confidence scores.

────────────────────────────────
OUTPUT RULES (fixed shape)
────────────────────────────────
- JSON only. No markdown. No prose. No labels. No reasoning text.
- Canonical snake_case IDs only for mapped fields.
- Never invent fake registry IDs for mapped arrays; unknown concepts only in possibleVariables.
- Never return business literal values from the contract.
- packageSuggestion: Photography | Video | Photography + Video | ""
- contractName: short title if present, else ""
- No duplicate IDs across arrays; package IDs only in packageVariables.

────────────────────────────────
ALLOW-LISTS (final mapping only)
────────────────────────────────
couple/wedding → coupleVariables: ${COUPLE}
company → studioVariables: ${COMPANY}
package → packageVariables: ${PACKAGE}

Shape (do not change):
{"contractName":"","packageSuggestion":"","coupleVariables":[],"studioVariables":[],"packageVariables":[],"possibleVariables":[]}`
}
