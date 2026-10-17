-- Collaboration V3 Notes: revisioned canonical notes with narrow owner/shared writes.
begin;

alter table public.notes
  add column revision bigint not null default 1 check (revision > 0);

create function collaboration_private.bump_note_revision_v3()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end $$;
revoke all on function collaboration_private.bump_note_revision_v3() from public,anon,authenticated,service_role;
create trigger notes_bump_revision_v3 before insert or update on public.notes
for each row execute function collaboration_private.bump_note_revision_v3();

create function collaboration_private.note_projection_v3(p_note public.notes)
returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id',(p_note).id,'author',(p_note).author,
    'content',(p_note).content,'pinned',(p_note).pinned,
    'created_at',(p_note).created_at,'revision',(p_note).revision::text)
$$;
revoke all on function collaboration_private.note_projection_v3(public.notes) from public,anon,authenticated,service_role;

create function collaboration_private.require_shared_notes_edit_v3(
  p_wedding_id uuid,p_access_version text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_owner uuid; v_membership public.wedding_collaboration_memberships%rowtype; v_level smallint;
begin
  if auth.uid() is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' is distinct from 'collaborator'
    or v_context->>'permission_group_mapping_version' is distinct from '3' then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  -- Keep lifecycle lock order: wedding, membership, then note.
  select w.user_id into v_owner from public.weddings w
    where w.id=p_wedding_id and w.status='active' for key share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select m.* into v_membership from public.wedding_collaboration_memberships m
    where m.id=(v_context->>'membership_id')::uuid and m.wedding_id=p_wedding_id
      and m.owner_user_id=v_owner and m.member_user_id=auth.uid() and m.status='active'
      and m.permission_group_mapping_version='3' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_access_version is null or pg_catalog.char_length(p_access_version)>19
    or p_access_version !~ '^[1-9][0-9]*$'
    or p_access_version::numeric<>v_membership.access_version::numeric then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'notes');
  if v_level is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_level=0 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if v_level<2 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  return pg_catalog.jsonb_build_object('owner_user_id',v_owner,'access_version',v_membership.access_version::text);
end $$;
revoke all on function collaboration_private.require_shared_notes_edit_v3(uuid,text) from public,anon,authenticated,service_role;

create function collaboration_private.require_owner_notes_edit_v3(p_wedding_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if auth.uid() is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select w.user_id into v_owner from public.weddings w
    where w.id=p_wedding_id and w.status='active' for key share;
  if not found or v_owner is distinct from auth.uid() then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  if not public.account_has_pro_access() then
    raise exception using errcode='42501',message='pro_required';
  end if;
  return v_owner;
end $$;
revoke all on function collaboration_private.require_owner_notes_edit_v3(uuid) from public,anon,authenticated,service_role;

create function public.get_my_owned_wedding_notes_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_notes jsonb;
begin
  if auth.uid() is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  if not exists(select 1 from public.weddings w
      where w.id=p_wedding_id and w.user_id=auth.uid() and w.status='active') then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',n.id,'wedding_id',n.wedding_id,'author',n.author,'content',n.content,
      'pinned',n.pinned,'created_at',n.created_at,'revision',n.revision::text)
      order by n.pinned desc,n.created_at desc,n.id),'[]'::jsonb)
    into v_notes
    from public.notes n
    where n.wedding_id=p_wedding_id;
  return v_notes;
end $$;
revoke all on function public.get_my_owned_wedding_notes_v3(uuid) from public,anon,service_role;
grant execute on function public.get_my_owned_wedding_notes_v3(uuid) to authenticated;

create function public.get_my_collaborative_wedding_notes_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_owner uuid; v_level smallint; v_notes jsonb;
begin
  if auth.uid() is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' is distinct from 'collaborator'
    or v_context->>'permission_group_mapping_version' is distinct from '3' then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select w.user_id into v_owner from public.weddings w
    where w.id=p_wedding_id and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'notes');
  if v_level is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_level=0 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  select coalesce(pg_catalog.jsonb_agg(collaboration_private.note_projection_v3(n)
    order by n.pinned desc,n.created_at desc,n.id),'[]'::jsonb)
    into v_notes from public.notes n
    where n.wedding_id=p_wedding_id
      and exists(select 1 from public.weddings w where w.id=n.wedding_id and w.user_id=v_owner and w.status='active');
  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,
    'access_version',v_context->>'access_version','notes_level',v_level,'notes',v_notes);
end $$;
revoke all on function public.get_my_collaborative_wedding_notes_v3(uuid) from public,anon,service_role;
grant execute on function public.get_my_collaborative_wedding_notes_v3(uuid) to authenticated;

create function public.create_my_collaborative_wedding_note_v3(
  p_wedding_id uuid,p_access_version text,p_content text,p_pinned boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth jsonb; v_owner uuid; v_author text; v_note public.notes%rowtype; v_content text;
begin
  v_auth:=collaboration_private.require_shared_notes_edit_v3(p_wedding_id,p_access_version);
  v_owner:=(v_auth->>'owner_user_id')::uuid;
  v_content:=pg_catalog.btrim(coalesce(p_content,''));
  if v_content='' or p_pinned is null then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  select nullif(pg_catalog.btrim(concat_ws(' ',nullif(pg_catalog.btrim(p.first_name),''),nullif(pg_catalog.btrim(p.last_name),''))), '')
    into v_author from public.profiles p where p.id=auth.uid();
  if v_author is null then
    select nullif(pg_catalog.btrim(u.name), '') into v_author from public.users u where u.id=auth.uid();
  end if;
  if v_author is null then
    select nullif(pg_catalog.split_part(a.email,'@',1),'') into v_author from auth.users a where a.id=auth.uid();
  end if;
  insert into public.notes(wedding_id,author,content,pinned)
    values(p_wedding_id,coalesce(v_author,'Collaborator'),v_content,p_pinned) returning * into v_note;
  return collaboration_private.note_projection_v3(v_note);
end $$;
revoke all on function public.create_my_collaborative_wedding_note_v3(uuid,text,text,boolean) from public,anon,service_role;
grant execute on function public.create_my_collaborative_wedding_note_v3(uuid,text,text,boolean) to authenticated;

create function public.mutate_my_collaborative_wedding_note_v3(
  p_action text,p_wedding_id uuid,p_access_version text,p_note_id uuid default null,
  p_expected_revision text default null,p_content text default null,p_pinned boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth jsonb; v_owner uuid; v_note public.notes%rowtype; v_next public.notes%rowtype; v_content text;
begin
  if p_action is null or p_action not in ('update','delete') then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_auth:=collaboration_private.require_shared_notes_edit_v3(p_wedding_id,p_access_version);
  v_owner:=(v_auth->>'owner_user_id')::uuid;
  if p_note_id is null or p_expected_revision is null or pg_catalog.char_length(p_expected_revision)>19
    or p_expected_revision !~ '^[1-9][0-9]*$' then raise exception using errcode='P0001',message='CONFLICT'; end if;
  select n.* into v_note from public.notes n join public.weddings w on w.id=n.wedding_id
    where n.id=p_note_id and n.wedding_id=p_wedding_id and w.user_id=v_owner and w.status='active' for update of n;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_revision::numeric<>v_note.revision::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_action='delete' then
    delete from public.notes n where n.id=v_note.id and n.wedding_id=p_wedding_id;
    return pg_catalog.jsonb_build_object('deleted',true,'id',v_note.id);
  end if;
  v_content:=pg_catalog.btrim(coalesce(p_content,''));
  if v_content='' or p_pinned is null then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  update public.notes n set content=v_content,pinned=p_pinned
    where n.id=v_note.id and n.wedding_id=p_wedding_id returning n.* into v_next;
  return collaboration_private.note_projection_v3(v_next);
end $$;
revoke all on function public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean) from public,anon,service_role;
grant execute on function public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean) to authenticated;

create function public.create_my_owned_wedding_note_v3(
  p_wedding_id uuid,p_content text,p_author text default null,p_pinned boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_note public.notes%rowtype; v_content text; v_author text;
begin
  v_owner:=collaboration_private.require_owner_notes_edit_v3(p_wedding_id);
  v_content:=pg_catalog.btrim(coalesce(p_content,''));
  if v_content='' or p_pinned is null then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_author:=coalesce(nullif(pg_catalog.btrim(p_author),''),'Studio');
  insert into public.notes(wedding_id,author,content,pinned) values(p_wedding_id,v_author,v_content,p_pinned) returning * into v_note;
  return collaboration_private.note_projection_v3(v_note);
end $$;
revoke all on function public.create_my_owned_wedding_note_v3(uuid,text,text,boolean) from public,anon,service_role;
grant execute on function public.create_my_owned_wedding_note_v3(uuid,text,text,boolean) to authenticated;

create function public.mutate_my_owned_wedding_note_v3(
  p_action text,p_wedding_id uuid,p_note_id uuid,p_expected_revision text default null,
  p_content text default null,p_pinned boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_note public.notes%rowtype; v_next public.notes%rowtype; v_content text;
begin
  if p_action is null or p_action not in ('update','delete') then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_owner:=collaboration_private.require_owner_notes_edit_v3(p_wedding_id);
  if p_note_id is null or p_expected_revision is null or pg_catalog.char_length(p_expected_revision)>19
    or p_expected_revision !~ '^[1-9][0-9]*$' then raise exception using errcode='P0001',message='CONFLICT'; end if;
  select n.* into v_note from public.notes n join public.weddings w on w.id=n.wedding_id
    where n.id=p_note_id and n.wedding_id=p_wedding_id and w.user_id=v_owner and w.status='active' for update of n;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_revision::numeric<>v_note.revision::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_action='delete' then
    delete from public.notes n where n.id=v_note.id and n.wedding_id=p_wedding_id;
    return pg_catalog.jsonb_build_object('deleted',true,'id',v_note.id);
  end if;
  v_content:=pg_catalog.btrim(coalesce(p_content,''));
  if v_content='' or p_pinned is null then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  update public.notes n set content=v_content,pinned=p_pinned
    where n.id=v_note.id and n.wedding_id=p_wedding_id returning n.* into v_next;
  return collaboration_private.note_projection_v3(v_next);
end $$;
revoke all on function public.mutate_my_owned_wedding_note_v3(text,uuid,uuid,text,text,boolean) from public,anon,service_role;
grant execute on function public.mutate_my_owned_wedding_note_v3(text,uuid,uuid,text,text,boolean) to authenticated;

commit;
