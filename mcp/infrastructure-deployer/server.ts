#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function redactEnv(env: Record<string, string>, redactValues: boolean) {
  if (!redactValues) return env;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    const trimmed = (v ?? "").trim();
    out[k] = trimmed ? "********" : "";
  }
  return out;
}

function uniq(arr: string[]) {
  return [...new Set(arr)];
}

function normalizeOrigin(origin: string) {
  const o = origin.trim();
  if (!o) return "";
  // Prefer explicit https origins; allow localhost for dev.
  if (o.startsWith("http://") || o.startsWith("https://")) return o;
  if (o.includes("localhost")) return `http://${o.replace(/^https?:\/\//, "")}`;
  return `https://${o.replace(/^https?:\/\//, "")}`;
}

function formatEndpointChecklist() {
  return [
    { method: "POST", path: "/api/blueprint/submit", agent: "Agent 1" },
    { method: "POST", path: "/api/research/trigger", agent: "Agent 2" },
    { method: "POST", path: "/api/report/generate", agent: "Agent 3" },
    { method: "POST", path: "/api/video/generate", agent: "Agent 4" },
    { method: "POST", path: "/api/delivery/send", agent: "Agent 5" },
    { method: "POST", path: "/api/telegram/command", agent: "Agent 12" },
  ];
}

const SetupVercelProjectInput = z.object({
  github_repo: z.string().min(1).describe("GitHub repo in org/name format, or full URL."),
  vercel_project_name: z.string().min(1),
  production_branch: z.string().default("main"),
  frontend_root_directory: z.string().default("."),
  frontend_domain: z.string().optional().describe("Production frontend domain (used for CORS allowlist guidance)."),
  environment_variables: z.record(z.string()).optional().describe("Key/value env vars to set in Vercel."),
  redact_values: z.boolean().default(true),
});

const DeployBackendServiceInput = z.object({
  provider: z.enum(["vercel", "railway", "render"]),
  github_repo: z.string().min(1).describe("GitHub repo in org/name format, or full URL."),
  backend_service_name: z.string().min(1),
  backend_root_directory: z.string().default(".").describe("Monorepo subdir containing the backend service."),
  start_command: z.string().default("node server.js"),
  node_version: z.string().optional().describe("Optional Node version pin, e.g. 20.x"),
  health_check_path: z.string().default("/healthz"),
  frontend_domain: z.string().optional().describe("Frontend domain used for CORS allowlist (recommended)."),
  environment_variables: z.record(z.string()).optional(),
  redact_values: z.boolean().default(true),
  autoscaling_target: z
    .enum(["none", "basic"])
    .default("basic")
    .describe("High-level autoscaling guidance level; actual features depend on provider plan."),
});

const ConfigureEnvironmentInput = z.object({
  target: z.enum(["vercel", "railway", "render", "local"]),
  environment_variables: z.record(z.string()).describe("Key/value env vars to configure."),
  redact_values: z.boolean().default(true),
  notes: z.string().optional(),
});

const SetupMonitoringInput = z.object({
  scope: z.enum(["frontend", "backend", "both"]).default("both"),
  sentry: z
    .object({
      enabled: z.boolean().default(true),
      dsn: z.string().optional().describe("Sentry DSN (store as env var; do not hardcode)."),
      traces_sample_rate: z.number().min(0).max(1).optional(),
    })
    .default({ enabled: true }),
  logging: z
    .object({
      provider: z.enum(["datadog", "logtail", "none"]).default("datadog"),
      service_name: z.string().optional(),
      environment: z.string().default("production"),
    })
    .default({ provider: "datadog", environment: "production" }),
});

const CreateDeploymentPipelineInput = z.object({
  frontend: z.object({ provider: z.literal("vercel"), production_branch: z.string().default("main") }).default({
    provider: "vercel",
    production_branch: "main",
  }),
  backend: z.object({ provider: z.enum(["railway", "render"]), production_branch: z.string().default("main") }),
  checks: z
    .object({
      require_preview: z.boolean().default(true),
      require_healthcheck: z.boolean().default(true),
      require_sentry_release: z.boolean().default(false),
    })
    .default({ require_preview: true, require_healthcheck: true, require_sentry_release: false }),
});

const ManageSecretsInput = z.object({
  provider: z.enum(["vercel", "railway", "render"]),
  secret_names: z.array(z.string().min(1)).default([]),
  rotation_days: z.number().int().min(1).default(90),
  access_model: z.enum(["least-privilege", "shared-admin"]).default("least-privilege"),
});

function vercelInstructions(params: z.infer<typeof SetupVercelProjectInput>) {
  const env = redactEnv(params.environment_variables ?? {}, params.redact_values);
  const frontendOrigin = params.frontend_domain ? normalizeOrigin(params.frontend_domain) : "";

  const steps: string[] = [];
  steps.push("Connect GitHub → Vercel and create a Next.js project.");
  steps.push(`Import repo: ${params.github_repo}`);
  steps.push(`Project name: ${params.vercel_project_name}`);
  steps.push(`Root directory: ${params.frontend_root_directory}`);
  steps.push(`Production branch: ${params.production_branch}`);
  steps.push("Set environment variables in Vercel Project Settings → Environment Variables (Production + Preview as needed).");
  steps.push("Deploy and verify the production URL responds (and any `/api/*` routes if used).");

  const corsGuidance = frontendOrigin
    ? [
        "CORS allowlist (backend):",
        `- Allow origin: ${frontendOrigin}`,
        "- Disallow wildcard origins in production",
        "- Allow credentials only if you truly need cookies; otherwise keep it off",
      ].join("\n")
    : [
        "CORS allowlist (backend):",
        "- Set `CORS_ORIGINS` to your Vercel production domain (and optionally preview domains)",
        "- Disallow wildcard origins in production",
      ].join("\n");

  return {
    provider: "vercel",
    steps,
    environment_variables: env,
    notes: {
      cors_guidance: corsGuidance,
      recommended_vercel_env_split: ["Production", "Preview"],
    },
  };
}

function backendInstructions(params: z.infer<typeof DeployBackendServiceInput>) {
  const env = redactEnv(params.environment_variables ?? {}, params.redact_values);
  const frontendOrigin = params.frontend_domain ? normalizeOrigin(params.frontend_domain) : "";
  const corsOrigins = uniq([frontendOrigin].filter(Boolean));

  const endpoints = formatEndpointChecklist();

  const shared: string[] = [];
  shared.push("Backend service requirements:");
  shared.push(`- Start command: ${params.start_command}`);
  shared.push(`- Health check: GET ${params.health_check_path} (should return 200)`);
  if (params.node_version) shared.push(`- Node version: ${params.node_version}`);
  shared.push("- Configure env vars in the provider dashboard (never commit secrets).");
  shared.push("- Restrict CORS to the frontend domain(s) only.");
  shared.push("- Ensure the required agent endpoints exist (see checklist).");

  const providerSteps: string[] = [];
  if (params.provider === "vercel") {
    providerSteps.push("Use Vercel as the single backend host (Next.js API routes under app/api/*).");
    providerSteps.push(`Import repo: ${params.github_repo}`);
    providerSteps.push(`Project name: ${params.backend_service_name}`);
    providerSteps.push(`Root directory: ${params.backend_root_directory}`);
    providerSteps.push("Set environment variables in Vercel Project Settings (Production + Preview as needed).");
    providerSteps.push("No separate runtime start command is required for Vercel API routes.");
    providerSteps.push("Configure cron schedules in vercel.json and protect cron routes with CRON_SECRET.");
    providerSteps.push("If Telegram bot polling requires a long-running process, run that worker on Railway or Render.");
  } else if (params.provider === "railway") {
    providerSteps.push("Create a Railway project → New Service → Deploy from GitHub repo.");
    providerSteps.push(`Select repo: ${params.github_repo}`);
    providerSteps.push(`Service name: ${params.backend_service_name}`);
    providerSteps.push(`Root directory: ${params.backend_root_directory}`);
    providerSteps.push("Set variables in Railway → Service → Variables.");
    providerSteps.push(`Set start command to: ${params.start_command}`);
    providerSteps.push("Add a health check (if available) and enable automatic deploys on push.");
    providerSteps.push("Scale settings: choose multiple instances only if you have stateless backend + external session store.");
  } else {
    providerSteps.push("Create a Render Web Service → Build and deploy from GitHub.");
    providerSteps.push(`Select repo: ${params.github_repo}`);
    providerSteps.push(`Service name: ${params.backend_service_name}`);
    providerSteps.push(`Root directory: ${params.backend_root_directory}`);
    providerSteps.push("Environment: Node");
    providerSteps.push(`Start command: ${params.start_command}`);
    providerSteps.push("Set env vars in Render → Environment.");
    providerSteps.push("Enable auto-deploy for the chosen branch.");
    providerSteps.push("Scaling: configure instance count and upgrade plan for autoscaling features (plan-dependent).");
  }

  const corsSnippet = corsOrigins.length
    ? {
        CORS_ORIGINS: corsOrigins.join(","),
      }
    : {
        CORS_ORIGINS: "<your-frontend-domain>",
      };

  const expressSkeleton = [
    "Minimal Express router sketch (server-side) to satisfy required endpoints:",
    "",
    "```js",
    "import express from 'express';",
    "import cors from 'cors';",
    "",
    "const app = express();",
    "app.use(express.json({ limit: '2mb' }));",
    "",
    "const origins = (process.env.CORS_ORIGINS || '')",
    "  .split(',')",
    "  .map(s => s.trim())",
    "  .filter(Boolean);",
    "",
    "app.use(cors({",
    "  origin: (origin, cb) => {",
    "    if (!origin) return cb(null, true); // allow non-browser clients",
    "    if (origins.includes(origin)) return cb(null, true);",
    "    return cb(new Error('CORS blocked'));",
    "  },",
    "  credentials: false,",
    "}));",
    "",
    "app.get(process.env.HEALTH_CHECK_PATH || '/healthz', (_req, res) => res.status(200).json({ ok: true }));",
    "",
    "app.post('/api/blueprint/submit', async (req, res) => res.json({ ok: true }));",
    "app.post('/api/research/trigger', async (req, res) => res.json({ ok: true }));",
    "app.post('/api/report/generate', async (req, res) => res.json({ ok: true }));",
    "app.post('/api/video/generate', async (req, res) => res.json({ ok: true }));",
    "app.post('/api/delivery/send', async (req, res) => res.json({ ok: true }));",
    "app.post('/api/telegram/command', async (req, res) => res.json({ ok: true }));",
    "",
    "app.listen(process.env.PORT || 3001);",
    "```",
  ].join("\n");

  const autoscalingGuidance =
    params.autoscaling_target === "none"
      ? [
          "Autoscaling guidance:",
          "- Not configured (requested).",
          "- If you later need it, ensure the service is stateless and uses external stores (DB/Redis) before scaling instances.",
        ].join("\n")
      : [
          "Autoscaling guidance (provider-dependent):",
          "- Keep the backend stateless: no in-memory sessions, no local file storage for runtime state.",
          "- Use external stores for queues/sessions (Postgres/Redis/S3).",
          "- Set CPU/memory limits and concurrency so scaling is predictable.",
          "- Add a real health check and graceful shutdown to support rolling deploys.",
        ].join("\n");

  return {
    provider: params.provider,
    steps: [...shared, ...providerSteps],
    environment_variables: {
      ...env,
      ...corsSnippet,
      HEALTH_CHECK_PATH: params.health_check_path,
    },
    required_endpoints: endpoints,
    snippets: {
      cors_env_example: corsSnippet,
      express_router_skeleton: expressSkeleton,
    },
    notes: {
      autoscaling: autoscalingGuidance,
      security_basics: [
        "Use HTTPS-only origins",
        "Set strict CORS allowlist",
        "Store secrets in provider secret manager",
        "Rotate keys on schedule",
      ],
    },
  };
}

function monitoringInstructions(params: z.infer<typeof SetupMonitoringInput>) {
  const steps: string[] = [];
  const scope = params.scope;

  if (params.sentry.enabled) {
    steps.push("Sentry (error monitoring):");
    if (scope === "frontend" || scope === "both") {
      steps.push("- Frontend: add Sentry Next.js SDK and set `SENTRY_DSN` in Vercel env.");
    }
    if (scope === "backend" || scope === "both") {
      steps.push("- Backend: add Sentry Node SDK, initialize early, capture unhandled rejections/exceptions.");
    }
    steps.push("- Set release/version (commit SHA) to correlate deploys to errors.");
    if (typeof params.sentry.traces_sample_rate === "number") {
      steps.push(`- Tracing sample rate: ${params.sentry.traces_sample_rate}`);
    } else {
      steps.push("- Tracing: start low (e.g. 0.05–0.1) and adjust after verifying cost.");
    }
  } else {
    steps.push("Sentry: disabled (requested).");
  }

  if (params.logging.provider !== "none") {
    steps.push("");
    steps.push(`Centralized logging (${params.logging.provider}):`);
    steps.push("- Emit structured JSON logs (level, timestamp, requestId, agentName, clientId, durationMs, ok).");
    steps.push("- Forward logs from the provider (Railway/Render) to your logging vendor.");
    steps.push("- Add alerting for: crash loops, 5xx spike, webhook failures, queue backlog (if any).");
  } else {
    steps.push("");
    steps.push("Centralized logging: disabled (requested).");
  }

  return {
    scope,
    steps,
    recommended_env: {
      SENTRY_DSN: params.sentry.dsn ? "********" : "<set-in-provider>",
      SENTRY_ENVIRONMENT: params.logging.environment,
      LOGGING_PROVIDER: params.logging.provider,
      LOG_SERVICE_NAME: params.logging.service_name ?? "vantage-stack",
    },
  };
}

function deploymentPipelineInstructions(params: z.infer<typeof CreateDeploymentPipelineInput>) {
  const steps: string[] = [];
  steps.push("Frontend (Vercel):");
  steps.push("- Auto-deploy on push (Preview for PRs, Production for main).");
  steps.push("- Protect Production deployments to maintainers only.");
  steps.push("");
  steps.push(`Backend (${params.backend.provider}):`);
  steps.push("- Auto-deploy on push to production branch.");
  steps.push("- Use staged rollouts if supported; otherwise do canary by routing (advanced).");
  steps.push("- Verify health check passes before marking deploy successful.");

  const checklist: string[] = [];
  checklist.push("Go-live checklist:");
  checklist.push("- Test all required API endpoints end-to-end from the deployed frontend.");
  checklist.push("- Test database connections from production backend (least-privilege DB user).");
  checklist.push("- Test API key validity (Sentry, Telegram, email provider, any research sources).");
  checklist.push("- Test cron jobs are scheduled (Vercel Cron + backend idempotency).");
  checklist.push("- Test Telegram bot responsiveness (webhook/polling, provider ingress).");
  checklist.push("- Confirm CORS blocks non-frontend origins.");
  checklist.push("- Confirm monitoring captures a forced error and creates an alert.");

  return {
    steps,
    checks: params.checks,
    go_live_checklist: checklist,
  };
}

function secretsInstructions(params: z.infer<typeof ManageSecretsInput>) {
  const names = uniq(params.secret_names.map((s) => s.trim()).filter(Boolean));
  const steps: string[] = [];

  steps.push(`Secrets management (${params.provider}):`);
  steps.push("- Store secrets only in the provider environment/secret store (never in git).");
  steps.push("- Use separate secrets per environment (Preview/Staging/Production).");
  steps.push("- Use least-privilege access for team members and CI.");
  steps.push(`- Rotation policy: rotate high-risk secrets at least every ${params.rotation_days} days (or on suspected exposure).`);

  if (names.length) {
    steps.push("");
    steps.push("Secrets to manage:");
    for (const n of names) steps.push(`- ${n}`);
  }

  const access =
    params.access_model === "least-privilege"
      ? [
          "Access model: least-privilege",
          "- Separate roles: deploy vs view-secrets vs admin",
          "- Use service accounts/tokens for automation where possible",
        ].join("\n")
      : [
          "Access model: shared-admin (not recommended for production)",
          "- If you must, enable 2FA and audit logs, and re-evaluate ASAP",
        ].join("\n");

  return { steps, notes: { access_model: access } };
}

async function main() {
  const server = new Server({ name: "infrastructure-deployer", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "setup-vercel-project",
          description:
            "Generate a Vercel deployment plan for the Next.js frontend: GitHub connection, project settings, env vars, and CORS guidance for the backend.",
          inputSchema: zodToJsonSchema(SetupVercelProjectInput),
        },
        {
          name: "deploy-backend-service",
          description:
            "Generate a Vercel/Railway/Render deployment plan for a Node.js backend service: service settings, env vars, start command guidance, health check, CORS allowlist, autoscaling guidance, and required agent endpoints checklist.",
          inputSchema: zodToJsonSchema(DeployBackendServiceInput),
        },
        {
          name: "configure-environment",
          description:
            "Prepare an environment-variable plan for Vercel/Railway/Render/local, with optional redaction for safe sharing.",
          inputSchema: zodToJsonSchema(ConfigureEnvironmentInput),
        },
        {
          name: "set-up-monitoring",
          description:
            "Generate production monitoring/logging setup guidance (Sentry + centralized logging) suitable for reliability-focused deployments.",
          inputSchema: zodToJsonSchema(SetupMonitoringInput),
        },
        {
          name: "create-deployment-pipeline",
          description:
            "Generate an end-to-end deployment workflow and a go-live checklist (endpoints, DB, keys, cron, Telegram bot, CORS, monitoring).",
          inputSchema: zodToJsonSchema(CreateDeploymentPipelineInput),
        },
        {
          name: "manage-secrets-in-production",
          description:
            "Generate a secrets-management/rotation plan for production deployments (Vercel/Railway/Render), emphasizing least-privilege and auditability.",
          inputSchema: zodToJsonSchema(ManageSecretsInput),
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params ?? {};

    if (name === "setup-vercel-project") {
      const parsed = SetupVercelProjectInput.parse(args);
      const out = vercelInstructions(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "deploy-backend-service") {
      const parsed = DeployBackendServiceInput.parse(args);
      const out = backendInstructions(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "configure-environment") {
      const parsed = ConfigureEnvironmentInput.parse(args);
      const env = redactEnv(parsed.environment_variables, parsed.redact_values);
      const out = {
        target: parsed.target,
        environment_variables: env,
        notes: parsed.notes ?? "",
        guidance: [
          "Do not commit secrets to git.",
          "Use separate env var sets per environment (preview/staging/prod).",
          "Prefer provider secret stores over build-time injection for highly sensitive values.",
        ],
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "set-up-monitoring") {
      const parsed = SetupMonitoringInput.parse(args);
      const out = monitoringInstructions(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "create-deployment-pipeline") {
      const parsed = CreateDeploymentPipelineInput.parse(args);
      const out = deploymentPipelineInstructions(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "manage-secrets-in-production") {
      const parsed = ManageSecretsInput.parse(args);
      const out = secretsInstructions(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

