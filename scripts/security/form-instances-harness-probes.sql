-- Probes after applying 20260908190000 migration on harness DB.
-- Expect all raises to be caught and reported as PASS/FAIL via NOTICE.

\set ON_ERROR_STOP on

-- Helper: set jwt sub
create or replace function public.test_set_uid(p_uid text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

do $$
declare
  owner_a uuid := '11111111-1111-1111-1111-111111111111';
  owner_b uuid := '22222222-2222-2222-2222-222222222222';
  wedding_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  wedding_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  form_id uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  extra_id uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  inst_id uuid;
  lead_id uuid;
  tok text;
  payload jsonb;
  err text;
begin
  -- RLS applies to table owner only when FORCE; SET ROLE authenticated for policy checks.
  execute 'set local role authenticated';

  -- OWNER can create for own wedding
  perform public.test_set_uid(owner_a::text);
  insert into public.form_instances (form_id, wedding_id, user_id, token, status, options_snapshot)
  values (
    form_id, wedding_a, owner_a, 'tok-owner-create-ok-xx', 'pending',
    jsonb_build_object(
      'additionalServiceOptions', jsonb_build_array(
        jsonb_build_object('id', extra_id::text, 'name', 'Album', 'price', 400)
      ),
      'packageOptions', jsonb_build_array(
        jsonb_build_object('id', 'pppppppp-pppp-pppp-pppp-pppppppppppp', 'name', 'P', 'price', 5000)
      )
    )
  )
  returning id into inst_id;
  raise notice 'PASS OWNER create own wedding';

  -- OWNER can update own
  update public.form_instances set status = 'opened' where id = inst_id;
  raise notice 'PASS OWNER update own';

  -- NON-OWNER cannot create referencing other wedding
  begin
    perform public.test_set_uid(owner_b::text);
    insert into public.form_instances (form_id, wedding_id, user_id, token, status)
    values (form_id, wedding_a, owner_b, 'tok-nonowner-create-bad', 'pending');
    raise exception 'FAIL NON-OWNER create should be blocked';
  exception when others then
    if sqlerrm like '%FAIL NON-OWNER%' then raise; end if;
    raise notice 'PASS NON-OWNER create blocked: %', sqlstate;
  end;

  -- NON-OWNER cannot update to other studio wedding
  begin
    perform public.test_set_uid(owner_a::text);
    update public.form_instances
    set wedding_id = wedding_b
    where id = inst_id;
    raise exception 'FAIL NON-OWNER reassign wedding should be blocked';
  exception when others then
    if sqlerrm like '%FAIL NON-OWNER reassign%' then raise; end if;
    raise notice 'PASS cross-tenant wedding reassignment blocked: %', sqlstate;
  end;

  -- LEAD path wedding_id NULL
  perform public.test_set_uid(owner_a::text);
  insert into public.form_instances (form_id, wedding_id, user_id, token, status)
  values (form_id, null, owner_a, 'tok-lead-null-wedding-xx', 'pending')
  returning id into lead_id;
  raise notice 'PASS LEAD null wedding_id create';

  -- PUBLIC TOKEN load DTO
  tok := 'tok-owner-create-ok-xx';
  -- reset status for get
  update public.form_instances set status = 'pending' where token = tok;
  payload := public.public_get_form_by_token(tok);
  if payload is null then raise exception 'FAIL public get null'; end if;
  if payload->'instance' ? 'user_id' then raise exception 'FAIL leaked instance.user_id'; end if;
  if payload->'instance' ? 'wedding_id' then raise exception 'FAIL leaked instance.wedding_id'; end if;
  if payload->'form' ? 'user_id' then raise exception 'FAIL leaked form.user_id'; end if;
  if payload->'instance'->>'status' is null then raise exception 'FAIL missing status'; end if;
  if payload->'form'->'schema' is null then raise exception 'FAIL missing schema'; end if;
  if payload->'optionsSnapshot' is null then raise exception 'FAIL missing optionsSnapshot'; end if;
  raise notice 'PASS PUBLIC DTO omits ownership internals';

  -- PUBLIC SUBMIT trusted price works
  update public.form_instances set status = 'opened' where token = tok;
  payload := public.public_submit_form_by_token(
    tok,
    jsonb_build_object(
      'fields', jsonb_build_object(
        'selectedAdditionalServiceIds', jsonb_build_array(extra_id::text)
      )
    )
  );
  if payload->'instance'->>'status' <> 'submitted' then
    raise exception 'FAIL trusted submit status';
  end if;
  if exists (
    select 1 from public.wedding_extra_services
    where wedding_id = wedding_a and price_snapshot = 400
  ) then
    raise notice 'PASS PUBLIC SUBMIT trusted price applied';
  else
    raise exception 'FAIL trusted price not applied';
  end if;

  -- MALICIOUS: client price cannot override (need fresh instance)
  insert into public.form_instances (form_id, wedding_id, user_id, token, status, options_snapshot)
  values (
    form_id, wedding_a, owner_a, 'tok-malicious-price-xx', 'opened',
    jsonb_build_object(
      'additionalServiceOptions', jsonb_build_array(
        jsonb_build_object('id', extra_id::text, 'name', 'Album', 'price', 400)
      )
    )
  );
  -- Delete existing extra so insert path runs
  delete from public.wedding_extra_services where wedding_id = wedding_a;
  update public.weddings set contract_value = 5000 where id = wedding_a;

  payload := public.public_submit_form_by_token(
    'tok-malicious-price-xx',
    jsonb_build_object(
      'fields', jsonb_build_object(
        'selectedAdditionalServiceIds', jsonb_build_array(extra_id::text)
      ),
      'additionalServiceSnapshots', jsonb_build_array(
        jsonb_build_object('id', extra_id::text, 'price', 1)
      )
    )
  );
  if (select price_snapshot from public.wedding_extra_services where wedding_id = wedding_a limit 1) <> 400 then
    raise exception 'FAIL client price overrode trusted';
  end if;
  raise notice 'PASS MALICIOUS client price ignored (trusted 400 kept)';

  -- MISSING TRUSTED PRICE fails closed
  insert into public.form_instances (form_id, wedding_id, user_id, token, status, options_snapshot)
  values (
    form_id, wedding_a, owner_a, 'tok-missing-price-xxxx', 'opened',
    jsonb_build_object(
      'additionalServiceOptions', jsonb_build_array(
        jsonb_build_object('id', extra_id::text, 'name', 'Album')
      )
    )
  );
  delete from public.wedding_extra_services where wedding_id = wedding_a;
  begin
    perform public.public_submit_form_by_token(
      'tok-missing-price-xxxx',
      jsonb_build_object(
        'fields', jsonb_build_object(
          'selectedAdditionalServiceIds', jsonb_build_array(extra_id::text)
        ),
        'additionalServiceSnapshots', jsonb_build_array(
          jsonb_build_object('id', extra_id::text, 'price', 999)
        )
      )
    );
    raise exception 'FAIL missing trusted price should fail';
  exception when others then
    if sqlerrm like '%FAIL missing%' then raise; end if;
    if sqlerrm not like '%MISSING_TRUSTED_PRICE%' then
      raise exception 'FAIL unexpected error: %', sqlerrm;
    end if;
    raise notice 'PASS MISSING TRUSTED PRICE fails closed';
  end;

  -- CROSS-TENANT: form owned by A cannot mutate B via forged...
  -- Instance is always bound to wedding_id on the row; submit uses inst.wedding_id only.
  insert into public.form_instances (form_id, wedding_id, user_id, token, status, options_snapshot)
  values (
    form_id, wedding_a, owner_a, 'tok-cross-tenant-xxxx', 'opened',
    jsonb_build_object(
      'additionalServiceOptions', jsonb_build_array(
        jsonb_build_object('id', extra_id::text, 'name', 'Album', 'price', 400)
      )
    )
  );
  delete from public.wedding_extra_services where wedding_id in (wedding_a, wedding_b);
  perform public.public_submit_form_by_token(
    'tok-cross-tenant-xxxx',
    jsonb_build_object(
      'fields', jsonb_build_object(
        'selectedAdditionalServiceIds', jsonb_build_array(extra_id::text)
      )
    )
  );
  if exists (select 1 from public.wedding_extra_services where wedding_id = wedding_b) then
    raise exception 'FAIL mutated other tenant wedding';
  end if;
  if not exists (select 1 from public.wedding_extra_services where wedding_id = wedding_a) then
    raise exception 'FAIL did not mutate own wedding';
  end if;
  raise notice 'PASS CROSS-TENANT submit only touches bound wedding';

  raise notice 'ALL LOCAL FORM SECURITY PROBES PASSED';
end;
$$;
