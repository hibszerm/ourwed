# Option B contract generation (current production path)

This feature implements the approved OurWed contract-generation flow. It is used by the production `contract-generation-boundary` Edge Function and the wedding contract-generation UI. The directory name “spike” is historical; this is not an offline-only experiment.

## Current flow

1. The wedding UI calls the authenticated boundary client to start or continue a generation run.
2. The Edge Function verifies the signed-in user and wedding ownership, then loads current wedding, package, template/version, source DOCX, questionnaire, payment, extras, locations, and travel context.
3. The Generator returns one of `MISSING_INPUT`, `CONFLICT_INPUT`, or `READY`. Missing answers are submitted through the continuation action and checked against the stored requirements and refreshed authority. Conflict verification is bounded to the normal conflict path.
4. For `READY`, structured BlockEdits are applied to the source DOCX package by the DOCX editor. Deterministic checks validate the edited candidate before the bounded Reviewer is called.
5. An accepted candidate is temporary and shown in Preview. Preview does not save the contract. The user explicitly saves/finalizes to create a durable document and version.
6. DOCX is the durable artifact. PDF is converted on demand by the separate `contract-docx-to-pdf` Edge Function. Regeneration, version history, downloads, and sent/signed status use their existing product services.

The source DOCX remains the document base. Authority and provenance rules, MissingInput/continuation behavior, source-preserving edits, deterministic validation, Reviewer limits, and explicit finalization are part of the production contract and should not be changed as incidental cleanup.

## Model boundaries

Generator, Reviewer, and Conflict Verifier have separate model/configuration boundaries. The production Edge Function reads the dedicated configuration; this document intentionally does not record secret values. Provider-backed flows must not be exercised by offline tests unless those tests explicitly stub the provider.

## Source Contract is separate

The Source Contract feature imports an existing external PDF/DOCX. It supports storing a document without analysis, or analyzing it into a reviewable proposal followed by an explicit atomic Apply. It does not generate a new contract and is documented in `src/features/wedding-contract-recovery/`.

## Tests and fixtures

The tests and fixtures under this directory protect the production protocol, authority handling, source DOCX editing, validation, lifecycle, and UI integration. Keep useful structural and adversarial DOCX fixtures even when they originated during earlier development experiments.

Older sparse/full-rewrite and semantic-mapping generation designs are historical and are not the current Option B route. See `docs/sparse-wedding-contract-migration.md` for the preserved migration record; do not treat its old route or rollback instructions as current production guidance.
