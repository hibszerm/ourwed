select version from supabase_migrations.schema_migrations where version = '20260908190000';

select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
join pg_class on pg_class.oid = polrelid
where relname = 'form_instances'
  and polname in ('form_instances_insert_own','form_instances_update_own')
order by polname;

select
  (prosrc like '%instance_public := jsonb_build_object%') as get_has_dto,
  (prosrc not like '%to_jsonb(inst)%' and prosrc not like '%to_jsonb(form_row)%') as get_no_to_jsonb_row,
  (position('instance_public' in prosrc) > 0
   and position('''user_id''' in substring(prosrc from position('instance_public' in prosrc) for 500)) = 0) as instance_dto_no_user_id
from pg_proc
where proname = 'public_get_form_by_token';

select
  (prosrc like '%MISSING_TRUSTED_PRICE%') as submit_fail_closed,
  (prosrc not like '%p_answer_json%additionalServiceSnapshots%') as submit_no_client_price_path
from pg_proc
where proname = 'public_submit_form_by_token';
