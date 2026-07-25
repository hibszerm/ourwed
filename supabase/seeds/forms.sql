-- =============================================================================
-- OurWed — Form Engine seeds
-- =============================================================================
-- Production form definitions (not fake wedding data).
--
-- Apply AFTER supabase/schema.sql.
--
-- Current seeds:
--   1. Contract Questionnaire (category = contract)
--
-- Future forms (add below, same pattern):
--   - Pre-wedding questionnaire   (category = pre_wedding)
--   - Family shot list            (category = wedding_day)
--   - Opinion / feedback form     (category = feedback)
--   - Session planning            (category = planning)
--
-- Idempotent: unique (slug, version). Re-running updates the schema jsonb.
-- =============================================================================

insert into public.forms (
  name,
  slug,
  description,
  category,
  schema,
  version,
  is_active
)
values (
  'Contract Questionnaire',
  'contract-questionnaire',
  'Dane potrzebne do przygotowania umowy — mirrors the existing demo Contract Questionnaire.',
  'contract',
  $json$
  {
    "id": "tpl-contract",
    "type": "contract_questionnaire",
    "title": "Dane do umowy",
    "description": "Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy. Pola oznaczone gwiazdką są wymagane.",
    "submitLabel": "Wyślij",
    "successTitle": "Dziękujemy!",
    "successDescription": "Otrzymaliśmy Wasze dane. Wkrótce przygotujemy umowę i prześlemy ją na podany adres e-mail.",
    "questions": [
      {
        "id": "q-section-wedding",
        "type": "section_title",
        "label": "Dane ślubu"
      },
      {
        "id": "q-wedding-date",
        "type": "date",
        "label": "Data ślubu",
        "required": true,
        "fieldKey": "weddingDate"
      },
      {
        "id": "q-package",
        "type": "select",
        "label": "Pakiet",
        "required": true,
        "fieldKey": "packageId",
-- Seed stores empty package options. Public Form Engine injects active
-- Studio Catalog packages at render time via packageService.list().
        "options": []
      },
      {
        "id": "q-section-p1",
        "type": "section_title",
        "label": "Dane Panny Młodej"
      },
      {
        "id": "q-p1-first",
        "type": "text",
        "label": "Imię",
        "required": true,
        "fieldKey": "partner1.firstName"
      },
      {
        "id": "q-p1-last",
        "type": "text",
        "label": "Nazwisko",
        "required": true,
        "fieldKey": "partner1.lastName"
      },
      {
        "id": "q-p1-phone",
        "type": "phone",
        "label": "Telefon",
        "required": true,
        "fieldKey": "partner1.phone"
      },
      {
        "id": "q-section-p2",
        "type": "section_title",
        "label": "Dane Pana Młodego"
      },
      {
        "id": "q-p2-first",
        "type": "text",
        "label": "Imię",
        "required": true,
        "fieldKey": "partner2.firstName"
      },
      {
        "id": "q-p2-last",
        "type": "text",
        "label": "Nazwisko",
        "required": true,
        "fieldKey": "partner2.lastName"
      },
      {
        "id": "q-p2-phone",
        "type": "phone",
        "label": "Telefon",
        "required": true,
        "fieldKey": "partner2.phone"
      },
      {
        "id": "q-section-address",
        "type": "section_title",
        "label": "Adres do umowy"
      },
      {
        "id": "q-p1-address",
        "type": "location",
        "label": "Adres do umowy",
        "required": true,
        "fieldKey": "partner1.address",
        "placeholder": "Wpisz adres…"
      },
      {
        "id": "q-section-email",
        "type": "section_title",
        "label": "Adres e-mail do kontaktu"
      },
      {
        "id": "q-p1-email",
        "type": "email",
        "label": "Adres e-mail do kontaktu",
        "required": true,
        "fieldKey": "partner1.email",
        "description": "Na ten adres wyślemy umowę oraz wszystkie informacje dotyczące współpracy."
      },
      {
        "id": "q-section-notes",
        "type": "section_title",
        "label": "Uwagi"
      },
      {
        "id": "q-notes",
        "type": "textarea",
        "label": "Uwagi",
        "fieldKey": "additionalNotes",
        "placeholder": "Dodatkowe informacje, które chcecie nam przekazać"
      }
    ]
  }
  $json$::jsonb,
  1,
  true
)
on conflict (slug, version) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  schema = excluded.schema,
  is_active = excluded.is_active;

-- =============================================================================
-- Future form seeds (examples — uncomment / extend when ready)
-- =============================================================================
--
-- insert into public.forms (name, slug, description, category, schema, version, is_active)
-- values (
--   'Pre-wedding Questionnaire',
--   'pre-wedding-questionnaire',
--   'Ankieta przedślubna — detale dnia ślubu.',
--   'pre_wedding',
--   '{}'::jsonb,  -- replace with full schema mirroring the product form
--   1,
--   true
-- )
-- on conflict (slug, version) do update
-- set schema = excluded.schema, is_active = excluded.is_active;
--
-- insert into public.forms (name, slug, description, category, schema, version, is_active)
-- values (
--   'Family Shot List',
--   'family-shot-list',
--   'Lista ujęć rodzinnych.',
--   'wedding_day',
--   '{}'::jsonb,
--   1,
--   true
-- )
-- on conflict (slug, version) do update
-- set schema = excluded.schema, is_active = excluded.is_active;
--
-- insert into public.forms (name, slug, description, category, schema, version, is_active)
-- values (
--   'Opinion Form',
--   'opinion-form',
--   'Formularz opinii po realizacji.',
--   'feedback',
--   '{}'::jsonb,
--   1,
--   true
-- )
-- on conflict (slug, version) do update
-- set schema = excluded.schema, is_active = excluded.is_active;
--
-- insert into public.forms (name, slug, description, category, schema, version, is_active)
-- values (
--   'Session Planning',
--   'session-planning',
--   'Planowanie sesji.',
--   'planning',
--   '{}'::jsonb,
--   1,
--   true
-- )
-- on conflict (slug, version) do update
-- set schema = excluded.schema, is_active = excluded.is_active;
