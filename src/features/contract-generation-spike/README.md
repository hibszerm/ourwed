# Contract generation spike

This offline experiment transforms a source DOCX using authoritative generation input. The source contract determines which factual concepts are required; available input values do not need to appear when the source has no corresponding concept.

## Flow

1. Read the source DOCX and build stable `part#pN` block IDs for body paragraphs, table-cell paragraphs, headers, and footers.
2. Plan changes from source blocks and authoritative input. Return `MISSING_INPUT` or `CONFLICT_INPUT` before applying operations when required facts are unavailable or inconsistent.
3. Apply READY block operations to the original DOCX package, preserving its OOXML structure, tables, styles, numbering, and dynamic Word fields.
4. Run deterministic candidate checks for source-required dates and financial obligations, approved text changes, package scope, DOCX structure, and stale party facts.
5. Render the candidate for layout inspection, then run an independent review. A failure is reported and stops the flow; generation does not automatically repair and review again.

The model boundary uses whole-block text operations rather than character offsets. Replacements preserve paragraph properties and source run styling. Insertions require a same-part `styleSourceBlockId`; inherited numbering, section properties, page breaks, and keep-next are removed from inserted paragraphs.

The shared planner and reviewer prompts treat the source as authoritative for legal wording and selected service scope. Deterministic checks cover known facts and document structure; they do not attempt to interpret arbitrary legal meaning.

## Test fixtures

- `fixtures/source-video-standard.docx` is a structural and content test fixture.
- `fixtures/work-generated-reference.docx` is a reference output fixture.
- `multi-template-acceptance/cases/` contains isolated acceptance cases and their source DOCX/input data.

Fixture names and values are test data, not runtime routing rules. The spike has no production provider client, API key, production UI, or deployment path.
