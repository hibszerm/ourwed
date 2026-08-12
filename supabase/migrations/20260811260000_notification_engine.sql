-- Notification Engine V1: durable events, deliveries, preferences, enqueue helper.
-- In-app reuses public.notifications. Email via Edge dispatcher + Resend.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid references public.billing_accounts(id) on delete set null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  event_key text not null,
  payload_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  constraint notification_events_event_key_unique unique (event_key)
);

create index if not exists notification_events_recipient_created_idx
  on public.notification_events (recipient_user_id, created_at desc);
create index if not exists notification_events_type_created_idx
  on public.notification_events (event_type, created_at desc);

comment on table public.notification_events is
  'Durable domain notification outbox. payload_safe must never store answers/tokens/PII beyond display labels.';
comment on column public.notification_events.event_key is
  'Exactly-once key, e.g. questionnaire.contract.completed:<instance_id>';

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  skip_reason text,
  provider text,
  provider_message_id text,
  last_error_code text,
  idempotency_key text,
  in_app_notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  constraint notification_deliveries_unique unique (event_id, channel, recipient_user_id)
);

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (status, created_at)
  where status in ('pending', 'failed');
create index if not exists notification_deliveries_provider_msg_idx
  on public.notification_deliveries (provider_message_id)
  where provider_message_id is not null;

comment on table public.notification_deliveries is
  'Per-channel delivery attempts. Email body is never stored.';

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('in_app', 'email')),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_preferences_unique unique (user_id, event_type, channel)
);

create index if not exists notification_preferences_user_idx
  on public.notification_preferences (user_id);

comment on table public.notification_preferences is
  'User channel preferences. Missing row = catalog default (email ON for V1 questionnaire events).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;

-- Customers: preferences only. Events/deliveries are server-owned.
drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No customer policies on events/deliveries (service role / security definer only).
revoke all on public.notification_events from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notification_events to service_role;
grant select, insert, update on public.notification_deliveries to service_role;
grant all on public.notification_events to service_role;
grant all on public.notification_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- Preference helpers
-- ---------------------------------------------------------------------------

create or replace function public.notification_email_enabled(
  p_user_id uuid,
  p_event_type text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select enabled into v_enabled
  from public.notification_preferences
  where user_id = p_user_id
    and event_type = p_event_type
    and channel = 'email';

  if found then
    return coalesce(v_enabled, true);
  end if;

  -- Catalog defaults for V1 questionnaire events: email ON
  if p_event_type in (
    'questionnaire.contract.completed',
    'questionnaire.prewedding.completed'
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.notification_email_enabled(uuid, text) from public, anon;
grant execute on function public.notification_email_enabled(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enqueue (exactly-once event + deliveries)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_notification_event(
  p_recipient_user_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_key text,
  p_payload_safe jsonb,
  p_in_app_title text,
  p_in_app_body text,
  p_target_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_billing uuid;
  v_in_app_id uuid;
  v_email_enabled boolean;
  v_delivery_id uuid;
  v_idem text;
begin
  if p_recipient_user_id is null or p_event_key is null or length(trim(p_event_key)) = 0 then
    return null;
  end if;

  select ba.id into v_billing
  from public.billing_accounts ba
  where ba.owner_user_id = p_recipient_user_id
  limit 1;

  insert into public.notification_events (
    billing_account_id,
    recipient_user_id,
    event_type,
    entity_type,
    entity_id,
    event_key,
    payload_safe,
    processed_at
  )
  values (
    v_billing,
    p_recipient_user_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    trim(p_event_key),
    coalesce(p_payload_safe, '{}'::jsonb),
    timezone('utc', now())
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id
    from public.notification_events
    where event_key = trim(p_event_key);
    return v_event_id;
  end if;

  -- In-app (always for V1 critical questionnaire events)
  insert into public.notifications (
    user_id, type, title, content, entity_type, entity_id, link, read
  )
  values (
    p_recipient_user_id,
    'success',
    p_in_app_title,
    p_in_app_body,
    p_entity_type,
    p_entity_id,
    p_target_path,
    false
  )
  returning id into v_in_app_id;

  insert into public.notification_deliveries (
    event_id,
    recipient_user_id,
    channel,
    status,
    attempt_count,
    provider,
    in_app_notification_id,
    sent_at,
    updated_at
  )
  values (
    v_event_id,
    p_recipient_user_id,
    'in_app',
    'sent',
    1,
    'in_app',
    v_in_app_id,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (event_id, channel, recipient_user_id) do nothing;

  -- Email delivery
  v_email_enabled := public.notification_email_enabled(p_recipient_user_id, p_event_type);
  v_idem := 'ourwed/' || v_event_id::text || '/' || p_recipient_user_id::text || '/email';

  if v_email_enabled then
    insert into public.notification_deliveries (
      event_id,
      recipient_user_id,
      channel,
      status,
      attempt_count,
      provider,
      idempotency_key,
      updated_at
    )
    values (
      v_event_id,
      p_recipient_user_id,
      'email',
      'pending',
      0,
      'resend',
      left(v_idem, 256),
      timezone('utc', now())
    )
    on conflict (event_id, channel, recipient_user_id) do nothing
    returning id into v_delivery_id;
  else
    insert into public.notification_deliveries (
      event_id,
      recipient_user_id,
      channel,
      status,
      attempt_count,
      skip_reason,
      provider,
      idempotency_key,
      updated_at
    )
    values (
      v_event_id,
      p_recipient_user_id,
      'email',
      'skipped',
      0,
      'preference_disabled',
      'resend',
      left(v_idem, 256),
      timezone('utc', now())
    )
    on conflict (event_id, channel, recipient_user_id) do nothing;
  end if;

  -- Best-effort async dispatch via pg_net when configured.
  if v_delivery_id is not null then
    perform public.request_notification_email_dispatch(v_delivery_id);
  end if;

  return v_event_id;
exception
  when others then
    -- Never fail the parent questionnaire transaction due to notification issues.
    raise warning 'enqueue_notification_event failed: %', sqlerrm;
    return v_event_id;
end;
$$;

revoke all on function public.enqueue_notification_event(uuid, text, text, uuid, text, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_notification_event(uuid, text, text, uuid, text, jsonb, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Async dispatch request (pg_net optional)
-- ---------------------------------------------------------------------------

create or replace function public.request_notification_email_dispatch(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_full text;
begin
  if p_delivery_id is null then
    return;
  end if;

  begin
    v_url := nullif(current_setting('app.settings.notification_dispatcher_url', true), '');
  exception when others then
    v_url := null;
  end;

  begin
    v_secret := nullif(current_setting('app.settings.notification_dispatch_secret', true), '');
  exception when others then
    v_secret := null;
  end;

  if v_url is null then
    -- Fallback: leave pending for Dashboard webhook / manual Edge invoke.
    return;
  end if;

  v_full := rtrim(v_url, '/') || '?delivery_id=' || p_delivery_id::text;

  begin
    perform net.http_post(
      url := v_full,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', coalesce('Bearer ' || v_secret, '')
      ),
      body := jsonb_build_object('deliveryId', p_delivery_id)
    );
  exception when others then
    raise warning 'notification dispatch http_post failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.request_notification_email_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.request_notification_email_dispatch(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Domain enqueue helpers (called from submit RPCs)
-- ---------------------------------------------------------------------------

create or replace function public.notify_contract_questionnaire_completed(
  p_instance_id uuid,
  p_answer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_wedding uuid;
  v_couple text;
  v_date text;
  v_path text;
  v_title text;
  v_body text;
  v_key text;
  v_payload jsonb;
begin
  select fi.user_id, fi.wedding_id
  into v_user, v_wedding
  from public.form_instances fi
  where fi.id = p_instance_id;

  if v_user is null then
    return;
  end if;

  if v_wedding is not null then
    select
      nullif(trim(coalesce(w.bride_name, '') ||
        case when coalesce(w.groom_name, '') <> '' and coalesce(w.bride_name, '') <> '' then ' i ' else '' end ||
        coalesce(w.groom_name, '')), ''),
      coalesce(w.wedding_date::text, null)
    into v_couple, v_date
    from public.weddings w
    where w.id = v_wedding;

    v_path := '/sluby/' || v_wedding::text || '?tab=contract_finance';
  else
    v_path := '/ankiety/' || p_instance_id::text;
  end if;

  v_title := 'Nowe dane do umowy';
  if v_couple is not null then
    v_body := v_couple || ' uzupełnili ankietę do umowy. Odpowiedzi czekają na Twoją weryfikację.';
  else
    v_body := 'Para uzupełniła ankietę. Odpowiedzi czekają na Twoją weryfikację.';
  end if;

  v_key := 'questionnaire.contract.completed:' || p_instance_id::text;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'questionnaireType', 'contract',
    'formInstanceId', p_instance_id,
    'formAnswerId', p_answer_id,
    'weddingId', v_wedding,
    'coupleLabel', v_couple,
    'weddingDate', v_date,
    'targetPath', v_path
  ));

  perform public.enqueue_notification_event(
    v_user,
    'questionnaire.contract.completed',
    'form_instance',
    p_instance_id,
    v_key,
    v_payload,
    v_title,
    v_body,
    v_path
  );
end;
$$;

revoke all on function public.notify_contract_questionnaire_completed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_contract_questionnaire_completed(uuid, uuid) to service_role;

create or replace function public.notify_prewedding_questionnaire_completed(
  p_questionnaire_id uuid,
  p_submitted_at timestamptz,
  p_is_update boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_wedding uuid;
  v_couple text;
  v_date text;
  v_path text;
  v_title text;
  v_body text;
  v_key text;
  v_payload jsonb;
begin
  select wq.owner_id, wq.wedding_id
  into v_owner, v_wedding
  from public.wedding_questionnaires wq
  where wq.id = p_questionnaire_id;

  if v_owner is null or v_wedding is null then
    return;
  end if;

  select
    nullif(trim(coalesce(w.bride_name, '') ||
      case when coalesce(w.groom_name, '') <> '' and coalesce(w.bride_name, '') <> '' then ' i ' else '' end ||
      coalesce(w.groom_name, '')), ''),
    coalesce(w.wedding_date::text, null)
  into v_couple, v_date
  from public.weddings w
  where w.id = v_wedding;

  v_path := '/sluby/' || v_wedding::text || '?tab=pre_wedding_questionnaire';
  v_title := case
    when p_is_update then 'Ankieta przedślubna zaktualizowana'
    else 'Ankieta przedślubna uzupełniona'
  end;
  v_body := 'Plan dnia i informacje organizacyjne są gotowe do sprawdzenia.';

  v_key := 'questionnaire.prewedding.completed:'
    || p_questionnaire_id::text
    || ':'
    || to_char(coalesce(p_submitted_at, timezone('utc', now())), 'YYYYMMDDHH24MISSMS');

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'questionnaireType', 'pre_wedding',
    'questionnaireId', p_questionnaire_id,
    'weddingId', v_wedding,
    'coupleLabel', v_couple,
    'weddingDate', v_date,
    'isUpdate', p_is_update,
    'targetPath', v_path
  ));

  perform public.enqueue_notification_event(
    v_owner,
    'questionnaire.prewedding.completed',
    'wedding_questionnaire',
    p_questionnaire_id,
    v_key,
    v_payload,
    v_title,
    v_body,
    v_path
  );
end;
$$;

revoke all on function public.notify_prewedding_questionnaire_completed(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.notify_prewedding_questionnaire_completed(uuid, timestamptz, boolean)
  to service_role;

notify pgrst, 'reload schema';
