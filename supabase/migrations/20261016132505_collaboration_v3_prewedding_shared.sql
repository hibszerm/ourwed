-- V3 Pre-Wedding shared projection and scoped writes. No table RLS is widened.
begin;

-- updated_at is transaction-time and is not a safe CAS token for multiple writes
-- in one transaction. Use monotonic revisions for accepted answer/time state.
alter table public.wedding_questionnaire_responses
  add column if not exists collaboration_revision bigint not null default 1
    check (collaboration_revision > 0);

create table if not exists collaboration_private.prewedding_response_revisions (
  questionnaire_id uuid primary key references public.wedding_questionnaires(id) on delete cascade,
  revision bigint not null check (revision > 0)
);
alter table collaboration_private.prewedding_response_revisions enable row level security;
alter table collaboration_private.prewedding_response_revisions force row level security;
revoke all on collaboration_private.prewedding_response_revisions from public,anon,authenticated,service_role;
insert into collaboration_private.prewedding_response_revisions(questionnaire_id,revision)
  select questionnaire_id,collaboration_revision from public.wedding_questionnaire_responses
  on conflict(questionnaire_id) do update set revision=greatest(
    collaboration_private.prewedding_response_revisions.revision,excluded.revision);

create or replace function collaboration_private.bump_prewedding_response_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into collaboration_private.prewedding_response_revisions(questionnaire_id,revision)
    values(new.questionnaire_id,1)
  on conflict(questionnaire_id) do update set revision=
    collaboration_private.prewedding_response_revisions.revision+1
  returning revision into new.collaboration_revision;
  return new;
end; $$;
revoke all on function collaboration_private.bump_prewedding_response_revision() from public,anon,authenticated,service_role;
drop trigger if exists wqr_collaboration_revision on public.wedding_questionnaire_responses;
create trigger wqr_collaboration_revision before insert or update on public.wedding_questionnaire_responses
for each row execute function collaboration_private.bump_prewedding_response_revision();

create or replace function collaboration_private.bump_prewedding_response_delete_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into collaboration_private.prewedding_response_revisions(questionnaire_id,revision)
    values(old.questionnaire_id,old.collaboration_revision+1)
  on conflict(questionnaire_id) do update set revision=greatest(
    collaboration_private.prewedding_response_revisions.revision,old.collaboration_revision)+1;
  return old;
end; $$;
revoke all on function collaboration_private.bump_prewedding_response_delete_revision() from public,anon,authenticated,service_role;
drop trigger if exists wqr_collaboration_revision_delete on public.wedding_questionnaire_responses;
create trigger wqr_collaboration_revision_delete after delete on public.wedding_questionnaire_responses
for each row execute function collaboration_private.bump_prewedding_response_delete_revision();

create table if not exists collaboration_private.prewedding_time_revisions (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  stop_key text not null,
  revision bigint not null default 1 check (revision > 0),
  primary key (wedding_id, stop_key)
);
alter table collaboration_private.prewedding_time_revisions enable row level security;
alter table collaboration_private.prewedding_time_revisions force row level security;
revoke all on collaboration_private.prewedding_time_revisions from public,anon,authenticated,service_role;
insert into collaboration_private.prewedding_time_revisions(wedding_id,stop_key,revision)
select wedding_id,stop_key,1 from public.wedding_operational_times
on conflict do nothing;

create or replace function collaboration_private.bump_prewedding_time_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_wedding uuid; v_key text;
begin
  v_wedding := case when tg_op='DELETE' then old.wedding_id else new.wedding_id end;
  v_key := case when tg_op='DELETE' then old.stop_key else new.stop_key end;
  insert into collaboration_private.prewedding_time_revisions(wedding_id,stop_key,revision)
    values(v_wedding,v_key,1)
  on conflict(wedding_id,stop_key) do update
    set revision=collaboration_private.prewedding_time_revisions.revision+1;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function collaboration_private.bump_prewedding_time_revision() from public,anon,authenticated,service_role;
drop trigger if exists wedding_operational_times_prewedding_revision on public.wedding_operational_times;
create trigger wedding_operational_times_prewedding_revision after insert or update or delete
on public.wedding_operational_times for each row execute function collaboration_private.bump_prewedding_time_revision();

create function collaboration_private.require_prewedding_write_v3(p_wedding_id uuid,p_expected_access_version text)
returns smallint language plpgsql security definer set search_path = '' as $$
declare v_context jsonb; v_level smallint; v_membership uuid; v_owner uuid; v_version bigint;
begin
  if auth.uid() is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select user_id into v_owner from public.weddings where id=p_wedding_id and status='active' for share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_context->>'relationship'='owner' then
    if v_owner is distinct from auth.uid() or p_expected_access_version is distinct from 'owner' then
      raise exception using errcode='P0001',message='CONFLICT'; end if;
    return 2;
  end if;
  begin v_membership:=(v_context->>'membership_id')::uuid; exception when others then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end;
  select access_version into v_version from public.wedding_collaboration_memberships
    where id=v_membership and wedding_id=p_wedding_id and member_user_id=auth.uid()
      and status='active' and permission_group_mapping_version='3' for share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_access_version is null or p_expected_access_version !~ '^[1-9][0-9]*$'
    or p_expected_access_version::numeric<>v_version::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'prewedding');
  if v_level is null or v_level<2 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  return v_level;
end; $$;
revoke all on function collaboration_private.require_prewedding_write_v3(uuid,text) from public,anon,authenticated,service_role;

create function public.get_my_collaborative_prewedding_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_context jsonb; v_level smallint; v_owner uuid;
  v_q public.wedding_questionnaires%rowtype; v_response public.wedding_questionnaire_responses%rowtype;
  v_places jsonb; v_times jsonb; v_access text; v_response_revision bigint;
begin
  if v_actor is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'prewedding');
  if v_level is null or v_level<1 then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_q from public.wedding_questionnaires q where q.wedding_id=p_wedding_id
    and q.owner_id=v_owner and q.status<>'archived' order by q.created_at desc,q.id limit 1;
  if not found then return jsonb_build_object('wedding_id',p_wedding_id,'access_version',
    case when v_context->>'relationship'='owner' then 'owner' else v_context->>'access_version' end,
    'prewedding_level',v_level,'questionnaire',null,'plan_day',jsonb_build_object('places','[]'::jsonb,'times','[]'::jsonb)); end if;
  select * into v_response from public.wedding_questionnaire_responses r where r.questionnaire_id=v_q.id;
  select coalesce(r.revision,0) into v_response_revision from collaboration_private.prewedding_response_revisions r
    where r.questionnaire_id=v_q.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'name',p.label,
    'address',p.formatted_address,'sort_order',p.sort_order) order by p.sort_order,p.created_at,p.id),'[]'::jsonb)
    into v_places from public.wedding_places p where p.wedding_id=p_wedding_id
      and p.role in ('preparation','bride_preparation','groom_preparation','ceremony','reception');
  select coalesce(jsonb_agg(jsonb_build_object('stop_key',s.stop_key,'time',t.operational_time,
    'revision',coalesce(r.revision,0)::text)),'[]'::jsonb) into v_times
    from (select p.id::text as stop_key from public.wedding_places p where p.wedding_id=p_wedding_id
        and p.role in ('preparation','bride_preparation','groom_preparation','ceremony','reception')
      union all select 'studio'::text) s
    left join public.wedding_operational_times t on t.wedding_id=p_wedding_id and t.stop_key=s.stop_key
    left join collaboration_private.prewedding_time_revisions r on r.wedding_id=p_wedding_id and r.stop_key=s.stop_key;
  v_access:=case when v_context->>'relationship'='owner' then 'owner' else v_context->>'access_version' end;
  return jsonb_build_object('wedding_id',p_wedding_id,'access_version',v_access,'prewedding_level',v_level,
    'questionnaire',jsonb_build_object('id',v_q.id,'status',case when v_q.status in ('sent','opened') then 'awaiting'
      when v_q.status in ('submitted') then 'completed' else 'in_progress' end,
      'title',v_q.title,'introduction',v_q.introduction,'schema',v_q.schema_snapshot_json,
      'response_id',v_response.id,'answers',coalesce(v_response.answers_json,'{}'::jsonb),
      'response_revision',coalesce(v_response_revision,0)::text,
      'answered_required',coalesce(v_response.answered_required,0),
      'total_required',coalesce(v_response.total_required,0),'submitted_at',v_response.submitted_at),
    'plan_day',jsonb_build_object('places',v_places,'times',v_times));
end; $$;

create function public.update_my_collaborative_prewedding_answer_v3(
  p_wedding_id uuid,p_questionnaire_id uuid,p_question_id text,p_value jsonb,p_clear boolean,
  p_expected_access_version text,p_expected_response_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_level smallint; v_q public.wedding_questionnaires%rowtype;
  v_response public.wedding_questionnaire_responses%rowtype; v_question jsonb; v_type text;
  v_answers jsonb; v_answered integer; v_total integer; v_current_revision bigint;
begin
  if auth.uid() is null or p_question_id is null or p_question_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or p_clear is null or (p_clear and p_value is not null) or (not p_clear and p_value is null) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_level:=collaboration_private.require_prewedding_write_v3(p_wedding_id,p_expected_access_version);
  select * into v_q from public.wedding_questionnaires where id=p_questionnaire_id and wedding_id=p_wedding_id and status<>'archived' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select q.question,q.question->>'type' into v_question,v_type
    from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question)
    where q.question->>'id'=p_question_id and q.question->>'type'<>'information' limit 1;
  if v_question is null then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if not p_clear and ((v_type in ('short_text','long_text','date','time','single_choice','yes_no') and pg_catalog.jsonb_typeof(p_value)<>'string')
    or (v_type='multiple_choice' and pg_catalog.jsonb_typeof(p_value)<>'array')
    or (v_type='acknowledgement' and pg_catalog.jsonb_typeof(p_value)<>'boolean')
    or (v_type='address' and pg_catalog.jsonb_typeof(p_value) not in ('string','object'))
    or (v_type='single_choice' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(v_question->'options','[]'::jsonb)) opts(option) where opts.option=p_value#>>'{}'))
    or (v_type='yes_no' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(v_question->'options','["Tak","Nie"]'::jsonb)) opts(option) where opts.option=p_value#>>'{}'))
    or (v_type='multiple_choice' and exists(select 1 from pg_catalog.jsonb_array_elements_text(p_value) answers(answer)
        where not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(v_question->'options','[]'::jsonb)) opts(option) where opts.option=answers.answer)))) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select coalesce(revision,0) into v_current_revision from collaboration_private.prewedding_response_revisions
    where questionnaire_id=p_questionnaire_id for update;
  v_current_revision:=coalesce(v_current_revision,0);
  if p_expected_response_revision is null or p_expected_response_revision !~ '^(0|[1-9][0-9]*)$'
    or p_expected_response_revision::numeric<>v_current_revision::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  select * into v_response from public.wedding_questionnaire_responses where questionnaire_id=p_questionnaire_id for update;
  if not found then
    v_response.id:=null; v_response.answers_json:='{}'::jsonb;
  end if;
  if p_clear then v_answers:=v_response.answers_json-p_question_id;
  else v_answers:=jsonb_set(v_response.answers_json,array[p_question_id],p_value,true); end if;
  select count(*) filter (where (q.question->>'required')='true' and coalesce((q.question->>'hidden')::boolean,false)=false
      and q.question->>'type'<>'information')::integer,
    count(*) filter (where (q.question->>'required')='true' and coalesce((q.question->>'hidden')::boolean,false)=false
      and q.question->>'type'<>'information' and nullif(v_answers->>(q.question->>'id'),'') is not null)::integer
    into v_total,v_answered
    from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question);
  if v_response.id is null then
    insert into public.wedding_questionnaire_responses(questionnaire_id,answers_json,answered_required,total_required)
      values(p_questionnaire_id,v_answers,coalesce(v_answered,0),coalesce(v_total,0)) returning * into v_response;
  else
    update public.wedding_questionnaire_responses set answers_json=v_answers,
      answered_required=coalesce(v_answered,0),total_required=coalesce(v_total,0) where id=v_response.id returning * into v_response;
  end if;
  update public.wedding_questionnaires set last_saved_at=pg_catalog.timezone('utc',pg_catalog.now()),
    status=case when status='opened' then 'in_progress' else status end,
    updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=p_questionnaire_id;
  select * into v_response from public.wedding_questionnaire_responses where id=v_response.id;
  return jsonb_build_object('answers',v_response.answers_json,'response_revision',v_response.collaboration_revision::text,
    'answered_required',v_response.answered_required,'total_required',v_response.total_required);
end; $$;

create function public.update_my_collaborative_prewedding_time_v3(
  p_wedding_id uuid,p_stop_key text,p_time text,p_clear boolean,p_expected_access_version text,p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_level smallint; v_revision bigint; v_place uuid;
begin
  if auth.uid() is null or p_wedding_id is null or p_stop_key is null or p_stop_key !~ '^(studio|[0-9a-fA-F-]{36})$'
    or p_clear is null or (p_clear and p_time is not null) or (not p_clear and (p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_level:=collaboration_private.require_prewedding_write_v3(p_wedding_id,p_expected_access_version);
  if p_stop_key<>'studio' then
    begin v_place:=p_stop_key::uuid; exception when others then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end;
    if not exists(select 1 from public.wedding_places where id=v_place and wedding_id=p_wedding_id) then
      raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_wedding_id::text||':'||p_stop_key,0));
  select revision into v_revision from collaboration_private.prewedding_time_revisions
    where wedding_id=p_wedding_id and stop_key=p_stop_key for update;
  v_revision:=coalesce(v_revision,0);
  if p_expected_revision is null or p_expected_revision !~ '^(0|[1-9][0-9]*)$'
    or p_expected_revision::numeric<>v_revision::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_clear then delete from public.wedding_operational_times where wedding_id=p_wedding_id and stop_key=p_stop_key;
  else insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
    values(p_wedding_id,p_stop_key,p_time) on conflict(wedding_id,stop_key) do update set operational_time=excluded.operational_time; end if;
  select revision into v_revision from collaboration_private.prewedding_time_revisions
    where wedding_id=p_wedding_id and stop_key=p_stop_key;
  return jsonb_build_object('time',case when p_clear then null else p_time end,'revision',coalesce(v_revision,0)::text);
end; $$;

-- Public CAS-compatible load/save preserve the existing token authority entrypoints.
create function public.public_get_prewedding_questionnaire_v2(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_hash text; v_revision bigint;
begin
  if p_token is null or pg_catalog.char_length(p_token)<20 or pg_catalog.char_length(p_token)>256 then return null; end if;
  v_result:=public.public_get_prewedding_questionnaire(p_token);
  if v_result is null then return null; end if;
  v_hash:=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  select coalesce(r.revision,0) into v_revision from public.wedding_questionnaires q
    left join collaboration_private.prewedding_response_revisions r on r.questionnaire_id=q.id
    where q.public_token_hash=v_hash and q.status not in ('draft','archived');
  return v_result || pg_catalog.jsonb_build_object('response_revision',coalesce(v_revision,0)::text);
end; $$;

create function public.public_autosave_prewedding_questionnaire_v2(
  p_token text,p_answers jsonb,p_answered_req integer,p_total_req integer,p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_qid uuid; v_revision bigint; v_response public.wedding_questionnaire_responses%rowtype;
  v_q public.wedding_questionnaires%rowtype;
begin
  if p_token is null or pg_catalog.char_length(p_token)<20 or pg_catalog.char_length(p_token)>256
    or p_answers is null or pg_catalog.jsonb_typeof(p_answers)<>'object'
    or p_answered_req is null or p_total_req is null or p_answered_req<0 or p_total_req<0 or p_answered_req>p_total_req
    or p_expected_revision is null or p_expected_revision !~ '^(0|[1-9][0-9]*)$' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_hash:=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_q from public.wedding_questionnaires where public_token_hash=v_hash
    and status not in ('draft','archived','submitted') for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  v_qid:=v_q.id;
  if exists(select 1 from pg_catalog.jsonb_each(p_answers) a
    where not exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
      cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question)
      where q.question->>'id'=a.key and q.question->>'type'<>'information'))
    or exists(select 1 from pg_catalog.jsonb_each(p_answers) a
      join lateral (select q.question->>'type' as kind,q.question as question
        from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
        cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question)
        where q.question->>'id'=a.key limit 1) def on true
      where (def.kind in ('short_text','long_text','date','time','single_choice','yes_no') and pg_catalog.jsonb_typeof(a.value)<>'string')
        or (def.kind='multiple_choice' and pg_catalog.jsonb_typeof(a.value)<>'array')
        or (def.kind='acknowledgement' and pg_catalog.jsonb_typeof(a.value)<>'boolean')
        or (def.kind='single_choice' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(def.question->'options','[]'::jsonb)) opts(option) where opts.option=a.value#>>'{}'))
        or (def.kind='yes_no' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(def.question->'options','["Tak","Nie"]'::jsonb)) opts(option) where opts.option=a.value#>>'{}'))
        or (def.kind='multiple_choice' and exists(select 1 from pg_catalog.jsonb_array_elements_text(a.value) answers(answer)
          where not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(def.question->'options','[]'::jsonb)) opts(option) where opts.option=answers.answer)))
        or (def.kind='address' and pg_catalog.jsonb_typeof(a.value) not in ('string','object'))) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select revision into v_revision from collaboration_private.prewedding_response_revisions
    where questionnaire_id=v_qid for update;
  if p_expected_revision::numeric<>coalesce(v_revision,0)::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  select * into v_response from public.wedding_questionnaire_responses where questionnaire_id=v_qid for update;
  if found then
    update public.wedding_questionnaire_responses set answers_json=p_answers,answered_required=p_answered_req,total_required=p_total_req
      where id=v_response.id;
  else
    insert into public.wedding_questionnaire_responses(questionnaire_id,answers_json,answered_required,total_required)
      values(v_qid,p_answers,p_answered_req,p_total_req) returning * into v_response;
  end if;
  select * into v_response from public.wedding_questionnaire_responses where id=v_response.id;
  update public.wedding_questionnaires set last_saved_at=pg_catalog.timezone('utc',pg_catalog.now()),
    status=case when status='opened' then 'in_progress' else status end where id=v_qid;
  return pg_catalog.jsonb_build_object('ok',true,'response_revision',v_response.collaboration_revision::text);
end; $$;

create function public.public_autosave_prewedding_answer_v2(
  p_token text,p_question_id text,p_value jsonb,p_clear boolean,p_answered_req integer,p_total_req integer,p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_q public.wedding_questionnaires%rowtype; v_r public.wedding_questionnaire_responses%rowtype;
  v_question jsonb; v_type text; v_answers jsonb; v_total integer; v_answered integer; v_revision bigint;
begin
  if p_token is null or pg_catalog.char_length(p_token)<20 or pg_catalog.char_length(p_token)>256
    or p_question_id is null or p_question_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or p_clear is null or (p_clear and p_value is not null) or (not p_clear and p_value is null)
    or p_answered_req is null or p_total_req is null or p_answered_req<0 or p_total_req<0 or p_answered_req>p_total_req
    or p_expected_revision is null or p_expected_revision !~ '^(0|[1-9][0-9]*)$' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_hash:=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_q from public.wedding_questionnaires where public_token_hash=v_hash
    and status not in ('draft','archived','submitted') for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'error','not_found'); end if;
  select q.question,q.question->>'type' into v_question,v_type
    from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question)
    where q.question->>'id'=p_question_id and q.question->>'type'<>'information' limit 1;
  if v_question is null then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if not p_clear and ((v_type in ('short_text','long_text','date','time','single_choice','yes_no') and pg_catalog.jsonb_typeof(p_value)<>'string')
    or (v_type='multiple_choice' and pg_catalog.jsonb_typeof(p_value)<>'array')
    or (v_type='acknowledgement' and pg_catalog.jsonb_typeof(p_value)<>'boolean')
    or (v_type='address' and pg_catalog.jsonb_typeof(p_value) not in ('string','object'))
    or (v_type='single_choice' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(v_question->'options','[]'::jsonb)) opts(option) where opts.option=p_value#>>'{}'))
    or (v_type='yes_no' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(v_question->'options','["Tak","Nie"]'::jsonb)) opts(option) where opts.option=p_value#>>'{}'))
    or (v_type='multiple_choice' and exists(select 1 from pg_catalog.jsonb_array_elements_text(p_value) answers(answer)
        where not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(v_question->'options','[]'::jsonb)) opts(option) where opts.option=answers.answer)))) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select revision into v_revision from collaboration_private.prewedding_response_revisions
    where questionnaire_id=v_q.id for update;
  if p_expected_revision::numeric<>coalesce(v_revision,0)::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  select * into v_r from public.wedding_questionnaire_responses where questionnaire_id=v_q.id for update;
  if found then
    v_answers:=case when p_clear then v_r.answers_json-p_question_id
      else pg_catalog.jsonb_set(v_r.answers_json,array[p_question_id],p_value,true) end;
  else
    v_answers:=case when p_clear then '{}'::jsonb else pg_catalog.jsonb_build_object(p_question_id,p_value) end;
  end if;
  select count(*) filter (where q.question->>'required'='true' and coalesce((q.question->>'hidden')::boolean,false)=false
      and q.question->>'type'<>'information')::integer,
    count(*) filter (where q.question->>'required'='true' and coalesce((q.question->>'hidden')::boolean,false)=false
      and q.question->>'type'<>'information' and nullif(v_answers->>(q.question->>'id'),'') is not null)::integer
    into v_total,v_answered
    from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question);
  if v_r.id is null then
    insert into public.wedding_questionnaire_responses(questionnaire_id,answers_json,answered_required,total_required)
      values(v_q.id,v_answers,coalesce(v_answered,0),coalesce(v_total,0)) returning * into v_r;
  else
    update public.wedding_questionnaire_responses set answers_json=v_answers,answered_required=coalesce(v_answered,0),total_required=coalesce(v_total,0)
      where id=v_r.id returning * into v_r;
  end if;
  update public.wedding_questionnaires set last_saved_at=pg_catalog.timezone('utc',pg_catalog.now()),
    status=case when status='opened' then 'in_progress' else status end,updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=v_q.id;
  return pg_catalog.jsonb_build_object('ok',true,'response_revision',v_r.collaboration_revision::text,
    'answered_required',coalesce(v_answered,0),'total_required',coalesce(v_total,0));
end; $$;

create function public.public_submit_prewedding_questionnaire_v2(
  p_token text,p_answers jsonb,p_answered_req integer,p_total_req integer,p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_qid uuid; v_current bigint; v_payload jsonb;
  v_q public.wedding_questionnaires%rowtype; v_response public.wedding_questionnaire_responses%rowtype;
  v_was_submitted boolean; v_submitted_at timestamptz;
begin
  if p_token is null or pg_catalog.char_length(p_token)<20 or pg_catalog.char_length(p_token)>256
    or p_answers is null or pg_catalog.jsonb_typeof(p_answers)<>'object'
    or p_answered_req is null or p_total_req is null or p_answered_req<0 or p_total_req<0 or p_answered_req>p_total_req
    or p_expected_revision is null or p_expected_revision !~ '^(0|[1-9][0-9]*)$' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_hash:=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_q from public.wedding_questionnaires where public_token_hash=v_hash
    and status not in ('draft','archived') for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'error','not_found'); end if;
  v_qid:=v_q.id;
  select revision into v_current from collaboration_private.prewedding_response_revisions
    where questionnaire_id=v_qid for update;
  v_current:=coalesce(v_current,0);
  if p_expected_revision::numeric<>v_current::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  v_was_submitted:=v_q.status in ('submitted','reopened');
  v_submitted_at:=pg_catalog.timezone('utc',pg_catalog.now());
  if exists(select 1 from pg_catalog.jsonb_each(p_answers) a
    where not exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
      cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question)
      where q.question->>'id'=a.key and q.question->>'type'<>'information'))
    or exists(select 1 from pg_catalog.jsonb_each(p_answers) a
      join lateral (select q.question->>'type' as kind,q.question as question
        from pg_catalog.jsonb_array_elements(coalesce(v_q.schema_snapshot_json->'sections','[]'::jsonb)) sec(section)
        cross join lateral pg_catalog.jsonb_array_elements(coalesce(sec.section->'questions','[]'::jsonb)) q(question)
        where q.question->>'id'=a.key limit 1) def on true
      where (def.kind in ('short_text','long_text','date','time','single_choice','yes_no') and pg_catalog.jsonb_typeof(a.value)<>'string')
        or (def.kind='multiple_choice' and pg_catalog.jsonb_typeof(a.value)<>'array')
        or (def.kind='acknowledgement' and pg_catalog.jsonb_typeof(a.value)<>'boolean')
        or (def.kind='single_choice' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(def.question->'options','[]'::jsonb)) opts(option) where opts.option=a.value#>>'{}'))
        or (def.kind='yes_no' and not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(def.question->'options','["Tak","Nie"]'::jsonb)) opts(option) where opts.option=a.value#>>'{}'))
        or (def.kind='multiple_choice' and exists(select 1 from pg_catalog.jsonb_array_elements_text(a.value) answers(answer)
          where not exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(def.question->'options','[]'::jsonb)) opts(option) where opts.option=answers.answer)))
        or (def.kind='address' and pg_catalog.jsonb_typeof(a.value) not in ('string','object'))) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select * into v_response from public.wedding_questionnaire_responses where questionnaire_id=v_qid for update;
  if found then
    update public.wedding_questionnaire_responses set answers_json=p_answers,answered_required=p_answered_req,
      total_required=p_total_req,submitted_at=v_submitted_at where id=v_response.id returning * into v_response;
  else
    insert into public.wedding_questionnaire_responses(questionnaire_id,answers_json,answered_required,total_required,submitted_at)
      values(v_qid,p_answers,p_answered_req,p_total_req,v_submitted_at) returning * into v_response;
  end if;
  update public.wedding_questionnaires set status='submitted',submitted_at=v_submitted_at,reopened_at=null,
    last_saved_at=v_submitted_at,updated_at=v_submitted_at where id=v_qid;
  perform public.notify_prewedding_questionnaire_completed(v_qid,v_submitted_at,v_was_submitted);
  v_payload:=pg_catalog.jsonb_build_object('ok',true,'submitted_at',v_submitted_at,'updated',v_was_submitted);
  return v_payload || pg_catalog.jsonb_build_object('response_revision',v_response.collaboration_revision::text);
end; $$;

revoke all on function public.get_my_collaborative_prewedding_v3(uuid) from public,anon,service_role;
revoke all on function public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text) from public,anon,service_role;
revoke all on function public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text) from public,anon,service_role;
revoke all on function public.public_get_prewedding_questionnaire_v2(text) from public,service_role;
revoke all on function public.public_autosave_prewedding_questionnaire_v2(text,jsonb,integer,integer,text) from public,service_role;
revoke all on function public.public_autosave_prewedding_answer_v2(text,text,jsonb,boolean,integer,integer,text) from public,service_role;
revoke all on function public.public_submit_prewedding_questionnaire_v2(text,jsonb,integer,integer,text) from public,service_role;
-- The old public write signatures cannot carry a revision token and must not
-- remain an alternate blind whole-response write path.
revoke all on function public.public_autosave_prewedding_questionnaire_v2(text,jsonb,integer,integer,text) from anon,authenticated;
revoke all on function public.public_autosave_prewedding_questionnaire(text,jsonb,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.public_submit_prewedding_questionnaire(text,jsonb,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_my_collaborative_prewedding_v3(uuid) to authenticated;
grant execute on function public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text) to authenticated;
grant execute on function public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text) to authenticated;
grant execute on function public.public_get_prewedding_questionnaire_v2(text) to anon,authenticated;
grant execute on function public.public_autosave_prewedding_questionnaire_v2(text,jsonb,integer,integer,text) to anon,authenticated;
grant execute on function public.public_autosave_prewedding_answer_v2(text,text,jsonb,boolean,integer,integer,text) to anon,authenticated;
grant execute on function public.public_submit_prewedding_questionnaire_v2(text,jsonb,integer,integer,text) to anon,authenticated;
commit;
