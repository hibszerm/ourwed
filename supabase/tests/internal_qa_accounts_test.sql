begin;
select plan(35);

select has_table('public', 'internal_qa_accounts', 'private QA registry exists');
select has_table('public', 'internal_qa_provisioning_authorizations', 'one-time authorization table exists');
select has_column('public', 'internal_qa_accounts', 'user_id', 'registry is keyed by Auth user id');
select has_column('public', 'internal_qa_accounts', 'provisioned_by', 'registry records its operator');
select has_column('public', 'internal_qa_accounts', 'purpose', 'registry records its purpose');
select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'internal_qa_accounts'),
  'registry enables and forces RLS');
select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'internal_qa_provisioning_authorizations'),
  'authorization table enables and forces RLS');
select ok(not has_table_privilege('anon', 'public.internal_qa_accounts', 'SELECT'), 'anon cannot read registry');
select ok(not has_table_privilege('anon', 'public.internal_qa_accounts', 'INSERT'), 'anon cannot insert registry rows');
select ok(not has_table_privilege('authenticated', 'public.internal_qa_accounts', 'SELECT'), 'authenticated cannot read registry');
select ok(not has_table_privilege('authenticated', 'public.internal_qa_accounts', 'INSERT'), 'authenticated cannot insert registry rows');
select ok(not has_table_privilege('authenticated', 'public.internal_qa_accounts', 'UPDATE'), 'authenticated cannot update registry rows');
select ok(not has_table_privilege('authenticated', 'public.internal_qa_accounts', 'DELETE'), 'authenticated cannot delete registry rows');
select ok(has_table_privilege('service_role', 'public.internal_qa_accounts', 'SELECT'), 'service role can read registry');
select ok(not exists (select 1 from pg_catalog.pg_policies
  where schemaname = 'public' and tablename in (
    'internal_qa_accounts', 'internal_qa_provisioning_authorizations'
  )), 'private tables expose no client policies');
select ok(not has_table_privilege('service_role', 'public.internal_qa_provisioning_authorizations', 'SELECT'),
  'service role cannot read authorization records directly');
select ok(not has_table_privilege('service_role', 'public.internal_qa_provisioning_authorizations', 'INSERT'),
  'service role writes authorization only through the RPC');
select ok(not has_function_privilege('anon',
  'public.create_internal_qa_provisioning_authorization(text,text,text)', 'EXECUTE'),
  'anon cannot create QA authorizations');
select ok(not has_function_privilege('authenticated',
  'public.create_internal_qa_provisioning_authorization(text,text,text)', 'EXECUTE'),
  'authenticated cannot create QA authorizations');
select ok(has_function_privilege('service_role',
  'public.create_internal_qa_provisioning_authorization(text,text,text)', 'EXECUTE'),
  'service role can create QA authorizations');
select ok((select p.proconfig @> array['search_path=""']
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_new_user'),
  'Auth bootstrap trigger uses an empty search path');
select ok((select p.proconfig @> array['search_path=""']
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'on_public_user_created_init_billing'),
  'billing bootstrap trigger uses an empty search path');
select ok((select p.proconfig @> array['search_path=""']
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'provision_official_pre_wedding_presets'),
  'preset helper uses an empty search path');
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'anon cannot execute Auth bootstrap trigger directly');
select ok(not has_function_privilege('authenticated', 'public.on_public_user_created_init_billing()', 'EXECUTE'),
  'authenticated cannot execute billing bootstrap trigger directly');
select ok(exists (
  select 1 from pg_catalog.pg_trigger t
  where t.tgname = 'on_auth_user_qa_metadata_updated'
    and t.tgrelid = 'auth.users'::regclass
    and not t.tgisinternal
), 'GoTrue app metadata update trigger completes the trusted QA handoff');
select ok(not has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE'),
  'service role cannot execute Auth bootstrap trigger directly');
select ok(not has_function_privilege('service_role', 'public.on_public_user_created_init_billing()', 'EXECUTE'),
  'service role cannot execute billing bootstrap trigger directly');
select ok(not has_function_privilege('service_role', 'public.provision_official_pre_wedding_presets(uuid)', 'EXECUTE'),
  'service role cannot execute the preset helper directly');

select ok((select p.pronargs = 0
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'account_has_pro_access'),
  'Pro helper has no caller-supplied user identifier');
select ok((select p.prosecdef and p.provolatile = 's'
      and p.proconfig @> array['search_path=""']
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'account_has_pro_access'),
  'Pro helper remains stable SECURITY DEFINER with empty search path and postgres owner');
select ok(has_function_privilege('authenticated', 'public.account_has_pro_access()', 'EXECUTE')
      and has_function_privilege('service_role', 'public.account_has_pro_access()', 'EXECUTE')
      and not has_function_privilege('anon', 'public.account_has_pro_access()', 'EXECUTE'),
  'Pro helper grants remain authenticated/service-role only');
select ok((select pg_catalog.pg_get_functiondef(p.oid) ilike '%auth.uid()%'
      and pg_catalog.pg_get_functiondef(p.oid) ilike '%internal_qa_accounts%'
      and pg_catalog.pg_get_functiondef(p.oid) ilike '%resolve_user_entitlement%'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'account_has_pro_access'),
  'Pro helper binds QA check to current actor and retains commercial fallback');
select ok(exists (select 1 from pg_catalog.pg_index i
  where i.indrelid = 'public.internal_qa_accounts'::regclass and i.indisprimary),
  'QA helper lookup is backed by the registry primary-key index');
select ok(exists (select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'weddings' and policyname = 'weddings_insert_own'
      and cmd = 'INSERT' and with_check ilike '%user_id = auth.uid()%'
      and with_check ilike '%account_has_pro_access()%')
    and exists (select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'weddings' and policyname = 'weddings_select_own'
        and cmd = 'SELECT' and qual ilike '%user_id = auth.uid()%'
        and qual not ilike '%collaboration%'),
  'wedding creation remains Pro-gated and wedding reads remain owner-scoped');

select * from finish();
rollback;
