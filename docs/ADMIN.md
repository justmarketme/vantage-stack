# Internal admin (`/admin`)

## Setup

Add to `.env.local` (or your host’s secrets):

| Variable | Required | Description |
|----------|----------|-------------|
| `CRM_ADMIN_PASSWORD` | Yes | Password for `/admin/login`. |
| `ADMIN_SESSION_SECRET` | Recommended | Random string (32+ chars) used to sign the session cookie. |
| `CRON_SECRET` | Fallback | If `ADMIN_SESSION_SECRET` is unset, this is used to sign sessions (dev convenience only). |

## URLs

- **Login:** `/admin/login` (public URL only — not linked from the marketing nav or footer)
- **Hub:** `/admin` — shortcuts to CRM, Scheduler, Analytics, Monitoring (requires login)
- **CRM:** `/crm` — same admin session as `/admin` (Navbar no longer links here; clients use the public site only)

## Behaviour

- Middleware protects `/admin` (except `/admin/login`).
- Session cookie: `vs_admin_session` (httpOnly, 7 days).
- Responses include `X-Robots-Tag: noindex, nofollow` for matched admin routes.

## CRM visibility

`/crm` is protected by the same middleware as `/admin` (sign in at `/admin/login` first). The marketing **Navbar** does not link to CRM.

## Production

- Use a strong unique `CRM_ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.
- Prefer rotating secrets over reusing `CRON_SECRET`.
