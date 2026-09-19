# Experimental tools (internal)

Intentionally **hidden from customer navigation**.

This document distinguishes **deleted experimental UI** from **protected production modules** that still live under historical directory names. Those directories are not obsolete product engines. Do not rename them as part of experimental-UI cleanup.

## Visibility policy

| Surface | Status |
|---------|--------|
| Customer sidebar | Hidden (no „Eksperymentalne” section) |
| Customer buttons / quick links | No production links |
| Deleted Lab SPA direct URLs | Not registered — not reachable |
| Remaining DEV eval route | `import.meta.env.DEV` only |
| Public couple forms | Unrelated — stay standalone |

This is not security-through-obscurity. Remaining registered routes still require normal auth (`ProtectedRoute`) where applicable. Separate authorization hardening is out of scope for the nav cleanup.

## Hidden customer-nav entries (removed)

- „Eksperymentalne” group
- Laboratorium mapowania
- Laboratorium porównania umów
- Dashboard V2 (Beta) sidebar entry

## Deleted experimental UI (not reachable)

These surfaces were removed. They are **not** current product routes and are **not** enabled by frontend flags.

| Surface | Status |
|---------|--------|
| `/laboratorium-umow-ai` | Deleted SPA — not registered |
| `/laboratorium-umow-ai/semantic` | Deleted SPA — not registered |
| `/laboratorium-umow-ai/porownanie` | Deleted SPA — not registered |
| `/eksperymenty/umowy-ai-transform` | Deleted SPA — not registered |
| `src/features/ai-contract-experiment/*` | Deleted |
| `VITE_ENABLE_AI_CONTRACT_LAB` / `VITE_ENABLE_CONTRACT_AI_DEBUG_MODES` / `VITE_AI_CONTRACT_LAB_WEDDING_ID` | Removed frontend flags |

## Remaining internal / DEV surfaces

| Route | Purpose | Flag / notes |
|-------|---------|--------------|
| `/dev/contract-analysis-eval` | Contract analysis eval | `import.meta.env.DEV` only |

## Retired experimental routes

| Route | Behavior |
|-------|----------|
| `/dashboard-v2` | Redirects to `/dashboard` (V2 beta retired; stage-based prototype) |

Source under `src/features/dashboard-v2/` may remain on disk for historical reference until a later cleanup; it is **not** mounted in the production route graph.

## Protected production modules (historical directory names)

Not Lab SPA. Do not delete or rename these because of the directory name.

- `src/features/ai-contract-lab/*` — template-field / semantic helpers used by current product contract work
- `src/features/ai-contract-transform/*` — sparse Full-AI / Mode A production engine
- Edge `ai-contract-full-rewrite` — production sparse rewrite

Lab-named Edge functions (`ai-contract-lab-analyze`, `ai-contract-lab-structured-mapping`, `ai-contract-guarded-transform`) are outside this documentation cleanup.

## Candidate future reuse

- Template field diagnostics
- Side-by-side AI transform quality tooling
- Internal eval harnesses

Do not expose this document or deleted Lab SPA links in customer UI.
