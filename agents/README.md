# Unipicks helpers (Area 6)

Written guides that a person — or an AI assistant given the guide — uses to
do routine business work. **They draft; a person decides and sends.** None of
them runs on its own, reads the database, or has any password or key.

| Helper | File | Status |
|---|---|---|
| Support (student and business questions) | [`support-agent.md`](./support-agent.md) | ✅ Ready |
| Marketing (posts, pitches, launch) | [`marketing-agent.md`](./marketing-agent.md) | ✅ Ready |
| Analytics (weekly numbers) | — | Later — when there is real order data; the numbers are in [`../business/metrics.md`](../business/metrics.md) |

## How to use the support helper

**Without AI:** open `support-agent.md`, find the situation in the table
(section 4), check the order or account (section 5), and adapt the reply.

**With an AI assistant (Claude, ChatGPT…):**
1. Copy the **system prompt** (section 2) and **How Unipicks works**
   (section 3) into a new chat. In Claude you can save them once as a
   **Project** with these as its instructions, so you don't paste them every
   time.
2. Paste the person's message. **Remove their email address and phone number
   first** — the AI doesn't need them.
3. Read the draft. If it says `CHECK:`, look it up with the queries in
   section 5 and tell the AI only the fact ("the order is Paid").
4. Fix anything wrong, then **you** send it from the Unipicks email or
   WhatsApp.

**Never** give the AI: database results, passwords, API keys, MoMo PINs,
pickup codes, or screenshots showing other people's details.

## How to use the marketing helper

Same way: copy its **system prompt** (section 2) and **What we can say**
(section 1) into a chat or a Claude Project, then ask for a post ("WhatsApp
status for Burger Thursday") and give it the deal's facts from section 4.
Check the draft against the list in section 6 before posting.

## Why not automatic yet

An automatic support bot (by webhook or a timer) would need to read orders and
send replies on its own. At this stage that is more risk than help: a wrong
answer about money hurts trust, and the volume is small. Look again when the
team answers more than about 20 messages a day.

## Keeping it true

When a rule in the app changes (timers, statuses, refunds, approval), update
`support-agent.md` in the same commit — `CODE_REVIEW.md` asks for it.
When a founder decision changes (fee, campus, ambassadors, payouts), update
`marketing-agent.md` §1 too.
