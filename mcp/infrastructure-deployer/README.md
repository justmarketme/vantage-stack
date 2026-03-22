# infrastructure-deployer (MCP)

DevOps / infrastructure guidance MCP for deploying VantageStack:

- **Frontend**: Next.js on Vercel
- **Backend**: Next.js API routes on Vercel (or Node.js service on Railway/Render when needed)

## Tools

- `setup-vercel-project`
  - Produces a Vercel deployment plan + env var guidance + backend CORS allowlist guidance
- `deploy-backend-service`
  - Produces Vercel/Railway/Render deployment plan + start command guidance + health check + env var + CORS + autoscaling guidance
  - Includes a required agent-endpoints checklist:
    - `POST /api/blueprint/submit` (Agent 1)
    - `POST /api/research/trigger` (Agent 2)
    - `POST /api/report/generate` (Agent 3)
    - `POST /api/video/generate` (Agent 4)
    - `POST /api/delivery/send` (Agent 5)
    - `POST /api/telegram/command` (Agent 12)
- `configure-environment`
  - Prepares an env var plan for Vercel/Railway/Render/local with optional redaction
- `set-up-monitoring`
  - Monitoring/logging setup guidance (Sentry + centralized logging)
- `create-deployment-pipeline`
  - End-to-end deployment workflow + go-live checklist (endpoints, DB, keys, cron, Telegram, CORS, monitoring)
- `manage-secrets-in-production`
  - Secrets storage + least-privilege access model + rotation guidance

## Run locally

From repo root:

```bash
npm install
npm run mcp:infrastructure-deployer
```

## Cursor MCP registration

Register an MCP server named `infrastructure-deployer` pointing to:

```bash
node --env-file=.env.local node_modules/tsx/dist/cli.mjs mcp/infrastructure-deployer/server.ts
```

