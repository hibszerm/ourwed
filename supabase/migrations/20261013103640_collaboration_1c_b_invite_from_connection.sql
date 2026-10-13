-- Resolve a selected global connection to its peer within the trusted database
-- boundary. The peer UUID is never included in this function's response.
begin;

create function public.create_wedding_collaboration_invite_from_connection(
  p_wedding_id uuid,
  p_connection_id uuid,
  p_proposed_share_amount numeric,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_connection public.collaboration_connections%rowtype;
  v_existing_event public.wedding_collaboration_events%rowtype;
  v_existing_invite public.wedding_collaboration_invitations%rowtype;
  v_peer uuid;
begin
  if v_actor is null or p_idempotency_key is null
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Preserve the reviewed create command's replay behavior even if the
  -- original connection was ended after the successful request.
  select * into v_existing_event
  from public.wedding_collaboration_events e
  where e.actor_user_id = v_actor and e.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_event.event_type <> 'invitation_created'
      or v_existing_event.invitation_id is null then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    select * into v_existing_invite
    from public.wedding_collaboration_invitations i
    where i.id = v_existing_event.invitation_id;

    if not found
      or v_existing_invite.wedding_id_snapshot is distinct from p_wedding_id
      or v_existing_invite.source_connection_id is distinct from p_connection_id
      or v_existing_invite.proposed_share_amount is distinct from p_proposed_share_amount then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'created',
      'invitation_id', v_existing_event.invitation_id,
      'duplicate', true
    );
  end if;

  -- Resolve only the requested connection. Returning one error for missing,
  -- inactive, and foreign connections prevents an existence oracle.
  select * into v_connection
  from public.collaboration_connections c
  where c.id = p_connection_id;

  if not found
    or v_connection.status <> 'active'
    or v_actor not in (v_connection.participant_low_id, v_connection.participant_high_id) then
    raise exception 'active_connection_required' using errcode = 'P0001';
  end if;

  if v_connection.participant_low_id = v_actor then
    v_peer := v_connection.participant_high_id;
  else
    v_peer := v_connection.participant_low_id;
  end if;

  if v_peer is null or v_peer = v_actor then
    raise exception 'active_connection_required' using errcode = 'P0001';
  end if;

  -- Follow the established user -> connection lock order used by the
  -- invitation and end-connection commands. Recheck the exact selected row
  -- under lock so it cannot become inactive before creation.
  if not public.wedding_collaboration_lock_users(array[v_actor, v_peer]) then
    raise exception 'active_connection_required' using errcode = 'P0001';
  end if;

  -- Another invocation with this key may have committed while this call
  -- waited on the participant locks. Recheck before requiring an active row.
  select * into v_existing_event
  from public.wedding_collaboration_events e
  where e.actor_user_id = v_actor and e.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_event.event_type <> 'invitation_created'
      or v_existing_event.invitation_id is null then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    select * into v_existing_invite
    from public.wedding_collaboration_invitations i
    where i.id = v_existing_event.invitation_id;

    if not found
      or v_existing_invite.wedding_id_snapshot is distinct from p_wedding_id
      or v_existing_invite.source_connection_id is distinct from p_connection_id
      or v_existing_invite.proposed_share_amount is distinct from p_proposed_share_amount then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'created',
      'invitation_id', v_existing_event.invitation_id,
      'duplicate', true
    );
  end if;

  perform 1
  from public.collaboration_connections c
  where c.id = p_connection_id
    and c.status = 'active'
    and v_actor in (c.participant_low_id, c.participant_high_id)
    and v_peer in (c.participant_low_id, c.participant_high_id)
  for update;

  if not found then
    raise exception 'active_connection_required' using errcode = 'P0001';
  end if;

  return public.create_wedding_collaboration_invite(
    p_wedding_id,
    v_peer,
    p_proposed_share_amount,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.create_wedding_collaboration_invite_from_connection(uuid, uuid, numeric, uuid)
  from public, anon;
grant execute on function public.create_wedding_collaboration_invite_from_connection(uuid, uuid, numeric, uuid)
  to authenticated;

commit;
