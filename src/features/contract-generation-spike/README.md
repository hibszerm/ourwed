# Contract generation spike

This offline experiment accepts an existing DOCX and current wedding facts. `buildBlockIndex` exposes stable `part#pN` IDs for body paragraphs, table-cell paragraphs, headers, and footers, with neighboring text context. The model boundary returns final Polish text as block operations; it does not return character offsets. The original DOCX package remains the physical base.

Supported operations are `REPLACE_BLOCK_TEXT`, `INSERT_BLOCK_BEFORE`, `INSERT_BLOCK_AFTER`, and sparse `DELETE_BLOCK`. Replacements preserve paragraph properties and use a dominant source body run style, retaining a short structural prefix separately where applicable. Insertions require an explicit same-part `styleSourceBlockId`; inserted paragraph properties and default run style are copied from that source, with numbering, section properties, page breaks, and keep-next removed.

Missing-input detection remains a planning result before operations are applied. The contract date and place rules are supplied as authoritative input: replace a source conclusion date with the generation date, preserve an existing place, and do not invent an absent place. For the Julia/Maksymilian fixture, preserve source Video Standard package wording exactly. A separate reviewer sees source facts, source text, and candidate text. A single repair returns block operations constrained to IDs cited in review findings, followed by final review.

Fixtures:

- `fixtures/source-video-standard.docx` is the uploaded source template.
- `fixtures/work-generated-reference.docx` is the supplied successful Work output reference.

The synthetic acceptance test exercises full paragraph rewrites (including contextual payment/date, Polish locations, and internal-reference examples), insertion style selection, package preservation, and unchanged tables/signatures/header/footer. This remains an isolated spike with no provider client, API key, production UI, or deployment path.

Generation input includes lightweight `contentClass` metadata (`factual_dynamic`, `package_service`, `protected_legal_static`) for transformation and review prompts. Transformation instructions preserve legal wording and permit only minimal, unambiguous editorial corrections with no legal effect. Deterministic authoritative-date checks run before the AI planning boundary and return `CONFLICT_INPUT` for a remaining-payment date before contract conclusion, and for a wedding date before conclusion when the source describes the event as future. A resumed generation can apply explicit manual date overrides. No conflict UI is included in this spike.
