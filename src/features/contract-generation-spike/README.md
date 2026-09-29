# Contract generation spike

This offline experiment transforms a source DOCX using authoritative generation input. The source contract and an AI-built literal inventory supply context for planning; deterministic code checks declared authorities, arithmetic, literal survival, and DOCX structure. AI owns language understanding, while an independent reviewer owns semantic correctness.

## Flow

1. Read the DOCX and build stable `part#pN` references for body paragraphs, table-cell paragraphs, headers, and footers; read supported textual document properties.
2. Ask a source-inventory model to identify exact source-instance literals. This stage receives the source only, without new CRM or wedding data.
3. Ask the planner to sweep the complete source and inventory, then return missing inputs, generic fact changes, retained literals, and safe block operations. Non-READY plans expose no executable operations.
4. Verify authority references, exact declared values, declared arithmetic, inventory dispositions, and operation targets without interpreting contract wording.
5. Apply READY operations to the original DOCX package, preserving OOXML structure, tables, styles, numbering, and dynamic Word fields. Deterministic candidate checks verify ZIP/XML integrity, literal removals/additions, untouched blocks, fields, and table structure.
6. Render/open the candidate and send source, authoritative input, inventory, planner provenance, candidate, and a mechanical changed-block diff to a read-only independent AI reviewer. A failure stops; there is no automatic repair.

The model boundary uses whole-block text operations rather than character offsets. Replacements preserve paragraph properties and source run styling. Insertions require a same-part `styleSourceBlockId`; inherited numbering, section properties, page breaks, and keep-next are removed from inserted paragraphs.

## Test fixtures

- `fixtures/source-video-standard.docx` is a structural and content test fixture.
- `fixtures/work-generated-reference.docx` is a reference output fixture.
- `multi-template-acceptance/cases/` contains isolated acceptance cases and source DOCX/input data.

Fixture names and values are test data, not runtime routing rules. This spike has no production provider client, API key, production UI, or deployment path.
