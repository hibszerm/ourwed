# Historical / bootstrap SQL (NOT executed by Supabase)

Files in this directory were previously untimestamped entries under
`supabase/migrations/`. Lexicographic ordering caused them to run **after**
secure multi-tenant RLS migrations and recreate `dev_allow_all_*` policies.

They are archived here for archaeology and acceptance-test references only.

- **Do not** put files from this folder back into `supabase/migrations/`.
- **Do not** rename them with a later timestamp (that would reintroduce open RLS).
- Canonical DDL for greenfield docs remains `supabase/schema.sql`.
- Live production was never changed by this archive move (migrations not applied remotely).

Archived:

| File | Why archived |
|------|----------------|
| `studio_catalog.sql` | CREATE catalog tables + **dangerous** `dev_allow_all_*` |
| `studio_catalog_scrub_mock_package_ids.sql` | One-shot mock package scrub (not RLS) |
| `travel_planning.sql` | CREATE travel tables + **dangerous** `dev_allow_all_*` |
| `travel_places_rls_policies.sql` | **Dangerous** `dev_allow_all_*` for places/segments |
| `questionnaires_crm.sql` | Early form_instances CRM alters (covered by schema / later migrations) |
| `performance_indexes.sql` | Additive indexes (`IF NOT EXISTS`); not required for RLS safety |
