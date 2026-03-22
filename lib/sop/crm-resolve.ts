import { generateMermaidDiagrams } from "./diagrams";
import type { SopProjectBrief } from "./schema";

export type SopSectionRow = { title: string; markdown: string };

function isSectionArray(x: unknown): x is SopSectionRow[] {
  return (
    Array.isArray(x) &&
    x.every((s) => s && typeof s === "object" && typeof (s as SopSectionRow).title === "string" && typeof (s as SopSectionRow).markdown === "string")
  );
}

export function techStackToBrief(p: { project_name: string; client_name: string; tech_stack: unknown }): SopProjectBrief {
  const t = (p.tech_stack ?? {}) as Record<string, unknown>;
  return {
    project_name: p.project_name,
    client_name: p.client_name,
    required_agents: Array.isArray(t.required_agents) ? (t.required_agents as string[]) : [],
    external_apis: Array.isArray(t.external_apis) ? (t.external_apis as unknown[]) : [],
    technical_requirements: t.technical_requirements,
    team_size: typeof t.team_size === "number" ? t.team_size : undefined,
    timeline: t.timeline,
    budget: t.budget,
  };
}

export function resolveSopSections(project: { sop_sections: unknown | null | undefined }, fallbackSnapshot: unknown): SopSectionRow[] {
  if (isSectionArray(project.sop_sections)) return project.sop_sections;
  const snap = fallbackSnapshot as { sections?: unknown } | null;
  if (isSectionArray(snap?.sections)) return snap.sections;
  return [];
}

const DIAGRAM_KEYS = ["systemOverview", "agentFlow", "databaseSchema", "techStack", "timeline"] as const;

export function resolveDiagramBundle(project: {
  diagram_bundle: unknown | null | undefined;
  project_name: string;
  client_name: string;
  tech_stack: unknown;
}): Record<string, string> {
  const d = project.diagram_bundle;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const out: Record<string, string> = {};
    for (const k of DIAGRAM_KEYS) {
      const v = (d as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
    if (Object.keys(out).length) return out;
  }
  const gen = generateMermaidDiagrams(techStackToBrief(project));
  return { ...gen };
}
