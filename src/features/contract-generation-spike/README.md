# Contract generation spike

This isolated experiment accepts an existing DOCX, current structured wedding facts, extras, financial inputs, a controlled generation date, and user answers. `ContractAi` is the provider boundary: a planner returns either Polish missing-input requirements or a grounded paragraph edit plan; a separate reviewer audits the candidate; on FAIL the orchestrator permits one repair and one final review. No model client, API key, production entry point, or UI is included.

`readSource` reads body paragraphs (including table cells), tables via their paragraphs, and header/footer paragraphs from the DOCX package. Edits are applied to the original package with the existing DOCX paragraph editor, which preserves the package and formatting around changed paragraphs. Deterministic checks then validate required facts, known stale fixture facts, amounts, selected extras, signature tables, unchanged header/footer/styles, package text, and conclusion date/place rules.

Fixtures:

- `fixtures/source-video-standard.docx` is the actual uploaded source template.
- `fixtures/work-generated-reference.docx` is the supplied successful Work output reference. It demonstrates the wedding data, unchanged package, two extras, and adjusted §1 references. Its conclusion fields are blank dotted fields, so it does not demonstrate the new generation-date rule.

The offline acceptance test verifies fixture ingestion, arithmetic, generic missing-input stop, answer propagation into a second attempt, conclusion-date/place input rules, and reference output facts. It does not make an AI call or claim that this spike has transformed the real fixture. The next acceptance step needs two provider calls in the no-repair case: transformation/planning (including missing-input detection) and independent review. A failing review adds one repair and a final review, for four calls total.
