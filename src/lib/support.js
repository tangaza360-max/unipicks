// The one support address shown in the app (delete account, Privacy, Terms).
// Until Unipicks owns a domain, this is the team Gmail inbox (founder decision
// 2026-10-04). Later: set VITE_SUPPORT_EMAIL (e.g. support@<domain>) in .env.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'unipicks.team@gmail.com'
