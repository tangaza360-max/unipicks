# Unipicks — Social App Standards Audit

**Date:** 2026-10-03
**Scope:** Read-only review of the student social layer: `src/pages/Social.jsx`, `SocialOnboarding.jsx`, `StudentSearch.jsx`, `Messages.jsx`, `src/components/ChatThread.jsx`, `SocialActivity.jsx`, `StoryTray.jsx`, `StoryViewer.jsx`, `StudentCamera.jsx`, `ProfileTab.jsx`, `StudentBottomNav.jsx`, `DesktopNav.jsx`, and the social migrations (chiefly `20260917130000_create_student_profiles.sql`, `20260831070000_add_chat_messages.sql`, `20260909223046_add_group_chat_support.sql`).
**No app code was changed for this audit.**

> **Caveat:** database findings reflect the migrations in the repo. Production may differ where changes were applied through the SQL Editor.

> **How "standards" are cited:** social apps have no ISO-style standard. The benchmark is the **platform that set user expectations** (e.g. "Instagram-standard story tray", "WhatsApp-standard read receipts"), plus formal requirements where they exist: Apple App Store Review Guideline 5.1.1(v) and Google Play's account-deletion policy, Rwanda Law N° 058/2021 on personal data, and GDPR as a reference baseline.

---

## Founder decisions (2026-10-03)

These answer the open questions from the first version of this audit. They're **decided**. Items marked *code pending* still need an approved code change; per the founder's instruction, no app code was changed for them.

| # | Topic | Decision | Status |
|---|---|---|---|
| D1 | **Mobile nav** | Move Group Orders into Home. Mobile bottom nav becomes **Home · Search · Social · Profile · Camera**. | Decided; code pending (`StudentBottomNav.jsx`, plus a Group Orders entry on Home). See §0 |
| D2 | **Student messaging** | **No non-friend messaging for MVP.** A student can message another student only if they're friends or the recipient accepted a message request. The "anyone can message anyone" RLS path gets closed in a future migration (spec in §3). | Decided; migration pending |
| D3 | **Merchant messaging** | Merchants may message **any student who has ordered from them. No cold outreach.** | Decided; migration pending (same migration as D2) |
| D4 | **Student stories** | **Not in MVP; a v2 feature.** Relabel the camera button **"Snap & share"** and make clear it's photo capture + share to other apps, not a story post. | Decided; relabel is code pending. See §5 |
| D5 | **Moderation** | **Admins review reports, with a 24-hour first-response SLA.** | Decided. The admin Reports UI is a **gap** (§6) |

---

## Summary

The **database** for the social layer is far ahead of the **UI**. `20260917130000_create_student_profiles.sql` defines 14 well-constrained tables (profiles, friend requests, friendships, blocks, reports, message requests, notifications, student stories with views and reactions, business follows, interests, saved items, interactions), with RLS and atomic RPCs. Mutual-consent friendships are implemented exactly as product doc §8 describes.

The UI uses only part of it:

- **Student stories:** tables exist, but there's no UI to post or view them. The story tray on Social is hard-coded placeholder circles, and the camera only downloads or shares a photo.
- **The Social feed is a placeholder** ("Social content will appear here").
- **No report button** anywhere, although `student_reports` exists.
- **Social is missing from the mobile bottom nav** (desktop only). Most Kepler students will be on mobile, so they can't reach Social at all.

Two **safety bugs in chat RLS** stand out:

1. **Anyone can message anyone.** The `chat_messages` INSERT policy only checks `sender_id = auth.uid()`, so blocks and message requests can be bypassed with a direct API call.
2. **Receivers can rewrite messages they received.** The UPDATE policy isn't limited to `is_read`, so the text of a merchant's "accepted / pickup code" message can be edited by its recipient. That undermines chat as dispute evidence.

| # | Area | Status | Priority |
|---|------|--------|----------|
| 1 | User discovery | ⚠️ partial | 🟡 |
| 2 | Friend requests & approval | ⚠️ partial | 🟡 |
| 3 | Direct messaging | ⚠️ partial (+ safety bugs) | 🔴 |
| 4 | Group conversations | ⚠️ partial | 🟡 |
| 5 | Stories | ❌ missing (student; v2 per D4) / ⚠️ partial (merchant) | 🔴 relabel · 🟢 v2 |
| 6 | Content moderation | ❌ missing (SLA decided: 24h; admin UI is a gap) | 🔴 |
| 7 | Notifications | ⚠️ partial | 🟡 |
| 8 | Profile pages & privacy | ⚠️ partial | 🟡 |
| 9 | Feed algorithm | ❌ missing (social feed) | 🟢 |
| 10 | Onboarding | ⚠️ partial | 🟡 |
| 11 | Account deletion / data export | ❌ missing | 🔴 |
| 12 | Safety features | ⚠️ partial | 🔴 |
| + | Mobile Social entry point (founder-confirmed bug; nav fix decided, D1) | ❌ missing | 🔴 |

---

## 0. Mobile navigation: Social tab missing (founder-confirmed bug)

- **Status:** ❌ missing
- **Evidence:** `src/components/StudentBottomNav.jsx:12-28` defines Home, Search, Group Orders and Profile, plus a centre Camera action. `src/components/DesktopNav.jsx:5-9` defines Home, **Social**, Group Orders, Messages and Profile. `StudentLayout.jsx:186` renders `<Social />` for the `social` tab, but on a phone nothing links to it; the only way in is typing `/dashboard/social`.
- **Gap:** The main social surface (friends, requests, activity) can't be reached on mobile. Every major social app puts its social hub in the primary mobile nav (the Instagram / TikTok / Snapchat bottom-bar standard).
- **Nav fix (decided, D1):** the mobile bottom nav becomes **Home · Search · Social · Profile · Camera**. **Group Orders moves into Home**: a "My Groups" entry near the top of the Home feed (e.g. a pill or segmented control "Deals | My Groups" that routes to the existing `/dashboard/orders` page). Group orders are already started from deal cards, and join links (`?join_code=`) keep working because the route doesn't change. Show the unread friend/message-request count as a badge on the Social icon.
- **Implementation notes (for when the code change is approved):**
  - `StudentBottomNav.jsx`: replace the `group-orders` item with `{ id: 'social', label: 'Social' }`. Keep Camera as an action button rather than a nav destination.
  - `StudentLayout.jsx`: `handleNavigate` already maps `social` correctly. Remove the `group-orders → orders` active-tab special case from the bottom nav.
  - `DealsFeed.jsx` (Home): add the "My Groups" entry, with a purple dot when the student has an open group (the planned "purple nav badge", dev history Phase 3).
  - Keep `DesktopNav.jsx` as is (it already has Social and Group Orders).
- **Priority:** 🔴 blocking for the social layer to exist on mobile

## 1. User discovery (search, mutual friends, suggestions)

- **Status:** ⚠️ partial
- **Evidence:**
  - `search_students` RPC (`20260918100000_add_student_search.sql`) respects `discoverable = true` (line 54), hides blocked users in both directions (lines 57-65), and caps results at 30 (line 128). That's privacy-first and in line with Instagram's private-account search behaviour.
  - Multi-tab search (People / Businesses / Deals) with a 300 ms debounce lives in `src/pages/StudentSearch.jsx`. Social.jsx has a second, duplicate student search.
  - No mutual-friends count, no "people you may know", no "classmates on campus" suggestions. `student_interests` exists but isn't used.
- **Gap:** Discovery works only if you already know someone's username.
- **Recommended fix:** Show the mutual-friend count on search results and profiles (Facebook/Instagram standard). Add a "Suggested: same campus · N mutual friends" row, respecting `discoverable`, with no contact-book upload. Remove the duplicate search in Social.jsx in favour of `StudentSearch`.
- **Priority:** 🟡 should-have

## 2. Friend requests and approval flow

- **Status:** ⚠️ partial
- **Evidence:**
  - Mutual consent is modelled correctly. `friend_requests` uses `pending|accepted|declined` and `sender <> receiver` (lines 47-60). `friendships` stores an ordered unique pair (`student_a < student_b`, lines 78-93) so the same friendship can't exist twice.
  - RPCs `send_/accept_/decline_/cancel_friend_request` are wired up in `Social.jsx` and `SocialActivity.jsx`.
  - The `students_delete_own_friendships` policy (line 1268) allows unfriending, but **no UI** exposes it: Social.jsx shows a "Friends" badge with no remove action.
  - There's **no friends list** anywhere (Profile or Social), and no pending-requests count on navigation.
- **Gap:** You can't see your friends or remove one. Product doc §8 says students "should be able to remove or manage friendships later."
- **Recommended fix:** Add Profile → "Friends (N)" with a list, a "Remove friend" option behind confirmation, and a "Requests" sub-tab with an accept/decline badge (Facebook standard). Unfriending is silent, with no notification to the other person (Instagram/Facebook standard).
- **Priority:** 🟡 should-have

## 3. Direct messaging (threading, read receipts, attachments, typing)

- **Status:** ⚠️ partial, with two safety bugs
- **Evidence:**
  - Threads per counterpart; timestamps and date separators; instant scroll to latest (`ChatThread.jsx`, dev history 2026-09-27). Sender name plus role pill ("🏪 Merchant" / "🎓 Student"). ✅ Tappable phone numbers (`linkPhoneNumbers.jsx`). ✅ Actionable "Pay Now" message buttons via `link_path`. ✅
  - **Read receipts:** `is_read` is set when a thread is opened (`ChatThread.jsx:172-191`) and drives unread badges, but the **sender never sees "Seen"**. WhatsApp-standard ✓ / ✓✓ / blue ✓✓ isn't shown.
  - **Typing indicator:** none (no Realtime presence or broadcast).
  - **Attachments:** text only. No photos, which matter here: "is this the right order?", menu photos.
  - **Message requests:** `message_requests` (lines 176-189) plus the `send_/accept_message_request` RPCs give an Instagram-style request inbox for students who aren't friends. ✅ (in the data model)
  - **⚠️ Safety bug A: requests and blocks can be bypassed.** `20260831070000_add_chat_messages.sql:13-16`:
    `CREATE POLICY "Users can insert their own chat messages" … WITH CHECK (auth.uid() = sender_id)`.
    Any signed-in user can insert a message to **any** `receiver_id`, including someone who blocked them or never accepted their message request. Blocks today only hide people from search (`search_students`) and from message profiles; they don't stop messages.
  - **⚠️ Safety bug B: receivers can edit messages.** Same file, lines 18-21: `"Users can update messages they receive" … USING (auth.uid() = receiver_id)` has no `WITH CHECK` and no column restriction. A receiver can change the `message`, `sender_id` or `link_path` of any message they received. Merchant "accepted / pickup code / decline reason" messages are what disputes rely on as evidence (`AdminDisputes.jsx`), so they can't be trusted.
  - No delete-for-me, no message reporting, no mute-conversation.
- **Gap:** Chat consent and integrity are enforced only in the UI. Expected messaging features are missing.
- **Decided messaging policy (D2, D3):**
  - **Student → student:** allowed only if the two are **friends** (`friendships`) **or** the receiver **accepted a message request** (`message_requests.status = 'accepted'`), **and** neither has blocked the other.
  - **Merchant → student:** allowed only if the student **has ordered from that merchant** (any row in `orders` with `merchant_id = sender` and `student_id = receiver`). No cold outreach.
  - **Student → merchant:** allowed (students contact businesses about deals and orders).
  - **Group chat:** unchanged (members of the group order only).
  - **System messages** (accept, decline, pickup code) keep coming from Edge Functions using the service role, which bypasses RLS.
- **Future migration spec** (not written now, per founder): replace `"Users can insert their own chat messages"` with:
  ```sql
  create policy chat_insert_direct on public.chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and group_order_id is null and receiver_id is not null and (
      -- student → student: friends or accepted request, and not blocked
      (public.get_my_role() = 'student'
        and exists (select 1 from public.student_profiles where user_id = receiver_id)
        and not public.are_students_blocked(auth.uid(), receiver_id)
        and (exists (select 1 from public.friendships f
                     where (f.student_a, f.student_b) = (least(auth.uid(), receiver_id), greatest(auth.uid(), receiver_id)))
             or exists (select 1 from public.message_requests r
                        where r.status = 'accepted'
                          and ((r.sender_id, r.receiver_id) = (auth.uid(), receiver_id)
                            or (r.sender_id, r.receiver_id) = (receiver_id, auth.uid())))))
      -- student → merchant
      or (public.get_my_role() = 'student'
          and exists (select 1 from public.merchant_profiles where id = receiver_id and approved))
      -- merchant → student who has ordered from them
      or (public.get_my_role() = 'merchant'
          and exists (select 1 from public.orders o where o.merchant_id = auth.uid() and o.student_id = receiver_id))
    )
  );
  ```
  Check the exact signature of `are_students_blocked` and add an index on `orders (merchant_id, student_id)` when writing it. Test with a student who isn't a friend (rejected), a blocked friend (rejected), and a merchant writing to a student with no orders (rejected).
- **Recommended fix:**
  1. Ship the migration above (D2/D3).
  2. Replace the UPDATE policy with a SECURITY DEFINER `mark_messages_read(thread)` RPC, or `GRANT UPDATE (is_read)` only, plus `WITH CHECK`.
  3. Add read receipts ("Seen" under the last outgoing message, WhatsApp/iMessage standard) with a privacy toggle to turn them off (WhatsApp standard).
  4. Add a typing indicator via Supabase Realtime broadcast.
  5. Add image attachments (Storage, ≤2 MB, EXIF stripped).
- **Priority:** 🔴 for the RLS fixes; 🟡 for receipts, typing and attachments

## 4. Group conversations (roles, leave/join, moderation)

- **Status:** ⚠️ partial
- **Evidence:**
  - Group chat exists only for group orders: `chat_messages.group_order_id` plus RLS limiting view and send to `group_order_members` (`20260909223046_add_group_chat_support.sql:20-40`). ✅
  - Implicit roles: host (`group_orders.created_by`) and member. The host can cancel or close the order (`GroupOrders.jsx:332`), but there's no "remove member", no "leave group" for members, and no mute.
  - Joining is by link or code (product doc §9), which is the WhatsApp invite-link standard. Join codes can't be revoked or regenerated.
  - Group chat stays open after the group closes or is cancelled; there's no read-only archive state.
- **Gap:** No member management, leave, mute, or reporting inside a group.
- **Recommended fix:** Add a "Leave group" action for members (only before payment). Let the host remove a member (also only before payment), with a WhatsApp-style system message ("Alice removed Bob"). Make the chat read-only once the group is closed or cancelled. Add a "Reset invite code" action for the host.
- **Priority:** 🟡 should-have

## 5. Stories (tray, viewer, expiry, viewer list, replies)

- **Status:** ❌ missing for students · ⚠️ partial for merchants
- **Evidence (merchant stories):**
  - 24-hour expiry (`20260913100000_add_merchant_stories.sql:7`, RLS `expires_at > now()` in `20260914010000_secure_merchant_stories.sql:11`). ✅
  - Tray on the Home feed (`DealsFeed.jsx:100-180`, `StoryTray.jsx`, `StoryRing.jsx`). ✅
  - Viewer with progress bars and auto-advance (`StoryViewer.jsx:6-53`), and a direct "Order" action from the story (`onOrder`). ✅ This is a strong, commerce-native pattern (Instagram shoppable stories).
  - Missing: viewer list and view counts for merchants; replies (Instagram-standard "Send message" bar → DM); a seen/unseen ring state. Story navigation uses click-only `<div>`s (`StoryViewer.jsx:84-85`), so it doesn't work with a keyboard. The alt text is the generic `alt="Story"`.
- **Evidence (student stories):**
  - The schema is complete: `student_stories` (image/video, `visibility in ('everyone','friends')`, `expires_at`), `student_story_views` (unique per viewer, owner can read the viewer list), `student_story_reactions`, with RLS (lines 236-312, 1384-1490).
  - **No frontend references any of these tables.** The Social story tray is hard-coded: a "Your Story" button with no `onClick`, plus three grey placeholder circles labelled "Stories" (`Social.jsx:615-646`).
  - The centre **Camera** button (`StudentCamera.jsx`) captures a photo and only offers **download** (line 122) or the **OS share sheet** (line 138). It never posts a story.
  - `students_view_own_stories` (line 1423) lets a student `SELECT` only their **own** stories; there's no policy or RPC for viewing friends' or "everyone" stories, so even with a UI, nobody else could see them.
- **Gap:** Student stories are advertised in the UI (the camera button, the "Your Story" circle) but don't work, which is a broken promise.
- **Decision (D4): student stories are a v2 feature, not MVP.**
  - **MVP (code pending):**
    - Relabel the camera button **"Snap & share"**: `ariaLabel` "Snap & share" in `StudentBottomNav.jsx`, plus a one-line hint in `StudentCamera.jsx`: *"Take a photo and share it to WhatsApp, Instagram or any app. It isn't posted on Unipicks."*
    - Keep the download and OS share actions as they are.
    - Remove the placeholder story tray ("Your Story" and the grey circles) from `Social.jsx` so nothing implies posting.
    - Merchant stories stay as they are; they work.
  - **v2 backlog (when stories are prioritised):** the build steps below.
- **v2 build plan:**
  - Follow the Instagram standard:
    - Posting from the camera uploads to storage, inserts into `student_stories` with a visibility picker (Friends / Everyone), and expires after 24h.
    - A `get_story_tray()` RPC returns friends' and public active stories, excluding blocked users, unseen first.
    - The viewer shows "Seen by N" to the owner.
    - Replies arrive as DMs, subject to the message-request rules.
    - Merchant stories get a view count.
- **Priority:** 🔴 MVP for the relabel and removing the fake tray; 🟢 v2 for student stories

## 6. Content moderation (reports, blocks, mute)

- **Status:** ❌ missing (beyond blocks)
- **Evidence:**
  - **Blocks:** `blocked_students` plus `block_student` / `unblock_student`, wired up in `Social.jsx:250-262`. A block hides each student from the other's search results, but isn't enforced on chat (see §3A) or on stories.
  - **Reports:** the `student_reports` table exists (lines 133-160, statuses `pending|reviewing|resolved|dismissed`, insert policy `students_create_reports` at line 1315), but **no UI files a report**, and there's **no admin screen** to review them. `AdminReviews.jsx` covers ratings only.
  - No mute (Instagram-standard "mute stories/messages without unfriending").
  - No reporting of merchants, stories or messages. Product doc §15 requires "Students can report comments or businesses. Businesses can also report students."
  - Admin moderation of ratings is a hard delete (`AdminReviews.jsx:25-27`). Product doc §15 requires hidden-but-retained.
- **Gap:** The reporting loop users expect on every social platform (report → review → action) doesn't exist. App stores require user-generated-content apps to offer reporting and blocking (Apple Guideline 1.2: a way to filter objectionable content, report it, and block abusive users, with timely responses).
- **Moderation SLA (decided, D5):** **admins review all reports, with a first response within 24 hours** (acknowledge and either act or move to `reviewing`). Serious safety reports (threats, harassment, sexual content, minors) should get immediate action: suspend first, then review. Publish the SLA in the Terms under "Reports and enforcement" so users know what to expect. It also answers Apple's "timely response" expectation.
- **⚠️ Gap: there is no admin Reports UI.** To meet the SLA, admins need:
  - an **Admin → Reports** tab (alongside Disputes), with filters for New, Reviewing, Resolved and Dismissed;
  - each report's age, highlighted once it's more than 24h old (an SLA breach);
  - actions: dismiss, warn, hide content, suspend user, with each action written to `activity_logs` via `log_admin_action`;
  - a red badge on the tab with the count of reports older than 12h;
  - optional: an email or Web Push to the admin when a new report arrives, so the 24h clock doesn't depend on opening the dashboard.
- **Recommended fix:**
  - Add a "Report" option in the ⋯ menu on profiles, messages and businesses (and stories in v2), inserting into `student_reports` (extended with `target_type`, `target_id`).
  - Build the Admin → Reports queue described above.
  - Add mute for conversations (and stories in v2).
- **Priority:** 🔴 blocking (an App Store requirement for user-generated content, and a basic safety need)

## 7. Notifications (push, in-app, digest)

- **Status:** ⚠️ partial
- **Evidence:**
  - In-app: `social_notifications` (lines 206-230) feeds `SocialActivity.jsx` (friend requests, message requests, accept/decline actions). The chat bubble shows an unread badge (`StudentLayout.jsx`).
  - `StudentLayout.jsx:160-162` dispatches `unipicks-open-activity` with **no listener** (noted in the dev history but still present). The activity panel is reachable only from inside `Social.jsx:543`, which mobile users can't reach (§0).
  - No push (no `PushManager` in `src/` or `public/sw.js`). No email or WhatsApp digest. No notification settings.
- **Gap:** Social events (new request, accepted, story reply, group join) are invisible unless the student happens to be on the Social page.
- **Recommended fix:**
  - Add an activity bell (heart icon, Instagram standard) in the top bar with an unread count, opening `SocialActivity`. Remove the dead event.
  - Add Web Push for requests and messages, with per-category toggles in Profile (iOS/Android notification-settings standard).
  - Defer email digests; WhatsApp is the dominant channel in Rwanda.
- **Priority:** 🟡 should-have

## 8. Profile pages (privacy controls, follower model)

- **Status:** ⚠️ partial
- **Evidence:**
  - `student_profiles` has a unique case-insensitive username (line 39), a display name, university, campus, bio and a `discoverable` flag (lines 7-37). ProfileTab has a Discoverability toggle (`ProfileTab.jsx:287-317, 870-895`). ✅
  - Follower model: student ↔ student uses **mutual friendship** (the Facebook model), not follow (the Instagram model). That's a deliberate product choice (§8), and right for campus safety. `business_follows` (lines 326-335) would add a one-way student → business follow (the Instagram business standard) but has **no UI**.
  - The public profile view (Social.jsx `selectedStudent`) shows name, @username, campus and bio, but no friend count, mutual friends or shared groups.
  - No profile photo upload for students (`StudentAvatar.jsx` falls back to initials).
  - Privacy controls cover discoverability only: there's no control over who can message you (everyone / friends) or who can see your stories (the default is on each story).
- **Gap:** A thin profile with no photo, no business follow, and only one privacy control.
- **Recommended fix:** Add a profile photo (moderated, EXIF stripped). Add "Who can message me: Everyone / Friends only" (Instagram/WhatsApp standard). Show "N mutual friends" on profiles. Add a "Follow" button on business pages using `business_follows`, so followed businesses rank higher in the feed.
- **Priority:** 🟡 should-have

## 9. Feed algorithm (recency vs. relevance)

- **Status:** ❌ missing for the social feed (✅ for the deals feed)
- **Evidence:**
  - The Social feed tabs (For You / Deals / Events / Activities, `Social.jsx:17-22`) render only "Social content will appear here." (`Social.jsx:670-680`).
  - The **deals** feed has a real relevance model ("Smart Discovery v3", `DealsFeed.jsx:307-443`: day 25%, time 25%, expiry 20%, affordability 15%, freshness 10%, quality 5%). It's more mature than many early marketplaces.
  - Signals are collected but unused for social ranking: `social_content_interactions`, `student_saved_items`, `student_interests`.
- **Gap:** The social feed doesn't exist. That's acceptable for MVP (product doc §25: "social where it creates value"), but tabs that lead to empty pages shouldn't ship.
- **Recommended fix:** Hide the Social feed tabs until there's content. When building it, start with an **activity feed of friends' deal actions**: "Aline saved Mr. Chips' combo", "3 friends joined a group order at …". That's the Venmo social-feed pattern, which drives commerce, with recency-first ordering and opt-out per action type, rather than a general content feed.
- **Priority:** 🟢 nice-to-have (🟡 for hiding the empty tabs)

## 10. Onboarding flow

- **Status:** ⚠️ partial
- **Evidence:**
  - Account signup (`Register.jsx`) verifies the `@keplercollege.ac.rw` domain; the terms and privacy checkbox exists. ✅
  - Social onboarding (`SocialOnboarding.jsx`) has 4 steps:
    1. An 18+ self-declaration (line 58).
    2. Username (line 63).
    3. Display name, university and campus as **free text** (lines 255-300), even though the university is already known from the verified email domain.
    4. A final step.

    It has a progress indicator (line 184). ✅
  - It doesn't explain what Social is for or why to join, offers no friend suggestions at the end, and doesn't prompt for a photo or interests (`student_interests` is unused).
- **Gap:** Data the system already has is asked for again, and the onboarding ends with an empty social graph.
- **Recommended fix:**
  - Prefill university from the email domain and make campus a dropdown.
  - Pre-suggest a username from the name.
  - End with "Find classmates" (suggested same-campus discoverable students) and an "Invite friends via WhatsApp" share link. The Instagram/TikTok onboarding standard ends with follow suggestions so the first feed isn't empty.
- **Priority:** 🟡 should-have

## 11. Account deletion / data export

- **Status:** ❌ missing
- **Evidence:** No "Delete account" or "Download my data" in `ProfileTab.jsx`. Only the admin RPC `admin_delete_user` exists (`20260903213819_add_admin_user_management_functions.sql`). `Privacy.jsx` says users "may request … deletion" but gives no channel.
- **Gap:** These are required by:
  - **Apple App Store Guideline 5.1.1(v):** apps that support account creation must let users start account deletion in the app. This will block the planned Capacitor iOS release (roadmap Phase 3).
  - **Google Play's account-deletion policy:** in-app deletion plus a web link.
  - **Law N° 058/2021** and the GDPR (Art. 17 erasure, Art. 20 portability) reference baseline.
- **Recommended fix:**
  - Add Profile → Settings → "Delete account". Confirm by typing the username, then run a SECURITY DEFINER RPC that anonymises orders and ratings (keeping financial records for legal retention), deletes the social profile, stories, friendships and messages, then deletes the auth user.
  - Add "Download my data", which emails or returns a JSON export.
  - Publish a public deletion web page for Google Play.
- **Priority:** 🔴 blocking for app-store launch; 🟡 for the web MVP

## 12. Safety features (blocking, age gates, reporting)

- **Status:** ⚠️ partial
- **Evidence:**
  - **Age gate:** `is_18_plus` must be true (DB check, line 36) and is self-declared (`SocialOnboarding.jsx:58`). Students under 18 are therefore excluded from Social, which is reasonable for a university platform. But `Privacy.jsx` says "not children under 13", which is inconsistent (also in the e-commerce audit §14).
  - **Verified community:** only verified-domain students can sign up, a real safety advantage over open platforms. Product doc §9 group links are restricted to verified accounts. ✅
  - **Blocking:** exists, but isn't enforced on messages (§3A) or stories.
  - **Reporting:** missing (§6).
  - **Phone exposure:** the student's phone number is copied onto every order and is visible to the merchant (`create-order/index.ts:113`). That's acceptable for fulfilment, but should be disclosed, with a note that merchants mustn't reuse it.
  - **Rate limiting:** none on `send_friend_request` / `send_message_request` (spam). Check the RPCs for a per-day cap.
- **Gap:** Blocks aren't enforced everywhere, there's no reporting, and the age statements are inconsistent.
- **Recommended fix:** Enforce blocks in the `chat_messages` INSERT policy and in the story tray RPC. Add reporting (§6). Cap friend and message requests at about 30 per day per student. Align the privacy policy to 18+ for Social.
- **Priority:** 🔴 blocking (block enforcement, reporting)

---

## Top 10 prioritized actions (ranked by impact)

| Rank | Action | Why | Effort | Refs |
|---|---|---|---|---|
| 1 | **Fix `chat_messages` RLS** per D2/D3 (spec in §3): students need a friendship or accepted request; merchants only message students who ordered from them; no blocked pairs; UPDATE limited to `is_read` through an RPC | Blocks and consent can be bypassed; message evidence can be edited | S (1 migration) | §3, §12 |
| 2 | **Mobile nav fix (D1):** Home · Search · Social · Profile · Camera; Group Orders moves into Home | The social layer can't be reached on phones | XS | §0 |
| 3 | **Reporting + admin Reports queue** with the 24h SLA (D5) | Safety baseline; Apple Guideline 1.2 | M | §6 |
| 4 | **In-app account deletion + data export** | Apple 5.1.1(v) / Google Play; Law 058/2021 | M | §11 |
| 5 | **"Snap & share" relabel + remove the fake story tray and empty feed tabs** (D4) | Broken promises erode trust | XS | §5, §9 |
| 6 | **Activity bell in the top bar** (wire up `SocialActivity`, remove the dead event) with an unread count | Friend and message requests go unseen | S | §7 |
| 7 | **Friends list + remove friend + requests badge** | Required by product doc §8 | S | §2 |
| 8 | **v2: Student stories end to end** (post from camera, tray RPC respecting friends/everyone and blocks, viewer list, replies to DM) | Deferred to v2 (D4); the schema is ready | L | §5 |
| 9 | **Read receipts ("Seen") + typing indicator + image attachments** | WhatsApp-level baseline expectations | M | §3 |
| 10 | **Onboarding: prefill university/campus, end with "Find classmates" + WhatsApp invite** | First session ends with an empty graph | S | §10 |

---

## Open questions

All five original questions were answered on 2026-10-03; see **Founder decisions** at the top. Remaining follow-up: approve the code changes marked *code pending* (D1 nav, D4 relabel) and the D2/D3 chat migration when ready.
