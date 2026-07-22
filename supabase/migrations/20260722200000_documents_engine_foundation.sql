-- =============================================================================
-- Documents engine — Phase 0 foundation
-- =============================================================================
-- Retires the prototype (sample_text mappings / immediate generate).
-- Creates component-based schema: templates → components → blocks,
-- drafts with package_snapshot, immutable exports with lock_status,
-- Variable Registry, RLS, storage.
-- No generation / preview / mapping UI in this phase.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Retire prototype (tables may never have existed on remote)
-- DROP TABLE … CASCADE removes policies; do not DROP POLICY on missing relations.
-- ---------------------------------------------------------------------------

drop table if exists public.template_mappings cascade;
drop table if exists public.generated_documents cascade;
drop table if exists public.document_templates cascade;

-- ---------------------------------------------------------------------------
-- 1) document_templates (shell — no package_id)
-- ---------------------------------------------------------------------------

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  description text,
  doc_type text not null default 'contract'
    check (doc_type in (
      'contract', 'annex', 'invoice', 'gdpr', 'delivery_protocol', 'other'
    )),
  category text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'archived')),
  current_version_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index document_templates_user_id_idx
  on public.document_templates (user_id, created_at desc);

create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row
  execute function public.set_updated_at();

comment on table public.document_templates is
  'Studio document template shell. Package-agnostic. Versions live in document_template_versions.';

-- ---------------------------------------------------------------------------
-- 2) document_template_versions
-- ---------------------------------------------------------------------------

create table public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  source_docx_path text,
  definition_checksum text,
  locale text not null default 'pl',
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (template_id, version_number)
);

create index document_template_versions_template_id_idx
  on public.document_template_versions (template_id, version_number desc);

comment on table public.document_template_versions is
  'Immutable template versions. Drafts/exports pin template_version_id.';

alter table public.document_templates
  add constraint document_templates_current_version_id_fkey
  foreign key (current_version_id)
  references public.document_template_versions (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 3) document_components + versions (reusable sections)
-- ---------------------------------------------------------------------------

create table public.document_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null
    check (kind in (
      'header',
      'parties',
      'wedding_information',
      'package_items',
      'payment_summary',
      'copyright',
      'gdpr',
      'optional_clauses',
      'signature_block',
      'custom'
    )),
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'archived')),
  current_version_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index document_components_user_id_idx
  on public.document_components (user_id, kind);

create trigger document_components_set_updated_at
  before update on public.document_components
  for each row
  execute function public.set_updated_at();

comment on table public.document_components is
  'Reusable internal Document Components. Not a user-facing builder.';

create table public.document_component_versions (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.document_components (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  match_fingerprint text,
  definition_checksum text,
  locale text not null default 'pl',
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (component_id, version_number)
);

create index document_component_versions_component_id_idx
  on public.document_component_versions (component_id, version_number desc);

comment on table public.document_component_versions is
  'Versioned component definitions. match_fingerprint supports safe DOCX rematch.';

alter table public.document_components
  add constraint document_components_current_version_id_fkey
  foreign key (current_version_id)
  references public.document_component_versions (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 4) Template ↔ component composition
-- ---------------------------------------------------------------------------

create table public.document_template_component_links (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null
    references public.document_template_versions (id) on delete cascade,
  component_version_id uuid not null
    references public.document_component_versions (id) on delete restrict,
  sort_order integer not null default 0,
  instance_key text,
  overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (template_version_id, sort_order)
);

create index document_template_component_links_tv_idx
  on public.document_template_component_links (template_version_id, sort_order);

comment on table public.document_template_component_links is
  'Ordered composition of component versions on a template version.';

-- ---------------------------------------------------------------------------
-- 5) Blocks + conditions
-- ---------------------------------------------------------------------------

create table public.document_blocks (
  id uuid primary key default gen_random_uuid(),
  component_version_id uuid not null
    references public.document_component_versions (id) on delete cascade,
  block_type text not null
    check (block_type in (
      'heading',
      'paragraph',
      'table',
      'package_items',
      'optional_clause',
      'payment_summary',
      'signature',
      'page_break'
    )),
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (component_version_id, sort_order)
);

create index document_blocks_component_version_id_idx
  on public.document_blocks (component_version_id, sort_order);

create trigger document_blocks_set_updated_at
  before update on public.document_blocks
  for each row
  execute function public.set_updated_at();

comment on table public.document_blocks is
  'Atomic blocks inside a component version. signature is first-class for future e-sign.';

create table public.document_block_conditions (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.document_blocks (id) on delete cascade,
  -- When condition fails, block (or optionally whole linked component) is hidden.
  scope text not null default 'block'
    check (scope in ('block', 'component')),
  -- e.g. { "op": "item_enabled", "itemKey": "drone" }
  rule jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index document_block_conditions_block_id_idx
  on public.document_block_conditions (block_id);

comment on table public.document_block_conditions is
  'Visibility rules evaluated against the draft (package snapshot, clauses, flags).';

-- ---------------------------------------------------------------------------
-- 6) Clause library
-- ---------------------------------------------------------------------------

create table public.document_clause_defs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  key text not null,
  title text not null,
  body text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, key)
);

create index document_clause_defs_user_id_idx
  on public.document_clause_defs (user_id, sort_order);

create trigger document_clause_defs_set_updated_at
  before update on public.document_clause_defs
  for each row
  execute function public.set_updated_at();

comment on table public.document_clause_defs is
  'Studio optional-clause library bound into optional_clause blocks.';

-- ---------------------------------------------------------------------------
-- 7) Central Variable Registry
-- ---------------------------------------------------------------------------

create table public.document_variable_registry (
  key text primary key,
  section text not null
    check (section in (
      'bride', 'groom', 'wedding', 'package', 'payments',
      'locations', 'studio', 'additional'
    )),
  label_pl text not null,
  value_type text not null default 'string'
    check (value_type in ('string', 'number', 'date', 'boolean', 'money')),
  data_source text not null default 'wedding'
    check (data_source in (
      'wedding', 'draft', 'package_snapshot', 'payments', 'studio', 'computed'
    )),
  description text,
  is_system boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.document_variable_registry is
  'Central Variable Registry. All document types bind slots to these keys.';

insert into public.document_variable_registry
  (key, section, label_pl, value_type, data_source, sort_order)
values
  ('bride.firstName', 'bride', 'Imię', 'string', 'wedding', 10),
  ('bride.lastName', 'bride', 'Nazwisko', 'string', 'wedding', 20),
  ('bride.phone', 'bride', 'Telefon', 'string', 'wedding', 30),
  ('bride.email', 'bride', 'E-mail', 'string', 'wedding', 40),
  ('bride.address', 'bride', 'Adres', 'string', 'wedding', 50),
  ('groom.firstName', 'groom', 'Imię', 'string', 'wedding', 110),
  ('groom.lastName', 'groom', 'Nazwisko', 'string', 'wedding', 120),
  ('groom.phone', 'groom', 'Telefon', 'string', 'wedding', 130),
  ('groom.email', 'groom', 'E-mail', 'string', 'wedding', 140),
  ('groom.address', 'groom', 'Adres', 'string', 'wedding', 150),
  ('wedding.date', 'wedding', 'Data ślubu', 'date', 'wedding', 210),
  ('wedding.ceremonyTime', 'wedding', 'Godzina ceremonii', 'string', 'wedding', 220),
  ('wedding.coupleNames', 'wedding', 'Imiona pary', 'string', 'computed', 230),
  ('package.name', 'package', 'Nazwa pakietu', 'string', 'package_snapshot', 310),
  ('package.price', 'package', 'Wartość umowy', 'money', 'draft', 320),
  ('package.deposit', 'package', 'Zadatek', 'money', 'draft', 330),
  ('package.remaining', 'package', 'Pozostała kwota', 'money', 'draft', 340),
  ('payments.depositPaid', 'payments', 'Zadatek opłacony', 'boolean', 'payments', 410),
  ('payments.totalPaid', 'payments', 'Suma wpłat', 'money', 'payments', 420),
  ('location.preparation', 'locations', 'Przygotowania', 'string', 'wedding', 510),
  ('location.ceremony', 'locations', 'Ceremonia', 'string', 'wedding', 520),
  ('location.reception', 'locations', 'Przyjęcie', 'string', 'wedding', 530),
  ('studio.name', 'studio', 'Nazwa studia', 'string', 'studio', 610),
  ('studio.nip', 'studio', 'NIP', 'string', 'studio', 620),
  ('additional.contractNumber', 'additional', 'Numer umowy', 'string', 'draft', 710),
  ('additional.city', 'additional', 'Miasto', 'string', 'draft', 720)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 8) wedding_document_drafts (working copy + full package snapshot)
-- ---------------------------------------------------------------------------

create table public.wedding_document_drafts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  template_id uuid not null references public.document_templates (id) on delete restrict,
  template_version_id uuid not null
    references public.document_template_versions (id) on delete restrict,
  title text not null,
  field_values jsonb not null default '{}'::jsonb,
  -- Deep copy: { packageId?, name, currency, items:[{key,name,description,unitPrice,enabled,sortOrder}] }
  package_snapshot jsonb not null default '{}'::jsonb,
  enabled_clause_ids uuid[] not null default '{}',
  money jsonb not null default '{}'::jsonb,
  notes text,
  status text not null default 'editing'
    check (status in ('editing', 'ready_to_export')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index wedding_document_drafts_wedding_id_idx
  on public.wedding_document_drafts (wedding_id, updated_at desc);

create index wedding_document_drafts_template_version_id_idx
  on public.wedding_document_drafts (template_version_id);

create trigger wedding_document_drafts_set_updated_at
  before update on public.wedding_document_drafts
  for each row
  execute function public.set_updated_at();

comment on table public.wedding_document_drafts is
  'Editable working copy. Overrides + package_snapshot never mutate wedding/catalog/template.';

-- ---------------------------------------------------------------------------
-- 9) wedding_documents (immutable exports + lock)
-- ---------------------------------------------------------------------------

create table public.wedding_documents (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  template_id uuid references public.document_templates (id) on delete set null,
  template_version_id uuid references public.document_template_versions (id) on delete set null,
  draft_id uuid references public.wedding_document_drafts (id) on delete set null,
  version_number integer not null check (version_number >= 1),
  format text not null default 'docx'
    check (format in ('docx', 'pdf')),
  file_path text not null,
  file_name text not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  lock_status text not null default 'exported'
    check (lock_status in ('exported', 'finalized', 'signed', 'locked')),
  locked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (wedding_id, template_id, version_number)
);

create index wedding_documents_wedding_id_idx
  on public.wedding_documents (wedding_id, created_at desc);

comment on table public.wedding_documents is
  'Immutable exports. Locked/signed rows must not be mutated — create a new version instead.';

create or replace function public.prevent_locked_wedding_document_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.lock_status in ('finalized', 'signed', 'locked') then
      -- Allow only no-op updates or moving lock_status (already terminal — block content changes)
      if new.file_path is distinct from old.file_path
        or new.file_name is distinct from old.file_name
        or new.snapshot_json is distinct from old.snapshot_json
        or new.version_number is distinct from old.version_number
        or new.format is distinct from old.format
        or new.draft_id is distinct from old.draft_id
        or new.template_version_id is distinct from old.template_version_id
      then
        raise exception 'Locked wedding document % is immutable', old.id;
      end if;
      if new.lock_status is distinct from old.lock_status
        and new.lock_status not in ('finalized', 'signed', 'locked')
      then
        raise exception 'Cannot unlock wedding document %', old.id;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.lock_status in ('finalized', 'signed', 'locked') then
      raise exception 'Cannot delete locked wedding document %', old.id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists wedding_documents_prevent_locked_mutation on public.wedding_documents;
create trigger wedding_documents_prevent_locked_mutation
  before update or delete on public.wedding_documents
  for each row
  execute function public.prevent_locked_wedding_document_mutation();

-- ---------------------------------------------------------------------------
-- 10) RLS
-- ---------------------------------------------------------------------------

alter table public.document_templates enable row level security;
alter table public.document_templates force row level security;
alter table public.document_template_versions enable row level security;
alter table public.document_template_versions force row level security;
alter table public.document_components enable row level security;
alter table public.document_components force row level security;
alter table public.document_component_versions enable row level security;
alter table public.document_component_versions force row level security;
alter table public.document_template_component_links enable row level security;
alter table public.document_template_component_links force row level security;
alter table public.document_blocks enable row level security;
alter table public.document_blocks force row level security;
alter table public.document_block_conditions enable row level security;
alter table public.document_block_conditions force row level security;
alter table public.document_clause_defs enable row level security;
alter table public.document_clause_defs force row level security;
alter table public.document_variable_registry enable row level security;
alter table public.document_variable_registry force row level security;
alter table public.wedding_document_drafts enable row level security;
alter table public.wedding_document_drafts force row level security;
alter table public.wedding_documents enable row level security;
alter table public.wedding_documents force row level security;

-- templates
create policy document_templates_select on public.document_templates
  for select using (user_id = auth.uid());
create policy document_templates_insert on public.document_templates
  for insert with check (user_id = auth.uid());
create policy document_templates_update on public.document_templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy document_templates_delete on public.document_templates
  for delete using (user_id = auth.uid());

-- template versions via template ownership
create policy document_template_versions_select on public.document_template_versions
  for select using (
    exists (
      select 1 from public.document_templates t
      where t.id = template_id and t.user_id = auth.uid()
    )
  );
create policy document_template_versions_insert on public.document_template_versions
  for insert with check (
    exists (
      select 1 from public.document_templates t
      where t.id = template_id and t.user_id = auth.uid()
    )
  );
create policy document_template_versions_update on public.document_template_versions
  for update using (
    exists (
      select 1 from public.document_templates t
      where t.id = template_id and t.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.document_templates t
      where t.id = template_id and t.user_id = auth.uid()
    )
  );
create policy document_template_versions_delete on public.document_template_versions
  for delete using (
    exists (
      select 1 from public.document_templates t
      where t.id = template_id and t.user_id = auth.uid()
    )
  );

-- components
create policy document_components_select on public.document_components
  for select using (user_id = auth.uid());
create policy document_components_insert on public.document_components
  for insert with check (user_id = auth.uid());
create policy document_components_update on public.document_components
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy document_components_delete on public.document_components
  for delete using (user_id = auth.uid());

create policy document_component_versions_select on public.document_component_versions
  for select using (
    exists (
      select 1 from public.document_components c
      where c.id = component_id and c.user_id = auth.uid()
    )
  );
create policy document_component_versions_insert on public.document_component_versions
  for insert with check (
    exists (
      select 1 from public.document_components c
      where c.id = component_id and c.user_id = auth.uid()
    )
  );
create policy document_component_versions_update on public.document_component_versions
  for update using (
    exists (
      select 1 from public.document_components c
      where c.id = component_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.document_components c
      where c.id = component_id and c.user_id = auth.uid()
    )
  );
create policy document_component_versions_delete on public.document_component_versions
  for delete using (
    exists (
      select 1 from public.document_components c
      where c.id = component_id and c.user_id = auth.uid()
    )
  );

-- composition links via template version ownership
create policy document_template_component_links_select
  on public.document_template_component_links
  for select using (
    exists (
      select 1
      from public.document_template_versions tv
      join public.document_templates t on t.id = tv.template_id
      where tv.id = template_version_id and t.user_id = auth.uid()
    )
  );
create policy document_template_component_links_insert
  on public.document_template_component_links
  for insert with check (
    exists (
      select 1
      from public.document_template_versions tv
      join public.document_templates t on t.id = tv.template_id
      where tv.id = template_version_id and t.user_id = auth.uid()
    )
  );
create policy document_template_component_links_update
  on public.document_template_component_links
  for update using (
    exists (
      select 1
      from public.document_template_versions tv
      join public.document_templates t on t.id = tv.template_id
      where tv.id = template_version_id and t.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.document_template_versions tv
      join public.document_templates t on t.id = tv.template_id
      where tv.id = template_version_id and t.user_id = auth.uid()
    )
  );
create policy document_template_component_links_delete
  on public.document_template_component_links
  for delete using (
    exists (
      select 1
      from public.document_template_versions tv
      join public.document_templates t on t.id = tv.template_id
      where tv.id = template_version_id and t.user_id = auth.uid()
    )
  );

-- blocks via component ownership
create policy document_blocks_select on public.document_blocks
  for select using (
    exists (
      select 1
      from public.document_component_versions cv
      join public.document_components c on c.id = cv.component_id
      where cv.id = component_version_id and c.user_id = auth.uid()
    )
  );
create policy document_blocks_insert on public.document_blocks
  for insert with check (
    exists (
      select 1
      from public.document_component_versions cv
      join public.document_components c on c.id = cv.component_id
      where cv.id = component_version_id and c.user_id = auth.uid()
    )
  );
create policy document_blocks_update on public.document_blocks
  for update using (
    exists (
      select 1
      from public.document_component_versions cv
      join public.document_components c on c.id = cv.component_id
      where cv.id = component_version_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.document_component_versions cv
      join public.document_components c on c.id = cv.component_id
      where cv.id = component_version_id and c.user_id = auth.uid()
    )
  );
create policy document_blocks_delete on public.document_blocks
  for delete using (
    exists (
      select 1
      from public.document_component_versions cv
      join public.document_components c on c.id = cv.component_id
      where cv.id = component_version_id and c.user_id = auth.uid()
    )
  );

create policy document_block_conditions_select on public.document_block_conditions
  for select using (
    exists (
      select 1
      from public.document_blocks b
      join public.document_component_versions cv on cv.id = b.component_version_id
      join public.document_components c on c.id = cv.component_id
      where b.id = block_id and c.user_id = auth.uid()
    )
  );
create policy document_block_conditions_insert on public.document_block_conditions
  for insert with check (
    exists (
      select 1
      from public.document_blocks b
      join public.document_component_versions cv on cv.id = b.component_version_id
      join public.document_components c on c.id = cv.component_id
      where b.id = block_id and c.user_id = auth.uid()
    )
  );
create policy document_block_conditions_update on public.document_block_conditions
  for update using (
    exists (
      select 1
      from public.document_blocks b
      join public.document_component_versions cv on cv.id = b.component_version_id
      join public.document_components c on c.id = cv.component_id
      where b.id = block_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.document_blocks b
      join public.document_component_versions cv on cv.id = b.component_version_id
      join public.document_components c on c.id = cv.component_id
      where b.id = block_id and c.user_id = auth.uid()
    )
  );
create policy document_block_conditions_delete on public.document_block_conditions
  for delete using (
    exists (
      select 1
      from public.document_blocks b
      join public.document_component_versions cv on cv.id = b.component_version_id
      join public.document_components c on c.id = cv.component_id
      where b.id = block_id and c.user_id = auth.uid()
    )
  );

-- clauses
create policy document_clause_defs_select on public.document_clause_defs
  for select using (user_id = auth.uid());
create policy document_clause_defs_insert on public.document_clause_defs
  for insert with check (user_id = auth.uid());
create policy document_clause_defs_update on public.document_clause_defs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy document_clause_defs_delete on public.document_clause_defs
  for delete using (user_id = auth.uid());

-- variable registry: readable by authenticated studios; system rows not user-writable
create policy document_variable_registry_select on public.document_variable_registry
  for select to authenticated using (true);

-- drafts / exports via wedding ownership
create policy wedding_document_drafts_select on public.wedding_document_drafts
  for select using (public.is_wedding_owner(wedding_id));
create policy wedding_document_drafts_insert on public.wedding_document_drafts
  for insert with check (public.is_wedding_owner(wedding_id));
create policy wedding_document_drafts_update on public.wedding_document_drafts
  for update using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
create policy wedding_document_drafts_delete on public.wedding_document_drafts
  for delete using (public.is_wedding_owner(wedding_id));

create policy wedding_documents_select on public.wedding_documents
  for select using (public.is_wedding_owner(wedding_id));
create policy wedding_documents_insert on public.wedding_documents
  for insert with check (public.is_wedding_owner(wedding_id));
create policy wedding_documents_update on public.wedding_documents
  for update using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
create policy wedding_documents_delete on public.wedding_documents
  for delete using (public.is_wedding_owner(wedding_id));

-- ---------------------------------------------------------------------------
-- 11) Storage bucket (keep document-files; allow pdf later)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-files',
  'document-files',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists document_files_select on storage.objects;
create policy document_files_select on storage.objects
  for select using (
    bucket_id = 'document-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists document_files_insert on storage.objects;
create policy document_files_insert on storage.objects
  for insert with check (
    bucket_id = 'document-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists document_files_update on storage.objects;
create policy document_files_update on storage.objects
  for update using (
    bucket_id = 'document-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists document_files_delete on storage.objects;
create policy document_files_delete on storage.objects
  for delete using (
    bucket_id = 'document-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
