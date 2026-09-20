# Contract reproduction workflow

OurWed is a **contract reproduction system**, not a contract builder.

The studio uploads its own legal contract once. From then on, OurWed recreates
that same document for each wedding by transforming the original text —
substituting only dynamic values.

## Official user journey

1. Upload contract (DOCX/PDF) → Contract Template (AI detects variables once)  
2. Create questionnaire manually (`/ankiety`)  
3. Client fills questionnaire → Wedding created  
4. Open Wedding → **Generate Contract**  
5. Choose template  
6. VariableResolver fills Company / Package / Wedding / Couple / Questionnaire automatically  
7. If nothing missing → generate immediately  
8. If missing → show ONLY unresolved fields (fill or omit)  
9. Sparse Full-AI rewrite transforms the **original** contract (values / structure via quality gate)  
10. Preview / minor edits  
11. Save DOCX + print/PDF  

## Generation strategy (important)

Generation does **not** fill `{{placeholders}}` and does **not** rebuild legal text from scratch.

### Current primary contract generation

```
WeddingContractGenerationPage
  → WeddingSparseContractGenerationService.generate
  → indexDocxForTransform
  → buildContractTransformationDataset
  → runSparseProductTransform
  → runFullAiRewrite
  → ai-contract-full-rewrite
  → runPostReconstructionQualityGate(mode: 'full_ai')
  → writeTransformedDocx
  → persist / preview / save
```

### Legacy emergency fallback

```
VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION=false
  → WeddingContractGenerationService.generate
  → prepareVerification
  → transformContract
```

`transformContract` is **deterministic slot rendering** on the uploaded DOCX.
It does **not** invoke any AI transform Edge function.

### Historical note (retired)

An earlier experimental path used Edge `document-ai-transform` for whole-document
value substitution. That client adapter and repository Edge source are retired.
It is **not** part of current production generation.

### Master document

`document_template_versions.source_docx_path` is always the source of truth.
The fillable `template_docx_path` (placeholders) is **not** used for generation.

## Modules

| Module | Role |
| --- | --- |
| `/ustawienia/dokumenty/szablony` | Contract Templates |
| `/ankiety` | Manual questionnaires |
| Wedding → Generate Contract | Sparse Full-AI generate + export |

## Key code

- `WeddingSparseContractGenerationService` — current wedding generation orchestration  
- `runSparseProductTransform` / `runFullAiRewrite` → `ai-contract-full-rewrite`  
- `ContractTransformationService.transformContract` — legacy deterministic slots  
- Import / reanalyze AI (`document-ai-analysis`) — variable detection only  

## Mock / offline

`VITE_DOCUMENT_AI_USE_MOCK=true` uses deterministic example→value replacement
from the import slot map for **document analysis** (no LLM).
