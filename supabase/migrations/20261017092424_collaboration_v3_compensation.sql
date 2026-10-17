-- V3 Compensation / personal finance. This additive migration keeps the client
-- contract/payment ledger separate from actor-specific economic value.
begin;

lock table public.wedding_collaboration_memberships,
  public.wedding_collaboration_invitations, public.payments
  in access exclusive mode nowait;

create table collaboration_private.compensation_relationships (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings(id) on delete set null,
  wedding_id_snapshot uuid not null,
  owner_user_id uuid references public.users(id) on delete set null,
  recipient_user_id uuid references public.users(id) on delete set null,
  recipient_label_snapshot text not null default 'Współpracownik',
  wedding_label_snapshot text not null default 'Wesele',
  wedding_date_snapshot date,
  currency text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (currency=pg_catalog.upper(pg_catalog.btrim(currency)) and pg_catalog.char_length(currency) between 3 and 8)
);
create unique index compensation_relationships_live_identity_uq
  on collaboration_private.compensation_relationships(wedding_id_snapshot,owner_user_id,recipient_user_id)
  where owner_user_id is not null and recipient_user_id is not null;
create index compensation_relationships_recipient_idx
  on collaboration_private.compensation_relationships(recipient_user_id,wedding_id_snapshot);

create table collaboration_private.compensation_terms (
  relationship_id uuid primary key references collaboration_private.compensation_relationships(id) on delete cascade,
  amount numeric(12,2) not null check (amount>=0),
  currency text not null,
  due_date date,
  terms_revision bigint not null check (terms_revision>0),
  amount_revision bigint not null check (amount_revision>0),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table collaboration_private.compensation_terms_history (
  relationship_id uuid not null references collaboration_private.compensation_relationships(id) on delete cascade,
  terms_revision bigint not null check (terms_revision>0),
  amount numeric(12,2) not null check (amount>=0),
  currency text not null,
  due_date date,
  amount_revision bigint not null check (amount_revision>0),
  active boolean not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  actor_user_id uuid references public.users(id) on delete set null,
  primary key(relationship_id,terms_revision)
);
create table collaboration_private.compensation_recipient_terms_history (
  relationship_id uuid not null references collaboration_private.compensation_relationships(id) on delete cascade,
  recipient_user_id uuid references public.users(id) on delete cascade,
  terms_revision bigint not null,
  amount numeric(12,2) not null,
  currency text not null,
  due_date date,
  amount_revision bigint not null,
  active boolean not null,
  visible_at timestamptz not null default pg_catalog.now(),
  primary key(relationship_id,recipient_user_id,terms_revision)
);
create table collaboration_private.compensation_private_settings (
  relationship_id uuid primary key references collaboration_private.compensation_relationships(id) on delete cascade,
  recipient_user_id uuid references public.users(id) on delete set null,
  fallback_amount numeric(12,2) check (fallback_amount is null or fallback_amount>=0),
  fallback_due_date date,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table collaboration_private.compensation_private_settings_history (
  relationship_id uuid not null references collaboration_private.compensation_relationships(id) on delete cascade,
  revision bigint not null check(revision>0),
  fallback_amount numeric(12,2),
  fallback_due_date date,
  recorded_at timestamptz not null default pg_catalog.now(),
  recipient_user_id uuid references public.users(id) on delete set null,
  primary key(relationship_id,revision)
);
create table collaboration_private.compensation_private_receipts (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references collaboration_private.compensation_relationships(id) on delete cascade,
  recipient_user_id uuid references public.users(id) on delete set null,
  amount numeric(12,2) not null check (amount>0),
  received_on date not null,
  description text,
  revision bigint not null default 1 check (revision>0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create index compensation_private_receipts_relationship_date_idx
  on collaboration_private.compensation_private_receipts(relationship_id,received_on,id);

create table collaboration_private.compensation_private_state (
  relationship_id uuid primary key references collaboration_private.compensation_relationships(id) on delete cascade,
  revision bigint not null default 1 check (revision>0),
  updated_at timestamptz not null default pg_catalog.now()
);
create table collaboration_private.compensation_client_receipt_archive (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references collaboration_private.compensation_relationships(id) on delete cascade,
  source_payment_id uuid not null,
  amount numeric(12,2) not null,
  received_on date not null,
  label_snapshot text not null,
  archived_at timestamptz not null default pg_catalog.now(),
  unique(relationship_id,source_payment_id)
);

alter table collaboration_private.compensation_relationships enable row level security;
alter table collaboration_private.compensation_relationships force row level security;
alter table collaboration_private.compensation_terms enable row level security;
alter table collaboration_private.compensation_terms force row level security;
alter table collaboration_private.compensation_terms_history enable row level security;
alter table collaboration_private.compensation_terms_history force row level security;
alter table collaboration_private.compensation_recipient_terms_history enable row level security;
alter table collaboration_private.compensation_recipient_terms_history force row level security;
alter table collaboration_private.compensation_private_settings enable row level security;
alter table collaboration_private.compensation_private_settings force row level security;
alter table collaboration_private.compensation_private_settings_history enable row level security;
alter table collaboration_private.compensation_private_settings_history force row level security;
alter table collaboration_private.compensation_private_receipts enable row level security;
alter table collaboration_private.compensation_private_receipts force row level security;
alter table collaboration_private.compensation_private_state enable row level security;
alter table collaboration_private.compensation_private_state force row level security;
alter table collaboration_private.compensation_client_receipt_archive enable row level security;
alter table collaboration_private.compensation_client_receipt_archive force row level security;
revoke all on collaboration_private.compensation_relationships,
  collaboration_private.compensation_terms,collaboration_private.compensation_terms_history,
  collaboration_private.compensation_recipient_terms_history,
  collaboration_private.compensation_private_settings,collaboration_private.compensation_private_settings_history,
  collaboration_private.compensation_private_receipts,
  collaboration_private.compensation_private_state,collaboration_private.compensation_client_receipt_archive
  from public,anon,authenticated,service_role;

create function collaboration_private.snapshot_visible_compensation_terms_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into collaboration_private.compensation_recipient_terms_history(
    relationship_id,recipient_user_id,terms_revision,amount,currency,due_date,amount_revision,active
  )
  select r.id,r.recipient_user_id,new.terms_revision,new.amount,new.currency,new.due_date,new.amount_revision,new.active
  from collaboration_private.compensation_relationships r
  join public.wedding_collaboration_memberships m on m.wedding_id_snapshot=r.wedding_id_snapshot
    and m.owner_user_id=r.owner_user_id and m.member_user_id=r.recipient_user_id and m.status='active'
  join collaboration_private.membership_area_access a on a.membership_id=m.id and a.compensation>0
  where r.id=new.relationship_id and r.recipient_user_id is not null
  on conflict(relationship_id,recipient_user_id,terms_revision) do nothing;
  return new;
end; $$;
revoke all on function collaboration_private.snapshot_visible_compensation_terms_v3() from public,anon,authenticated,service_role;
create trigger compensation_terms_snapshot_visible_v3 after insert or update on collaboration_private.compensation_terms
  for each row execute function collaboration_private.snapshot_visible_compensation_terms_v3();

create function collaboration_private.snapshot_compensation_on_grant_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.compensation <= 0 then return new; end if;
  elsif new.compensation <= 0 or old.compensation > 0 then
    return new;
  end if;
  if new.compensation > 0 then
    insert into collaboration_private.compensation_recipient_terms_history(
      relationship_id,recipient_user_id,terms_revision,amount,currency,due_date,amount_revision,active
    )
    select r.id,r.recipient_user_id,t.terms_revision,t.amount,t.currency,t.due_date,t.amount_revision,t.active
    from public.wedding_collaboration_memberships m
    join collaboration_private.compensation_relationships r on r.wedding_id_snapshot=m.wedding_id_snapshot
      and r.owner_user_id=m.owner_user_id and r.recipient_user_id=m.member_user_id
    join collaboration_private.compensation_terms t on t.relationship_id=r.id
    where m.id=new.membership_id and r.recipient_user_id is not null
    on conflict(relationship_id,recipient_user_id,terms_revision) do nothing;
  end if;
  return new;
end; $$;
revoke all on function collaboration_private.snapshot_compensation_on_grant_v3() from public,anon,authenticated,service_role;
create trigger membership_area_access_snapshot_compensation_v3
  after insert or update of compensation on collaboration_private.membership_area_access
  for each row execute function collaboration_private.snapshot_compensation_on_grant_v3();

-- One relationship spans every membership period for a recipient/wedding.
insert into collaboration_private.compensation_relationships(
  wedding_id,wedding_id_snapshot,owner_user_id,recipient_user_id,recipient_label_snapshot,
  wedding_label_snapshot,wedding_date_snapshot,currency
)
select distinct on (m.wedding_id_snapshot,m.owner_user_id,m.member_user_id)
  m.wedding_id,m.wedding_id_snapshot,m.owner_user_id,m.member_user_id,
  coalesce(nullif(pg_catalog.btrim(u.name),''),'Współpracownik'),
  coalesce(nullif(pg_catalog.concat_ws(' ',nullif(pg_catalog.btrim(i.couple_first_name_snapshot),''),
    nullif(pg_catalog.btrim(i.couple_second_name_snapshot),'')),''),'Wesele'),
  i.wedding_date_snapshot,pg_catalog.upper(pg_catalog.btrim(i.currency_snapshot))
from public.wedding_collaboration_memberships m
join public.wedding_collaboration_invitations i on i.id=m.accepted_invitation_id
left join public.users u on u.id=m.member_user_id
where m.accepted_invitation_id is not null and m.owner_user_id is not null and m.member_user_id is not null
order by m.wedding_id_snapshot,m.owner_user_id,m.member_user_id,m.accepted_at,m.id
on conflict(wedding_id_snapshot,owner_user_id,recipient_user_id) where owner_user_id is not null and recipient_user_id is not null do nothing;

-- Preserve proposal snapshots, including explicit zero. No fallback or receipt
-- state is inferred from an invitation proposal.
insert into collaboration_private.compensation_terms(
  relationship_id,amount,currency,due_date,terms_revision,amount_revision,active
)
select r.id,i.proposed_share_amount,r.currency,null,1,1,true
from collaboration_private.compensation_relationships r
join lateral (
  select i.proposed_share_amount from public.wedding_collaboration_invitations i
  where i.wedding_id_snapshot=r.wedding_id_snapshot and i.owner_user_id=r.owner_user_id
    and i.invitee_user_id=r.recipient_user_id and i.status='accepted' and i.proposed_share_amount is not null
  order by i.accepted_at desc nulls last,i.id desc limit 1
) i on true
where not exists(select 1 from collaboration_private.compensation_terms t where t.relationship_id=r.id);
insert into collaboration_private.compensation_terms_history(
  relationship_id,terms_revision,amount,currency,due_date,amount_revision,active,actor_user_id
)
select t.relationship_id,t.terms_revision,t.amount,t.currency,t.due_date,t.amount_revision,t.active,r.owner_user_id
from collaboration_private.compensation_terms t
join collaboration_private.compensation_relationships r on r.id=t.relationship_id;
insert into collaboration_private.compensation_private_settings(relationship_id,recipient_user_id)
select r.id,r.recipient_user_id from collaboration_private.compensation_relationships r
on conflict do nothing;
insert into collaboration_private.compensation_private_settings_history(relationship_id,revision,recipient_user_id)
select s.relationship_id,1,s.recipient_user_id from collaboration_private.compensation_private_settings s;
insert into collaboration_private.compensation_private_state(relationship_id)
select r.id from collaboration_private.compensation_relationships r on conflict do nothing;

alter table public.payments
  add column received_by_user_id uuid references public.users(id) on delete set null,
  add column receiver_kind text,
  add column receiver_relationship_id uuid references collaboration_private.compensation_relationships(id) on delete set null,
  add column receiver_label_snapshot text,
  add column compensation_revision bigint not null default 1 check(compensation_revision>0);

-- Historical payments were owner-only; preserve that known attribution.
update public.payments p set received_by_user_id=w.user_id,
  receiver_kind='owner',receiver_label_snapshot=coalesce(nullif(pg_catalog.btrim(u.name),''),'Studio')
from public.weddings w left join public.users u on u.id=w.user_id
where p.wedding_id=w.id and p.payment_date is not null;
alter table public.payments add constraint payments_receiver_shape_check check (
  (payment_date is null and receiver_kind is null and receiver_relationship_id is null)
  or (payment_date is not null and receiver_kind in ('owner','collaborator')
      and ((receiver_kind='owner' and receiver_relationship_id is null)
        or (receiver_kind='collaborator' and receiver_relationship_id is not null)))
);
create index payments_receiver_relationship_idx on public.payments(receiver_relationship_id,payment_date)
  where receiver_relationship_id is not null and payment_date is not null;

create function collaboration_private.archive_deleted_wedding_client_receipts_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into collaboration_private.compensation_client_receipt_archive(
    relationship_id,source_payment_id,amount,received_on,label_snapshot
  )
  select p.receiver_relationship_id,p.id,p.amount,p.payment_date,
    coalesce(p.receiver_label_snapshot,r.recipient_label_snapshot,'Współpracownik')
  from public.payments p join collaboration_private.compensation_relationships r
    on r.id=p.receiver_relationship_id
  where p.wedding_id=old.id and p.payment_date is not null and p.receiver_relationship_id is not null
  on conflict(relationship_id,source_payment_id) do nothing;
  return old;
end; $$;
revoke all on function collaboration_private.archive_deleted_wedding_client_receipts_v3() from public,anon,authenticated,service_role;
create trigger weddings_archive_compensation_receipts_v3 before delete on public.weddings
  for each row execute function collaboration_private.archive_deleted_wedding_client_receipts_v3();

create function collaboration_private.validate_payment_receiver_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_rel collaboration_private.compensation_relationships%rowtype;
begin
  select w.user_id into v_owner from public.weddings w where w.id=new.wedding_id;
  if v_owner is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if new.payment_date is null then
    new.received_by_user_id:=null; new.receiver_kind:=null; new.receiver_relationship_id:=null; new.receiver_label_snapshot:=null;
  else
    if new.receiver_relationship_id is null then
      if new.received_by_user_id is not null and new.received_by_user_id is distinct from v_owner then
        raise exception using errcode='P0001',message='VALIDATION_ERROR';
      end if;
      new.received_by_user_id:=v_owner; new.receiver_kind:='owner';
      select coalesce(nullif(pg_catalog.btrim(u.name),''),'Studio') into new.receiver_label_snapshot
        from public.users u where u.id=v_owner;
    else
      select * into v_rel from collaboration_private.compensation_relationships r
        where r.id=new.receiver_relationship_id and r.wedding_id_snapshot=new.wedding_id
          and r.owner_user_id=v_owner and r.recipient_user_id=new.received_by_user_id;
      if not found then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
      if tg_op='INSERT' then
        if not exists(select 1 from public.wedding_collaboration_memberships m
          where m.wedding_id_snapshot=new.wedding_id and m.owner_user_id=v_owner
            and m.member_user_id=v_rel.recipient_user_id and m.status='active') then
          raise exception using errcode='P0001',message='VALIDATION_ERROR';
        end if;
      elsif old.receiver_relationship_id is distinct from new.receiver_relationship_id
        or old.received_by_user_id is distinct from new.received_by_user_id then
        if not exists(select 1 from public.wedding_collaboration_memberships m
          where m.wedding_id_snapshot=new.wedding_id and m.owner_user_id=v_owner
            and m.member_user_id=v_rel.recipient_user_id and m.status='active') then
          raise exception using errcode='P0001',message='VALIDATION_ERROR';
        end if;
      end if;
      if new.received_by_user_id is not null and new.received_by_user_id is distinct from v_rel.recipient_user_id then
        raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
      new.received_by_user_id:=v_rel.recipient_user_id;new.receiver_kind:='collaborator';
      new.receiver_label_snapshot:=v_rel.recipient_label_snapshot;
    end if;
  end if;
  if tg_op='UPDATE' then
    if old.type is distinct from new.type or old.amount is distinct from new.amount or old.payment_date is distinct from new.payment_date
      or old.method is distinct from new.method or old.note is distinct from new.note
      or old.received_by_user_id is distinct from new.received_by_user_id
      or old.receiver_kind is distinct from new.receiver_kind
      or old.receiver_relationship_id is distinct from new.receiver_relationship_id
      or old.receiver_label_snapshot is distinct from new.receiver_label_snapshot then
      new.compensation_revision:=old.compensation_revision+1;
    else
      new.compensation_revision:=old.compensation_revision;
    end if;
  end if;
  return new;
end; $$;
revoke all on function collaboration_private.validate_payment_receiver_v3() from public,anon,authenticated,service_role;
create trigger payments_validate_compensation_receiver_v3 before insert or update on public.payments
  for each row execute function collaboration_private.validate_payment_receiver_v3();

create function collaboration_private.ensure_compensation_relationship_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invite public.wedding_collaboration_invitations%rowtype; v_id uuid;
begin
  if new.accepted_invitation_id is null or new.owner_user_id is null or new.member_user_id is null then return new; end if;
  select * into v_invite from public.wedding_collaboration_invitations i where i.id=new.accepted_invitation_id;
  insert into collaboration_private.compensation_relationships(
    wedding_id,wedding_id_snapshot,owner_user_id,recipient_user_id,recipient_label_snapshot,
    wedding_label_snapshot,wedding_date_snapshot,currency
  ) values(new.wedding_id,new.wedding_id_snapshot,new.owner_user_id,new.member_user_id,
    coalesce((select nullif(pg_catalog.btrim(u.name),'') from public.users u where u.id=new.member_user_id),'Współpracownik'),
    coalesce(nullif(pg_catalog.concat_ws(' ',nullif(pg_catalog.btrim(v_invite.couple_first_name_snapshot),''),
      nullif(pg_catalog.btrim(v_invite.couple_second_name_snapshot),'')),''),'Wesele'),
    v_invite.wedding_date_snapshot,coalesce(pg_catalog.upper(pg_catalog.btrim(v_invite.currency_snapshot)),'PLN'))
  on conflict(wedding_id_snapshot,owner_user_id,recipient_user_id) where owner_user_id is not null and recipient_user_id is not null
  do update set wedding_id=excluded.wedding_id,updated_at=pg_catalog.now()
  returning id into v_id;
  insert into collaboration_private.compensation_private_settings(relationship_id,recipient_user_id)
    values(v_id,new.member_user_id) on conflict(relationship_id) do nothing;
  insert into collaboration_private.compensation_private_state(relationship_id) values(v_id) on conflict do nothing;
  if v_invite.proposed_share_amount is not null and not exists(
    select 1 from collaboration_private.compensation_terms t where t.relationship_id=v_id
  ) then
    insert into collaboration_private.compensation_terms(relationship_id,amount,currency,terms_revision,amount_revision,active)
      values(v_id,v_invite.proposed_share_amount,v_invite.currency_snapshot,1,1,true);
    insert into collaboration_private.compensation_terms_history(relationship_id,terms_revision,amount,currency,amount_revision,active,actor_user_id)
      values(v_id,1,v_invite.proposed_share_amount,v_invite.currency_snapshot,1,true,new.owner_user_id);
  end if;
  return new;
end; $$;
revoke all on function collaboration_private.ensure_compensation_relationship_v3() from public,anon,authenticated,service_role;
create trigger wedding_collaboration_seed_compensation_v3 after insert on public.wedding_collaboration_memberships
  for each row execute function collaboration_private.ensure_compensation_relationship_v3();

create function collaboration_private.erase_recipient_private_compensation_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from collaboration_private.compensation_private_receipts x where x.recipient_user_id=old.id;
  delete from collaboration_private.compensation_private_settings_history h where h.recipient_user_id=old.id;
  delete from collaboration_private.compensation_private_settings s where s.recipient_user_id=old.id;
  delete from collaboration_private.compensation_recipient_terms_history h where h.recipient_user_id=old.id;
  update collaboration_private.compensation_client_receipt_archive a set label_snapshot='Współpracownik'
    where exists(select 1 from collaboration_private.compensation_relationships r
      where r.id=a.relationship_id and r.recipient_user_id=old.id);
  update collaboration_private.compensation_relationships r set recipient_label_snapshot='Współpracownik',updated_at=pg_catalog.now()
    where r.recipient_user_id=old.id;
  update public.payments set receiver_label_snapshot='Współpracownik' where received_by_user_id=old.id;
  return old;
end; $$;
revoke all on function collaboration_private.erase_recipient_private_compensation_v3() from public,anon,authenticated,service_role;
create trigger users_erase_private_compensation_v3 before delete on public.users
  for each row execute function collaboration_private.erase_recipient_private_compensation_v3();

create function public.list_wedding_payment_receivers_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null or not exists(select 1 from public.weddings w where w.id=p_wedding_id and w.user_id=v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select pg_catalog.jsonb_build_object('owner_user_id',v_actor,'owner_label',
    coalesce((select nullif(pg_catalog.btrim(u.name),'') from public.users u where u.id=v_actor),'Studio'),
    'collaborators',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id',r.recipient_user_id,'relationship_id',r.id,'label',r.recipient_label_snapshot)
      order by r.recipient_label_snapshot,r.id)
      from collaboration_private.compensation_relationships r
      where r.wedding_id_snapshot=p_wedding_id and r.owner_user_id=v_actor and r.recipient_user_id is not null
        and exists(select 1 from public.wedding_collaboration_memberships m where m.wedding_id_snapshot=p_wedding_id
          and m.member_user_id=r.recipient_user_id and m.owner_user_id=v_actor and m.status='active')),'[]'::jsonb)) into v_result;
  return v_result;
end; $$;

create function public.get_owner_compensation_relationships_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null or not exists(select 1 from public.weddings w where w.id=p_wedding_id and w.user_id=v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relationship_id',r.id,'recipient_user_id',r.recipient_user_id,'recipient_label',r.recipient_label_snapshot,
    'active_membership',exists(select 1 from public.wedding_collaboration_memberships m where m.wedding_id_snapshot=r.wedding_id_snapshot
      and m.owner_user_id=v_actor and m.member_user_id=r.recipient_user_id and m.status='active'),
    'amount',t.amount,'currency',t.currency,'due_date',t.due_date,'active',t.active,
    'terms_revision',coalesce(t.terms_revision,0)::text,'amount_revision',coalesce(t.amount_revision,0)::text)
    order by r.recipient_label_snapshot,r.id),'[]'::jsonb) into v_result
  from collaboration_private.compensation_relationships r
  left join collaboration_private.compensation_terms t on t.relationship_id=r.id
  where r.wedding_id_snapshot=p_wedding_id and r.owner_user_id=v_actor and r.recipient_user_id is not null;
  return v_result;
end; $$;

create function public.mutate_owner_compensation_terms_v3(
  p_relationship_id uuid,p_expected_terms_revision text,p_amount numeric,p_due_date date,p_active boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_rel collaboration_private.compensation_relationships%rowtype;
  v_old collaboration_private.compensation_terms%rowtype; v_terms_revision bigint; v_amount_revision bigint;
begin
  select * into v_rel from collaboration_private.compensation_relationships r where r.id=p_relationship_id
    and r.owner_user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_terms_revision is null or p_expected_terms_revision !~ '^(0|[1-9][0-9]*)$'
    or pg_catalog.char_length(p_expected_terms_revision)>19 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select * into v_old from collaboration_private.compensation_terms t where t.relationship_id=v_rel.id for update;
  if not found then
    if p_expected_terms_revision<>'0' then raise exception using errcode='P0001',message='CONFLICT'; end if;
    if p_amount is null or p_amount<0 or p_active is null then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_terms_revision:=1;v_amount_revision:=1;
    insert into collaboration_private.compensation_terms(relationship_id,amount,currency,due_date,terms_revision,amount_revision,active)
      values(v_rel.id,p_amount,v_rel.currency,p_due_date,1,1,p_active);
  else
    if p_expected_terms_revision::numeric<>v_old.terms_revision::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
    if p_amount is null or p_amount<0 or p_active is null then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_terms_revision:=v_old.terms_revision+1;
    v_amount_revision:=v_old.amount_revision+case when p_amount is distinct from v_old.amount or p_active is distinct from v_old.active then 1 else 0 end;
    update collaboration_private.compensation_terms set amount=p_amount,due_date=p_due_date,active=p_active,
      terms_revision=v_terms_revision,amount_revision=v_amount_revision,updated_at=pg_catalog.now() where relationship_id=v_rel.id;
  end if;
  insert into collaboration_private.compensation_terms_history(relationship_id,terms_revision,amount,currency,due_date,amount_revision,active,actor_user_id)
  select relationship_id,terms_revision,amount,currency,due_date,amount_revision,active,v_actor
    from collaboration_private.compensation_terms where relationship_id=v_rel.id;
  return pg_catalog.jsonb_build_object('relationship_id',v_rel.id,'amount',p_amount,'currency',v_rel.currency,
    'due_date',p_due_date,'active',p_active,'terms_revision',v_terms_revision::text,'amount_revision',v_amount_revision::text);
end; $$;

create function public.get_my_collaborative_compensation_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_rel collaboration_private.compensation_relationships%rowtype;
  v_level smallint; v_m public.wedding_collaboration_memberships%rowtype; v_term collaboration_private.compensation_terms%rowtype;
begin
  select * into v_m from public.wedding_collaboration_memberships m where m.wedding_id_snapshot=p_wedding_id
    and m.member_user_id=v_actor and m.status='active' order by m.accepted_at desc,m.id desc limit 1;
  if found then
    select a.compensation into v_level from collaboration_private.membership_area_access a where a.membership_id=v_m.id;
    select * into v_rel from collaboration_private.compensation_relationships r where r.wedding_id_snapshot=p_wedding_id
      and r.owner_user_id=v_m.owner_user_id and r.recipient_user_id=v_actor;
  else
    select * into v_rel from collaboration_private.compensation_relationships r where r.wedding_id_snapshot=p_wedding_id
      and r.recipient_user_id=v_actor order by r.updated_at desc limit 1;
    v_level:=0;
  end if;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_term from collaboration_private.compensation_terms t where t.relationship_id=v_rel.id and t.active;
  return pg_catalog.jsonb_build_object('relationship_id',v_rel.id,'wedding_id',v_rel.wedding_id_snapshot,
    'currency',v_rel.currency,'access_version',case when v_m.id is null then null else v_m.access_version::text end,
    'compensation_level',coalesce(v_level,0),
    'official_terms',case when v_m.id is not null and coalesce(v_level,0)>0 and found then pg_catalog.jsonb_build_object(
      'amount',v_term.amount,'currency',v_term.currency,'due_date',v_term.due_date,
      'terms_revision',v_term.terms_revision::text,'amount_revision',v_term.amount_revision::text) else null end);
end; $$;

create function public.get_my_private_compensation_v3(p_relationship_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_rel collaboration_private.compensation_relationships%rowtype;
  v_settings collaboration_private.compensation_private_settings%rowtype; v_level smallint:=0;
  v_m public.wedding_collaboration_memberships%rowtype; v_snapshot record;
  v_official collaboration_private.compensation_terms%rowtype; v_client numeric(14,2); v_private numeric(14,2); v_value numeric(12,2);
  v_known boolean:=false; v_source text:='unknown'; v_revision bigint;
begin
  select * into v_rel from collaboration_private.compensation_relationships r
    where r.id=p_relationship_id and r.recipient_user_id=v_actor;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_settings from collaboration_private.compensation_private_settings s where s.relationship_id=v_rel.id;
  select m.* into v_m from public.wedding_collaboration_memberships m
    where m.wedding_id_snapshot=v_rel.wedding_id_snapshot and m.owner_user_id=v_rel.owner_user_id
      and m.member_user_id=v_actor and m.status='active' order by m.accepted_at desc,m.id desc limit 1;
  if found then
    select a.compensation into v_level from collaboration_private.membership_area_access a
    where a.membership_id=v_m.id;
  end if;
  if coalesce(v_level,0)>0 then select * into v_official from collaboration_private.compensation_terms t where t.relationship_id=v_rel.id and t.active; end if;
  select coalesce(sum(amount),0) into v_client from (
    select p.amount from public.payments p where p.receiver_relationship_id=v_rel.id and p.payment_date is not null
    union all
    select a.amount from collaboration_private.compensation_client_receipt_archive a where a.relationship_id=v_rel.id
  ) received;
  select coalesce(sum(x.amount),0) into v_private from collaboration_private.compensation_private_receipts x
    where x.relationship_id=v_rel.id and x.recipient_user_id=v_actor;
  if v_m.id is null then
    select h.terms_revision,h.amount,h.currency,h.due_date,h.amount_revision,h.active into v_snapshot
    from collaboration_private.compensation_recipient_terms_history h
      where h.relationship_id=v_rel.id and h.recipient_user_id=v_actor
      order by h.visible_at desc,h.terms_revision desc limit 1;
    if found then
      v_official.relationship_id:=v_rel.id;v_official.terms_revision:=v_snapshot.terms_revision;
      v_official.amount:=v_snapshot.amount;v_official.currency:=v_snapshot.currency;
      v_official.due_date:=v_snapshot.due_date;v_official.amount_revision:=v_snapshot.amount_revision;
      v_official.active:=v_snapshot.active;
    end if;
  end if;
  if v_official.relationship_id is not null and v_official.active then
    v_known:=true; v_value:=v_official.amount;v_source:='official_compensation';
  elsif v_settings.fallback_amount is not null then v_known:=true;v_value:=v_settings.fallback_amount;v_source:='private_fallback'; end if;
  select revision into v_revision from collaboration_private.compensation_private_state s where s.relationship_id=v_rel.id;
  return pg_catalog.jsonb_build_object('relationship_id',v_rel.id,'wedding_snapshot',v_rel.wedding_id_snapshot,
    'wedding_label',v_rel.wedding_label_snapshot,'wedding_date',v_rel.wedding_date_snapshot,
    'recipient_label',v_rel.recipient_label_snapshot,'currency',v_rel.currency,'personal_value_known',v_known,
    'personal_value',v_value,'value_source',v_source,
    'due_date',case when v_source='official_compensation' then v_official.due_date else v_settings.fallback_due_date end,
    'client_received_total',v_client,'private_received_total',v_private,'received_total',v_client+v_private,
    'balance_known',v_known,'balance',case when v_known then v_value-v_client-v_private else null end,
    'fallback_amount',v_settings.fallback_amount,'fallback_due_date',v_settings.fallback_due_date,
    'private_revision',coalesce(v_revision,1)::text,'terms_revision',case when v_source='official_compensation' then v_official.terms_revision::text else null end,
    'active_membership',exists(select 1 from public.wedding_collaboration_memberships m where m.wedding_id_snapshot=v_rel.wedding_id_snapshot
      and m.owner_user_id=v_rel.owner_user_id and m.member_user_id=v_actor and m.status='active'),
    'private_receipts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',x.id,'amount',x.amount,
      'received_on',x.received_on,'description',x.description,'revision',x.revision::text)
      order by x.received_on,x.created_at,x.id) from collaboration_private.compensation_private_receipts x
      where x.relationship_id=v_rel.id and x.recipient_user_id=v_actor),'[]'::jsonb),
    'client_receipts',coalesce((select pg_catalog.jsonb_agg(x.item order by x.received_on,x.source_id)
      from (select pg_catalog.jsonb_build_object('payment_id',p.id,'amount',p.amount,'received_on',p.payment_date,
          'label',p.receiver_label_snapshot,'source','client_payment') item,p.payment_date received_on,p.id source_id
        from public.payments p where p.receiver_relationship_id=v_rel.id and p.payment_date is not null
       union all
       select pg_catalog.jsonb_build_object('payment_id',a.source_payment_id,'amount',a.amount,'received_on',a.received_on,
          'label',a.label_snapshot,'source','client_payment') item,a.received_on,a.source_payment_id
        from collaboration_private.compensation_client_receipt_archive a where a.relationship_id=v_rel.id) x),'[]'::jsonb));
end; $$;

create function public.mutate_my_private_compensation_settings_v3(
  p_relationship_id uuid,p_expected_revision text,p_fallback_amount numeric,p_fallback_due_date date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_rel collaboration_private.compensation_relationships%rowtype;
  v_s collaboration_private.compensation_private_settings%rowtype;v_revision bigint;
begin
  select * into v_rel from collaboration_private.compensation_relationships r where r.id=p_relationship_id and r.recipient_user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_s from collaboration_private.compensation_private_settings s where s.relationship_id=v_rel.id for update;
  select revision into v_revision from collaboration_private.compensation_private_state s where s.relationship_id=v_rel.id for update;
  if p_expected_revision is null or p_expected_revision !~ '^[1-9][0-9]*$' or p_expected_revision::numeric<>v_revision::numeric
    then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_fallback_amount<0 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  update collaboration_private.compensation_private_settings set fallback_amount=p_fallback_amount,
    fallback_due_date=p_fallback_due_date,updated_at=pg_catalog.now() where relationship_id=v_rel.id;
  insert into collaboration_private.compensation_private_settings_history(relationship_id,revision,fallback_amount,fallback_due_date,recipient_user_id)
    select relationship_id,v_revision+1,fallback_amount,fallback_due_date,recipient_user_id
    from collaboration_private.compensation_private_settings where relationship_id=v_rel.id;
  update collaboration_private.compensation_private_state set revision=revision+1,updated_at=pg_catalog.now() where relationship_id=v_rel.id;
  return pg_catalog.jsonb_build_object('fallback_amount',p_fallback_amount,'fallback_due_date',p_fallback_due_date,'revision',(v_revision+1)::text);
end; $$;

create function public.create_my_private_compensation_receipt_v3(
  p_relationship_id uuid,p_amount numeric,p_received_on date,p_description text,p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_rel collaboration_private.compensation_relationships%rowtype; v_rev bigint; v_id uuid;
begin
  select * into v_rel from collaboration_private.compensation_relationships r where r.id=p_relationship_id and r.recipient_user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select revision into v_rev from collaboration_private.compensation_private_state s where s.relationship_id=v_rel.id for update;
  if p_expected_revision is null or p_expected_revision !~ '^[1-9][0-9]*$' or p_expected_revision::numeric<>v_rev::numeric
    then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_amount is null or p_amount<=0 or p_received_on is null or p_description is not null and pg_catalog.char_length(p_description)>160
    then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  insert into collaboration_private.compensation_private_receipts(relationship_id,recipient_user_id,amount,received_on,description)
    values(v_rel.id,v_actor,p_amount,p_received_on,nullif(pg_catalog.btrim(p_description),'')) returning id into v_id;
  update collaboration_private.compensation_private_state set revision=revision+1,updated_at=pg_catalog.now() where relationship_id=v_rel.id;
  return pg_catalog.jsonb_build_object('receipt_id',v_id,'revision',(v_rev+1)::text);
end; $$;

create function public.delete_my_private_compensation_receipt_v3(
  p_receipt_id uuid,p_expected_receipt_revision text,p_expected_private_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_rel_id uuid; v_state_revision bigint; v_receipt_revision bigint;
begin
  select x.relationship_id,x.revision into v_rel_id,v_receipt_revision
  from collaboration_private.compensation_private_receipts x
  where x.id=p_receipt_id and x.recipient_user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform 1 from collaboration_private.compensation_relationships r where r.id=v_rel_id and r.recipient_user_id=v_actor for update;
  select revision into v_state_revision from collaboration_private.compensation_private_state s where s.relationship_id=v_rel_id for update;
  if p_expected_receipt_revision is null or p_expected_receipt_revision !~ '^[1-9][0-9]*$'
    or p_expected_receipt_revision::numeric<>v_receipt_revision::numeric
    or p_expected_private_revision is null or p_expected_private_revision !~ '^[1-9][0-9]*$'
    or p_expected_private_revision::numeric<>v_state_revision::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  delete from collaboration_private.compensation_private_receipts where id=p_receipt_id;
  update collaboration_private.compensation_private_state set revision=revision+1,updated_at=pg_catalog.now() where relationship_id=v_rel_id;
  return pg_catalog.jsonb_build_object('deleted',true,'private_revision',(v_state_revision+1)::text);
end; $$;

create function public.mutate_my_shared_compensation_terms_v3(
  p_wedding_id uuid,p_expected_access_version text,p_expected_terms_revision text,
  p_amount numeric,p_due_date date,p_active boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_m public.wedding_collaboration_memberships%rowtype;
  v_level smallint; v_rel collaboration_private.compensation_relationships%rowtype; v_old collaboration_private.compensation_terms%rowtype;
  v_tr bigint;v_ar bigint;
begin
  select * into v_m from public.wedding_collaboration_memberships m where m.wedding_id_snapshot=p_wedding_id
    and m.member_user_id=v_actor and m.status='active' order by m.accepted_at desc,m.id desc limit 1 for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select compensation into v_level from collaboration_private.membership_area_access a where a.membership_id=v_m.id;
  if coalesce(v_level,0)<2 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if p_expected_access_version is null or p_expected_access_version !~ '^[1-9][0-9]*$'
    or p_expected_access_version::numeric<>v_m.access_version::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  select * into v_rel from collaboration_private.compensation_relationships r where r.wedding_id_snapshot=p_wedding_id
    and r.owner_user_id=v_m.owner_user_id and r.recipient_user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_old from collaboration_private.compensation_terms t where t.relationship_id=v_rel.id for update;
  if p_expected_terms_revision is null or p_expected_terms_revision !~ '^(0|[1-9][0-9]*)$'
    or p_expected_terms_revision::numeric<>(case when v_old.relationship_id is null then 0 else v_old.terms_revision::numeric end) then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_amount is null or p_amount<0 or p_active is null then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_tr:=coalesce(v_old.terms_revision,0)+1;
  v_ar:=coalesce(v_old.amount_revision,0)+case when p_amount is distinct from v_old.amount or p_active is distinct from v_old.active then 1 else 0 end;
  if v_old.relationship_id is null then
    insert into collaboration_private.compensation_terms(relationship_id,amount,currency,due_date,terms_revision,amount_revision,active)
      values(v_rel.id,p_amount,v_rel.currency,p_due_date,v_tr,v_ar,p_active);
  else
    update collaboration_private.compensation_terms set amount=p_amount,due_date=p_due_date,active=p_active,
      terms_revision=v_tr,amount_revision=v_ar,updated_at=pg_catalog.now() where relationship_id=v_rel.id;
  end if;
  insert into collaboration_private.compensation_terms_history(relationship_id,terms_revision,amount,currency,due_date,amount_revision,active,actor_user_id)
  select relationship_id,terms_revision,amount,currency,due_date,amount_revision,active,v_actor
    from collaboration_private.compensation_terms where relationship_id=v_rel.id;
  return pg_catalog.jsonb_build_object('amount',p_amount,'currency',v_rel.currency,'due_date',p_due_date,
    'active',p_active,'terms_revision',v_tr::text,'amount_revision',v_ar::text);
end; $$;

create function public.get_my_personal_compensation_values_v3(p_wedding_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  with owned as (
    select w.id,w.contract_value,w.currency,w.wedding_date,w.status,w.bride_name,w.groom_name,w.display_name,
      coalesce(sum(t.amount) filter(where t.active),0)::numeric(14,2) official_total
    from public.weddings w left join collaboration_private.compensation_relationships r
      on r.wedding_id_snapshot=w.id and r.owner_user_id=v_actor
    left join collaboration_private.compensation_terms t on t.relationship_id=r.id
    where w.user_id=v_actor and (p_wedding_ids is null or w.id=any(p_wedding_ids))
    group by w.id
  ), shared as (
    select r.wedding_id_snapshot id,r.wedding_label_snapshot,r.wedding_date_snapshot,w.wedding_date,
      w.status,w.currency,a.compensation,t.amount official_amount,s.fallback_amount,
      coalesce(t.amount,fh.amount) visible_official_amount,
      coalesce(t.active,fh.active,false) visible_official_active,
      coalesce(sum(p.amount) filter(where p.payment_date is not null),0)
        + coalesce((select sum(ar.amount) from collaboration_private.compensation_client_receipt_archive ar
          where ar.relationship_id=r.id),0)
        + coalesce((select sum(x.amount) from collaboration_private.compensation_private_receipts x
          where x.relationship_id=r.id and x.recipient_user_id=v_actor),0) received_total,
      exists(select 1 from public.wedding_collaboration_memberships ma where ma.wedding_id_snapshot=r.wedding_id_snapshot
        and ma.owner_user_id=r.owner_user_id and ma.member_user_id=v_actor and ma.status='active') active_membership,
      r.id relationship_id
    from collaboration_private.compensation_relationships r
    left join public.weddings w on w.id=r.wedding_id
    left join lateral (
      select m.id,m.access_version from public.wedding_collaboration_memberships m
      where m.wedding_id_snapshot=r.wedding_id_snapshot and m.owner_user_id=r.owner_user_id
        and m.member_user_id=v_actor and m.status='active'
      order by m.accepted_at desc,m.id desc limit 1
    ) m on true
    left join collaboration_private.membership_area_access a on a.membership_id=m.id
    left join collaboration_private.compensation_terms t on t.relationship_id=r.id and t.active
    left join collaboration_private.compensation_private_settings s on s.relationship_id=r.id and s.recipient_user_id=v_actor
    left join lateral (
      select h.amount,h.active from collaboration_private.compensation_recipient_terms_history h
      where h.relationship_id=r.id and h.recipient_user_id=v_actor
      order by h.visible_at desc,h.terms_revision desc limit 1
    ) fh on m.id is null
    left join public.payments p on p.receiver_relationship_id=r.id and p.payment_date is not null
    where r.recipient_user_id=v_actor and r.owner_user_id is distinct from v_actor
      and (p_wedding_ids is null or r.wedding_id_snapshot=any(p_wedding_ids))
    group by r.id,w.id,a.compensation,t.amount,t.active,fh.amount,fh.active,s.fallback_amount
  )
  select coalesce(pg_catalog.jsonb_agg(item),'[]'::jsonb) into v_result from (
    select pg_catalog.jsonb_build_object('wedding_id',o.id,'wedding_label',coalesce(nullif(pg_catalog.btrim(o.display_name),''),
        nullif(pg_catalog.concat_ws(' ',nullif(pg_catalog.btrim(o.bride_name),''),nullif(pg_catalog.btrim(o.groom_name),'')),''),'Wesele'),
      'wedding_date',o.wedding_date,'status',o.status,'collaborative',false,'value_known',o.contract_value is not null,
      'personal_value',case when o.contract_value is null then null else o.contract_value-o.official_total end,
      'currency',o.currency,'source','owner_net','received_total',null,'balance',null,'balance_known',false) item from owned o
      where o.status in ('active','archived')
    union all
    select pg_catalog.jsonb_build_object('wedding_id',s.id,
      'wedding_label',s.wedding_label_snapshot,'wedding_date',coalesce(s.wedding_date_snapshot,s.wedding_date),
      'status',coalesce(s.status,'archived'),'collaborative',true,'relationship_id',s.relationship_id,
      'value_known',case when s.active_membership and coalesce(s.compensation,0)>0 and s.official_amount is not null then true
        when not s.active_membership and s.visible_official_active then true else s.fallback_amount is not null end,
      'personal_value',case when s.active_membership and coalesce(s.compensation,0)>0 and s.official_amount is not null then s.official_amount
        when not s.active_membership and s.visible_official_active then s.visible_official_amount else s.fallback_amount end,
      'currency',s.currency,'source',case when s.active_membership and coalesce(s.compensation,0)>0 and s.official_amount is not null then 'official_compensation'
        when not s.active_membership and s.visible_official_active then 'official_compensation'
        when s.fallback_amount is not null then 'private_fallback' else 'unknown' end,
      'received_total',s.received_total,'balance',case when
        (s.active_membership and coalesce(s.compensation,0)>0 and s.official_amount is not null)
        or (not s.active_membership and s.visible_official_active) then s.visible_official_amount-s.received_total
        when s.fallback_amount is not null then s.fallback_amount-s.received_total else null end,
      'balance_known',case when s.active_membership and coalesce(s.compensation,0)>0 and s.official_amount is not null then true
        when not s.active_membership and s.visible_official_active then true else s.fallback_amount is not null end) item
      from shared s where coalesce(s.status,'archived') in ('active','archived')
  ) values;
  return v_result;
end; $$;

-- Replace invitation preview/list projections so Compensation=0 never reveals
-- whether an official proposal exists. Full lifecycle logic stays unchanged.
create function collaboration_private.invitation_compensation_visible_v3(p_invitation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.compensation>0 from collaboration_private.invitation_area_access a
    where a.invitation_id=p_invitation_id),false)
$$;
revoke all on function collaboration_private.invitation_compensation_visible_v3(uuid) from public,anon,authenticated,service_role;

alter function public.get_wedding_collaboration_invitation_preview(uuid)
  rename to get_wedding_collaboration_invitation_preview_legacy_v3;
revoke all on function public.get_wedding_collaboration_invitation_preview_legacy_v3(uuid)
  from public,anon,authenticated,service_role;
create function public.get_wedding_collaboration_invitation_preview(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;v_visible boolean;
begin
  v_result:=public.get_wedding_collaboration_invitation_preview_legacy_v3(p_invitation_id);
  if v_result is null then return null; end if;
  v_visible:=collaboration_private.invitation_compensation_visible_v3((v_result->>'invitation_id')::uuid);
  v_result:=v_result-'contract_value';
  if not v_visible then v_result:=v_result||pg_catalog.jsonb_build_object('proposed_share_amount',null); end if;
  return v_result;
end; $$;

alter function public.list_my_wedding_collaboration_invitations()
  rename to list_my_wedding_collaboration_invitations_legacy_v3;
revoke all on function public.list_my_wedding_collaboration_invitations_legacy_v3()
  from public,anon,authenticated,service_role;
create function public.list_my_wedding_collaboration_invitations()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb;v_item jsonb;v_items jsonb:='[]'::jsonb;v_visible boolean;
begin
  v_rows:=public.list_my_wedding_collaboration_invitations_legacy_v3();
  for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(v_rows,'[]'::jsonb)) loop
    v_visible:=collaboration_private.invitation_compensation_visible_v3((v_item->>'invitation_id')::uuid);
    v_item:=v_item-'contract_value';
    if not v_visible then v_item:=v_item||pg_catalog.jsonb_build_object('proposed_share_amount',null); end if;
    v_items:=v_items||pg_catalog.jsonb_build_array(v_item);
  end loop;
  return v_items;
end; $$;

revoke all on function public.list_wedding_payment_receivers_v3(uuid) from public,anon,service_role;
revoke all on function public.get_owner_compensation_relationships_v3(uuid) from public,anon,service_role;
revoke all on function public.mutate_owner_compensation_terms_v3(uuid,text,numeric,date,boolean) from public,anon,service_role;
revoke all on function public.get_my_collaborative_compensation_v3(uuid) from public,anon,service_role;
revoke all on function public.get_my_private_compensation_v3(uuid) from public,anon,service_role;
revoke all on function public.mutate_my_private_compensation_settings_v3(uuid,text,numeric,date) from public,anon,service_role;
revoke all on function public.create_my_private_compensation_receipt_v3(uuid,numeric,date,text,text) from public,anon,service_role;
revoke all on function public.delete_my_private_compensation_receipt_v3(uuid,text,text) from public,anon,service_role;
revoke all on function public.mutate_my_shared_compensation_terms_v3(uuid,text,text,numeric,date,boolean) from public,anon,service_role;
revoke all on function public.get_my_personal_compensation_values_v3(uuid[]) from public,anon,service_role;
revoke all on function public.get_wedding_collaboration_invitation_preview(uuid) from public,anon,service_role;
revoke all on function public.list_my_wedding_collaboration_invitations() from public,anon,service_role;
grant execute on function public.list_wedding_payment_receivers_v3(uuid) to authenticated;
grant execute on function public.get_owner_compensation_relationships_v3(uuid) to authenticated;
grant execute on function public.mutate_owner_compensation_terms_v3(uuid,text,numeric,date,boolean) to authenticated;
grant execute on function public.get_my_collaborative_compensation_v3(uuid) to authenticated;
grant execute on function public.get_my_private_compensation_v3(uuid) to authenticated;
grant execute on function public.mutate_my_private_compensation_settings_v3(uuid,text,numeric,date) to authenticated;
grant execute on function public.create_my_private_compensation_receipt_v3(uuid,numeric,date,text,text) to authenticated;
grant execute on function public.delete_my_private_compensation_receipt_v3(uuid,text,text) to authenticated;
grant execute on function public.mutate_my_shared_compensation_terms_v3(uuid,text,text,numeric,date,boolean) to authenticated;
grant execute on function public.get_my_personal_compensation_values_v3(uuid[]) to authenticated;
grant execute on function public.get_wedding_collaboration_invitation_preview(uuid) to authenticated;
grant execute on function public.list_my_wedding_collaboration_invitations() to authenticated;

commit;
