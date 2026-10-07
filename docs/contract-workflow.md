# OurWed contract workflows

This document describes the current production contract flows. Contract generation and Source Contract import are separate features with different purposes and persistence.

## Option B — generate a new contract

The wedding detail “Generate contract” action checks readiness and navigates to `/sluby/:weddingId/umowy/nowa`. The page uses the authenticated `contract-generation-boundary` client; it does not open the retired legacy generation modal.

```text
wedding UI
  → authenticated contract-generation-boundary
  → current wedding/package/template/source and authority context
  → Generator: MISSING_INPUT | CONFLICT_INPUT | READY
  → user continuation or bounded conflict verification, when required
  → source DOCX BlockEdits
  → deterministic mechanical validation
  → bounded advisory Reviewer
  → temporary candidate Preview
  → explicit Save/finalize
  → durable DOCX and generated-document version
```

The active template version's source DOCX remains the physical document base. Current authority, package scope, extras, travel and payment rules govern values; source clauses, structure and formatting are preserved subject to the validated edits. MissingInput answers are submitted through the continuation action. The workflow does not add an automatic retry or repair loop.

Preview is not persistence. Save/finalize is explicit. DOCX is the retained artifact; PDF is generated on demand by the `contract-docx-to-pdf` function. Regeneration creates another version while prior generated versions remain available. Sent/signed state is a separate manual status operation.

## Source Contract — import an existing document

Source Contract is not an Option B input stage. It handles an existing external or historical PDF/DOCX and provides two paths:

1. **Store only:** privately upload and record the document without extraction, model analysis, recovery, or wedding-data mutation.
2. **Analyze and populate:** extract document text, call the authenticated `wedding-contract-recovery-analyze` function, review the proposed values, explicitly select fields, then apply them through the atomic `apply_wedding_contract_recovery` RPC.

Apply is owner- and record-bound, concurrency guarded, and persists selected changes atomically. It synchronizes the approved partner/questionnaire fields and related wedding/package/extras/travel/deadline values according to the reviewed selections.

## Template management and shared documents

Template upload, version pinning, readiness/analysis, durable document persistence, downloads, and version history are supporting product capabilities. Their existence does not make the older generation implementation current. Keep template-management and shared document services distinct from the generator being selected for new contracts.

## Historical architecture notes

The old sparse/full-rewrite generation workflow and its rollback configuration are preserved in [the July 2026 migration note](sparse-wedding-contract-migration.md). That file records a previous architecture and is not current operational guidance. Older deterministic slot-generation and placeholder-filling implementations also remain in the repository; they are not the current Option B route and should not be removed without a separate verified call-graph and compatibility review.

For the current implementation details, see [the Option B feature README](../src/features/contract-generation-spike/README.md) and the separate Source Contract recovery feature.
