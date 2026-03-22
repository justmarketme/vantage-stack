# secrets-manager (MCP)

Security + configuration utilities for VantageStack.

This MCP helps you safely create `.env.local`, validate API keys with live test calls, encrypt secrets for storage, rotate credentials, and optionally store secrets in Postgres/Supabase Vault.

Notes on “free alternatives”:
- Similarweb and SEMrush are treated as deprecated/unconfigured in free-only mode; this MCP does not require their keys.
- The research pipeline uses free/public sources (Tranco) and an optional `OPENPAGERANK_API_KEY`.

## Tools

- `create-env-file`
- `validate-api-keys`
- `encrypt-secrets`
- `rotate-credentials`
- `store-in-supabase-vault`
- `generate-secure-tokens`

## Run locally

```bash
npm run mcp:secrets-manager
```

## Notes

- Never commit `.env.local` or `.env` (they are gitignored).
- Prefer platform secret injection (Vercel/Netlify/etc.) or a dedicated secrets manager (Doppler/1Password/etc.).
- If you choose database storage, use Supabase Vault when available; otherwise this MCP falls back to a dedicated encrypted table.
