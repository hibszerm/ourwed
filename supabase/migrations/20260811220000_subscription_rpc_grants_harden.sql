-- Harden subscription foundation RPC grants.
-- Customer must not resolve/ensure arbitrary billing accounts.

revoke all on function public.ensure_billing_account_for_user(uuid) from public, anon, authenticated;
revoke all on function public.initialize_trial_subscription(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.resolve_account_entitlement(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.resolve_user_entitlement(uuid, timestamptz) from public, anon, authenticated;

-- Customer entrypoint remains get_my_subscription_summary (SECURITY DEFINER).
-- Admin RPCs remain granted to authenticated and assert AAL2 internally.

-- Optional: allow owners to resolve only their own account via wrapper already present.
-- Keep catalog readable.
grant execute on function public.billing_plan_catalog() to anon, authenticated;

notify pgrst, 'reload schema';
