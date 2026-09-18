# Unipicks — Group Orders

## 1. Purpose

Group Orders allow multiple students to join the same temporary order around one deal.

The goal is to make group buying useful for students who are already together, such as during lunch, breaks, or other campus activities.

Key product rules:
- Anyone with the group-order link or join code can join.
- A group is a temporary activity, not a friendship system.
- Each student normally pays only for their own items.
- A student can optionally pay for another group member.
- Larger groups can unlock better deals or lower shared delivery costs.
- Businesses can later define minimum and maximum group sizes.
- Businesses can later create group-only offers.
- Shared delivery can make several orders more efficient.

This document records the Group Orders product design, database foundation, security, payment architecture, and frontend changes.
## 2. Payment Architecture

Unipicks uses Architecture A for Group Order payments.

### How it works

- Every student normally pays only for themselves.
- A student can choose to pay for one or more other group members.
- Students can pay at different times.
- A student does not need to wait for the whole group before paying.
- The system keeps track of who is unpaid, whose payment is in progress, and who has paid.

### Why this architecture was chosen

This keeps payment simple and flexible for students. It also supports real group situations where one person may decide to pay for a friend, while everyone else pays separately.

The database does not store a fixed paid amount directly on each group member. The amount owed is calculated from the member quantity and the current deal price. Actual payment allocations are stored separately.

### Payment statuses

- unpaid — the member has not been paid for.
- pending — a payment is currently being processed or reserved.
- paid — payment for that member has been completed.

The frontend should not directly create or modify payment allocation records. Payment allocation and payment-status changes are controlled by the backend payment flow.
## 3. Group Order Database

The Group Orders backend is built around two main tables: `group_orders` and `group_order_members`.

### 3.1 group_orders

This table represents the shared Group Order itself.

Important fields:
- `id` — unique Group Order ID.
- `deal_id` — the deal being purchased.
- `created_by` — the student who created the group.
- `host_name` — the name of the host.
- `join_code` — the code students use to join the group.
- `status` — controls whether the Group Order is open or cancelled.
- `created_at` — when the Group Order was created.

The `join_code` is unique so that one code cannot identify multiple Group Orders.

### 3.2 group_order_members

This table represents each student participating in a Group Order.

Important fields:
- `id` — unique member record.
- `group_order_id` — identifies the Group Order.
- `student_id` — identifies the student.
- `student_name` — stored display name.
- `item_note` — optional note for the order.
- `joined_at` — when the student joined.
- `quantity` — number of items the student is ordering.
- `payment_status` — unpaid, pending, or paid.
- `order_id` — links the group member to the normal order record when an order is created.

Each student can appear only once in the same Group Order through a unique constraint on `group_order_id` and `student_id`.

The database also prevents the same normal order from being linked to multiple Group Order members through a unique index on `order_id`.
## 4. Security and Access Control

Group Orders use database-level access control so students can only access groups they are allowed to access.

### Access rules

- A Group Order host can view their Group Order.
- A student who has joined a Group Order can view that Group Order.
- Participants can view the members of their Group Order.
- A student can join an open Group Order as themselves.
- A student cannot join as another user.
- Closed or cancelled Group Orders cannot accept new members.

### Secure database functions

The backend includes security functions that check whether the current signed-in student can access a Group Order and whether a Group Order is still open.

The join-code lookup also uses a protected database function. This allows the system to find an open Group Order without exposing broad access to the `group_orders` table.

These functions run with controlled permissions and are not available for unrestricted public use.

### Payment security

Payment allocation records do not have client-side INSERT or UPDATE permissions. This is intentional. The payment backend must control payment allocations and payment-status changes so students cannot simply mark members as paid from the frontend.
## 5. Group Payment Tracking and Allocation

Group Orders use a separate payment-allocation table so one payment can cover one or more group members.

### group_order_payment_members

This table connects a payment transaction to the Group Order members that the payment covers.

Important fields:
- `id` — unique allocation record.
- `transaction_id` — the payment transaction.
- `group_order_member_id` — the group member being paid for.
- `amount` — the amount allocated to that member.
- `created_at` — when the allocation was created.

A transaction can therefore pay for the student who made the payment, another group member, or multiple members.

The allocation table has a unique constraint preventing the same transaction from allocating payment to the same group member more than once.

### Why payment allocation is separate

The amount a member owes is based on their quantity and the current deal price. The database does not store a separate `paid_amount` field on the member.

Instead, payment records show exactly which members were covered by each transaction and how much was allocated to them.

This gives the payment system a clear history and supports the Architecture A decision where one student can optionally pay for other students.
## 6. Safe Payment Reservation and Concurrency

Group payments need protection against two people trying to pay for the same member at the same time.

For example, if two students select the same unpaid group member before either payment finishes, the system must not allow both payments to reserve that member.

### Reservation process

The database includes a secure function called `reserve_group_order_payment_members`.

Before the payment provider is called, this function:

- Checks that at least one member was selected.
- Checks that all selected members belong to the same Group Order.
- Checks that all selected members exist.
- Checks that the Group Order is still open.
- Checks that all selected members are currently unpaid.
- Changes the selected members from `unpaid` to `pending`.
- Returns the reserved members to the payment backend.

The function is controlled by the backend and is not available for normal client-side execution.

### Payment result

If payment succeeds, the reserved members can be completed as `paid` and the payment allocation records can be created.

If payment fails or is cancelled, the reserved members must be returned to `unpaid` so they can be paid later.

This reservation step is important because it prevents double-payment attempts and gives the payment flow a clear state while the external payment provider is processing the transaction.
## 7. Transactions and Group Redemption

Group payments use the existing Unipicks transaction system while adding Group Order support.

### Transaction support

The `transactions` table was updated so a Group Order payment can be connected to a `group_order_id`.

The existing `redemption_id` remains available for normal orders, but it can now be temporarily empty for Group Order payments because the final shared redemption does not exist until the whole active group has paid.

Existing normal transactions are preserved. The Group Order changes do not replace the normal order payment system.

### Group redemption

A Group Order receives one shared redemption code after all active group members have successfully paid.

The host receives this single Group Order redemption code.

The merchant can use the shared code to verify the completed Group Order instead of requiring a separate redemption code for every member.

The database prevents more than one Group Order redemption from being created for the same Group Order.

The final redemption should only be created when everyone in the active Group Order has paid.
## 8. Atomic Group Order Creation

Group Order creation was moved into a secure database function so the Group Order and its first member are created together.

The function is called `create_group_order_with_host`.

### What the function does

- Confirms that the student is signed in.
- Confirms that a deal was provided.
- Confirms that the selected deal exists.
- Gets the signed-in student name from their account information.
- Validates the join code.
- Creates the Group Order.
- Automatically adds the creator as the first member and host.

The host is therefore created as a Group Order member in the same database operation.

This is safer than relying on the frontend to create the Group Order first and then separately create the host member. It reduces the chance of creating an incomplete Group Order.

The function is available to authenticated users and is not exposed for unrestricted public use.
## 9. Frontend Group Orders

The main Group Orders frontend is implemented in `src/pages/GroupOrders.jsx`.

The page is now self-contained and loads its own available deals instead of depending on the Home or Deals Feed page to provide the deals.

### Group Order creation

When a student starts a Group Order, the frontend generates a join code and calls the secure `create_group_order_with_host` database function.

The frontend no longer directly inserts the new Group Order into the database.

This keeps Group Order creation inside the controlled backend function.

### Existing Group Order features

The Group Orders area supports the existing Group Order experience, including creating and joining Group Orders and viewing group members.

The existing Group Order messaging and group-chat foundation remains part of the product.

No changes were made to the normal order payment flow as part of this Group Order work.
## 10. Navigation Changes

Group Orders were moved to the main student navigation position that was previously used by Orders.

### What changed

- Group Orders now appears as a main navigation item.
- The navigation label is `Group Orders`.
- The navigation icon was changed to a group-oriented icon.
- The Group Orders page is no longer embedded inside the Home or Deals Feed page.
- The existing Orders screen was moved into the Profile area.

### Important

This was only a location and navigation change. The existing Group Order and normal Order logic was not intentionally redesigned as part of this change.

The internal navigation tab ID remains `orders` for compatibility with the existing navigation structure, while the user-facing label is `Group Orders`.
## 11. Database Migrations and Backend Changes

The Group Orders database foundation was built through a series of Supabase migrations.

Important migrations include:

- `20260831060237_add_group_orders.sql` — creates the Group Order and member tables.
- `20260831061227_add_group_order_quantity.sql` — adds member quantity.
- `20260909223046_add_group_chat_support.sql` — adds Group Order chat support.
- `20260914011000_secure_group_order_access.sql` — adds protected Group Order access and join-code functions with RLS.
- `20260917000100_add_group_order_member_order.sql` — connects Group Order members to normal orders.
- `20260917040000_add_group_order_payment_tracking.sql` — adds payment status and payment allocation tracking.
- `20260917050000_add_group_order_redemption.sql` — connects redemptions to Group Orders and prevents duplicate Group Order redemptions.
- `20260917060000_reconcile_transactions_for_group_orders.sql` — adds Group Order support to the existing transaction system.
- `20260917070000_add_group_payment_reservation.sql` — adds safe payment-member reservation.
- `20260917080000_create_group_order_with_host.sql` — adds atomic Group Order creation with the host as the first member.

The migrations were pushed to the live Supabase database during development.

The existing normal order transaction and payment foundation was preserved while Group Order support was added around it.
## 12. Validation and Testing Completed

The Group Orders database and frontend changes were validated during development.

### Database validation

- Supabase migrations were pushed successfully to the linked project.
- The Group Order payment reservation function was pushed successfully.
- The atomic Group Order creation function was pushed successfully.
- The transaction schema was reconciled so existing normal transactions remain supported.
- Group Order redemption support was added without removing the existing normal redemption flow.

### Frontend validation

- The Group Order creation flow was updated to use the secure database function.
- `npm run build` completed successfully after the Group Order frontend changes.
- `npm run build` completed successfully again after the navigation changes.
- Vite reported a large JavaScript chunk warning, but the build itself completed successfully.

The next important test is runtime testing in the development application: create a Group Order, join it with another student account, verify the member list, and then test the payment flow.
## 13. Current Status and Next Steps

### Current status

The Group Orders foundation is now in place.

Completed:
- Group Order database structure.
- Group member quantities.
- Group member payment statuses.
- Payment allocation tracking.
- Safe payment reservation.
- Group Order transaction support.
- Group Order redemption support.
- Atomic Group Order creation with the host.
- Secure Group Order access and join-code handling.
- Group Order frontend creation flow.
- Group Orders moved into the main student navigation.
- Normal Orders moved into Profile.
- Production build validation.

### Not yet considered finished

The complete runtime payment flow still needs to be tested end-to-end.

This includes:
- Selecting one or more members to pay for.
- Reserving those members.
- Starting the payment provider transaction.
- Handling successful payment.
- Handling failed or cancelled payment.
- Creating payment allocation records.
- Updating members to `paid`.
- Returning failed reservations to `unpaid`.
- Checking when every active group member has paid.
- Creating the single Group Order redemption code.
- Delivering the redemption code to the host.
- Verifying the Group Order redemption with the merchant.

### Development rule

The existing normal order flow should remain unchanged unless runtime testing identifies a real regression. Group Order work should be built around the existing payment and order foundation rather than replacing it.
