# Multi-template acceptance

This harness runs one named case independently. The default entry point loads the case, reads its original DOCX, performs deterministic missing-input and date-conflict preflight, prepares a transformation request, and writes compact JSON and Markdown results. Provider execution is disabled unless a caller explicitly supplies a local adapter. The adapter boundary permits at most one transformation and one independent review; it has no retry or repair operation. A review failure stops the case.

From the repository root, import `runMultiTemplateAcceptance` from `src/features/contract-generation-spike/multi-template-acceptance/harness.ts` and call it with one case ID. Optional `casesRoot` and `outputRoot` paths support local setup. Results and any candidate artifacts are written under the selected output root, separated by case and run ID. With no provider adapter, the result is `READY` after preflight and no DOCX is generated.

## Add one real case

1. Add a sanitized real source DOCX as `cases/<case-id>/source.docx`.
2. Add `input.json` with the matching case ID, generation date, authoritative wedding facts, and any user-provided answers or extras. Use the existing `WeddingFacts` shape; absent required facts produce `MISSING_INPUT`.
3. Inspect deterministic preflight. A `CONFLICT_INPUT` result stops before the provider boundary.
4. Explicitly authorize the provider run outside this harness task, then run only that named case with a provider adapter.
5. The case uses one transformation and one independent review. A failed review stops without repair.
6. Inspect the rendered candidate manually for page flow, blank pages, paragraph and extras formatting, signatures, tables, headers/footers, font/style corruption, and indentation; record the visual result with the acceptance report.
7. Do not tune code immediately for one isolated wording mistake. Change generic code only when a repeated or new systemic failure class is demonstrated across real cases.

Future cases should represent meaningfully different real templates, such as video-only and photo-plus-video contracts, different factual fields and paragraph/table layouts, different signature structures, and templates that trigger missing-input or date-conflict preflight. These are diversity examples only; the harness contains no template-specific assumptions or fake cases.

Keep only the minimum sanitized data needed for acceptance. Do not commit personal secrets, provider keys, or generated production customer documents. A Work-generated reference may be attached for qualitative comparison, but it is optional and never used as transformation input.

Product rules remain shared in the existing contract-generation spike. Cases run from their own original source DOCX and do not reuse operations, candidates, aliases, or mappings from other cases.
