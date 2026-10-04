# Unipicks auth email templates

Branded versions of Supabase's default auth emails. Supabase sends them; the
founder pastes them into the dashboard (they are not deployed from git).

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Confirm your email for Unipicks` |
| Reset Password | `reset-password.html` | `Reset your Unipicks password` |

**Status:** installed in production on 2026-10-04 by the founder through the Management API (`PATCH /v1/projects/{ref}/config/auth` with only `mailer_subjects_confirmation`, `mailer_templates_confirmation_content`, `mailer_subjects_recovery`, `mailer_templates_recovery_content`; checked with a GET afterwards). The token needs the `auth_config_write` and `project_admin_write` permissions; the CLI login token is read-only for this. Delete such a token after use.

## How to install (Supabase dashboard)
1. Authentication → Emails → **Templates**.
2. Open **Confirm signup**: set the Subject above, replace the whole body with the file content, **Save**.
3. Open **Reset Password**: same with `reset-password.html`.
4. Test: sign up / "Forgot password?" with a test address and check the email.

## Notes
- Supabase variables used: `{{ .ConfirmationURL }}` (the one-time link, also shown as plain text in case the button doesn't work) and `{{ .Email }}`. Don't remove them.
- The logo is `https://unipicks.vercel.app/apple-touch-icon.png` (PNG, because Gmail does not show SVG images).
- Colours from `docs/user-research/brand/README.md`: green `#95BF47`, ink `#2E2724`, stone `#70635C`, paper `#FBFAF8`.
- Layout uses tables and inline styles because many email apps ignore `<style>` blocks.
- Branding helps a little with spam folders; the real fix is an own domain with SPF/DKIM (Resend or Brevo).
