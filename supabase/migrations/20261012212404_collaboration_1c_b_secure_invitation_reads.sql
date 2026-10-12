-- Collaboration V1 / Wave 1C-B: actor-bound wedding invitation read surfaces.
-- These functions expose only invitation snapshots and lifecycle state. They
-- do not authorize access to weddings or child resources.
begin;

create function public.get_wedding_collaboration_invitation_preview(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invite record;
  v_inviter text;
begin
  if v_actor is null or p_invitation_id is null then return null; end if;
  if not exists (
    select 1 from auth.users au join public.users u on u.id = au.id
    where au.id = v_actor and au.email_confirmed_at is not null
      and au.deleted_at is null and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then return null; end if;

  select i.id, i.owner_user_id, i.wedding_id, i.wedding_id_snapshot,
         i.status, i.reason, i.expires_at, i.expired_at,
         i.couple_first_name_snapshot, i.couple_second_name_snapshot,
         i.wedding_date_snapshot, i.package_label_snapshot,
         i.contract_value_snapshot, i.currency_snapshot,
         i.proposed_share_amount, i.created_at,
         i.accepted_at, i.declined_at, i.cancelled_at, i.superseded_at
    into v_invite
  from public.wedding_collaboration_invitations i
  where i.id = p_invitation_id and i.invitee_user_id = v_actor
  for update;
  if not found then return null; end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= pg_catalog.now() then
    update public.wedding_collaboration_invitations
      set status = 'expired', reason = 'expired', expired_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      where id = v_invite.id;
    insert into public.wedding_collaboration_events(
      wedding_id, wedding_id_snapshot, invitation_id, actor_user_id,
      event_type, reason, metadata
    ) values (
      v_invite.wedding_id, v_invite.wedding_id_snapshot, v_invite.id, null,
      'invitation_expired', 'expired', '{"source":"invitation_preview"}'::jsonb
    );
    v_invite.status := 'expired';
    v_invite.reason := 'expired';
    v_invite.expired_at := pg_catalog.now();
  end if;

  select coalesce(nullif(pg_catalog.btrim(u.name), ''), 'Użytkownik niedostępny')
    into v_inviter
  from public.users u where u.id = v_invite.owner_user_id;
  v_inviter := coalesce(v_inviter, 'Użytkownik niedostępny');

  return pg_catalog.jsonb_build_object(
    'invitation_id', v_invite.id,
    'status', v_invite.status,
    'reason', v_invite.reason,
    'couple_first_name', v_invite.couple_first_name_snapshot,
    'couple_second_name', v_invite.couple_second_name_snapshot,
    'wedding_date', v_invite.wedding_date_snapshot,
    'package_label', v_invite.package_label_snapshot,
    'inviter_display_name', v_inviter,
    'contract_value', v_invite.contract_value_snapshot,
    'currency', v_invite.currency_snapshot,
    'proposed_share_amount', v_invite.proposed_share_amount,
    'membership_status', (
      select m.status from public.wedding_collaboration_memberships m
      where m.accepted_invitation_id = v_invite.id and m.member_user_id = v_actor
      order by m.accepted_at desc, m.id desc limit 1
    ),
    'created_at', v_invite.created_at,
    'expires_at', v_invite.expires_at,
    'accepted_at', v_invite.accepted_at,
    'declined_at', v_invite.declined_at,
    'cancelled_at', v_invite.cancelled_at,
    'expired_at', v_invite.expired_at,
    'superseded_at', v_invite.superseded_at
  );
end;
$$;

create function public.get_wedding_collaboration_state(p_wedding_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_wedding_id uuid;
  v_expired record;
  v_invitations jsonb;
  v_memberships jsonb;
begin
  if v_actor is null or p_wedding_id is null then return null; end if;
  if not exists (
    select 1 from auth.users au join public.users u on u.id = au.id
    where au.id = v_actor and au.email_confirmed_at is not null
      and au.deleted_at is null and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then return null; end if;

  select w.id into v_wedding_id
  from public.weddings w where w.id = p_wedding_id and w.user_id = v_actor;
  if not found then return null; end if;

  for v_expired in
    select i.id, i.wedding_id, i.wedding_id_snapshot
    from public.wedding_collaboration_invitations i
    where i.wedding_id = p_wedding_id and i.owner_user_id = v_actor
      and i.status = 'pending' and i.expires_at <= pg_catalog.now()
    order by i.expires_at, i.id
    limit 50
    for update
  loop
    update public.wedding_collaboration_invitations
      set status = 'expired', reason = 'expired', expired_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      where id = v_expired.id;
    insert into public.wedding_collaboration_events(
      wedding_id, wedding_id_snapshot, invitation_id, actor_user_id,
      event_type, reason, metadata
    ) values (
      v_expired.wedding_id, v_expired.wedding_id_snapshot, v_expired.id, null,
      'invitation_expired', 'expired', '{"source":"owner_collaboration_state"}'::jsonb
    );
  end loop;

  select coalesce(pg_catalog.jsonb_agg(row_data.item order by row_data.created_at desc), '[]'::jsonb)
    into v_invitations
  from (
    select pg_catalog.jsonb_build_object(
      'invitation_id', i.id,
      'status', i.status,
      'reason', i.reason,
      'collaborator_display_name', coalesce(nullif(pg_catalog.btrim(u.name), ''), 'Użytkownik niedostępny'),
      'proposed_share_amount', i.proposed_share_amount,
      'currency', i.currency_snapshot,
      'contract_value', i.contract_value_snapshot,
      'created_at', i.created_at,
      'expires_at', i.expires_at,
      'accepted_at', i.accepted_at,
      'declined_at', i.declined_at,
      'cancelled_at', i.cancelled_at,
      'expired_at', i.expired_at,
      'superseded_at', i.superseded_at,
      'membership_id', m.id,
      'membership_status', m.status
    ) as item, i.created_at
    from public.wedding_collaboration_invitations i
    left join public.users u on u.id = i.invitee_user_id
    left join public.wedding_collaboration_memberships m on m.accepted_invitation_id = i.id
    where i.wedding_id_snapshot = p_wedding_id and i.owner_user_id = v_actor
    order by i.created_at desc, i.id desc
    limit 50
  ) row_data;

  select coalesce(pg_catalog.jsonb_agg(row_data.item order by row_data.accepted_at desc), '[]'::jsonb)
    into v_memberships
  from (
    select pg_catalog.jsonb_build_object(
      'membership_id', m.id,
      'status', m.status,
      'collaborator_display_name', coalesce(nullif(pg_catalog.btrim(u.name), ''), 'Użytkownik niedostępny'),
      'accepted_share_amount', i.proposed_share_amount,
      'currency', i.currency_snapshot,
      'accepted_at', m.accepted_at
    ) as item, m.accepted_at
    from public.wedding_collaboration_memberships m
    left join public.users u on u.id = m.member_user_id
    left join public.wedding_collaboration_invitations i on i.id = m.accepted_invitation_id
    where m.wedding_id_snapshot = p_wedding_id and m.owner_user_id = v_actor
      and m.status = 'active'
    order by m.accepted_at desc, m.id desc
    limit 50
  ) row_data;

  return pg_catalog.jsonb_build_object(
    'wedding_id', v_wedding_id,
    'invitations', v_invitations,
    'active_memberships', v_memberships
  );
end;
$$;

create function public.list_my_wedding_collaboration_invitations()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invite record;
  v_result jsonb;
begin
  if v_actor is null then return '[]'::jsonb; end if;
  if not exists (
    select 1 from auth.users au join public.users u on u.id = au.id
    where au.id = v_actor and au.email_confirmed_at is not null
      and au.deleted_at is null and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then return '[]'::jsonb; end if;

  for v_invite in
    select i.id, i.wedding_id, i.wedding_id_snapshot
    from public.wedding_collaboration_invitations i
    where i.invitee_user_id = v_actor and i.status = 'pending'
      and i.expires_at <= pg_catalog.now()
    order by i.expires_at, i.id
    limit 50
    for update
  loop
    update public.wedding_collaboration_invitations
      set status = 'expired', reason = 'expired', expired_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      where id = v_invite.id;
    insert into public.wedding_collaboration_events(
      wedding_id, wedding_id_snapshot, invitation_id, actor_user_id,
      event_type, reason, metadata
    ) values (
      v_invite.wedding_id, v_invite.wedding_id_snapshot, v_invite.id, null,
      'invitation_expired', 'expired', '{"source":"invitation_list"}'::jsonb
    );
  end loop;

  select coalesce(pg_catalog.jsonb_agg(row_data.item order by row_data.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select pg_catalog.jsonb_build_object(
      'invitation_id', i.id,
      'status', i.status,
      'reason', i.reason,
      'couple_first_name', i.couple_first_name_snapshot,
      'couple_second_name', i.couple_second_name_snapshot,
      'wedding_date', i.wedding_date_snapshot,
      'package_label', i.package_label_snapshot,
      'inviter_display_name', coalesce(nullif(pg_catalog.btrim(u.name), ''), 'Użytkownik niedostępny'),
      'contract_value', i.contract_value_snapshot,
      'currency', i.currency_snapshot,
      'proposed_share_amount', i.proposed_share_amount,
      'created_at', i.created_at,
      'expires_at', i.expires_at
    ) as item, i.created_at
    from public.wedding_collaboration_invitations i
    left join public.users u on u.id = i.owner_user_id
    where i.invitee_user_id = v_actor
    order by i.created_at desc, i.id desc
    limit 20
  ) row_data;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- In-app notifications only. Existing notification delivery remains the
-- authoritative inbox; 1C-B does not enqueue email or change its dispatcher.
create function public.wedding_collaboration_notify_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_title text;
  v_body text;
  v_target text;
  v_invitation_id uuid;
  v_invitee_user_id uuid;
  v_owner_user_id uuid;
  v_couple_first_name text;
  v_couple_second_name text;
  v_membership_member_user_id uuid;
  v_membership_owner_user_id uuid;
  v_accepted_invitation_id uuid;
begin
  if new.invitation_id is not null then
    select i.id, i.invitee_user_id, i.owner_user_id,
           i.couple_first_name_snapshot, i.couple_second_name_snapshot
      into v_invitation_id, v_invitee_user_id, v_owner_user_id,
           v_couple_first_name, v_couple_second_name
    from public.wedding_collaboration_invitations i where i.id = new.invitation_id;
  end if;
  if new.membership_id is not null then
    select m.member_user_id, m.owner_user_id, m.accepted_invitation_id
      into v_membership_member_user_id, v_membership_owner_user_id, v_accepted_invitation_id
    from public.wedding_collaboration_memberships m where m.id = new.membership_id;
    if v_invitation_id is null and v_accepted_invitation_id is not null then
      select i.id, i.invitee_user_id, i.owner_user_id,
             i.couple_first_name_snapshot, i.couple_second_name_snapshot
        into v_invitation_id, v_invitee_user_id, v_owner_user_id,
             v_couple_first_name, v_couple_second_name
      from public.wedding_collaboration_invitations i
      where i.id = v_accepted_invitation_id;
    end if;
  end if;

  case new.event_type
    when 'invitation_created' then
      v_recipient := v_invitee_user_id;
      v_title := 'Zaproszenie do zlecenia';
      v_body := coalesce(v_couple_first_name, 'Para') || ' i ' ||
        coalesce(v_couple_second_name, 'partner') || ' zapraszają Cię do współpracy.';
      v_target := '/wspolpraca/zaproszenie/' || v_invitation_id::text;
    when 'invitation_accepted' then
      v_recipient := v_owner_user_id;
      v_title := 'Zaproszenie zaakceptowane';
      v_body := 'Współpracownik zaakceptował zaproszenie do zlecenia.';
      v_target := '/sluby/' || new.wedding_id_snapshot::text;
    when 'invitation_declined' then
      v_recipient := v_owner_user_id;
      v_title := 'Zaproszenie odrzucone';
      v_body := 'Współpracownik odrzucił zaproszenie do zlecenia.';
      v_target := '/sluby/' || new.wedding_id_snapshot::text;
    when 'invitation_cancelled' then
      if new.reason = 'owner_cancelled' or new.reason in ('global_connection_ended','wedding_deleted','account_deleted') then
        v_recipient := v_invitee_user_id;
        v_title := 'Zaproszenie zakończone';
        v_body := 'To zaproszenie nie jest już aktywne.';
        v_target := '/wspolpraca/zaproszenie/' || v_invitation_id::text;
      end if;
    when 'invitation_expired' then
      v_recipient := v_invitee_user_id;
      v_title := 'Zaproszenie wygasło';
      v_body := 'To zaproszenie nie jest już aktywne.';
      v_target := '/wspolpraca/zaproszenie/' || v_invitation_id::text;
    when 'invitation_superseded' then
      v_recipient := v_invitee_user_id;
      v_title := 'Warunki zaproszenia uległy zmianie';
      v_body := 'Poproś właściciela zlecenia o nowe zaproszenie.';
      v_target := '/wspolpraca/zaproszenie/' || v_invitation_id::text;
    when 'membership_revoked' then
      v_recipient := v_membership_member_user_id;
      v_title := 'Współpraca zakończona';
      v_body := 'Właściciel zakończył współpracę przy zleceniu.';
      v_target := '/wspolpraca/zaproszenie/' || v_invitation_id::text;
    when 'membership_left' then
      v_recipient := v_membership_owner_user_id;
      v_title := 'Współpraca zakończona';
      v_body := 'Współpracownik opuścił zlecenie.';
      v_target := '/sluby/' || new.wedding_id_snapshot::text;
    else
      return new;
  end case;

  if v_recipient is null or v_target is null then return new; end if;
  insert into public.notifications(user_id, type, title, content, entity_type, entity_id, link, read)
  values (v_recipient, 'info', v_title, v_body, 'wedding_collaboration',
    coalesce(new.invitation_id, new.membership_id), v_target, false);
  return new;
end;
$$;

create trigger wedding_collaboration_notify_event
  after insert on public.wedding_collaboration_events
  for each row execute function public.wedding_collaboration_notify_event();

revoke all on function public.get_wedding_collaboration_invitation_preview(uuid) from public, anon;
revoke all on function public.get_wedding_collaboration_state(uuid) from public, anon;
revoke all on function public.list_my_wedding_collaboration_invitations() from public, anon;
revoke all on function public.wedding_collaboration_notify_event() from public, anon, authenticated;
grant execute on function public.get_wedding_collaboration_invitation_preview(uuid) to authenticated;
grant execute on function public.get_wedding_collaboration_state(uuid) to authenticated;
grant execute on function public.list_my_wedding_collaboration_invitations() to authenticated;

commit;
