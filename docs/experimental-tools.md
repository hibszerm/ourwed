# Experimental tools (internal)

Intentionally **hidden from customer navigation**. Implementation retained for future reuse.

## Visibility policy

| Surface | Status |
|---------|--------|
| Customer sidebar | Hidden (no „Eksperymentalne” section) |
| Customer buttons / quick links | No production links |
| Direct URL | May remain reachable when feature flags enable routes |
| Public couple forms | Unrelated — stay standalone |

This is not security-through-obscurity. Routes that remain registered still require normal auth (`ProtectedRoute`) where applicable. Separate authorization hardening is out of scope for the nav cleanup.

## Hidden customer-nav entries (removed)

- „Eksperymentalne” group
- Laboratorium mapowania
- Laboratorium porównania umów
- Dashboard V2 (Beta) sidebar entry

## Retained routes (direct URL / flag)

| Route | Purpose | Flag / notes |
|-------|---------|--------------|
| `/laboratorium-umow-ai` | AI contract mapping experiment | `VITE_ENABLE_AI_CONTRACT_LAB=true` |
| `/laboratorium-umow-ai/semantic` | Semantic lab | same |
| `/eksperymenty/umowy-ai-transform` | Transform comparison | same |
| `/laboratorium-umow-ai/porownanie` | Alias → comparison | same |
| `/dev/contract-analysis-eval` | Contract analysis eval | `import.meta.env.DEV` only |

## Retired experimental routes

| Route | Behavior |
|-------|----------|
| `/dashboard-v2` | Redirects to `/dashboard` (V2 beta retired; stage-based prototype) |

Source under `src/features/dashboard-v2/` may remain on disk for historical reference until a later cleanup; it is **not** mounted in the production route graph.

## Why retained

- Prototype contract AI pipelines may feed production later
- Acceptance tests and edge functions depend on these modules
- Avoid destructive deletion of research code

## Dependencies

- `src/features/ai-contract-lab/*`
- `src/features/ai-contract-experiment/*`
- `src/features/ai-contract-transform/*`
- Supabase functions such as `ai-contract-lab-analyze`, `ai-contract-full-rewrite`, `ai-contract-guarded-transform`

## Candidate future reuse

- Template field diagnostics
- Side-by-side AI transform quality tooling
- Internal eval harnesses

Do not expose this document or these links in customer UI.
