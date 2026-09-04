-- Freeze extra-service display names the same way prices are frozen.
-- Catalog renames must not rewrite historical wedding extras.
-- Does NOT change price_snapshot, quantity, FK, or ON DELETE RESTRICT.

alter table public.wedding_extra_services
  add column if not exists name_snapshot text;

comment on column public.wedding_extra_services.name_snapshot is
  'Frozen catalog name at selection time. Catalog renames never rewrite this.';

update public.wedding_extra_services wes
set name_snapshot = e.name
from public.extra_services e
where wes.extra_service_id = e.id
  and (wes.name_snapshot is null or btrim(wes.name_snapshot) = '');

update public.wedding_extra_services
set name_snapshot = 'Usługa'
where name_snapshot is null or btrim(name_snapshot) = '';

alter table public.wedding_extra_services
  alter column name_snapshot set default 'Usługa';

alter table public.wedding_extra_services
  alter column name_snapshot set not null;

create or replace function public.wedding_extra_fill_name_snapshot()
returns trigger
language plpgsql
as $$
declare
  live_name text;
begin
  if new.name_snapshot is not null and length(btrim(new.name_snapshot)) > 0 then
    new.name_snapshot := btrim(new.name_snapshot);
    return new;
  end if;
  select e.name into live_name
  from public.extra_services e
  where e.id = new.extra_service_id;
  new.name_snapshot := coalesce(nullif(btrim(coalesce(live_name, '')), ''), 'Usługa');
  return new;
end;
$$;

drop trigger if exists wedding_extra_services_fill_name_snapshot
  on public.wedding_extra_services;

create trigger wedding_extra_services_fill_name_snapshot
before insert on public.wedding_extra_services
for each row
execute function public.wedding_extra_fill_name_snapshot();
