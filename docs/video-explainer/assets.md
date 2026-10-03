# Unipicks — 30-Second Explainer: Assets, Music & Production Notes

## 1. What's in this folder

| File | What it is |
|---|---|
| `unipicks-explainer.mp4` | **Final vertical cut**, 1080×1920, H.264, 30 fps, 30.0 s, ~3 MB, no audio. For Instagram Reels, TikTok, WhatsApp Status, YouTube Shorts. |
| `unipicks-explainer-16x9.mp4` | **Final landscape cut**, 1920×1080, same specs. For YouTube, presentations, campus screens. |
| `explainer.html` | The animation source. Open it in Chrome with `?w=1080&h=1920&play=1` (or `?w=1920&h=1080&play=1`) to preview in real time. Edit the text, prices or timing here, then re-render. |
| `render.mjs` | Deterministic renderer: Playwright screenshots each of the 900 frames, which are piped into ffmpeg. |
| `fonts/` | Space Grotesk and Inter (`.woff2`), the app's own typefaces, with their SIL OFL 1.1 licences. |
| `storyboard-vertical.jpg`, `storyboard-16x9.jpg` | Contact sheets of 8 key frames taken from the final MP4s. |
| `script.md`, `storyboard.md` | Narration and on-screen text; scene-by-scene time codes. |

### Re-rendering after an edit

From the repo root (uses the `@playwright/test` already in `devDependencies` and system `ffmpeg`; nothing new is installed into the app):

```bash
node docs/video-explainer/render.mjs                  # both formats (~5 min)
node docs/video-explainer/render.mjs --format vertical
node docs/video-explainer/render.mjs --stills 2,9,15,24,29   # quick PNG checks into ./stills/
# If Playwright says its browser isn't installed:
CHROMIUM_PATH=/path/to/chrome node docs/video-explainer/render.mjs
```

## 2. Assets used (all safe to publish)

| Asset | Source | Licence / status |
|---|---|---|
| Unipicks "U" logo mark | `src/components/Logo.jsx` (same SVG path) | Yours |
| Brand colours | `public/manifest.json` (`#191713`, `#95BF47`) | Yours |
| Space Grotesk, Inter | `@fontsource` packages (Google Fonts) | SIL Open Font License 1.1, commercial use OK |
| Emoji (🍟 🍛 🌯 👛 🎉 …) | Noto Color Emoji (system font at render time) | SIL OFL 1.1 |
| App screens | **Stylised HTML mock-ups** modelled on the real UI (deal cards, offer badges, group progress, pickup code), not screenshots | Yours |
| Businesses (Campus Chips, Kinyinya Bites, Mama Rose Kitchen) | **Fictional** | No permission needed |
| Student names in chat (Aline, Kevin, Grace, Jean) | **Fictional**, illustrative | — |
| Prices, ratings, "3,200 RWF saved" | **Illustrative** | See §5 |

## 3. Music: royalty-free suggestions

**Style:** light **Afrobeats or Amapiano-inspired instrumental**, 108–118 BPM, bright and warm, with log drum or percussion and no vocals (so a voiceover sits on top). It should feel local, joyful and aspirational.

| Source | Cost | Commercial use | Search terms |
|---|---|---|---|
| **CapCut built-in library** | Free | Only tracks marked **"Commercial use"**; filter for them | "afrobeat", "amapiano", "upbeat happy" |
| **YouTube Audio Library** (studio.youtube.com → Audio Library) | Free | Yes; check whether attribution is required per track | Genre: Dance/Electronic or World; Mood: Happy/Bright |
| **Pixabay Music** (pixabay.com/music) | Free | Yes (Pixabay Content License, no attribution) | "afrobeat", "amapiano", "summer upbeat" |
| **Uppbeat** (uppbeat.io) | Free tier with credit / paid | Yes, with attribution on the free tier | "afro", "happy upbeat" |
| **Epidemic Sound** / **Artlist** | Paid subscription | Yes, cleared for social and ads | "afrobeats", "amapiano" |

⚠️ **Avoid trending commercial songs** (e.g. a chart hit from Instagram's music picker). They're often not licensed for **business** accounts, and the post can be muted or removed.

**Beat sync:** at 115 BPM one bar is about 2.09 s. Put the first drop on **5.0 s** (Unipicks reveal). The four feature beats change every 2 s from 12.0 s, which lines up with roughly one bar each.

## 4. Voiceover

- The script is in `script.md` (63 words, about 2.1 words per second).
- **Best option:** a Kepler student records it on a phone in a quiet room (closet or car), 20–30 cm from the mic. Real student voices outperform polished adverts with this audience.
- Record 2–3 takes, pick the best in CapCut, apply "Enhance voice", and duck the music under it.
- An AI voice (CapCut text-to-speech) also works. If you use one, keep it warm and conversational, and follow platform rules on disclosing AI-generated audio where they apply.

## 5. Before you publish: accuracy checklist

The video promises features. Make sure each promise is true in the live app, both for trust and because Rwanda's consumer law (Law N° 36/2012) prohibits misleading advertising.

| Promise in the video | Status in the code today | Action |
|---|---|---|
| "Verified with your Kepler email" | ✅ Email-domain check at signup (`src/lib/universities.js`) | Turn on Supabase **email confirmation** so the inbox itself is verified |
| Deal cards with % OFF / BUY 1 GET 1 / GROUP BUY | ✅ Offer types and badges exist; pricing fixed in commit `88158ea` | Deploy that fix first |
| "Order in two taps" → accepted → pay | ✅ Flow exists (`create-order` → merchant accept → "Pay Now" chat button) | — |
| **"Group price unlocked" when the group fills** | ⚠️ **Not yet enforced.** The group discount currently applies regardless of size (founder decision Q4, recommended in the e-commerce audit) | Ship the `min_participants` enforcement before publishing, or change that frame's text in `explainer.html` |
| "Pay with MoMo" | ⚠️ UmunotaPay integration is **sandbox/untested** | Run one live end-to-end payment before launch. Use "MoMo" as a generic term: **don't** use MTN's logo or yellow branding without permission |
| Pickup code after paying | ✅ (`process-payment` generates it) | — |
| Group chat with friends | ✅ Group-order chat exists | — |
| "You saved this week 3,200 RWF" | Illustrative | Fine as an individual example; don't present it as an average or a platform statistic |
| "Link in bio" | — | Add the real sign-up URL to your bio and caption. No public domain was found in the repo |

## 6. Optional upgrades (later)

- Swap the mock phone screens for **real screen recordings** once the UI is stable: Playwright can record the running app at 1080×1920.
- With a partner merchant's written permission, replace a fictional business with a real one (e.g. the origin-story business) for local recognition.
- Add a 6–10 second **cut-down** (Scenes 1 → 5) for WhatsApp Status and paid ads.
- Translate the on-screen text into Kinyarwanda for a second version.
