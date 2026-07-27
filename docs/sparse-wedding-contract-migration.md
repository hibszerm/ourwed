# Migration: sparse AI as primary wedding contract engine

Date: 2026-07-27

## Removed from product path

- AI analysis / slot building on package template upload
- Package readiness / health / attention mapping UI as generation gates
- Slot-based `transformContract` as the default wedding generate path
- Primary-nav framing of Comparison Lab as a normal workflow

## Retained

- `document_templates` + `document_template_versions` (DOCX bytes + version pins)
- `packages.active_contract_template_*` bindings
- `wedding_document_drafts` / `wedding_documents` persistence (`saveGeneratedContract`)
- Payment schedule dialog + Gotenberg PDF + `ContractDocxPreview`
- Legacy `assignPackageContractFromDocx` / `ContractTransformationService` (deprecated, not deleted)
- Legacy `slot_map` / readiness meta on existing templates (ignored by sparse generate)

## Reused (unchanged engines)

- `ai-contract-transform` sparse protocol: `indexDocxForTransform`, `buildContractTransformationDataset`, `runFullAiRewrite`, quality gate (Mode A download policy), `writeTransformedDocx`
- Product wrapper: `runSparseProductTransform` (not Comparison Lab Mode B / `verifyGuardedTransformation`)

## Engine note (post-review)

Wedding Generate initially called Mode B (`runGuardedProductTransform`). That was the Comparison Lab guarded path with stricter completeness blocking. It was switched to Mode A–policy sparse Full AI (`runSparseProductTransform` → `ai-contract-full-rewrite`).

## New user workflow

1. Package → upload/replace/download DOCX template (validate + store only)
2. Wedding → Generuj umowę
3. Sparse guarded AI → verify → optional payment clarification → preview
4. Download DOCX / PDF

## Rollback

Set `VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION=false` to restore slot-based generation (only useful for already-analyzed templates).

## Future cleanup candidates

- Delete product callers of `assignPackageContractFromDocx` and related readiness UX
- Drop unused package-contract slot allowlist gates from wedding verify UI
- Remove emergency flag once sparse path is stable in production
- Optional DB cleanup of unused `slot_map` columns/meta (separate migration)
