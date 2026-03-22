import { z } from "zod";

export const SopProjectBriefSchema = z.object({
  project_name: z.string().min(1),
  client_name: z.string().min(1),
  business_goals: z.any().optional(),
  technical_requirements: z.any().optional(),
  required_agents: z.array(z.string()).optional().default([]),
  external_apis: z.array(z.any()).optional().default([]),
  team_size: z.number().int().positive().optional(),
  timeline: z.any().optional(),
  budget: z.any().optional(),
  // Optional: if you already have the CRM client_id in Supabase.
  client_id: z.string().uuid().optional(),
  // Optional: if you want to control the project_id (otherwise we generate one).
  project_id: z.string().uuid().optional(),
  created_by: z.string().optional(),
});

export type SopProjectBrief = z.infer<typeof SopProjectBriefSchema>;

export type SopProjectStatus = "draft" | "active";
export type SopVersionStatus = "suggested" | "approved" | "in_progress" | "implemented";

export type SopSopProjectRow = {
  project_id: string;
  client_id: string | null;
  notion_workspace_url: string | null;
  figma_file_url: string | null;
  sop_version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  status: SopProjectStatus;
  project_name: string;
  client_name: string;
  tech_stack: unknown;
  last_optimization_at: string | null;
  notion_root_page_id: string | null;
  notion_backlog_page_id: string | null;
  notion_pages: unknown;
  /** CRM / canonical section bodies when set */
  sop_sections?: unknown | null;
  diagram_bundle?: unknown | null;
};

export type SopVersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  change_description: string;
  changed_by: string;
  changed_at: string;
  which_pages_changed: unknown;
  before_snapshot: unknown;
  after_snapshot: unknown;
  status: SopVersionStatus;
  implementation_date: string | null;
};

