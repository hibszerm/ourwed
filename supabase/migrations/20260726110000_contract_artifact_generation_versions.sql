-- Generated-contract revisions are independent from template revisions.
-- A generation may have one immutable artifact per output format.

alter table public.wedding_documents
  drop constraint if exists wedding_documents_wedding_id_template_id_version_number_key;

create unique index if not exists wedding_documents_generation_format_unique
  on public.wedding_documents (wedding_id, template_id, version_number, format);

create table if not exists public.wedding_document_generation_sequences (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  template_id uuid not null references public.document_templates (id) on delete cascade,
  current_version integer not null check (current_version >= 1),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (wedding_id, template_id)
);

insert into public.wedding_document_generation_sequences (
  wedding_id,
  template_id,
  current_version
)
select wedding_id, template_id, max(version_number)
from public.wedding_documents
where template_id is not null
group by wedding_id, template_id
on conflict (wedding_id, template_id) do update
set current_version = greatest(
  public.wedding_document_generation_sequences.current_version,
  excluded.current_version
);

alter table public.wedding_document_generation_sequences enable row level security;
alter table public.wedding_document_generation_sequences force row level security;

drop policy if exists wedding_document_generation_sequences_select
  on public.wedding_document_generation_sequences;
create policy wedding_document_generation_sequences_select
  on public.wedding_document_generation_sequences
  for select to authenticated
  using (
    exists (
      select 1
      from public.weddings w
      where w.id = wedding_id
        and w.user_id = auth.uid()
    )
  );

create or replace function public.allocate_wedding_document_generation_version(
  target_wedding_id uuid,
  target_template_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
begin
  if not exists (
    select 1
    from public.weddings w
    join public.document_templates t
      on t.id = target_template_id
     and t.user_id = auth.uid()
    where w.id = target_wedding_id
      and w.user_id = auth.uid()
  ) then
    raise exception 'Wedding or template is unavailable';
  end if;

  insert into public.wedding_document_generation_sequences (
    wedding_id,
    template_id,
    current_version
  )
  values (target_wedding_id, target_template_id, 1)
  on conflict (wedding_id, template_id) do update
  set current_version =
        public.wedding_document_generation_sequences.current_version + 1,
      updated_at = timezone('utc', now())
  returning current_version into allocated;

  return allocated;
end;
$$;

revoke all on function public.allocate_wedding_document_generation_version(uuid, uuid)
  from public;
grant execute on function public.allocate_wedding_document_generation_version(uuid, uuid)
  to authenticated;
