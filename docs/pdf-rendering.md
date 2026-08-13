# PDF rendering (OurWed)

## Production architecture (current)

### Brief PDF (HTML → PDFShift)

```text
OurWed client (authenticated + PRO)
  → Supabase Edge Function `pdf-render`
  → PDFShift (X-API-Key server secret)
  → PDF bytes
  → download
```

### Contract PDF (DOCX → Cloudmersive)

```text
OurWed client (authenticated + PRO)
  → exact final generated contract DOCX bytes
  → Supabase Edge Function `contract-docx-to-pdf`
  → Cloudmersive Convert (`Apikey` server secret)
  → PDF bytes
  → browser download (download-only; not Cloudmersive-hosted URL)
```

**DOCX remains canonical.** Sparse AI generation / template versioning / DOCX download are unchanged. Cloudmersive only converts an already-generated final DOCX. PDFShift is **not** used for contract DOCX→PDF.

| Export | Status |
|--------|--------|
| **Pobierz DOCX** | Canonical — unchanged sparse DOCX generation |
| **Pobierz PDF** | Production — Edge `contract-docx-to-pdf` → Cloudmersive |
| **HTML→PDFShift (contract)** | **STOPPED** — incomplete vs final DOCX (`paragraphsToPrintHtml` is not a production renderer) |
| **Experimental DOCX→LibreOffice** | Lab only (`VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT` + Edge `docx-to-pdf` / local bridge) — **not** customer production |

### Input / ownership tradeoff

Production client sends `docxBase64` of the **exact final DOCX** already shown in the ready preview (same bytes as DOCX download). Edge requires authenticated session + `account_has_pro_access()`. Optional `weddingId` / `documentId` are audit-only. Arbitrary URLs are rejected. This mirrors brief HTML→`pdf-render` (caller-supplied document bytes/HTML under auth+PRO), not an anonymous conversion relay.

### File size

Before calling Cloudmersive: measure DOCX bytes. Free-tier max **3 670 016** bytes (3.5 MB). Over limit → `CONTRACT_PDF_FILE_TOO_LARGE` — **no provider call**.

Customer message: „Plik umowy jest zbyt duży, aby wygenerować PDF w tej chwili.”

### Contract PDF errors (customer-safe)

| Code | UX |
|------|-----|
| `CONTRACT_PDF_LIMIT_REACHED` | „Limit generowania PDF jest chwilowo niedostępny. Spróbuj ponownie później.” |
| `CONTRACT_PDF_FILE_TOO_LARGE` | „Plik umowy jest zbyt duży, aby wygenerować PDF w tej chwili.” |
| `CONTRACT_PDF_PRO_REQUIRED` | „Generowanie PDF wymaga aktywnego PRO.” |
| `CONTRACT_PDF_TIMEOUT` | timeout copy |
| other | Generic Polish — no Cloudmersive/HTTP leak |

No automatic retry. No localhost fallback. Conversion failure does **not** mutate wedding / contract / DOCX / signed state.

One user PDF click → one Edge invoke → one Cloudmersive conversion (busy + in-flight guard).

### Brief PDF (unchanged provider; V2 information architecture)

1. `buildWeddingBriefPdfData` / `loadWeddingBriefPdfData` — derived **operational field guide** (not questionnaire dump)
2. Field registry: `briefFieldRegistry.ts` (classification + single destination per fact)
3. `renderWeddingBriefHtml` + `renderWeddingBriefFooterHtml`
4. `convertWeddingBriefHtmlToPdf` → `renderProductionHtmlToPdf` → Edge `pdf-render` → PDFShift
5. `downloadPdfBytes`

Page order: assignment → contacts → timeline → Nie przegap → locations → semantic ops → vendors → settlement.

No localhost. No Gotenberg. `sandbox=false`. Preview: `tmp/wedding-brief-v2/brief-preview.html` via `npm run test:wedding-brief`.

## Provider modules

| Concern | Module |
|---------|--------|
| HTML→PDF (brief) | `src/features/documents/pdf/pdfRenderer.ts` → PDFShift Edge |
| DOCX→PDF (contract) | `supabase/functions/contract-docx-to-pdf/cloudmersiveConvert.ts` (canonical) + client `contractPdfAdapter.ts` |
| Lab DOCX→LibreOffice | `docx-to-pdf` + `gotenbergPdfAdapter` (flag-gated) |
| Comparison POC | `npm run pdf:cloudmersive-docx-poc` |

## Privacy

### PDFShift (brief)

Receives only HTML (+ optional header/footer). No auth tokens, service keys, or questionnaire public tokens.

### Cloudmersive (contract PDF)

Receives the **complete final contract DOCX**. May contain names, addresses, phone/email, wedding date, prices, legal wording.

Do **not** send auth tokens, service keys, questionnaire public tokens, or unrelated wedding data. Do not log DOCX content.

Safe telemetry only: provider, document/wedding id, byte size, duration, status/error code.

`CLOUDMERSIVE_API_KEY` — Edge / POC server only. Never `VITE_CLOUDMERSIVE_API_KEY`.

## Local Gotenberg (development / lab only)

**Not required** for production brief or production contract PDF.

```bash
docker compose --profile gotenberg up gotenberg
npm run dev:pdf
# optional lab: VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT + VITE_LOCAL_PDF_FUNCTION_URL
npm run pdf:pdfshift-poc
npm run pdf:cloudmersive-docx-poc   # comparison tooling
```

Production must never silently fall back to Gotenberg/localhost.

## Env

| Var | Where | Notes |
|-----|-------|-------|
| `PDFSHIFT_API_KEY` | Edge | Production brief |
| `PDF_RENDER_TIMEOUT_MS` | Edge optional | Default 60000 |
| `PDF_RENDER_ALLOW_SANDBOX` | Edge optional | Staging/POC only |
| `CLOUDMERSIVE_API_KEY` | Edge (+ POC script) | Production contract PDF; never `VITE_*` |
| `CLOUDMERSIVE_TIMEOUT_MS` | Edge optional | Default 60000 |
| `VITE_LOCAL_PDF_FUNCTION_URL` | Vite DEV only | Lab DOCX→Gotenberg; ignored in production builds |
| `GOTENBERG_*` | Lab/dev-pdf only | Not used by production contract/brief PDF |
| `CLOUDMERSIVE_POC_LIVE` | POC script | Comparison only; CI must omit |

## Manual deploy (contract PDF)

1. `supabase secrets set CLOUDMERSIVE_API_KEY=...`
2. `supabase functions deploy contract-docx-to-pdf`
3. Browser QA: generate contract → Pobierz DOCX → Pobierz PDF
4. Repeat with Docker / `npm run dev:pdf` **off** — must work
5. Expired Trial: PDF blocked (PRO)
6. Confirm brief still uses PDFShift

## Manual deploy (brief — unchanged)

1. `supabase secrets set PDFSHIFT_API_KEY=sk_...`
2. Ensure `PDF_RENDER_ALLOW_SANDBOX` unset/false in production
3. `supabase functions deploy pdf-render`
