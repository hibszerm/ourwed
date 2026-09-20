# CG1 Architecture Snapshot (audit facts)

Frozen recovery: `086ac1626731ec42ce5210b49b5c636e1ca802e1`

## Production path (default)

Sparse Full-AI rewrite (flag `VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION` defaults ON).

```
PackageContractSection
→ uploadPackageContractTemplate → documentTemplateService + packageService.linkContractTemplate
→ WeddingContractGenerationPage
→ WeddingSparseContractGenerationService.generate
→ indexDocxForTransform
→ buildContractTransformationDataset (+ wedding_extra_services names)
→ runSparseProductTransform
   → Edge ai-contract-full-rewrite (LLM changedBlocks)
   → applySparseBlockChanges
   → runPostReconstructionQualityGate
        deterministic repairs + insertAdditionalServicesIntoBlocks
   → writeTransformedDocx
→ saveGeneratedContract
```

## Deterministic vs LLM

| Deterministic | LLM |
|---------------|-----|
| Readiness gates, dataset build | Which blocks change + replacement text |
| Protected-value extraction | Local grammar / person agreement |
| Extras placement + insertion | Must NOT invent extras/locations/money |
| Quality gate / Mode A download | |
| DOCX paragraph edits/insertions | |

## Model (source: `supabase/functions/ai-contract-full-rewrite/prompt.ts`)

- Default: `gpt-4.1-mini`
- Override: `OPENAI_CONTRACT_TRANSFORM_MODEL` || `OPENAI_CONTRACT_MODEL`
- Endpoint: `https://api.openai.com/v1/responses`
- Schema: `full_ai_contract_rewrite_v2` strict JSON
- Temperature: unset (API default)
- Max tokens: 8192 then retry up to 16384
- Retries: incomplete + parse failure paths

## Extras placement priority

`classifyAdditionalServicesPlacement`:
1. existing_section (Usługi dodatkowe patterns)
2. package_deliverables
3. package_scope
4. before_payment
5. safe_placement_not_found (skip insert)

Never after signatures.

## Party semantics (sparse dataset)

- Wedding `couple.partner1` / `partner2` names → `personCount` 1|2
- Address/phone from partner1 preferred
- No separate signatory entity
- Questionnaire feeds wedding fields indirectly; sparse generate does not read forms live

## Edge functions

- `ai-contract-full-rewrite` — generation
- `contract-docx-to-pdf` — PDF export
- `document-ai-analysis` — legacy slots only (not default path)
