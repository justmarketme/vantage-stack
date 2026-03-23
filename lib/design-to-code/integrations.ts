/**
 * Stubs and env-driven helpers for GitHub / Vercel automation.
 * Wire GITHUB_TOKEN, GITHUB_REPO, VERCEL_TOKEN in production.
 */

export function planGithubClientBranch(clientSlug: string, repo?: string) {
  const r = (repo || process.env.DESIGN_TO_CODE_GITHUB_REPO || "").trim();
  return {
    ok: true as const,
    suggested_branch: `client/${clientSlug}`,
    remote: r || "(set DESIGN_TO_CODE_GITHUB_REPO or pass repo)",
    steps: [
      `git fetch origin`,
      `git checkout -b client/${clientSlug}`,
      `git push -u origin client/${clientSlug}`,
    ],
  };
}

export function planStagingDeploy(clientSlug: string) {
  const base = (process.env.DESIGN_TO_CODE_STAGING_BASE || "https://staging.vantagestack.com").replace(/\/$/, "");
  return {
    ok: true as const,
    staging_url: `${base}/${clientSlug}`,
    note: "Connect Vercel preview deployments or custom staging project; set DESIGN_TO_CODE_STAGING_BASE.",
  };
}

export function planProductionDeploy(clientSlug: string, customDomain?: string) {
  const cd = customDomain?.trim();
  if (cd) {
    return { ok: true as const, production_url: cd, note: "Use this custom domain in Vercel / DNS when ready." };
  }
  const base = (process.env.DESIGN_TO_CODE_PRODUCTION_BASE || "https://vantagestack.com").replace(/\/$/, "");
  return {
    ok: true as const,
    production_url: `${base}/${clientSlug}`,
    note: "Point DNS or Vercel project domain when ready.",
  };
}

export function revisionPromptBlock(clientName: string, request: string, contextSnippet: string) {
  return `Client ${clientName} requested: ${request}

Current code / section context:
${contextSnippet}

Update the implementation to satisfy the request. Preserve accessibility, performance, and existing patterns.`;
}
