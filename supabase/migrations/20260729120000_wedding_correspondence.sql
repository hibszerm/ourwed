-- Optional couple correspondence channel for studio↔contact.
alter table public.weddings
  add column if not exists correspondence_channel text
    check (
      correspondence_channel is null
      or correspondence_channel in ('email', 'instagram', 'facebook')
    );

alter table public.weddings
  add column if not exists correspondence_value text;

comment on column public.weddings.correspondence_channel is
  'Primary couple correspondence channel: email | instagram | facebook. Null when unset.';

comment on column public.weddings.correspondence_value is
  'Channel-specific handle, email, or URL. Null when unset.';
