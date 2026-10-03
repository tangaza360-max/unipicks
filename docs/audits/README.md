# Unipicks — Audit & Research Deliverables

Index of the four deliverables produced on branch `claude/unipicks-codebase-audit-9vd6fb` (2026-10-03). Read-only audit: no app code was changed.

| # | Deliverable | Location | Summary | Status |
|---|---|---|---|---|
| 1 | E-Commerce Standards Audit | [`ecommerce-audit.md`](./ecommerce-audit.md) | 14-point audit against WCAG 2.1, ISO 20488/32111, Rwanda Laws 058/2021 and 36/2012, OWASP. Top risks: self-created pickup codes, unverified payment webhook, charged price ≠ advertised price for 4 offer types, no refunds/settlement. | ✅ Done |
| 2 | Social App Standards Audit | [`social-audit.md`](./social-audit.md) | 12-point audit + mobile-nav finding against Instagram/WhatsApp/Facebook norms and Apple/Google store rules. Top risks: chat RLS lets anyone message anyone and lets receivers edit messages; no reporting; Social missing from mobile nav; student stories and feed are placeholders; no account deletion. | ✅ Done |
| 3 | 30-Second Explainer Video | [`../video-explainer/`](../video-explainer/) | Rendered 30.0 s MP4s: `unipicks-explainer.mp4` (1080×1920) and `unipicks-explainer-16x9.mp4` (1920×1080), on-screen text only. Plus `script.md` (63-word voiceover), `storyboard.md` (frame-accurate time codes), `assets.md` (royalty-free music, CapCut steps, pre-publish accuracy checklist), and the re-renderable source (`explainer.html` + `render.mjs`). | ✅ Done |
| 4 | Student Feedback Google Form | [`../user-research/google-form.md`](../user-research/google-form.md) | 8–12 question form spec, paste-ready text, API JSON, distribution plan. | ⏳ Pending |
