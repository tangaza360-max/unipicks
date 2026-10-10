-- Download my data (founder request 2026-10-10; right of access and data
-- portability). export_my_data() returns, as one JSON document, everything
-- Unipicks stores about the person calling it.
--
-- Included: account (email, phone, names, verified university), role,
-- profiles, interests, saved deals, likes, comments, reviews, orders, pickup
-- codes, payments, group orders, friends, friend and message requests,
-- people they blocked, chat messages they sent or received (group chats
-- included), stories, story
-- views and reactions, alerts, reports they filed, phones with alerts on,
-- deal views and searches, follows, and the list of their photos. Other
-- people appear only by display name where the person already sees it.
-- Left out on purpose: password data and auth tokens; the payment provider's
-- raw payload; phone-alert keys and endpoints; reports filed AGAINST the
-- person (to protect the reporter — to be confirmed by the lawyer); admin
-- notes about them.
-- Rows are read whole (to_jsonb) so the export follows the real columns,
-- which differ a little between environments; listed private fields removed.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer -- reads the caller's rows across tables in one go
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_user auth.users;
  name_of jsonb;
begin
  if me is null then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  select * into v_user from auth.users where id = me;

  return jsonb_build_object(
    'about', jsonb_build_object(
      'service', 'Unipicks',
      'generated_at', now(),
      'what_this_is', 'Everything Unipicks stores about you. Times are in UTC. Photos are listed by file name; you can see them in the app.'
    ),
    'account', jsonb_build_object(
      'user_id', me,
      'email', v_user.email,
      'phone', v_user.phone,
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'details_you_gave', coalesce(v_user.raw_user_meta_data, '{}'::jsonb),
      'verified_by_unipicks', coalesce(v_user.raw_app_meta_data, '{}'::jsonb) - 'provider' - 'providers'
    ),
    'role', (select r.role from public.user_roles r where r.user_id = me),
    'student_profile', (select to_jsonb(sp) from public.student_profiles sp where sp.user_id = me),
    'business_profile', (select to_jsonb(mp) from public.merchant_profiles mp where mp.id = me),
    'your_deals_as_business', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.deals d where d.merchant_id = me), '[]'),
    'interests', coalesce((select jsonb_agg(i.interest order by i.created_at) from public.student_interests i where i.student_id = me), '[]'),
    'saved', coalesce((select jsonb_agg(jsonb_build_object('type', s.item_type, 'item_id', s.item_id, 'deal', d.title, 'saved_at', s.created_at) order by s.created_at)
                         from public.student_saved_items s left join public.deals d on d.id = s.item_id where s.student_id = me), '[]'),
    'likes', coalesce((select jsonb_agg(jsonb_build_object('deal', d.title, 'deal_id', l.deal_id, 'liked_at', l.created_at) order by l.created_at)
                         from public.deal_likes l left join public.deals d on d.id = l.deal_id where l.student_id = me), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('deal', d.title, 'text', c.body, 'is_reply', c.parent_id is not null, 'written_at', c.created_at) order by c.created_at)
                            from public.deal_comments c left join public.deals d on d.id = c.deal_id where c.author_id = me), '[]'),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('deal', d.title) order by r.created_at)
                           from public.ratings r left join public.deals d on d.id = r.deal_id where r.student_id = me), '[]'),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('deal', d.title) order by o.created_at)
                          from public.orders o left join public.deals d on d.id = o.deal_id where o.student_id = me), '[]'),
    'orders_received_as_business', coalesce((select jsonb_agg(to_jsonb(o) - 'student_phone' order by o.created_at) from public.orders o where o.merchant_id = me), '[]'),
    'pickup_codes', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.redemptions x where x.student_id = me), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(t) - 'webhook_payload' - 'provider_response' order by t.created_at) from public.transactions t where t.student_id = me), '[]'),
    'group_orders_you_started', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.group_orders g where g.created_by = me), '[]'),
    'group_orders_you_joined', coalesce((select jsonb_agg(to_jsonb(m) order by to_jsonb(m) ->> 'joined_at') from public.group_order_members m where m.student_id = me), '[]'),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('name', sp.display_name, 'friends_since', f.created_at) order by f.created_at)
                           from public.friendships f
                           left join public.student_profiles sp on sp.user_id = case when f.student_a = me then f.student_b else f.student_a end
                          where me in (f.student_a, f.student_b)), '[]'),
    'friend_requests', coalesce((select jsonb_agg(jsonb_build_object('direction', case when fr.sender_id = me then 'sent' else 'received' end,
                                                                     'other_person', sp.display_name, 'status', fr.status, 'at', fr.created_at) order by fr.created_at)
                                   from public.friend_requests fr
                                   left join public.student_profiles sp on sp.user_id = case when fr.sender_id = me then fr.receiver_id else fr.sender_id end
                                  where me in (fr.sender_id, fr.receiver_id)), '[]'),
    'message_requests', coalesce((select jsonb_agg(jsonb_build_object('direction', case when mr.sender_id = me then 'sent' else 'received' end,
                                                                      'other_person', sp.display_name, 'status', mr.status, 'at', mr.created_at) order by mr.created_at)
                                    from public.message_requests mr
                                    left join public.student_profiles sp on sp.user_id = case when mr.sender_id = me then mr.receiver_id else mr.sender_id end
                                   where me in (mr.sender_id, mr.receiver_id)), '[]'),
    'people_you_blocked', coalesce((select jsonb_agg(jsonb_build_object('name', sp.display_name, 'since', b.created_at) order by b.created_at)
                                      from public.blocked_students b left join public.student_profiles sp on sp.user_id = b.blocked_id
                                     where b.blocker_id = me), '[]'),
    'chat_messages', coalesce((select jsonb_agg(to_jsonb(cm) - 'sender_id' - 'receiver_id'
                                                || jsonb_build_object('direction', case when cm.sender_id = me then 'sent'
                                                                         when cm.group_order_id is not null then 'received in a group chat'
                                                                         else 'received' end,
                                                                      'other_person', coalesce(sp.display_name, mp.business_name))
                                                order by cm.created_at)
                                 from public.chat_messages cm
                                 left join public.student_profiles sp on sp.user_id = case when cm.sender_id = me then cm.receiver_id else cm.sender_id end
                                 left join public.merchant_profiles mp on mp.id = case when cm.sender_id = me then cm.receiver_id else cm.sender_id end
                                where me in (cm.sender_id, cm.receiver_id)
                                   -- group chats she belongs to or started
                                   or cm.group_order_id in (select gm.group_order_id from public.group_order_members gm where gm.student_id = me
                                                            union select g.id from public.group_orders g where g.created_by = me)), '[]'),
    'stories', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.student_stories s where s.student_id = me), '[]'),
    'stories_you_viewed', coalesce((select jsonb_agg(jsonb_build_object('story_id', v.story_id, 'viewed_at', v.viewed_at)) from public.student_story_views v where v.viewer_id = me), '[]'),
    'story_reactions', coalesce((select jsonb_agg(to_jsonb(x) - 'student_id') from public.student_story_reactions x where x.student_id = me), '[]'),
    'alerts', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id' - 'actor_id' order by n.created_at) from public.user_notifications n where n.user_id = me), '[]'),
    'reports_you_filed', coalesce((select jsonb_agg(jsonb_build_object('category', r.category, 'details', r.description, 'about', r.context,
                                                                       'status', r.status, 'filed_at', r.created_at) order by r.created_at)
                                     from public.student_reports r where r.reporter_id = me), '[]'),
    'phones_with_alerts_on', coalesce((select jsonb_agg(jsonb_build_object('device', p.user_agent, 'added_at', p.created_at)) from public.push_subscriptions p where p.user_id = me), '[]'),
    'deals_you_viewed', coalesce((select jsonb_agg(to_jsonb(v) - 'student_id') from public.deal_views v where v.student_id = me), '[]'),
    'searches', coalesce((select jsonb_agg(to_jsonb(x) - 'student_id') from public.deal_searches x where x.student_id = me), '[]'),
    'businesses_you_follow', coalesce((select jsonb_agg(jsonb_build_object('business', mp.business_name, 'since', bf.created_at))
                                         from public.business_follows bf left join public.merchant_profiles mp on mp.id = bf.merchant_id where bf.student_id = me), '[]'),
    'activity_signals', coalesce((select jsonb_agg(to_jsonb(x) - 'student_id') from public.social_content_interactions x where x.student_id = me), '[]'),
    'photos', jsonb_build_object(
      'profile_photo', (select sp.avatar_path from public.student_profiles sp where sp.user_id = me),
      'story_photos', coalesce((select jsonb_agg(s.media_url) from public.student_stories s where s.student_id = me), '[]'),
      'review_photos', coalesce((select jsonb_agg(r.photo_path) from public.ratings r where r.student_id = me and r.photo_path is not null), '[]')
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
