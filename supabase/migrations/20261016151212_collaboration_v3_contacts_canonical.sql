-- V3 Contacts: make operational couple data independent of Contract answers.
begin;

alter table public.weddings
  add column bride_first_name text,
  add column bride_last_name text,
  add column groom_first_name text,
  add column groom_last_name text,
  add column groom_email text,
  add column contacts_revision bigint not null default 1 check (contacts_revision >= 1);

create function collaboration_private.format_contact_location_v3(p_value jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v_address text; v_name text;
begin
  if jsonb_typeof(p_value)='string' then return btrim(p_value#>>'{}'); end if;
  if jsonb_typeof(p_value)<>'object' then return ''; end if;
  v_address:=coalesce(nullif(btrim(p_value->>'formattedAddress'),''),
    nullif(concat_ws(', ',nullif(btrim(p_value->>'street'),''),
      nullif(btrim(p_value->>'buildingNumber'),''),nullif(btrim(p_value->>'postalCode'),''),
      nullif(btrim(p_value->>'city'),''),nullif(btrim(p_value->>'country'),'')),''),'');
  v_name:=coalesce(nullif(btrim(p_value->>'label'),''),nullif(btrim(p_value->>'name'),''),'');
  if v_name<>'' and v_address<>'' and v_name<>v_address then return v_name||' — '||v_address; end if;
  return coalesce(nullif(v_address,''),v_name,'');
end $$;
revoke all on function collaboration_private.format_contact_location_v3(jsonb) from public,anon,authenticated,service_role;

create function collaboration_private.clean_contact_name_v3(p_value text)
returns text language sql immutable set search_path = '' as $$
  select case when lower(btrim(coalesce(p_value,''))) in ('','—','–','-','n/a','na','brak') then null else btrim(p_value) end
$$;
revoke all on function collaboration_private.clean_contact_name_v3(text) from public,anon,authenticated,service_role;

create function collaboration_private.format_effective_contact_address_v3(p_address text,p_postal text,p_city text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_base text:=regexp_replace(btrim(regexp_replace(coalesce(p_address,''),',\s*Polska\s*$','','i')),'\s+',' ','g');
  v_postal text:=nullif(regexp_replace(btrim(coalesce(p_postal,'')),'\s+',' ','g'),'');
  v_city text:=nullif(regexp_replace(btrim(coalesce(p_city,'')),'\s+',' ','g'),'');
  v_postal_pos integer;
  v_has_postal boolean;
  v_has_city boolean;
  v_core text;
begin
  v_base:=coalesce(v_base,'');
  v_postal_pos:=case when v_postal is null then 0 else position(lower(v_postal) in lower(v_base)) end;
  v_has_postal:=v_postal is null or (v_postal_pos>0
      and (v_postal_pos=1 or substring(v_base from v_postal_pos-1 for 1) !~ '[[:alnum:]]')
      and (v_postal_pos+length(v_postal)>length(v_base)
        or substring(v_base from v_postal_pos+length(v_postal) for 1) !~ '[[:alnum:]]'));
  v_has_city:=v_city is null or lower(v_base)=lower(v_city)
    or right(lower(v_base),length(v_city)+2)=', '||lower(v_city)
    or right(lower(v_base),length(v_city)+1)=' '||lower(v_city);

  if v_base='' then return coalesce(nullif(concat_ws(' ',v_postal,v_city),''),''); end if;
  if v_has_postal and v_has_city then return v_base; end if;

  -- If city is already the trailing component but postal is missing, move the
  -- city into the canonical "postal city" suffix rather than duplicating it.
  if v_city is not null and v_has_city and v_postal is not null and not v_has_postal then
    if lower(v_base)=lower(v_city) then
      v_core:='';
    elsif right(lower(v_base),length(v_city)+2)=', '||lower(v_city) then
      v_core:=rtrim(left(v_base,length(v_base)-length(v_city)-2),', ');
    else
      v_core:=rtrim(left(v_base,length(v_base)-length(v_city)-1),' ');
    end if;
    return concat_ws(', ',nullif(v_core,''),v_postal||' '||v_city);
  end if;

  if v_postal is not null and not v_has_postal and v_city is not null and not v_has_city then
    return v_base||', '||v_postal||' '||v_city;
  end if;

  if v_city is not null and not v_has_city then
    if v_postal is not null and v_has_postal and right(lower(v_base),length(v_postal))=lower(v_postal) then
      return v_base||' '||v_city;
    end if;
    return v_base||', '||v_city;
  end if;

  if v_postal is not null and not v_has_postal then return v_base||', '||v_postal; end if;
  return v_base;
end $$;
revoke all on function collaboration_private.format_effective_contact_address_v3(text,text,text) from public,anon,authenticated,service_role;

-- Match the application merge precedence (latest submitted/approved Contract
-- form; nonblank answer wins), then snapshot those effective values into the
-- operational wedding row. Historical form_answers are never modified.
-- The preceding ADD COLUMN DDL already holds an ACCESS EXCLUSIVE lock on
-- public.weddings for this transaction. Keep that lock explicit at the trust
-- boundary below: only the owner guard is disabled for the migration backfill,
-- while collaboration-term and other wedding triggers remain active. The
-- transactional DDL is rolled back with the backfill if any statement fails.
lock table public.weddings in access exclusive mode;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.weddings'::regclass
      and t.tgname='weddings_enforce_owner'
      and not t.tgisinternal
      and t.tgenabled='O'
  ) then
    raise exception 'expected enabled public.weddings owner trigger before Contacts backfill';
  end if;
end $$;
alter table public.weddings disable trigger weddings_enforce_owner;

with latest_answer as (
  select distinct on (fi.wedding_id) fi.wedding_id, fa.answer_json
  from public.form_instances fi
  join public.forms f on f.id=fi.form_id and f.category='contract'
  join public.form_answers fa on fa.instance_id=fi.id
  where fi.wedding_id is not null and fi.status in ('submitted','approved')
  order by fi.wedding_id,fi.submitted_at desc nulls last,fi.created_at desc,fi.id desc
), raw_fields as (
  select w.id as wedding_id,
    case
      when jsonb_typeof(a.answer_json->'fields')='object' and a.answer_json->'fields'<>'{}'::jsonb
        then a.answer_json->'fields'
      when jsonb_typeof(a.answer_json->'values')='object' and (a.answer_json->'values' ?|
        array['q-p1-first','sys_p1_first','q-p1-last','sys_p1_last','q-p1-phone','sys_p1_phone','q-p1-email','sys_p1_email',
          'q-p1-address','sys_p1_address','q-p1-postal','q-p1-postal-code','q-p1-city','q-p2-first','sys_p2_first','q-p2-last','sys_p2_last',
          'q-p2-phone','sys_p2_phone','q-p2-email','sys_p2_email','q-p2-address','sys_p2_address'])
        then jsonb_build_object(
          'partner1.firstName',coalesce(a.answer_json->'values'->'q-p1-first',a.answer_json->'values'->'sys_p1_first'),
          'partner1.lastName',coalesce(a.answer_json->'values'->'q-p1-last',a.answer_json->'values'->'sys_p1_last'),
          'partner1.phone',coalesce(a.answer_json->'values'->'q-p1-phone',a.answer_json->'values'->'sys_p1_phone'),
          'partner1.email',coalesce(a.answer_json->'values'->'q-p1-email',a.answer_json->'values'->'sys_p1_email'),
          'partner1.address',coalesce(a.answer_json->'values'->'q-p1-address',a.answer_json->'values'->'sys_p1_address'),
          'partner1.postalCode',coalesce(a.answer_json->'values'->'q-p1-postal',a.answer_json->'values'->'q-p1-postal-code'),
          'partner1.city',a.answer_json->'values'->'q-p1-city',
          'partner2.firstName',coalesce(a.answer_json->'values'->'q-p2-first',a.answer_json->'values'->'sys_p2_first'),
          'partner2.lastName',coalesce(a.answer_json->'values'->'q-p2-last',a.answer_json->'values'->'sys_p2_last'),
          'partner2.phone',coalesce(a.answer_json->'values'->'q-p2-phone',a.answer_json->'values'->'sys_p2_phone'),
          'partner2.email',coalesce(a.answer_json->'values'->'q-p2-email',a.answer_json->'values'->'sys_p2_email'),
          'partner2.address',coalesce(a.answer_json->'values'->'q-p2-address',a.answer_json->'values'->'sys_p2_address'))
      else coalesce((select jsonb_object_agg(k.field_key,x.item->'value')
        from jsonb_array_elements(coalesce(a.answer_json->'answers','[]'::jsonb)) x(item)
        cross join lateral (select case x.item->>'questionId'
          when 'q-p1-first' then 'partner1.firstName' when 'sys_p1_first' then 'partner1.firstName'
          when 'q-p1-last' then 'partner1.lastName' when 'sys_p1_last' then 'partner1.lastName'
          when 'q-p1-phone' then 'partner1.phone' when 'sys_p1_phone' then 'partner1.phone'
          when 'q-p1-email' then 'partner1.email' when 'sys_p1_email' then 'partner1.email'
          when 'q-p1-address' then 'partner1.address' when 'sys_p1_address' then 'partner1.address'
          when 'q-p1-postal' then 'partner1.postalCode' when 'q-p1-postal-code' then 'partner1.postalCode'
          when 'q-p1-city' then 'partner1.city'
          when 'q-p2-first' then 'partner2.firstName' when 'sys_p2_first' then 'partner2.firstName'
          when 'q-p2-last' then 'partner2.lastName' when 'sys_p2_last' then 'partner2.lastName'
          when 'q-p2-phone' then 'partner2.phone' when 'sys_p2_phone' then 'partner2.phone'
          when 'q-p2-email' then 'partner2.email' when 'sys_p2_email' then 'partner2.email'
          when 'q-p2-address' then 'partner2.address' when 'sys_p2_address' then 'partner2.address'
          else null end as field_key) k
        where k.field_key is not null), '{}'::jsonb)
    end as fields
  from public.weddings w left join latest_answer a on a.wedding_id=w.id
), effective as (
  select w.id,
    coalesce(collaboration_private.clean_contact_name_v3(f.fields->>'partner1.firstName'),
      collaboration_private.clean_contact_name_v3(split_part(btrim(w.bride_name),' ',1))) as bride_first,
    coalesce(collaboration_private.clean_contact_name_v3(f.fields->>'partner1.lastName'),
      collaboration_private.clean_contact_name_v3(substr(btrim(w.bride_name),length(split_part(btrim(w.bride_name),' ',1))+2))) as bride_last,
    coalesce(collaboration_private.clean_contact_name_v3(f.fields->>'partner2.firstName'),
      collaboration_private.clean_contact_name_v3(split_part(btrim(w.groom_name),' ',1))) as groom_first,
    coalesce(collaboration_private.clean_contact_name_v3(f.fields->>'partner2.lastName'),
      collaboration_private.clean_contact_name_v3(substr(btrim(w.groom_name),length(split_part(btrim(w.groom_name),' ',1))+2))) as groom_last,
    coalesce(nullif(btrim(f.fields->>'partner1.phone'),''),w.phone) as bride_phone,
    coalesce(nullif(btrim(f.fields->>'partner1.email'),''),w.email) as bride_email,
    coalesce(nullif(btrim(f.fields->>'partner2.phone'),''),w.groom_phone) as groom_phone,
    coalesce(nullif(btrim(f.fields->>'partner2.email'),''),w.groom_email) as groom_email,
    case
      when nullif(btrim(a.address),'') is not null
        then btrim(a.address)
      else w.contract_address
    end as contract_address,
    coalesce(nullif(btrim(f.fields->>'partner1.postalCode'),''),
      nullif(btrim(f.fields#>>'{partner1.address,postalCode}'),''),w.contract_postal_code) as contract_postal_code,
    coalesce(nullif(btrim(f.fields->>'partner1.city'),''),
      nullif(btrim(f.fields#>>'{partner1.address,city}'),''),w.contract_city) as contract_city
  from public.weddings w join raw_fields f on f.wedding_id=w.id
  cross join lateral (select coalesce(
    nullif(collaboration_private.format_contact_location_v3(f.fields->'partner1.address'),''),
    nullif(collaboration_private.format_contact_location_v3(f.fields->'partner2.address'),'')) as address) a
)
update public.weddings w set
  bride_first_name=e.bride_first, bride_last_name=e.bride_last,
  groom_first_name=e.groom_first, groom_last_name=e.groom_last,
  groom_email=e.groom_email,
  bride_name=coalesce(nullif(concat_ws(' ',nullif(e.bride_first,''),nullif(e.bride_last,'')),''),w.bride_name),
  groom_name=coalesce(nullif(concat_ws(' ',nullif(e.groom_first,''),nullif(e.groom_last,'')),''),w.groom_name),
  phone=e.bride_phone,email=e.bride_email,groom_phone=e.groom_phone,
  contract_address=e.contract_address,contract_postal_code=e.contract_postal_code,contract_city=e.contract_city
from effective e where e.id=w.id;

alter table public.weddings enable trigger weddings_enforce_owner;

create function collaboration_private.bump_wedding_contacts_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.bride_first_name,new.bride_last_name,new.groom_first_name,new.groom_last_name,
      new.bride_name,new.groom_name,new.phone,new.email,new.groom_phone,new.groom_email,new.contract_address,
      new.contract_postal_code,new.contract_city,new.correspondence)
    is distinct from row(old.bride_first_name,old.bride_last_name,old.groom_first_name,old.groom_last_name,
      old.bride_name,old.groom_name,old.phone,old.email,old.groom_phone,old.groom_email,old.contract_address,
      old.contract_postal_code,old.contract_city,old.correspondence) then
    new.contacts_revision:=old.contacts_revision+1;
  else
    new.contacts_revision:=old.contacts_revision;
  end if;
  return new;
end $$;

create trigger weddings_bump_contacts_revision
before update on public.weddings for each row execute function collaboration_private.bump_wedding_contacts_revision();

create function collaboration_private.write_wedding_contacts_v3(
  p_wedding_id uuid,p_expected_revision text,p_contacts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_w public.weddings%rowtype; v_corr jsonb; v_normalized_corr jsonb:='[]'::jsonb;
  v_entry jsonb; v_channel text; v_value text; v_id text;
  v_first jsonb; v_seen text[]:='{}'; v_seen_ids text[]:='{}'; v_key text; v_next_revision bigint;
  v_actor uuid:=auth.uid(); v_original_claim_sub text; v_context jsonb; v_contacts_level smallint;
begin
  if v_actor is null or p_wedding_id is null or p_expected_revision !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(p_contacts) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_contacts))<>4
    or not(p_contacts ?& array['bride','groom','contract_address','correspondence']) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if jsonb_typeof(p_contacts->'bride') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_contacts->'bride'))<>4
    or not(p_contacts->'bride' ?& array['first_name','last_name','phone','email'])
    or jsonb_typeof(p_contacts->'groom') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_contacts->'groom'))<>4
    or not(p_contacts->'groom' ?& array['first_name','last_name','phone','email'])
    or jsonb_typeof(p_contacts->'contract_address') not in ('string','null')
    or jsonb_typeof(p_contacts->'correspondence') is distinct from 'array' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if exists(select 1 from jsonb_each(p_contacts->'bride') x where jsonb_typeof(x.value) not in ('string','null'))
    or exists(select 1 from jsonb_each(p_contacts->'groom') x where jsonb_typeof(x.value) not in ('string','null')) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if exists(select 1 from jsonb_each_text(p_contacts->'bride') x where length(x.value)>500)
    or exists(select 1 from jsonb_each_text(p_contacts->'groom') x where length(x.value)>500)
    or length(coalesce(p_contacts->>'contract_address',''))>1000 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if nullif(btrim(p_contacts#>>'{bride,first_name}'),'') is null
    or nullif(btrim(p_contacts#>>'{groom,first_name}'),'') is null then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_corr:=p_contacts->'correspondence';
  for v_entry in select e.value from jsonb_array_elements(v_corr) with ordinality as e(value,ordinality) order by e.ordinality loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_entry))<>3
      or not(v_entry ?& array['id','channel','value'])
      or jsonb_typeof(v_entry->'id') is distinct from 'string'
      or jsonb_typeof(v_entry->'channel') is distinct from 'string'
      or jsonb_typeof(v_entry->'value') is distinct from 'string'
      or (v_entry->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_channel:=v_entry->>'channel'; v_value:=btrim(v_entry->>'value'); v_id:=v_entry->>'id';
    if v_channel not in ('email','instagram','facebook') or v_value='' or length(v_value)>500
      or v_value ~ '[[:cntrl:]]' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    if v_id=any(v_seen_ids) then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_seen_ids:=array_append(v_seen_ids,v_id);
    if v_channel='email' then
      if v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
      v_value:=lower(v_value);
    elsif v_channel='instagram' then
      if v_value ~* '^https?://' then
        if v_value !~* '^https?://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$' then
          raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
        v_value:='https://instagram.com/'||regexp_replace(v_value,'^https?://(www\.)?instagram\.com/([^/?#]+)/?$','\2','i');
      else
        if v_value !~* '^@?[A-Za-z0-9._]{1,30}$' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
        v_value:='@'||regexp_replace(v_value,'^@','');
      end if;
    end if;
    v_key:=v_channel||':'||lower(regexp_replace(v_value,'^@',''));
    if v_channel='instagram' and v_value ~* '^https?://' then
      v_key:='instagram:'||lower(regexp_replace(v_value,'^https?://(www\.)?instagram\.com/([^/?#]+).*$','\2','i'));
    end if;
    if v_key=any(v_seen) then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_seen:=array_append(v_seen,v_key);
    v_normalized_corr:=v_normalized_corr||jsonb_build_array(jsonb_build_object('id',v_id,'channel',v_channel,'value',v_value));
  end loop;
  select * into v_w from public.weddings w where w.id=p_wedding_id and w.status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_w.user_id is distinct from v_actor then
    v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
    if v_context is null or v_context->>'relationship' is distinct from 'collaborator' then
      raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
    v_contacts_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'contacts');
    if v_contacts_level is null or v_contacts_level<2 then
      raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  end if;
  if v_w.contacts_revision::text<>p_expected_revision then raise exception using errcode='P0001',message='CONFLICT'; end if;
  v_first:=p_contacts->'bride';
  -- Only this revoked, internal writer reaches the owner-guarded row update.
  -- Its public callers have already authenticated the actor and checked either
  -- wedding ownership or level-two Contacts authority. Present the persisted
  -- owner to the existing trigger for this one update, then restore the actor
  -- claim before returning. No caller-supplied identity reaches this context.
  v_original_claim_sub:=coalesce(pg_catalog.current_setting('request.jwt.claim.sub',true),'');
  perform pg_catalog.set_config('request.jwt.claim.sub',v_w.user_id::text,true);
  update public.weddings w set
    bride_first_name=nullif(btrim(v_first->>'first_name'),''), bride_last_name=nullif(btrim(v_first->>'last_name'),''),
    groom_first_name=nullif(btrim(p_contacts#>>'{groom,first_name}'),''), groom_last_name=nullif(btrim(p_contacts#>>'{groom,last_name}'),''),
    bride_name=concat_ws(' ',nullif(btrim(v_first->>'first_name'),''),nullif(btrim(v_first->>'last_name'),'')),
    groom_name=concat_ws(' ',nullif(btrim(p_contacts#>>'{groom,first_name}'),''),nullif(btrim(p_contacts#>>'{groom,last_name}'),'')),
    phone=nullif(btrim(v_first->>'phone'),''),email=nullif(lower(btrim(v_first->>'email')),''),
    groom_phone=nullif(btrim(p_contacts#>>'{groom,phone}'),''),groom_email=nullif(lower(btrim(p_contacts#>>'{groom,email}')),''),
    contract_address=nullif(btrim(p_contacts->>'contract_address'),''),contract_postal_code=null,contract_city=null,
    correspondence=v_normalized_corr,
    correspondence_channel=nullif(v_normalized_corr->0->>'channel',''),correspondence_value=nullif(v_normalized_corr->0->>'value','')
  where w.id=p_wedding_id and w.contacts_revision::text=p_expected_revision
  returning w.contacts_revision into v_next_revision;
  perform pg_catalog.set_config('request.jwt.claim.sub',v_original_claim_sub,true);
  if not found then raise exception using errcode='P0001',message='CONFLICT'; end if;
  return jsonb_build_object('status','ok','contacts_revision',v_next_revision::text);
end $$;

create function public.get_my_wedding_contacts_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_w public.weddings%rowtype;
begin
  if auth.uid() is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.* into v_w from public.weddings w where w.id=p_wedding_id and w.user_id=auth.uid() and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return jsonb_build_object('wedding_id',v_w.id,'contacts_revision',v_w.contacts_revision::text,
    'bride',jsonb_build_object('first_name',v_w.bride_first_name,'last_name',v_w.bride_last_name,'phone',v_w.phone,'email',v_w.email),
    'groom',jsonb_build_object('first_name',v_w.groom_first_name,'last_name',v_w.groom_last_name,'phone',v_w.groom_phone,'email',v_w.groom_email),
    'contract_address',nullif(collaboration_private.format_effective_contact_address_v3(v_w.contract_address,v_w.contract_postal_code,v_w.contract_city),''),
    'correspondence',coalesce(nullif(v_w.correspondence,'[]'::jsonb),
      case when v_w.correspondence_channel is not null and v_w.correspondence_value is not null then
        jsonb_build_array(jsonb_build_object('id',
          (substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),1,8)||'-'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),9,4)||'-4'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),14,3)||'-8'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),18,3)||'-'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),21,12)),
          'channel',v_w.correspondence_channel,'value',v_w.correspondence_value)) else '[]'::jsonb end));
end $$;

create function public.get_my_collaborative_contacts_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_level smallint; v_w public.weddings%rowtype;
begin
  if auth.uid() is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' is distinct from 'collaborator' then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.* into v_w from public.weddings w where w.id=p_wedding_id and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'contacts');
  if v_level is null or v_level<1 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  return jsonb_build_object('wedding_id',v_w.id,'access_version',v_context->>'access_version',
    'contacts_level',v_level,'contacts_revision',v_w.contacts_revision::text,
    'bride',jsonb_build_object('first_name',v_w.bride_first_name,'last_name',v_w.bride_last_name,'phone',v_w.phone,'email',v_w.email),
    'groom',jsonb_build_object('first_name',v_w.groom_first_name,'last_name',v_w.groom_last_name,'phone',v_w.groom_phone,'email',v_w.groom_email),
    'contract_address',nullif(collaboration_private.format_effective_contact_address_v3(v_w.contract_address,v_w.contract_postal_code,v_w.contract_city),''),
    'correspondence',coalesce(nullif(v_w.correspondence,'[]'::jsonb),
      case when v_w.correspondence_channel is not null and v_w.correspondence_value is not null then
        jsonb_build_array(jsonb_build_object('id',
          (substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),1,8)||'-'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),9,4)||'-4'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),14,3)||'-8'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),18,3)||'-'||
           substr(md5(v_w.id::text||':'||v_w.correspondence_channel||':'||v_w.correspondence_value),21,12)),
          'channel',v_w.correspondence_channel,'value',v_w.correspondence_value))
        else '[]'::jsonb end));
end $$;

create function public.update_my_collaborative_contacts_v3(
  p_wedding_id uuid,p_expected_access_version text,p_expected_contacts_revision text,p_contacts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_context jsonb; v_level smallint; v_w public.weddings%rowtype; v_result jsonb;
begin
  if auth.uid() is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.* into v_w from public.weddings w where w.id=p_wedding_id and w.status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' is distinct from 'collaborator' then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'contacts');
  if v_level is null or v_level<2 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if p_expected_access_version is distinct from v_context->>'access_version' then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  if v_w.contacts_revision::text is distinct from p_expected_contacts_revision then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  v_result:=collaboration_private.write_wedding_contacts_v3(p_wedding_id,p_expected_contacts_revision,p_contacts);
  return v_result||jsonb_build_object('access_version',v_context->>'access_version','contacts_level',v_level);
end $$;

create function public.update_my_wedding_contacts_v3(
  p_wedding_id uuid,p_expected_contacts_revision text,p_contacts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_w public.weddings%rowtype;
begin
  if auth.uid() is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.* into v_w from public.weddings w where w.id=p_wedding_id and w.user_id=auth.uid() and w.status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_w.contacts_revision::text is distinct from p_expected_contacts_revision then raise exception using errcode='P0001',message='CONFLICT'; end if;
  return collaboration_private.write_wedding_contacts_v3(p_wedding_id,p_expected_contacts_revision,p_contacts);
end $$;

revoke all on function collaboration_private.bump_wedding_contacts_revision() from public,anon,authenticated,service_role;
revoke all on function collaboration_private.write_wedding_contacts_v3(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_my_collaborative_contacts_v3(uuid) from public,anon,service_role;
revoke all on function public.get_my_wedding_contacts_v3(uuid) from public,anon,service_role;
revoke all on function public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb) from public,anon,service_role;
revoke all on function public.update_my_wedding_contacts_v3(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.get_my_collaborative_contacts_v3(uuid) to authenticated;
grant execute on function public.get_my_wedding_contacts_v3(uuid) to authenticated;
grant execute on function public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb) to authenticated;
grant execute on function public.update_my_wedding_contacts_v3(uuid,text,jsonb) to authenticated;

commit;
