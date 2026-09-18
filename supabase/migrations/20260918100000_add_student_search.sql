-- UNIPICKS SOCIAL
-- Secure student discovery/search

create or replace function public.search_students(
  search_query text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  university text,
  campus text,
  student_description text,
  short_bio text
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  current_student uuid := auth.uid();
  normalized_query text;
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  normalized_query := lower(
    regexp_replace(
      coalesce(trim(search_query), ''),
      '[\s._-]+',
      '',
      'g'
    )
  );

  -- Empty searches do not return student results.
  if normalized_query = '' then
    return;
  end if;

  return query
  select
    sp.user_id,
    sp.username,
    sp.display_name,
    sp.university,
    sp.campus,
    sp.student_description,
    sp.short_bio
  from public.student_profiles sp
  where sp.is_18_plus = true
    and sp.discoverable = true
    and sp.user_id <> current_student

    -- Do not expose students blocked by the current user
    -- or students who have blocked the current user.
    and not exists (
      select 1
      from public.blocked_students b
      where
        (b.blocker_id = current_student and b.blocked_id = sp.user_id)
        or
        (b.blocker_id = sp.user_id and b.blocked_id = current_student)
    )

    -- Username search:
    -- ignores spaces and common separators.
    and (
      lower(
        regexp_replace(
          sp.username,
          '[\s._-]+',
          '',
          'g'
        )
      ) like '%' || normalized_query || '%'

      or

      -- Display-name search:
      -- ignores spaces and common separators.
      lower(
        regexp_replace(
          sp.display_name,
          '[\s._-]+',
          '',
          'g'
        )
      ) like '%' || normalized_query || '%'
    )

  order by
    case
      when lower(
        regexp_replace(
          sp.username,
          '[\s._-]+',
          '',
          'g'
        )
      ) = normalized_query then 0

      when lower(
        regexp_replace(
          sp.username,
          '[\s._-]+',
          '',
          'g'
        )
      ) like normalized_query || '%' then 1

      when lower(
        regexp_replace(
          sp.display_name,
          '[\s._-]+',
          '',
          'g'
        )
      ) like normalized_query || '%' then 2

      else 3
    end,
    lower(sp.username),
    lower(sp.display_name)

  limit 30;
end;
$$;

revoke all on function public.search_students(text)
from public;

grant execute on function public.search_students(text)
to authenticated;