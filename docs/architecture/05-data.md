# 5. The data

*Checked 2026-10-05 against the live database: 32 tables in `public`, plus
Supabase's `auth.users`. Links are the real foreign keys.*

Every person is one row in `auth.users` (Supabase Auth). Almost every table
points to it. The diagrams below are grouped by area so they stay readable.
`users` in the diagrams = `auth.users`.

---

## A. Accounts and roles

```mermaid
erDiagram
  users ||--|| user_roles : "has one role"
  users ||--o| student_profiles : "student: social profile"
  users ||--o| merchant_profiles : "business: name, RDB, phone, MoMo code"
  users ||--o{ push_subscriptions : "phones with alerts on (max 10)"
  users ||--o{ user_notifications : "bell + activity"
  user_roles {
    text role "student | merchant | admin | delivery (unused)"
  }
  merchant_profiles {
    bool approved
    text business_name
    text rdb_number
  }
```

- The role is set by the database at sign-up and cannot be changed from the app.
- Verified university and student ID live in `auth.users.raw_app_meta_data`
  (server-owned), not in a table.

## B. Deals, orders and money

```mermaid
erDiagram
  users ||--o{ deals : "business publishes"
  deals ||--o{ orders : "ordered"
  users ||--o{ orders : "student orders"
  orders ||--o{ transactions : "paid by (normal_order_id)"
  orders ||--o| redemptions : "pickup code (order_id)"
  transactions ||--o| redemptions : "old flow (transaction_id)"
  orders ||--o{ ratings : "rated after pickup"
  deals ||--o{ chat_messages : "order messages"
  deals ||--o{ notifications : "business alerts (old bell)"
  deals ||--o{ deal_views : "unused"
  orders {
    text status "see page 4"
    numeric total_price
    text dispute_status
    uuid group_order_id
  }
  transactions {
    text status "processing | paid | failed"
    numeric amount
    text umunota_reference "UMP-…"
    jsonb webhook_payload
  }
  redemptions {
    text code "pickup code"
    text status "pending | redeemed"
  }
```

- **One order ↔ one payment** in the current flow (`transactions.normal_order_id`).
- **The price is decided by the server** (`create-order`), never by the app.
- Refunds will add a `refunds` table linked to `orders` and `transactions`
  (plan approved 2026-10-05).

## C. Group orders

```mermaid
erDiagram
  deals ||--o{ group_orders : "group buy"
  users ||--o{ group_orders : "host (created_by)"
  group_orders ||--o{ group_order_members : "members"
  users ||--o{ group_order_members : "student"
  group_orders ||--o| orders : "submitted as one order"
  group_orders ||--o{ chat_messages : "group chat"
  group_order_members ||--o{ group_order_payment_members : "old per-member payment"
  transactions ||--o{ group_order_payment_members : "old per-member payment"
```

## D. Social

```mermaid
erDiagram
  users ||--o{ friend_requests : "sends / receives"
  users ||--o{ friendships : "student_a < student_b"
  users ||--o{ blocked_students : "blocks"
  users ||--o{ message_requests : "sends / receives"
  users ||--o{ chat_messages : "sender / receiver"
  users ||--o{ student_stories : "posts"
  student_stories ||--o{ student_story_views : "seen by"
  student_stories ||--o{ student_story_reactions : "unused"
  users ||--o{ merchant_stories : "business posts"
```

- Photos are not in tables: they are files in Storage (page 2); a story row
  keeps the file path.

## E. Moderation and admin

```mermaid
erDiagram
  users ||--o{ student_reports : "reporter / reported"
  student_stories ||--o{ student_reports : "reported story (story_id)"
  users ||--o{ activity_logs : "admin actions"
  users ||--o{ system_settings : "updated by admin"
  student_reports {
    text status "pending | reviewing | resolved | dismissed"
    text context "chat | profile | business | story"
  }
```

- Disputes are not a table: they are the `dispute_*` columns of `orders`.
- Bans are not a table: `banned` is in `auth.users.raw_app_meta_data`
  (checked by `is_banned`).

## What happens when an account is deleted

Account deletion keeps a "Deleted user" row (tombstone) instead of removing
the user, so these links never break:

| Kept (accounting, disputes, the other person) | Changed | Removed |
|---|---|---|
| orders, transactions, pickup codes, ratings, chat messages, reports, deals (switched off), activity log, blocks **against** them | phones on orders set to empty; names → "Deleted user"; rating texts emptied; deal photos removed | role (so they can't log in), student / business profile, friendships, friend and message requests, their own blocks, stories and views, business stories, notifications, group memberships, saved items, interests, views, searches; phones with alerts on (trigger) |

*(From `tombstone_user_core`, `20261003240000_fix_tombstone_transactions_payload.sql`.)*

## Tables the app does not use (yet)

`business_follows`, `deal_searches`, `deal_views`, `social_content_interactions`,
`student_interests`, `student_saved_items`, `student_story_reactions`,
`group_order_payment_members` (old group payment). They exist in the
database but no screen or server function reads or writes them. Keep them
(planned features) or remove them in a clean-up; either way they cause no
harm today.
