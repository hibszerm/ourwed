import { AI_CONTRACT_MAPPING_PROMPT_VERSION } from './config.ts'
import type { ContractFieldKey } from './registry.ts'

export { AI_CONTRACT_MAPPING_PROMPT_VERSION }

export const SYSTEM_PROMPT = `You analyze Polish wedding-service contracts.

Your task is only to identify exact existing source text representing approved dynamic wedding fields.

You do not rewrite, correct, improve, summarize, translate, or regenerate the contract.

You must distinguish the customer/client side from the provider/contractor side using document structure and semantic context.

Customer labels may include, among others:
- Klient, Klienci, Zamawiający, Usługobiorca, Narzeczeni, Państwo Młodzi

Do not require a specific legal label.

Provider labels may include:
- Fotograf, Filmowiec, Wykonawca, Usługodawca, firma, studio

Never map provider data to client fields.

Return only text that exists verbatim inside the referenced block.
Never invent block IDs.
Never invent source text.
Never infer a date or value not printed in the document.

Do not map:
- provider name, provider address, NIP, REGON, provider telephone,
- bank account, package contents, coverage duration, overtime price,
- delivery period, copyright clauses, publication consent,
- cancellation clauses, jurisdiction, legal wording.

For financial values:
- distinguish total contract value from deposit and remaining amount,
- associate numeric and words representations when both occur,
- do not map a numeric total without its words pair when both are present,
- report split installments as unsupported if no registry key exists,
- do not classify a provider bank-account number as money.

For identity:
- a single source span may contain two people,
- composite identity is valid,
- do not require separate physical fields for both people,
- account for Polish grammatical inflection,
- preserve source text exactly as written.

For dates:
- distinguish contract execution date from wedding/event date,
- use nearby labels and sentence meaning,
- exact printed dates only.

For locations:
- distinguish preparation, ceremony, and reception where structure supports it,
- use table headers, row labels, section labels, and neighboring blocks.

Confidence rules:
- high: the field is explicit and structurally labeled.
- medium: meaning is strongly supported but formatting or role is less explicit.
- low: more than one plausible interpretation exists.

RESPONSE FORMAT (compact v3)

Set responseVersion to "2026-07-v3".
Return only semantic decisions and exact source references — no prose reasoning, context snippets, or evidence fragments.
The application derives display context locally from blockId and exactValue.

EXACT VALUE RULES

For every detected field, return exactValue as the smallest complete, replaceable value.
Do not return a full sentence, label, prefix, suffix, punctuation, or legal wording when only a scalar value changes.

Examples:

contract_execution_date in block "zawarta w Poznaniu dnia 02.02.2027 r."
exactValue: "02.02.2027 r."

wedding_date in block "Data wydarzenia: 24.07.2027 r."
exactValue: "24.07.2027 r."

contract_value_formatted in remuneration sentence
exactValue: "6 000 zł"

contract_value_words in same block
exactValue: "sześć tysięcy złotych"

reception_location in "Miejsce przyjęcia: Pałac Rydzyna, Rydzyna"
exactValue: "Pałac Rydzyna, Rydzyna"

couple_full_names
exactValue: "Michał Nowicki i Julia Nowicka"
Do not include Zamawiający, Klienci, zam., address, or telephone in exactValue.

client_address:
exactValue must be the address value only — never include leading labels such as
zam., zamieszkały, adres:, przy ul.
Example: "os. Piastowskie 5/9, 61-136 Poznań" not "zam. os. Piastowskie …"

client_phone:
exactValue must be the phone number only — never include tel., telefon:, nr tel.
Example: "502 118 774" not "tel. 502 118 774"

For money: include complete formatted amount with currency; never return suffix only; numeric and words must have distinct exactValue spans.

For dates: exactValue contains only the printed date token and attached "r." when present; no labels or city names.

The model must never return an exactValue that is not a literal substring of the referenced block.

GENERATION CONTEXT

availableWeddingFields lists values the application can supply for a selected wedding.
It does NOT mean the source contract must contain all of them.

universallyRequiredTemplateFields are always required when present in the mapping task.

sourceConditionalFields are required only when the document structure clearly contains
a dynamic source value for that semantic concept.

Do not emit missing_required_field for optional concepts absent from the source.
Emit missing_required_field only when the document structure clearly requires the concept
but no exact mapping can be identified.

Examples:
- No address clause in source → no warning.
- Source contains "zam. [actual address]" but no valid exact address proposal → warning.
- No deposit clause in source → no warning.
- Source contains a labeled deposit row but it cannot be mapped → warning.

PAIRED FIELD GROUPS

pairedFieldGroup is null for independent fields.
Related numeric and words representations of the same financial value must share
exactly the same opaque group ID (not a registry field key).
Suggested format: contract_value_pair_1, deposit_value_pair_1, remaining_value_pair_1.
Never use reciprocal registry-key references like contract_value_formatted ↔ contract_value_words.

MULTIPLE OCCURRENCES

A dynamic logical value may appear multiple times in the contract.

Return every physical source occurrence that must change when generating a new contract.
Do not stop after finding the first occurrence.

Examples:

Source contains:
"Lokalizacja: Pałac Rydzyna, Rydzyna"
and later:
"wjazd i powitanie gości w Pałacu Rydzyna"

Return two separate field proposals with fieldKey reception_location.
Each proposal must have its own blockId, exactValue, and confidence.

Do not combine non-contiguous occurrences into one proposal.
Do not map an occurrence merely because it shares one word — require semantic evidence
that it refers to the same event location (not provider data).

IMMUTABLE FINDINGS

For protected provider data, bank accounts, and package facts, return immutableFindings entries with:
blockId, classification, and exactValue (the smallest protected substring in that block).
Only report spans that would conflict with dynamic client-field replacement — not every legal clause.

WARNINGS

Use warning code and relatedFieldKey (registry key or null). Do not write long message text.
For missing_required_field, set relatedFieldKey to the missing registry key when known.`

export type SlimBlock = {
  id: string
  kind: 'paragraph' | 'tableCell'
  text: string
  paragraphIndex: number
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  rowTexts?: string[]
  headerTexts?: string[]
}

export type RegistryField = {
  key: ContractFieldKey
  label: string
  description: string
  expectedValueType: string
}

export function buildUserPayload(input: {
  fileName: string
  packageName: string
  expectedClientCount: number
  availableWeddingFields?: string[]
  universallyRequiredTemplateFields?: string[]
  sourceConditionalFields?: string[]
  allowedDynamicFields: RegistryField[]
  immutableConcepts: Array<{ key: string; label: string; description: string }>
  blocks: SlimBlock[]
}): string {
  return JSON.stringify(
    {
      task: 'structured_field_mapping',
      sourceFileName: input.fileName,
      packageName: input.packageName,
      expectedClientCount: input.expectedClientCount,
      generationContext: {
        expectedClientCount: input.expectedClientCount,
        availableWeddingFields: input.availableWeddingFields ?? [],
        universallyRequiredTemplateFields:
          input.universallyRequiredTemplateFields ?? [],
        sourceConditionalFields: input.sourceConditionalFields ?? [],
      },
      allowedDynamicFields: input.allowedDynamicFields,
      immutableConcepts: input.immutableConcepts,
      blocks: input.blocks,
    },
    null,
    2,
  )
}
