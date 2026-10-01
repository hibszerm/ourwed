# Multi-template acceptance

This harness runs one named case independently. It loads the original DOCX, validates normalized input and arithmetic, prepares a generation request, and writes JSON and Markdown results. Provider execution is disabled unless a caller supplies an adapter. The successful flow is one generator call, source-copy block editing, mechanical validation, then one independent review call. Missing input, conflicts, mechanical failures, and review failures stop without repair or retry.

From the repository root, import `runMultiTemplateAcceptance` from `src/features/contract-generation-spike/multi-template-acceptance/harness.ts` and call it with one case ID. Optional `casesRoot` and `outputRoot` paths support local setup. Results and any candidate artifacts are written under the selected output root, separated by case and run ID. With no provider adapter, the result is `READY` after preflight and no DOCX is generated.

## Add one real case

1. Add a sanitized real source DOCX as `cases/<case-id>/source.docx`.
2. Add `input.json` with the matching case ID, source filename, normalized authoritative input, and any user-provided answers or extras.
3. Inspect case-file and arithmetic preflight results.
4. Explicitly authorize the provider run outside this harness task, then run only that named case with a provider adapter.
5. A successful candidate uses one generation call and one independent review call. A failed review stops without repair.
6. Inspect the rendered candidate manually for page flow, blank pages, paragraph and extras formatting, signatures, tables, headers/footers, font/style corruption, and indentation; record the visual result with the acceptance report.
7. Do not tune code immediately for one isolated wording mistake. Change generic code only when a repeated or new systemic failure class is demonstrated across real cases.

Future cases should represent meaningfully different real templates, such as video-only and photo-plus-video contracts, different factual fields and paragraph/table layouts, different signature structures, and templates that trigger missing-input or conflict flows. These are diversity examples only; the harness contains no template-specific assumptions or fake cases.

Keep only the minimum sanitized data needed for acceptance. Do not commit personal secrets, provider keys, or generated production customer documents. A Work-generated reference may be attached for qualitative comparison, but it is optional and never used as transformation input.

Product rules remain shared in the existing contract-generation spike. Cases run from their own original source DOCX and do not reuse operations, candidates, aliases, or mappings from other cases.
