-- Fix 8 (ecosystem audit J7; social audit D5): the report → review loop.
--
-- student_reports existed, but nothing filed reports and no admin could read
-- them, so the 24-hour first-response SLA (decision D5) was impossible.
--
-- Here:
--   * reports record where they came from (context) and the admin outcome
--     (admin_note, reviewed_by, reviewed_at);
--   * anyone signed in can report someone else (students and merchants —
--     product doc §15), only as 'pending', and not while banned;
--   * admins read every report (get_admin_reports adds names) and review them
--     through review_report, which is logged in activity_logs;
--   * every admin gets a user_notifications row when a report is filed
--     (dashboard bell, fix 5), so the SLA clock doesn't depend on someone
--     opening the Reports tab.

alter table public.student_reports
  add column if not exists context text
    check (context is null or context in ('chat', 'profile', 'business')),
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Filing: own reports only, always starting as 'pending'.
drop policy if exists students_create_reports on public.student_reports;
create policy users_create_reports on public.student_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
  );

drop trigger if exists reject_banned_reports on public.student_reports;
create trigger reject_banned_reports
before insert on public.student_reports
for each row execute function public.reject_if_banned();

-- Admins read all reports (the reporter still reads their own).
drop policy if exists admins_view_reports on public.student_reports;
create policy admins_view_reports on public.student_reports
  for select to authenticated
  using (public.is_admin());

-- Admin queue with names.
create or replace function public.get_admin_reports()
returns table (
  id uuid,
  category text,
  description text,
  context text,
  status text,
  admin_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reporter_role text,
  reported_id uuid,
  reported_name text,
  reported_role text,
  reported_banned boolean,
  reported_deleted boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view reports' using errcode = '42501';
  end if;

  return query
  select r.id, r.category, r.description, r.context, r.status, r.admin_note, r.created_at, r.reviewed_at,
         r.reporter_id,
         coalesce(nullif(ru.raw_user_meta_data ->> 'full_name', ''), mp_r.business_name, ru.email)::text,
         rr.role,
         r.reported_id,
         coalesce(nullif(du.raw_user_meta_data ->> 'full_name', ''), mp_d.business_name, du.email)::text,
         dr.role,
         public.is_banned(r.reported_id),
         coalesce(du.raw_app_meta_data ? 'deleted_at', false)
    from public.student_reports r
    left join auth.users ru on ru.id = r.reporter_id
    left join auth.users du on du.id = r.reported_id
    left join public.user_roles rr on rr.user_id = r.reporter_id
    left join public.user_roles dr on dr.user_id = r.reported_id
    left join public.merchant_profiles mp_r on mp_r.id = r.reporter_id
    left join public.merchant_profiles mp_d on mp_d.id = r.reported_id
   order by (r.status in ('pending', 'reviewing')) desc, r.created_at asc;
end;
$$;

revoke all on function public.get_admin_reports() from public, anon;
grant execute on function public.get_admin_reports() to authenticated;

-- Review: reviewing / resolved / dismissed, with an optional note.
create or replace function public.review_report(p_report_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.student_reports;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review reports' using errcode = '42501';
  end if;

  if p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;

  update public.student_reports
     set status = p_status,
         admin_note = coalesce(nullif(trim(p_note), ''), admin_note),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_report_id
  returning * into v_report;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (auth.uid(), 'report_' || p_status, 'report', v_report.reported_id, null,
          jsonb_build_object('report_id', v_report.id, 'category', v_report.category));
end;
$$;

revoke all on function public.review_report(uuid, text, text) from public, anon;
grant execute on function public.review_report(uuid, text, text) to authenticated;

-- Alert every admin when a report is filed.
create or replace function public.notify_report_filed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  select r.user_id,
         'report_filed',
         new.reporter_id,
         new.id,
         format('New report: %s. Please respond within 24 hours.', new.category),
         '/dashboard/reports'
    from public.user_roles r
   where r.role = 'admin';
  return new;
end;
$$;

revoke all on function public.notify_report_filed() from public;

drop trigger if exists notify_report_filed on public.student_reports;
create trigger notify_report_filed
after insert on public.student_reports
for each row execute function public.notify_report_filed();
