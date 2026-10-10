-- Comments on deals (founder request 2026-10-10, Instagram-style), with
-- one level of replies; the deal's own business can answer.
--
-- Who: active students (role student, not banned) on deals they can see, and
-- the deal's own business while in good standing. Nobody else.
-- Reading: signed-in people, through get_deal_comments(), which shows a
-- student's name only where their profile photo is visible (same rule as
-- reviews) and hides comments from people you blocked. The table itself only
-- shows your own rows, so author ids never leak. Visitors get the number only
-- (get_deal_comment_count).
-- Delete: your own; admins any. The business can't delete students'
-- comments (it can report them). No editing.
-- Limits: 1–500 characters; at most 10 comments per 10 minutes per person;
-- replies only to top-level comments on the same deal, and not to someone
-- who blocked you.
-- Alerts: the business hears about new comments on its deals; the writer of
-- a comment hears about replies (Social → Activity / the bell).
-- Erasure: linked to user_roles with "delete together"; account deletion
-- removes the role, so comments go too (replies to them as well).

create table if not exists public.deal_comments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid not null references public.user_roles(user_id) on delete cascade,
  parent_id uuid references public.deal_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists deal_comments_deal_idx on public.deal_comments (deal_id, created_at);
create index if not exists deal_comments_parent_idx on public.deal_comments (parent_id);
create index if not exists deal_comments_author_idx on public.deal_comments (author_id, created_at);

alter table public.deal_comments enable row level security;
revoke all on public.deal_comments from anon, authenticated;
grant select, insert, delete on public.deal_comments to authenticated;

-- Admins see all rows too: Postgres only deletes rows the person may see.
drop policy if exists "People see their own comment rows" on public.deal_comments;
create policy "People see their own comment rows"
  on public.deal_comments for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- A student on a deal they can see (the deals rules run inside), or the
-- deal's own business in good standing.
drop policy if exists "Students and the deal's business comment" on public.deal_comments;
create policy "Students and the deal's business comment"
  on public.deal_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      ((select public.can_post_student_story())
        and exists (select 1 from public.deals d where d.id = deal_id and d.active))
      or exists (
        select 1 from public.deals d
         where d.id = deal_id
           and d.merchant_id = (select auth.uid())
           and public.is_merchant_in_good_standing(d.merchant_id))
    )
  );

drop policy if exists "Authors and admins delete comments" on public.deal_comments;
create policy "Authors and admins delete comments"
  on public.deal_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- Replies, the speed limit (checked with full access: other people's rows).
create or replace function public.check_deal_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent public.deal_comments;
begin
  new.body := btrim(new.body);

  if (select count(*) from public.deal_comments
       where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Slow down: you can post 10 comments every 10 minutes.' using errcode = '54000';
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.deal_comments where id = new.parent_id;
    if not found or v_parent.deal_id <> new.deal_id or v_parent.parent_id is not null then
      raise exception 'You can only reply to a comment on this deal.' using errcode = '22023';
    end if;
    if exists (select 1 from public.blocked_students
                where blocker_id = v_parent.author_id and blocked_id = new.author_id) then
      raise exception 'You can''t reply to this comment.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.check_deal_comment() from public, anon, authenticated;

drop trigger if exists deal_comments_check on public.deal_comments;
create trigger deal_comments_check
  before insert on public.deal_comments
  for each row execute function public.check_deal_comment();

-- Alerts: the business about a new comment; a writer about a reply.
create or replace function public.notify_deal_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deal public.deals;
  v_parent_author uuid;
  v_who text;
  v_snippet text := left(new.body, 80) || case when char_length(new.body) > 80 then '…' else '' end;
begin
  select * into v_deal from public.deals where id = new.deal_id;

  if new.parent_id is null then
    if v_deal.merchant_id is distinct from new.author_id then
      insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
      values (v_deal.merchant_id, 'deal_comment', new.author_id, new.id,
              format('New comment on %s: “%s”', v_deal.title, v_snippet), '/deal/' || new.deal_id);
    end if;
  else
    select author_id into v_parent_author from public.deal_comments where id = new.parent_id;
    if v_parent_author is distinct from new.author_id then
      v_who := case when new.author_id = v_deal.merchant_id then coalesce(v_deal.business_name, 'The business')
                    else 'Someone' end;
      insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
      values (v_parent_author, 'comment_reply', new.author_id, new.id,
              format('%s replied to your comment on %s: “%s”', v_who, v_deal.title, v_snippet), '/deal/' || new.deal_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_deal_comment() from public, anon, authenticated;

drop trigger if exists deal_comments_notify on public.deal_comments;
create trigger deal_comments_notify
  after insert on public.deal_comments
  for each row execute function public.notify_deal_comment();

-- Reading comments (signed in).
create or replace function public.get_deal_comments(p_deal_id uuid, p_limit integer default 100)
returns table (
  id uuid, parent_id uuid, body text, created_at timestamptz,
  author_id uuid, author_name text, is_business boolean, is_mine boolean
)
language sql
stable
security definer -- names and other people's rows, which RLS keeps private
set search_path = ''
as $$
  select c.id,
         c.parent_id,
         c.body,
         c.created_at,
         case when c.author_id = d.merchant_id then null
              when public.can_see_student_avatar(c.author_id::text) then c.author_id end,
         case when c.author_id = d.merchant_id then d.business_name
              when public.can_see_student_avatar(c.author_id::text) then sp.display_name end,
         c.author_id = d.merchant_id,
         c.author_id = auth.uid()
    from public.deal_comments c
    join public.deals d on d.id = c.deal_id
    left join public.student_profiles sp on sp.user_id = c.author_id
   where c.deal_id = p_deal_id
     and auth.uid() is not null
     -- the deal must be one the caller may see
     and ((d.active and public.is_merchant_in_good_standing(d.merchant_id))
          or d.merchant_id = auth.uid()
          or exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'))
     -- hide people the caller blocked
     and not exists (select 1 from public.blocked_students b
                      where b.blocker_id = auth.uid() and b.blocked_id = c.author_id)
   order by c.created_at
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.get_deal_comments(uuid, integer) from public, anon;
grant execute on function public.get_deal_comments(uuid, integer) to authenticated;

-- The number, for visitors too (live deals only).
create or replace function public.get_deal_comment_count(p_deal_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
    from public.deal_comments c
    join public.deals d on d.id = c.deal_id
   where c.deal_id = p_deal_id
     and d.active
     and public.is_merchant_in_good_standing(d.merchant_id);
$$;

revoke all on function public.get_deal_comment_count(uuid) from public;
grant execute on function public.get_deal_comment_count(uuid) to anon, authenticated;
