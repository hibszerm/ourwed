# document-ai-analysis

Supabase Edge Function: wedding contract → structured JSON via Gemini.

## Architecture

```
React (geminiDocumentAnalyzer)
  → supabase.functions.invoke('document-ai-analysis')
  → Gemini API (server-side only)
  → validated JSON
  → Mapping Review UI
```

## Secrets

Set in Supabase project secrets (never in Vite / React):

```bash
supabase secrets set GEMINI_API_KEY=your_key_here
# optional override:
# supabase secrets set GEMINI_MODEL=gemini-2.5-flash
```

## Deploy

```bash
supabase functions deploy document-ai-analysis
```

## Request body

```json
{
  "text": "...extracted DOCX text...",
  "contentHash": "sha256-hex",
  "registryKeys": ["studio.name", "wedding.date", "..."],
  "schemaVersion": "1.0.0",
  "promptVersion": "1.0.0"
}
```

## Response

Success: `{ "ok": true, "analysis": { ... }, "fromCache": false }`  
Error: `{ "ok": false, "error": { "code": "...", "message": "..." } }`
