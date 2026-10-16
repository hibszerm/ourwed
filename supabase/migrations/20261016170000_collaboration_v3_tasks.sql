begin;

alter table public.tasks add column revision bigint not null default 1 check (revision > 0);

create function collaboration_private.bump_task_revision_v3()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end $$;
revoke all on function collaboration_private.bump_task_revision_v3() from public,anon,authenticated,service_role;
create trigger tasks_bump_revision_v3 before update on public.tasks
for each row execute function collaboration_private.bump_task_revision_v3();

create function collaboration_private.require_tasks_edit_v3(
  p_wedding_id uuid, p_access_version text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_owner uuid; v_level smallint; v_membership public.wedding_collaboration_memberships%rowtype;
begin
  if auth.uid() is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' is distinct from 'collaborator'
    or v_context->>'permission_group_mapping_version' is distinct from '3' then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  -- Keep the lock order aligned with wedding lifecycle operations: wedding,
  -- membership, then task row. This prevents authority changes from racing a
  -- task write and avoids reversing the 1C-D wedding-first order.
  select w.user_id into v_owner from public.weddings w
    where w.id=p_wedding_id and w.status='active' for key share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select m.* into v_membership from public.wedding_collaboration_memberships m
    where m.id=(v_context->>'membership_id')::uuid and m.wedding_id=p_wedding_id
      and m.owner_user_id=v_owner and m.member_user_id=auth.uid() and m.status='active'
      and m.permission_group_mapping_version='3' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_access_version is null or pg_catalog.char_length(p_access_version)>19
    or p_access_version !~ '^[1-9][0-9]*$' then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  if p_access_version::numeric <> v_membership.access_version::numeric then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  v_level := collaboration_private.resolve_wedding_area_level(p_wedding_id,'tasks');
  if v_level is null or v_level = 0 then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  if v_level < 2 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  return pg_catalog.jsonb_build_object('owner_user_id',v_owner,'access_version',v_membership.access_version::text);
end $$;
revoke all on function collaboration_private.require_tasks_edit_v3(uuid,text) from public,anon,authenticated,service_role;

create function public.get_my_collaborative_wedding_tasks_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_level smallint; v_tasks jsonb;
begin
  if auth.uid() is null or p_wedding_id is null then return pg_catalog.jsonb_build_object('kind','unavailable'); end if;
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' is distinct from 'collaborator'
    or v_context->>'permission_group_mapping_version' is distinct from '3' then
    return pg_catalog.jsonb_build_object('kind','unavailable');
  end if;
  v_level := collaboration_private.resolve_wedding_area_level(p_wedding_id,'tasks');
  if v_level is null or v_level=0 then return pg_catalog.jsonb_build_object('kind','unavailable'); end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',t.id,'title',t.title,'due_date',t.due_date,'status',t.status,
    'completed_at',t.completed_at,'created_at',t.created_at,'revision',t.revision::text)
    order by t.due_date asc nulls last,t.created_at asc,t.id asc),'[]'::jsonb)
  into v_tasks from public.tasks t
  join public.weddings w on w.id=t.wedding_id and w.user_id=t.user_id and w.status='active'
  where t.wedding_id=p_wedding_id;
  return pg_catalog.jsonb_build_object('kind','shared','wedding_id',p_wedding_id,
    'access_version',v_context->>'access_version','tasks_level',v_level,'tasks',v_tasks);
end $$;
revoke all on function public.get_my_collaborative_wedding_tasks_v3(uuid) from public,anon,service_role;
grant execute on function public.get_my_collaborative_wedding_tasks_v3(uuid) to authenticated;

create function public.get_my_collaborative_tasks_v3(p_due_through date default null)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id',t.id,'title',t.title,'wedding_id',t.wedding_id,'due_date',t.due_date,
    'status',t.status,'completed_at',t.completed_at,'created_at',t.created_at,
    'revision',t.revision::text,'tasks_level',a.tasks,'access_version',m.access_version::text,
    'wedding_label',coalesce(nullif(pg_catalog.btrim(concat_ws(' ',w.bride_name,w.groom_name)),''),'Ślub'))
  from public.wedding_collaboration_memberships m
  join public.weddings w on w.id=m.wedding_id and w.user_id=m.owner_user_id and w.status='active'
  join collaboration_private.membership_area_access a on a.membership_id=m.id and a.tasks>0
  join public.tasks t on t.wedding_id=w.id and t.user_id=w.user_id
  where m.member_user_id=auth.uid() and m.status='active'
    and m.permission_group_mapping_version='3'
    and public.wedding_collaboration_actor_is_eligible(auth.uid())
    and (p_due_through is null or (t.due_date is not null and t.due_date<=p_due_through
      and t.status in ('todo','in_progress')))
  order by t.due_date asc nulls last,t.created_at asc,t.id asc
$$;
revoke all on function public.get_my_collaborative_tasks_v3(date) from public,anon,service_role;
grant execute on function public.get_my_collaborative_tasks_v3(date) to authenticated;

create function public.get_my_collaborative_task_targets_v3()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('wedding_id',w.id,'tasks_level',a.tasks,
    'access_version',m.access_version::text,
    'wedding_label',coalesce(nullif(pg_catalog.btrim(concat_ws(' ',w.bride_name,w.groom_name)),''),'Ślub'))
  from public.wedding_collaboration_memberships m
  join public.weddings w on w.id=m.wedding_id and w.user_id=m.owner_user_id and w.status='active'
  join collaboration_private.membership_area_access a on a.membership_id=m.id and a.tasks=2
  where m.member_user_id=auth.uid() and m.status='active'
    and m.permission_group_mapping_version='3'
    and public.wedding_collaboration_actor_is_eligible(auth.uid())
  order by w.wedding_date asc nulls last,w.id
$$;
revoke all on function public.get_my_collaborative_task_targets_v3() from public,anon,service_role;
grant execute on function public.get_my_collaborative_task_targets_v3() to authenticated;

create function public.mutate_my_collaborative_task_v3(
  p_action text,p_wedding_id uuid,p_access_version text,
  p_task_id uuid default null,p_expected_revision text default null,
  p_title text default null,p_due_date date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth jsonb; v_owner uuid; v_task public.tasks%rowtype; v_new public.tasks%rowtype;
begin
  if p_action is null or p_action not in ('create','update','complete','reopen','delete') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_auth := collaboration_private.require_tasks_edit_v3(p_wedding_id,p_access_version);
  v_owner := (v_auth->>'owner_user_id')::uuid;
  if p_action='create' then
    if p_task_id is not null or p_expected_revision is not null or p_title is null
      or nullif(pg_catalog.btrim(p_title),'') is null or pg_catalog.char_length(p_title)>500 then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    insert into public.tasks(user_id,wedding_id,title,status,due_date)
    values(v_owner,p_wedding_id,pg_catalog.btrim(p_title),'todo',p_due_date) returning * into v_new;
    return pg_catalog.jsonb_build_object('id',v_new.id,'title',v_new.title,'wedding_id',v_new.wedding_id,
      'due_date',v_new.due_date,'status',v_new.status,'completed_at',v_new.completed_at,
      'created_at',v_new.created_at,'revision',v_new.revision::text);
  end if;
  if p_task_id is null or p_expected_revision is null or pg_catalog.char_length(p_expected_revision)>19
    or p_expected_revision !~ '^(0|[1-9][0-9]*)$' then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  select * into v_task from public.tasks t where t.id=p_task_id and t.wedding_id=p_wedding_id
    and t.user_id=v_owner for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_revision::numeric <> v_task.revision::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_action='delete' then
    delete from public.tasks where id=v_task.id;
    return pg_catalog.jsonb_build_object('deleted',true,'id',v_task.id);
  elsif p_action='update' then
    if p_title is null or nullif(pg_catalog.btrim(p_title),'') is null or pg_catalog.char_length(p_title)>500 then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    update public.tasks set title=pg_catalog.btrim(p_title),due_date=p_due_date
      where id=v_task.id returning * into v_new;
  elsif p_action='complete' then
    update public.tasks set status='done',completed_at=pg_catalog.now()
      where id=v_task.id and status is distinct from 'done' returning * into v_new;
    if not found then v_new:=v_task; end if;
  elsif p_action='reopen' then
    update public.tasks set status='todo',completed_at=null
      where id=v_task.id and status='done' returning * into v_new;
    if not found then v_new:=v_task; end if;
  end if;
  return pg_catalog.jsonb_build_object('id',v_new.id,'title',v_new.title,'wedding_id',v_new.wedding_id,
    'due_date',v_new.due_date,'status',v_new.status,'completed_at',v_new.completed_at,
    'created_at',v_new.created_at,'revision',v_new.revision::text);
end $$;
revoke all on function public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date) from public,anon,service_role;
grant execute on function public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date) to authenticated;

commit;
