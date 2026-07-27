-- Idempotent helper assumed by later migrations and by supabase/schema.sql.
-- Safe on remote: create or replace with the same body already present from schema bootstrap.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
