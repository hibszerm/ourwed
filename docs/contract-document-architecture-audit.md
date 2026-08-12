# Contract document architecture audit

**Date:** 2026-08-12  
**Scope:** Read-only architecture / data-flow audit. No implementation. No PDFShift credits. No production behavior changes.

**Context:** Brief PDF already uses PDFShift. Contract DOCX remains the editable/legal output. A prior HTML→PDFShift contract POC used incomplete `paragraphsToPrintHtml` and must **not** be treated as production-ready.

---

## 1. Contract source of truth

**Closest single source of truth for the final legal contract today:**

> The studio’s **uploaded package contract DOCX** stored at  
> `document_template_versions.source_docx_path`  
> (OOXML binary: legal wording + layout + tables + headers/footers + images).

Generation does **not** rebuild legalese from an app content model. It **transforms** that master DOCX by substituting dynamic values (sparse Full-AI path by default), then writes paragraph text edits back into the same OOXML structure.

| Layer | Role |
|-------|------|
| Master template DOCX | Legal text + Word layout |
| Live wedding / package / company data | Dynamic values at generate time |
| Generated DOCX bytes | Customer artifact |
| `wedding_documents.snapshot_json` | Provenance / frozen wedding clone **after** save — not the generation input on regenerate |

Supporting product docs: `docs/contract-workflow.md`.

---

## 2. Actual generation pipeline

### Production (default): sparse Full-AI

```text
WeddingContractGenerationPage.generate()
  → isSparseWeddingContractGenerationEnabled()  [default ON]
  → resolveSparseTemplateSource / resolvePackageContractForWedding
  → download source DOCX (documentStorage + source_docx_path)
  → indexDocxForTransform
  → buildContractTransformationDataset(wedding, package, extras)
  → runSparseProductTransform → Edge ai-contract-full-rewrite (changedBlocks)
  → quality gate (Mode A)
  → writeTransformedDocx / applyDocxParagraphEditsAndInsertions
  → buildFinalContractGenerationArtifact
  → saveGeneratedContract → ContractArtifactPersistenceService.persist
       → allocate_wedding_document_generation_version
       → buildContractArtifactSnapshot
       → upload DOCX to Storage
       → record wedding_documents (+ draft)
```

Key files:

- `src/pages/WeddingContractGenerationPage.tsx`
- `src/features/documents/template/WeddingSparseContractGenerationService.ts`
- `src/features/documents/template/packageContractAssignment.ts`
- `src/features/ai-contract-transform/transformationDataset.ts`
- `src/features/ai-contract-transform/transformService.ts`
- `src/features/ai-contract-transform/docxTransformWriter.ts`
- `src/features/documents/template/docxParagraphEditor.ts`
- `src/features/documents/template/finalContractGenerationArtifact.ts`
- `src/features/documents/template/saveGeneratedContract.ts`
- `src/features/documents/template/ContractArtifactPersistenceService.ts`
- `src/features/documents/template/ContractExportService.ts`

### Legacy / rollback: slot-based transform

When `VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION=false`:

`WeddingContractGenerationService` → `ContractTransformationService.transformContract` → `resolveContractVariables` → `applyBoundSlotsToParagraphs` → `materializeDocx`.

### Deprecated (not Generate UI)

`generateContractFromTemplate` → `fillTemplateDocx` (`{{…}}` replace in `document.xml` only).

### Preview / print / experimental PDF

| Path | Mechanism |
|------|-----------|
| In-app preview | `ContractDocxPreview` + `docx-preview` `renderAsync` (exact DOCX) |
| Legacy print | `paragraphsToPrintHtml` + `printHtmlAsPdf` (`window.print`) |
| Experimental PDF | `ExperimentalPdfActions` → DOCX → Gotenberg LibreOffice (flag-gated) |
| Brief PDF | Unrelated — HTML → PDFShift |

---

## 3. DOCX library / strategy

| Library | Role |
|---------|------|
| **jszip** | Open/edit OOXML ZIP; rewrite `word/document.xml` |
| **docx-preview** | Browser preview of final DOCX |
| **pdfjs-dist** | PDF import/analysis (templates/recovery), not contract generation |
| **docx / pizzip / docxtemplater** | **Not** product dependencies |

**Strategy (production):**  
**A + D hybrid** — edit an existing DOCX template (not build from scratch); replace/rebuild paragraph text runs inside `document.xml` while preserving headers, footers, tables structure, images, and most formatting. Sparse path may insert paragraphs. Does **not** use a full DOCX template engine for production.

---

## 4. Template storage / versioning

| Concern | Location |
|---------|----------|
| Template shell | `document_templates` |
| Versions | `document_template_versions` (append-only `version_number`) |
| Master DOCX path | `source_docx_path` (Storage) |
| Fillable DOCX path | `template_docx_path` — **not** used for production generation |
| Slot map (legacy) | `document_template_versions.slot_map` |
| Meta / field config | `document_templates.meta` |
| Package binding | `packages.active_contract_template_id` + `active_contract_template_version_id` |
| Upload API | `documentTemplateService.uploadTemplate` / `createVersion` |
| Package UX | `uploadPackageContractTemplate`, `PackageContractSection` |
| Exports pin version | `wedding_documents.template_version_id` |

Storage helpers: `src/lib/api/documents/storage.ts`, `src/lib/api/documents/templateService.ts`.

---

## 5. Dynamic data inventory

Primary sparse dataset: `buildContractTransformationDataset`  
(`src/features/ai-contract-transform/transformationDataset.ts`).

Legacy also uses `resolveContractVariables` (company + wedding + overrides).

| Field group | Source entity | Mapping / format | DOCX insertion |
|-------------|---------------|------------------|----------------|
| Client display names | `weddings` couple | join “A i B” | AI `changedBlocks` / slots |
| Client addresses | couple postal fields | `formatPolishPostalAddress` | same |
| Phone | couple phone fields | trim first available | same |
| Wedding date | `weddings` date | `plDate` → `dd.mm.yyyy r.` | same |
| Contract execution date | generate-time / freeze | `plDate(now)` / execution snapshot | same |
| Deposit / final payment due | wedding commercial / terms | `plDate` | same |
| Preparation / ceremony / reception | wedding locations + places | address heuristics | same |
| Package name | `packages` / snapshot | trim | same |
| Contract value / deposit / remaining | commercial summary | `formatCurrency` + Polish words | same |
| Additional services | `wedding_extra_services` | `buildDatasetAdditionalServices` | insertions / substitutions |
| Company / studio (legacy path) | studio details | `resolveContractVariables` | slots |
| Manual overrides | draft / UI | string map | applied into resolved values |

Formatting lives in TypeScript utilities (`currency`, postal address, Polish money words), not in DOCX styles.

---

## 6. Static / legal content source

| Question | Answer |
|----------|--------|
| Where does legal wording live? | **Inside the uploaded DOCX template** (and thus in each generated DOCX derivative) |
| Extracted to DB as authoritative legal text? | **No** for production. Optional `document_blocks` / builder payloads exist but are **not** the sparse generation input |
| Paragraph/block extraction? | Yes for AI/transform (`indexDocxForTransform`, `extractDocxParagraphs`) — operational, not a second legal store |
| Can app reconstruct exact legal text without DOCX binary? | **No** (not with layout fidelity; body text only partially) |
| Stable paragraph IDs? | Index / `para-N` / `table-…` blockIds within a given DOCX indexing pass — not a durable legal clause ID across arbitrary template edits |

---

## 7. Placeholder system

| Era | Mechanism |
|-----|-----------|
| Production sparse | No `{{placeholders}}`. AI proposes value substitutions / insertions against indexed blocks |
| Legacy slots | Logical fields + physical bindings + `slot_map` → `applyBoundSlotsToParagraphs` |
| Deprecated fill | `fillTemplateDocx` replaces `{{registry_id}}` in `document.xml` |

Missing values: omit / blank / underscore policy depending on path (sparse quality rules vs legacy omit keys). Same mapping layer (`ContractTransformationDataset` / resolved values) **could** feed an HTML renderer for **values**, but **not** for full legal layout.

---

## 8. Paragraph representation

`DocxParagraph` = `{ index, text }` (`docxParagraphEditor.ts`).

| Captured | Lost vs final DOCX |
|----------|-------------------|
| Body paragraph order (indexed) | Run-level fonts beyond rebuild heuristics |
| Canonical text for edits | Headers/footers |
| Table **cell text** as paragraphs with origin | Table geometry, borders, merges, widths |
| | Images, drawings, floating objects |
| | Section properties, page size, margins |
| | Exact list/numbering definitions |
| | Signature graphics / line art as layout |

Canonical helpers: `canonicalParagraph.ts`. Richer mapping extract: `docxStructureExtractor.ts` (wizard, not generation truth).

---

## 9. Tables

- Present in master DOCX; structure preserved during paragraph text rewrite.
- Sparse AI sees cells as `tableCell` blocks with row context.
- App models do **not** store row/column counts, widths, borders, merges, or vertical alignment as a first-class editable model.
- **Gap for HTML:** cannot rebuild faithful tables from `DocxParagraph` alone.

---

## 10. Header / footer

- Live in OOXML `word/header*.xml` / `footer*.xml`.
- Generation edits **do not** rewrite them (editor preserves ZIP parts).
- Lab may detect presence (`hasHeader` / `hasFooter`) without extracting content.
- Page numbers / studio chrome in headers: **DOCX-only** unless separately designed for HTML.

---

## 11. Branding / images

- Logos/signatures embedded in template media remain in generated DOCX.
- Registry concepts `company_logo` / `company_signature` exist for analysis — **not** a production binary injector into DOCX.
- Future HTML would need explicit asset URLs/data URIs; PDFShift cannot see DOCX-embedded media without extraction.

---

## 12. Signature layout

- Typically Word paragraphs/tables/lines inside the master template.
- App does not own a portable signature layout model.
- CRM “signed” is a **status flag**, not an inserted signature image workflow for generated umowa.

---

## 13. Page geometry

Inherited from master DOCX (page size, margins, sections, page breaks, keep-with-next, etc.).  
**Not** represented outside OOXML for production generation.  
Brief HTML `@page` rules are a **different** document system.

---

## 14. Typography

- Inherited from DOCX styles/runs.
- App rewrites text while trying to preserve overlapped run formatting.
- Print HTML forces Times New Roman 12pt — **not** production typography.

---

## 15. Conditional content

| Mechanism | Location |
|-----------|----------|
| Package-specific clauses | Inside that package’s uploaded DOCX |
| Sparse AI “don’t rewrite package provisions” | Edge prompt / quality rules |
| Extra-service insertions | `expandBlocksWithInsertions` + quality gate |
| Legacy omit blank fields | transform / review state |
| Experiment conditionals | `sourceConditionalFields.ts` (lab only) |

**No centralized clause engine** shared by DOCX and HTML today. Conditions = template text + generation rules.

---

## 16. Experimental / AI reusable pieces

Hidden UI (`docs/experimental-tools.md`). Reusable without enabling nav:

| Module | Reuse potential |
|--------|-----------------|
| `ai-contract-transform/*` | **Already production** sparse path |
| `docxLabExtract.ts`, `applyApprovedReplacementPlan.ts` | Lab edits via production paragraph editor |
| `docxStructureExtractor.ts` | Richer structure for mapping |
| `ai-contract-experiment/*` | Conditionals / classification experiments |
| `experimentalDocxRenderer.ts` | Experiment-only; still DOCX-centric |

No production-complete HTML contract renderer in lab code.

---

## 17. Existing HTML renderer limitations

| Renderer | Represents | Cannot represent |
|----------|------------|------------------|
| `paragraphsToPrintHtml` | Flat body paragraph texts | Tables layout, H/F, images, signatures, geometry, styles |
| `buildDocxPreviewModel` | Approximate CSS from `document.xml` | Full Word fidelity; H/F parts |
| `ContractDocxPreview` (`docx-preview`) | Visual DOCX preview | Not a PDFShift HTML pipeline |
| Brief `renderWeddingBriefHtml` | Ops brief only | Contract legalese |

**Why PDFShift contract POC was incomplete:** it rendered sample/`paragraphsToPrintHtml` content that is **not** the master DOCX legal+layout artifact. Visual parity between two Chromium renders of that HTML ≠ parity with production DOCX.

---

## 18. Snapshot / versioning behavior

`buildContractArtifactSnapshot` (`contractArtifactDomain.ts`) stores:

- cloned wedding / client / package snapshot  
- template ids  
- resolved values / omitted keys  
- execution snapshot / audit  

**Critical:** regenerate uses **live wedding data** + **pinned `templateVersionId`**, not replay of prior snapshot as the generation dataset (`WeddingContractPreviewPage.regenerate`). Snapshot is provenance / overrides support, **not** a frozen legal content model that guarantees DOCX and a later PDF share identical wording if wedding data changed.

Risk if HTML/PDF generated later from live data: **business/legal drift** vs saved DOCX.

---

## 19. Signed-document behavior

- `WeddingContractSignedControls` → CRM `contract.status = signed` (+ timeline).
- No upload of counter-signed PDF/DOCX as the generated umowa’s signed binary in this path.
- Export lock helpers exist (`markSigned`) for document lock status.
- Recovery import (`wedding-contract-recovery`) is separate (external contracts).

PDF rendering would not currently alter signed CRM state unless explicitly wired later.

---

## 20. Custom-template support

**Yes.** Studios upload their own DOCX (Document Templates + package contract upload).  
Arbitrary Word layouts are **in scope** for the product strategy.  
A hand-built single HTML template **cannot** cover arbitrary user DOCX without either:

- per-template HTML, or  
- structural extraction → generic HTML, or  
- abandoning HTML and converting DOCX→PDF externally.

---

## 21. Multiple-template support

| Scope | Behavior |
|-------|----------|
| Studio | Many `document_templates` |
| Package | **One** active contract template + version |
| Wedding generate | Resolves package’s active template |

HTML generation would need to be **template-generic** (or per-template) because packages differ.

---

## 22. ContractDocumentModel feasibility

**Rating: C — HARD** (leans D if aiming for Word-layout fidelity)

Reason: source of truth is opaque OOXML; app models capture text edits, not full layout. Building a shared model that both regenerates DOCX and HTML without divergence would largely **re-platform** the working reproduction system.

---

## 23. ContractContentModel feasibility

**Rating: B — MODERATE** (for **content** parity only; layout deliberately separate)

Feasible direction:

- Centralize **dynamic values + snapshot** at generate time  
- Keep DOCX as layout/legal template renderer  
- Build a **controlled HTML layout** that consumes the **same content snapshot** (not Word geometry)

Does **not** automatically solve custom arbitrary templates’ visual identity.

---

## 24. One-source-of-legal-truth recommendation

**Recommended: Option C (pragmatic) evolving toward B for content values**

1. **Short term:** DOCX template remains legal/layout source; generated DOCX remains the frozen customer artifact.  
2. **For PDF:** either render from that **same generated DOCX** via a DOCX→PDF engine, **or** produce HTML from a **frozen content snapshot taken at the same moment as DOCX save**, with legal clauses still originating from the template (extracted once per template version if HTML is pursued).  
3. **Avoid:** dual authoring of legalese in DOCX and HTML.  
4. **Avoid:** regenerating PDF later from live wedding without binding to the saved artifact snapshot.

**Not recommended now:** Option A full DB legal store replacing DOCX, or Option D as the *only* plan without acknowledging HTML incompleteness — but **external DOCX→PDF** remains the only way to get PDF visually faithful to arbitrary custom DOCX without a large HTML project.

---

## 25. HTML / PDFShift requirements (if pursued)

Grounded in real package templates (Times-like legal docs, tables, signatures):

1. A4 portrait  
2. Stable paragraph order matching generated body text  
3. Bold/italic runs where present in body  
4. Centered headings  
5. Tables with correct cell **values** (widths/borders approximate OK if labeled)  
6. Explicit page breaks for signature sections if needed  
7. Signature block layout (labels + lines)  
8. Optional header/footer + logo (HTTPS or data URI)  
9. Same placeholder/dynamic values as DOCX artifact snapshot  
10. No questionnaire tokens / secrets in HTML  

---

## 26. PDFShift compatibility assessment

| Requirement | Fit |
|-------------|-----|
| A4, margins, print backgrounds | Straightforward |
| System/web fonts (Times-like) | Straightforward with care |
| Paragraph order + basic emphasis | Straightforward |
| Tables (simple) | Possible with care |
| Merged cells / complex Word tables | Difficult / not equivalent |
| Exact Word pagination | Not realistically equivalent |
| Headers/footers/page numbers | Possible with care (separate HTML) |
| Embedded DOCX images without extract | Difficult |
| Arbitrary user template fidelity | Not realistically equivalent |

**Legal/content equivalence + professional stable A4** is achievable; **pixel Word equivalence** is not a sane goal for PDFShift HTML.

---

## 27. Preview opportunity

Yes, practically:

- Keep **DOCX preview** (`docx-preview`) for fidelity.  
- Future HTML could power print/PDF preview **without** PDFShift credits.  
- Do **not** spend PDFShift credits for preview.

Current architecture already separates preview (DOCX) from download (DOCX bytes).

---

## 28. Migration risks

| Risk | Rank |
|------|------|
| Legal wording drift (DOCX vs HTML) | **HIGH** |
| Custom user templates vs one HTML skin | **HIGH** |
| Snapshot timing / regenerate from live data | **HIGH** |
| Table / signature layout mismatch | **MEDIUM** |
| Template version mismatch | **MEDIUM** |
| Placeholder / value formatting mismatch | **MEDIUM** |
| Pagination differences (acceptable if disclosed) | **LOW–MEDIUM** |
| Future template edits breaking HTML assumptions | **HIGH** |

---

## 29. Recommended target architecture

**Choose: B — Shared ContractContentModel (values + frozen snapshot) → existing DOCX template renderer → separate controlled HTML layout → PDFShift**

**with an explicit product fork:**

- If PDF must match **arbitrary uploaded Word layouts** → prefer **DOCX→PDF** (hosted converter), not HTML.  
- If PDF may be an OurWed-branded **content-equivalent** A4 (like Brief) → HTML+PDFShift is viable **after** content snapshot + clause strategy for **supported** templates.

Do **not** choose full ContractDocumentModel (A) now.  
Do **not** treat incomplete `paragraphsToPrintHtml` as B.

**Tradeoff:** B preserves working DOCX reproduction; HTML is a second renderer with controlled layout, not Word clone. Custom-template visual identity remains DOCX-primary.

---

## 30. Minimal staged migration plan (not executed)

1. **Freeze content at save** — ensure PDF always binds to the same generation artifact snapshot as the saved DOCX (values + template version + resolved strings).  
2. **Define ContractContentSnapshot schema** (no dual legalese yet).  
3. **Pilot HTML renderer for one internal/reference template** (not all custom uploads).  
4. **Semantic parity tests** DOCX text vs HTML text for that pilot.  
5. **PDFShift POC** on that HTML (sandbox), visual QA.  
6. **Product decision:** content-equivalent PDF vs DOCX-faithful PDF (external converter).  
7. Only then enable production contract PDF.

---

## 31. Semantic parity test strategy

- Normalize extracted plain text from generated DOCX body vs HTML body  
- Assert same resolved dynamic values (names, dates, money, locations, package)  
- Assert clause markers / section headings presence  
- Assert table **cell values** set equality (order-tolerant where needed)  
- Assert templateVersionId + generationVersion metadata alignment  
- Assert snapshot hash / content fingerprint equality between DOCX save and PDF input  
- **No live PDFShift in CI**

---

## 32. Visual parity test strategy

- Separate from semantic tests  
- Page screenshots (local Chromium and/or PDFShift sandbox)  
- Accept anti-aliasing; fail on missing sections, clipped tables, broken signatures  
- Do **not** require Word pixel match  
- Manual legal review checklist for pilot template

---

## 33. Files that would need changes in a future implementation

- `contractArtifactDomain.ts` / persistence (stronger freeze for PDF binding)  
- New HTML renderer module (not `paragraphsToPrintHtml`)  
- `renderProductionHtmlToPdf` wiring for `documentType: 'contract'`  
- Generation save path to emit content snapshot usable by HTML  
- Possibly template-time extraction job  
- Acceptance tests for semantic parity  
- `docs/pdf-rendering.md` / this doc updates  

---

## 34. What must NOT be changed (for now)

- DOCX as canonical editable/legal download  
- Sparse generation pipeline behavior without a deliberate project  
- Brief PDFShift production path  
- Re-enabling experimental nav  
- Treating `paragraphsToPrintHtml` as production contract HTML  
- Dual-maintained legal text in HTML templates  
- Consuming PDFShift credits in CI  

---

## 35. GO / NO-GO — PDFShift for production contract PDFs

### **NO-GO (now)**

Do **not** enable PDFShift for production contract PDFs based on current HTML capabilities or the prior POC.

**Reasons:**

1. Source of truth is arbitrary user DOCX layout; app models do not capture it.  
2. Existing HTML paths are incomplete vs DOCX.  
3. Custom multi-template product strategy conflicts with a single hand-built HTML layout.  
4. Snapshot/regenerate semantics risk content drift if PDF is generated later from live data.  

### **Conditional GO (future)**

PDFShift becomes acceptable **only if**:

- PDF is defined as **content-equivalent OurWed layout** (not Word clone), **and**  
- HTML is fed from a **frozen content snapshot** aligned to a specific generated DOCX artifact, **and**  
- Scope is limited (pilot template / controlled templates) **or** a robust extraction pipeline exists, **and**  
- Semantic parity tests pass.

### **Alternative if Word-faithful PDF is required**

Hosted **DOCX→PDF** conversion of the **already generated** DOCX artifact (not HTML). That is a different project and was out of scope for “no new provider” preference — but it is the only faithful path for arbitrary custom templates without rebuilding Word in HTML.

---

## Dependency map (summary)

```text
document_templates / document_template_versions.source_docx_path
        │
        ▼
packages.active_contract_template_*
        │
        ▼
Wedding generate (sparse)
        │
        ├─ buildContractTransformationDataset (live wedding values)
        ├─ AI transform (changedBlocks)
        └─ write back into DOCX XML (jszip)
                │
                ▼
        generated DOCX bytes
                │
                ├─ preview: docx-preview
                ├─ download: Storage + wedding_documents
                ├─ snapshot_json: provenance (not regenerate input)
                └─ experimental PDF: DOCX→Gotenberg (lab)
```

---

*End of audit. No code or production behavior changed.*
