# Local experimental DOCX → PDF (no `supabase start`)

Use this flow to test Gotenberg conversion while local Supabase migration history remains incomplete.

## Prerequisites

- Docker (Gotenberg)
- `.env.local` with:

```bash
VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT=true
VITE_LOCAL_PDF_FUNCTION_URL=http://127.0.0.1:54322/docx-to-pdf
ENABLE_EXPERIMENTAL_PDF_EXPORT=true
GOTENBERG_URL=http://localhost:3000
```

`GOTENBERG_*` and `ENABLE_EXPERIMENTAL_PDF_EXPORT` are read only by `npm run dev:pdf` (and by the Edge Function when deployed). They must never be `VITE_`-prefixed.

**Required for browser → local server routing:**

```bash
VITE_LOCAL_PDF_FUNCTION_URL=http://127.0.0.1:54322/docx-to-pdf
```

Without this Vite variable, the app falls back to `supabase.functions.invoke('docx-to-pdf')`. After changing any `VITE_*` value, restart `npm run dev`.

In the browser console you should see:

```text
[pdf-export] DEV=true localUrlConfigured=true
[pdf-export] transport=local url=http://127.0.0.1:54322/docx-to-pdf
```

If you see `transport=supabase`, the local URL was not loaded into the Vite client.

## Terminals

```bash
# Terminal 1 — Gotenberg / LibreOffice
docker compose --profile gotenberg up gotenberg

# Terminal 2 — local PDF endpoint (reuses gotenbergConvert.ts)
npm run dev:pdf

# Terminal 3 — Vite app
npm run dev
```

## Frontend URL

When `import.meta.env.DEV` is true and `VITE_LOCAL_PDF_FUNCTION_URL` is set, the browser calls:

**`http://127.0.0.1:54322/docx-to-pdf`**

(exact value of `VITE_LOCAL_PDF_FUNCTION_URL`)

Otherwise it calls the Supabase Edge Function `docx-to-pdf`.

`VITE_LOCAL_PDF_FUNCTION_URL` is **ignored in production builds**.

## Contract

Same JSON body/response as the Edge Function:

- Request: `{ docxBase64, filename?, runId? }`
- Response: `{ ok: true, pdfBase64, provider }` or `{ ok: false, error }`

Conversion rules live in `supabase/functions/docx-to-pdf/gotenbergConvert.ts` (shared; not duplicated).
