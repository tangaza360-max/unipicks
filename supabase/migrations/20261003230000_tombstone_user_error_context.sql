-- P3 / B1 follow-up: make unexpected tombstone_user failures diagnosable.
--
-- PostgREST only returns code, message, details and hint for a failed RPC; the
-- PL/pgSQL context ("which statement, which line") is lost, so a production
-- failure surfaced as a bare 500. tombstone_user is now a thin wrapper around
-- the unchanged body (renamed to tombstone_user_core) that:
--   * re-raises deliberate pre-check errors (RAISE in the body: active orders,
--     open dispute, open group, admin, not found) exactly as before, so the
--     Edge Function keeps mapping them to 409/403/404;
--   * re-raises every other error with the same SQLSTATE, message and detail,
--     and a hint starting 'tombstone_user unexpected error' that carries the
--     PL/pgSQL context. Context lines hold statement text with $n/variable
--     names, never row values.
-- The whole call is still one transaction: any error rolls everything back.

alter function public.tombstone_user(uuid, uuid) rename to tombstone_user_core;
revoke all on function public.tombstone_user_core(uuid, uuid) from public, anon, authenticated, service_role;

create function public.tombstone_user(p_user_id uuid, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
begin
  return public.tombstone_user_core(p_user_id, p_actor_id);
exception when others then
  get stacked diagnostics
    v_state = returned_sqlstate,
    v_message = message_text,
    v_detail = pg_exception_detail,
    v_hint = pg_exception_hint,
    v_context = pg_exception_context;

  -- Pre-check: the innermost context line is a RAISE inside tombstone_user_core.
  if split_part(v_context, E'\n', 1) like '%tombstone_user_core(uuid,uuid)% at RAISE' then
    raise exception using errcode = v_state, message = v_message;
  end if;

  v_hint := left(
    'tombstone_user unexpected error'
      || coalesce('; original hint: ' || nullif(v_hint, ''), '')
      || '; where: ' || replace(coalesce(v_context, ''), E'\n', ' <- '),
    2000
  );

  if nullif(v_detail, '') is null then
    raise exception using errcode = v_state, message = v_message, hint = v_hint;
  end if;
  raise exception using errcode = v_state, message = v_message, detail = v_detail, hint = v_hint;
end;
$$;

revoke all on function public.tombstone_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tombstone_user(uuid, uuid) to service_role;
