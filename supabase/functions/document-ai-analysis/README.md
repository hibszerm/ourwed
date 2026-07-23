# document-ai-analysis

Supabase Edge Function: wedding contract → structured JSON via OpenAI.

## Architecture

```
React (edgeDocumentAnalyzer / activeAiDocumentAnalyzer)
  → supabase.functions.invoke('document-ai-analysis')
  → OpenAI Responses API (server-side only)
  → validated JSON
  → Mapping Review / Simple Import UI
```

## Secrets

Set in Supabase project secrets (never in Vite / React):

```bash
supabase secrets set OPENAI_API_KEY=your_key_here
# optional override (default: gpt-5-mini):
# supabase secrets set OPENAI_MODEL=gpt-5-mini
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

Provider-neutral error codes: `unauthorized`, `bad_request`, `provider_unavailable`, `provider_timeout`, `provider_rate_limit`, `invalid_json`, `validation_failed`, `empty_response`, `unknown`.
