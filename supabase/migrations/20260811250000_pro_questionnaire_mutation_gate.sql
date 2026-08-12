-- Questionnaire PRO write gate + token RPC entitlement assert.
-- SELECT unchanged. Public couple RPCs unchanged.
-- Does not weaken ownership checks.

-- questionnaire_templates
drop policy if exists qt_insert_own on public.questionnaire_templates;
create policy qt_insert_own on public.questionnaire_templates
  for insert to authenticated
  with check (owner_id = auth.uid() and public.account_has_pro_access());

drop policy if exists qt_update_own on public.questionnaire_templates;
create policy qt_update_own on public.questionnaire_templates
  for update to authenticated
  using (owner_id = auth.uid() and public.account_has_pro_access())
  with check (owner_id = auth.uid() and public.account_has_pro_access());

drop policy if exists qt_delete_own on public.questionnaire_templates;
create policy qt_delete_own on public.questionnaire_templates
  for delete to authenticated
  using (owner_id = auth.uid() and public.account_has_pro_access());

-- wedding_questionnaires
drop policy if exists wq_insert_own on public.wedding_questionnaires;
create policy wq_insert_own on public.wedding_questionnaires
  for insert to authenticated
  with check (owner_id = auth.uid() and public.account_has_pro_access());

drop policy if exists wq_update_own on public.wedding_questionnaires;
create policy wq_update_own on public.wedding_questionnaires
  for update to authenticated
  using (owner_id = auth.uid() and public.account_has_pro_access())
  with check (owner_id = auth.uid() and public.account_has_pro_access());

drop policy if exists wq_delete_own on public.wedding_questionnaires;
create policy wq_delete_own on public.wedding_questionnaires
  for delete to authenticated
  using (owner_id = auth.uid() and public.account_has_pro_access());

-- wedding_questionnaire_responses (studio-side delete only; public RPCs are SECURITY DEFINER)
drop policy if exists wqr_delete_own on public.wedding_questionnaire_responses;
create policy wqr_delete_own on public.wedding_questionnaire_responses
  for delete to authenticated
  using (
    public.account_has_pro_access()
    and exists (
      select 1
      from public.wedding_questionnaires wq
      where wq.id = wedding_questionnaire_responses.questionnaire_id
        and wq.owner_id = auth.uid()
    )
  );

-- form_answers (studio-side writes)
drop policy if exists form_answers_insert_own on public.form_answers;
create policy form_answers_insert_own on public.form_answers for insert to authenticated
  with check (
    public.is_form_instance_owner(instance_id)
    and public.account_has_pro_access()
  );
drop policy if exists form_answers_update_own on public.form_answers;
create policy form_answers_update_own on public.form_answers for update to authenticated
  using (
    public.is_form_instance_owner(instance_id)
    and public.account_has_pro_access()
  )
  with check (
    public.is_form_instance_owner(instance_id)
    and public.account_has_pro_access()
  );
drop policy if exists form_answers_delete_own on public.form_answers;
create policy form_answers_delete_own on public.form_answers for delete to authenticated
  using (
    public.is_form_instance_owner(instance_id)
    and public.account_has_pro_access()
  );

-- SECURITY DEFINER token RPC must assert PRO (bypasses table RLS).
create or replace function public.generate_prewedding_token(p_questionnaire_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_hash  text;
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.wedding_questionnaires
  where id = p_questionnaire_id;

  if v_owner is null then
    raise exception 'questionnaire_not_found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

  -- Entitlement: expired studios cannot mint/rotate public links.
  perform public.assert_account_can_mutate_pro_data();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  update public.wedding_questionnaires
  set public_token_hash = v_hash,
      updated_at        = timezone('utc', now())
  where id = p_questionnaire_id;

  return v_token;
end;
$$;

revoke all on function public.generate_prewedding_token(uuid) from public, anon;
grant execute on function public.generate_prewedding_token(uuid) to authenticated;

-- Harden assert message for frontend PRO_ACCESS_REQUIRED mapping.
create or replace function public.assert_account_can_mutate_pro_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.account_has_pro_access() then
    raise exception 'PRO_ACCESS_REQUIRED'
      using errcode = 'P0001',
            hint = 'Active PRO entitlement required for this mutation',
            detail = 'pro_required';
  end if;
end;
$$;

notify pgrst, 'reload schema';
