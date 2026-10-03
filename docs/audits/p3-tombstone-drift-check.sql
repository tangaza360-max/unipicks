-- P3 / B1 drift check: every table and column the deletion path touches.
-- Read-only. Run in the Supabase SQL editor (production). Every row returned
-- is a column tombstone_user_core / scrub_payment_payload expects but the
-- database does not have. Expected result after 20261003240000: one row,
-- transactions.phone_number (optional; the function checks for it first).
with expected(table_schema, table_name, column_name) as (values
  ('auth','users','id'), ('auth','users','email'), ('auth','users','phone'), ('auth','users','encrypted_password'),
  ('auth','users','banned_until'), ('auth','users','updated_at'), ('auth','users','raw_user_meta_data'), ('auth','users','raw_app_meta_data'),
  ('auth','sessions','user_id'), ('auth','refresh_tokens','user_id'), ('auth','identities','user_id'),
  ('auth','mfa_factors','user_id'), ('auth','one_time_tokens','user_id'),
  ('public','user_roles','user_id'), ('public','user_roles','role'),
  ('public','orders','student_id'), ('public','orders','merchant_id'), ('public','orders','status'), ('public','orders','dispute_status'),
  ('public','orders','student_phone'), ('public','orders','merchant_phone'),
  ('public','group_orders','created_by'), ('public','group_orders','status'), ('public','group_orders','host_name'), ('public','group_orders','id'),
  ('public','group_order_members','group_order_id'), ('public','group_order_members','student_id'), ('public','group_order_members','student_name'),
  ('public','student_profiles','user_id'),
  ('public','friend_requests','sender_id'), ('public','friend_requests','receiver_id'),
  ('public','friendships','student_a'), ('public','friendships','student_b'),
  ('public','message_requests','sender_id'), ('public','message_requests','receiver_id'),
  ('public','blocked_students','blocker_id'),
  ('public','student_story_views','viewer_id'), ('public','student_story_reactions','student_id'), ('public','student_stories','student_id'),
  ('public','business_follows','student_id'), ('public','business_follows','merchant_id'),
  ('public','student_interests','student_id'), ('public','student_saved_items','student_id'),
  ('public','social_content_interactions','student_id'), ('public','deal_views','student_id'), ('public','deal_searches','student_id'),
  ('public','merchant_stories','merchant_id'),
  ('public','notifications','merchant_id'), ('public','notifications','student_email'), ('public','notifications','student_name'), ('public','notifications','message'),
  ('public','merchant_profiles','id'),
  ('public','user_notifications','user_id'), ('public','user_notifications','actor_id'), ('public','user_notifications','type'),
  ('public','transactions','student_id'), ('public','transactions','webhook_payload'), ('public','transactions','phone_number'),
  ('public','redemptions','student_id'), ('public','redemptions','student_name'),
  ('public','ratings','student_id'), ('public','ratings','review'),
  ('public','activity_logs','admin_id'), ('public','activity_logs','action'), ('public','activity_logs','target_type'),
  ('public','activity_logs','target_id'), ('public','activity_logs','target_name'), ('public','activity_logs','details'),
  ('public','deals','merchant_id'), ('public','deals','active'), ('public','deals','image_url')
)
select e.table_schema || '.' || e.table_name || '.' || e.column_name as missing
  from expected e
 where not exists (
   select 1 from information_schema.columns c
    where c.table_schema = e.table_schema and c.table_name = e.table_name and c.column_name = e.column_name)
 order by 1;

-- Shape of transactions.webhook_payload items (key names only, no values),
-- to confirm items hold product data only.
select jsonb_typeof(webhook_payload -> 'items') as items_type,
       (select string_agg(distinct k, ', ')
          from jsonb_array_elements(case when jsonb_typeof(webhook_payload -> 'items') = 'array'
                                         then webhook_payload -> 'items' else '[]'::jsonb end) el,
               jsonb_object_keys(case when jsonb_typeof(el) = 'object' then el else '{}'::jsonb end) k) as item_keys,
       count(*)
  from public.transactions
 group by 1, 2
 order by 3 desc;

-- NOT NULL / CHECK constraints the tombstone could trip on the columns it writes.
select conrelid::regclass, conname, pg_get_constraintdef(oid)
  from pg_constraint
 where contype = 'c'
   and conrelid in ('public.transactions'::regclass, 'public.orders'::regclass, 'public.redemptions'::regclass,
                    'public.ratings'::regclass, 'public.group_orders'::regclass, 'public.group_order_members'::regclass,
                    'public.notifications'::regclass, 'public.activity_logs'::regclass, 'public.deals'::regclass)
 order by 1, 2;
select table_name, column_name from information_schema.columns
 where table_schema = 'public' and is_nullable = 'NO'
   and (table_name, column_name) in (('orders','student_phone'), ('orders','merchant_phone'), ('redemptions','student_name'),
        ('ratings','review'), ('notifications','student_name'), ('notifications','student_email'), ('deals','image_url'),
        ('activity_logs','admin_id'));
