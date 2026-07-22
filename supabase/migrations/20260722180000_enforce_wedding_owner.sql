-- =============================================================================
-- Harden wedding ownership at the database boundary
-- =============================================================================
-- App-layer filters + RLS already require user_id = auth.uid().
-- This trigger makes ownership non-spoofable on INSERT and immutable on UPDATE,
-- so a buggy client can never write another studio's user_id.
-- =============================================================================

create or replace function public.enforce_wedding_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required to modify weddings';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    -- Ownership is immutable; ignore any client attempt to reassign.
    new.user_id := old.user_id;
    if old.user_id is distinct from auth.uid() then
      raise exception 'Cannot modify a wedding owned by another studio';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists weddings_enforce_owner on public.weddings;
create trigger weddings_enforce_owner
  before insert or update on public.weddings
  for each row
  execute function public.enforce_wedding_owner();

-- Table owners bypass RLS unless forced. Authenticated clients use non-owner
-- roles, but force the policy path for defense in depth.
alter table public.weddings force row level security;
alter table public.wedding_places force row level security;
alter table public.travel_segments force row level security;
alter table public.tasks force row level security;
alter table public.notes force row level security;
alter table public.contacts force row level security;
alter table public.payments force row level security;
alter table public.timeline_events force row level security;
alter table public.notifications force row level security;
alter table public.contracts force row level security;
alter table public.calendar_events force row level security;
alter table public.galleries force row level security;
alter table public.form_instances force row level security;
alter table public.form_answers force row level security;
