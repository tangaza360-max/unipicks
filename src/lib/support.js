// The one support address shown in the app (Help, delete account, Privacy,
// Terms). Until Unipicks owns a domain, this is the team Gmail inbox (founder
// decision 2026-10-04). Later: set VITE_SUPPORT_EMAIL (e.g. support@<domain>) in .env.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'unipicks.team@gmail.com'

// Support WhatsApp (founder decision 2026-10-10). Empty or not a valid
// Rwandan mobile number = no WhatsApp button on Help.
export const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || ''
