# Unipicks — Social App Standards Audit

**Date:** 2026-10-03
**Scope:** Read-only review of the student social layer: `src/pages/Social.jsx`, `SocialOnboarding.jsx`, `StudentSearch.jsx`, `Messages.jsx`, `src/components/ChatThread.jsx`, `SocialActivity.jsx`, `StoryTray.jsx`, `StoryViewer.jsx`, `StudentCamera.jsx`, `ProfileTab.jsx`, `StudentBottomNav.jsx`, `DesktopNav.jsx`, and the social migrations (chiefly `20260917130000_create_student_profiles.sql`, `20260831070000_add_chat_messages.sql`, `20260909223046_add_group_chat_support.sql`).
**No app code was changed for this audit.**

> **Caveat:** database findings reflect the migrations in the repo. Production may differ where changes were applied through the SQL Editor.

> **How "standards" are cited:** social apps have no ISO-style standard. The benchmark is the **platform that set user expectations** (e.g. "Instagram-standard story tray", "WhatsApp-standard read receipts"), plus formal requirements where they exist: Apple App Store Review Guideline 5.1.1(v) and Google Play's account-deletion policy, Rwanda Law N° 058/2021 on personal data, and GDPR as a reference baseline.

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
| 5 | Stories | ❌ missing (student) / ⚠️ partial (merchant) | 🟡 |
| 6 | Content moderation | ❌ missing | 🔴 |
| 7 | Notifications | ⚠️ partial | 🟡 |
| 8 | Profile pages & privacy | ⚠️ partial | 🟡 |
| 9 | Feed algorithm | ❌ missing (social feed) | 🟢 |
| 10 | Onboarding | ⚠️ partial | 🟡 |
| 11 | Account deletion / data export | ❌ missing | 🔴 |
| 12 | Safety features | ⚠️ partial | 🔴 |
| + | Mobile Social entry point (founder-confirmed bug) | ❌ missing | 🔴 |

---

## 0. Mobile navigation: Social tab missing (founder-confirmed bug)

- **Status:** ❌ missing
- **Evidence:** `src/components/StudentBottomNav.jsx:12-28` defines Home, Search, Group Orders and Profile, plus a centre Camera action. `src/components/DesktopNav.jsx:5-9` defines Home, **Social**, Group Orders, Messages and Profile. `StudentLayout.jsx:186` renders `<Social />` for the `social` tab, but on a phone nothing links to it; the only way in is typing `/dashboard/social`.
- **Gap:** The main social surface (friends, requests, activity) can't be reached on mobile. Every major social app puts its social hub in the primary mobile nav (the Instagram / TikTok / Snapchat bottom-bar standard).
- **Recommended fix:** Add Social to the mobile bottom nav. With 5 slots including the camera, the cleanest options are:
  - **(a) Recommended:** Home · Search · [Camera] · Social · Profile, with Group Orders moved into a top segment on Home or into Profile. Group orders are started from deal cards anyway.
  - **(b)** Replace Search with Social and put search in the top bar (the Instagram pattern before 2020).

  Either way, show the unread-requests badge on the Social icon.
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
- **Recommended fix:**
  1. Replace the INSERT policy so student-to-student messages require an accepted message request or a friendship, and neither side has blocked the other (use `are_students_blocked`, which exists but is unused). Merchant ↔ student messages should require an order or deal context. System messages should come only from the service role.
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
- **Recommended fix:**
  - Short term: hide the placeholder tray and relabel the camera "Snap & share", so the UI doesn't promise something it can't do.
  - To build it, follow the Instagram standard:
    - Posting from the camera uploads to storage, inserts into `student_stories` with a visibility picker (Friends / Everyone), and expires after 24h.
    - A `get_story_tray()` RPC returns friends' and public active stories, excluding blocked users, unseen first.
    - The viewer shows "Seen by N" to the owner.
    - Replies arrive as DMs, subject to the message-request rules.
    - Merchant stories get a view count.
- **Priority:** 🟡 should-have (🔴 for hiding the fake tray)

## 6. Content moderation (reports, blocks, mute)

- **Status:** ❌ missing (beyond blocks)
- **Evidence:**
  - **Blocks:** `blocked_students` plus `block_student` / `unblock_student`, wired up in `Social.jsx:250-262`. A block hides each student from the other's search results, but isn't enforced on chat (see §3A) or on stories.
  - **Reports:** the `student_reports` table exists (lines 133-160, statuses `pending|reviewing|resolved|dismissed`, insert policy `students_create_reports` at line 1315), but **no UI files a report**, and there's **no admin screen** to review them. `AdminReviews.jsx` covers ratings only.
  - No mute (Instagram-standard "mute stories/messages without unfriending").
  - No reporting of merchants, stories or messages. Product doc §15 requires "Students can report comments or businesses. Businesses can also report students."
  - Admin moderation of ratings is a hard delete (`AdminReviews.jsx:25-27`). Product doc §15 requires hidden-but-retained.
- **Gap:** The reporting loop users expect on every social platform (report → review → action) doesn't exist. App stores require user-generated-content apps to offer reporting and blocking (Apple Guideline 1.2: a way to filter objectionable content, report it, and block abusive users, with timely responses).
- **Recommended fix:**
  - Add a "Report" option in the ⋯ menu on profiles, messages, stories and businesses, inserting into `student_reports` (extended with `target_type`, `target_id`).
  - Add an Admin → "Reports" queue alongside Disputes, with actions: dismiss, warn, hide content, suspend (product doc §15 ladder).
  - Add mute for stories and conversations.
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
| 1 | **Fix `chat_messages` RLS**: INSERT requires friendship, an accepted request or order context, and no block; UPDATE limited to `is_read` through an RPC | Blocks and consent can be bypassed; message evidence can be edited | S (1 migration) | §3, §12 |
| 2 | **Add Social to the mobile bottom nav** (Home · Search · Camera · Social · Profile) | The social layer can't be reached on phones | XS | §0 |
| 3 | **Reporting + admin Reports queue** (profiles, messages, stories, businesses) | Safety baseline; Apple Guideline 1.2 | M | §6 |
| 4 | **In-app account deletion + data export** | Apple 5.1.1(v) / Google Play; Law 058/2021 | M | §11 |
| 5 | **Hide or stub the fake UI**: the placeholder story tray, empty feed tabs, and the camera's implied posting | Broken promises erode trust | XS | §5, §9 |
| 6 | **Activity bell in the top bar** (wire up `SocialActivity`, remove the dead event) with an unread count | Friend and message requests go unseen | S | §7 |
| 7 | **Friends list + remove friend + requests badge** | Required by product doc §8 | S | §2 |
| 8 | **Student stories end to end** (post from camera, tray RPC respecting friends/everyone and blocks, viewer list, replies to DM) | The schema is ready; this completes the camera's promise | L | §5 |
| 9 | **Read receipts ("Seen") + typing indicator + image attachments** | WhatsApp-level baseline expectations | M | §3 |
| 10 | **Onboarding: prefill university/campus, end with "Find classmates" + WhatsApp invite** | First session ends with an empty graph | S | §10 |

---

## Open questions for the founder

1. **Mobile nav layout:** if Social takes a bottom-nav slot, which goes: Group Orders (moved to Home or Profile; recommended) or Search (moved to the top bar)?
2. **Who can DM whom:** should students be able to message non-friends at all (through message requests, as built), or friends-only for MVP? Should merchants be able to message students who haven't ordered?
3. **Student stories:** are they in MVP scope, or should the camera be repositioned as "snap & share" until later? Product doc §26 lists only "basic profiles" for MVP.
4. **Moderation staffing:** who reviews reports, and in what target time? Apple expects a "timely" response, so even "within 24h by the founder" should be written down.
5. **Profile photos:** OK to allow them? They need moderation, which ties to question 4.
