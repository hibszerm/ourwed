# Contract reproduction workflow

OurWed is a **contract reproduction system**, not a contract builder.

The studio uploads its own legal contract once. From then on, OurWed recreates
that same document for each wedding by **transforming** the original text —
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
9. AI transforms the **original** contract (values only)  
10. Quality check (retry if non-value edits detected; punctuation/spacing ignored)  
11. Preview / minor edits  
12. Save DOCX + print/PDF  

## Generation strategy (important)

Generation does **not** fill `{{placeholders}}` and does **not** rebuild legal text.

```
Choose template
  → Load original uploaded contract (master)
  → Collect variables (Company / Package / Wedding / Couple / System)
  → AI document transformer (Edge: document-ai-transform)
  → Quality gate (paragraph order + only allowed value inserts)
  → Retry once if needed
  → Write paragraph texts back into original DOCX structure
  → Preview → edit → export
```

### AI rules

Allowed: substitute names, dates, locations, prices, company details, etc.

Forbidden: rewrite clauses, reorder, merge/split paragraphs, invent values,
change legal meaning, translate, summarize.

Missing values → `__________` (never invent).

### Master document

`document_template_versions.source_docx_path` is always the source of truth.
The fillable `template_docx_path` (placeholders) is **not** used for generation.

## Modules

| Module | Role |
| --- | --- |
| `/ustawienia/dokumenty/szablony` | Contract Templates |
| `/ankiety` | Manual questionnaires |
| Wedding → Generate Contract | Transform + export |

## Key code

- `ContractTransformationService` — orchestration  
- `supabase/functions/document-ai-transform` — OpenAI transform (server-only)  
- `contractQualityCheck.ts` — fail if more than values changed  
- `VariableResolver` — structured values  
- Import AI (`document-ai-analysis`) — variable detection only  

## Mock / offline

`VITE_DOCUMENT_AI_USE_MOCK=true` uses deterministic example→value replacement
from the import slot map (no LLM).
