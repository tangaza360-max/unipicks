create or replace function public.handle_redemption_notification()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deal_merchant_id uuid;
  deal_title text;
begin
  select merchant_id, title
    into deal_merchant_id, deal_title
  from public.deals
  where id = new.deal_id;

  if deal_merchant_id is not null then
    insert into public.notifications (
      merchant_id,
      deal_id,
      student_name,
      student_email,
      message,
      type
    ) values (
      deal_merchant_id,
      new.deal_id,
      new.student_name,
      (select email from auth.users where id = new.student_id),
      format('Student %s redeemed "%s"', coalesce(new.student_name, 'A student'), coalesce(deal_title, 'your deal')),
      'redemption'
    );
  end if;

  return new;
end;
$$;
