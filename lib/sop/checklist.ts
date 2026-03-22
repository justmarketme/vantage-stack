import type { SopProjectBrief } from "./schema";

type ChecklistItem = { task: string; owner: string; done: boolean; notes?: string };

function item(task: string, owner: string, notes?: string): ChecklistItem {
  return { task, owner, done: false, notes };
}

export function generateDeploymentChecklist(brief: SopProjectBrief) {
  const project = `${brief.client_name} / ${brief.project_name}`;

  return {
    project,
    initial_sop_generation_checklist: [
      item("Create/ensure Supabase SOP tables exist (sop_projects, sop_versions, business_goals, sop_daily_metrics)", "Ops lead"),
      item("Confirm `.env.local` contains required Notion + Telegram env vars (or accept best-effort mode)", "PM"),
      item("Confirm `NOTION_ROOT_PARENT_PAGE_ID` points to a valid Notion page where new SOP workspaces are created", "PM"),
      item("Confirm `TELEGRAM_CHAT_ID` and/or `TELEGRAM_CEO_COACH_CHAT_ID` are configured for notifications", "Ops lead"),
      item("Create a test project brief JSON (matches `project_name`, `client_name`, `business_goals`, `technical_requirements`, `required_agents`, `external_apis`, `team_size`, `timeline`, `budget`)", "Engineering"),
      item("Run MCP tool `sync-to-backend` for that brief and capture outputs (project_id, notion URLs, figma artifact link)", "Engineering"),
      item("Verify `sop_projects` row was created/updated and `sop_versions` contains v1.0 initial record", "Ops lead"),
      item("If Notion is enabled: verify the 16 section pages exist under the created SOP workspace root", "PM"),
      item("Verify diagram artifacts are reachable at `/sop-artifacts/<project_id>/index.html`", "Engineering"),
      item("Verify checklist/automation contract: daily job can read `sop_projects.tech_stack` and generate suggestions", "Engineering"),
    ],
    daily_7am_optimization_checklist: [
      item("Cron route is deployed and scheduled: `/api/cron/sop-optimization` at `0 7 * * *` UTC", "Engineering", "Also validate Vercel cron secret handling (if any)."),
      item("Pick at least one project with status `draft` or `active` and ensure it has KPI rows in `sop_daily_metrics` (or accept low-signal analysis)", "Ops lead", "Without daily metrics rows, suggestions are generated but limited."),
      item("Run the job once for a single project_id (manual trigger or temp query param) and validate it completes successfully", "Engineering"),
      item("Verify `sop_versions` inserts: each suggestion creates a new row with `status='suggested'` and increasing version numbers", "Ops lead"),
      item("Verify Notion backlog update: `OPTIMIZATION BACKLOG` exists and contains new suggested items (best-effort)", "PM", "If Notion write fails, job should not fail overall."),
      item("Verify `Tech Stack Selection` page update includes `Last reviewed` and top alternative candidates summary", "PM"),
      item("Verify Telegram message includes the one-click `Approve` button and correct `sop_versions.id` in callback_data", "Ops lead"),
      item("Click Approve and confirm `sop_versions.status` becomes `approved`", "Engineering"),
      item("Check that CEO recommendations were persisted to `ceo_coach_briefings` (if DB permissions allow)", "Ops lead"),
    ],
    version_control_and_versioning_checklist: [
      item("Every suggestion run creates a new `sop_versions` row with before/after snapshots and `which_pages_changed`", "Ops lead"),
      item("Approval workflow: Telegram `/sop-approve <id>` and inline Approve button both update `sop_versions.status='approved'`", "Engineering"),
      item("Implementation workflow (optional): when a change is implemented, update `sop_projects.sop_version` and `status='active'`", "PM", "Not fully automated yet; can be a follow-up."),
      item("No collisions: verify version numbers are unique per suggestion day and monotonically increasing as desired", "Ops lead"),
    ],
    audit_trail_and_telemetry_checklist: [
      item("Confirm scheduler job logging exists for `sop-optimization` and failures notify via Telegram", "Engineering"),
      item("Confirm each version suggestion stores: `change_description`, `before_snapshot`, `after_snapshot`, `changed_by`, timestamps", "Ops lead"),
      item("Confirm CEO coach recommendations persist into `ceo_coach_briefings` with readable text + JSON payload", "Ops lead"),
      item("Confirm Notion failures are non-fatal (daily optimization still completes)", "Engineering"),
    ],
    strategic_analysis_checklist: [
      item("Populate `business_goals` row for the current month (month_start = date_trunc('month', now()))", "CEO coach / Ops"),
      item("Verify daily optimization reads business goals and includes actionable recommendations in Telegram + DB", "Ops lead"),
      item("Confirm desired goal KPIs exist for measuring SOP impact (see metrics ingestion checklist below)", "PM"),
    ],
    rollback_checklist: [
      item("If Notion updates cause malformed content: stop cron route `/api/cron/sop-optimization` immediately", "Engineering"),
      item("Preserve audit trail: do not delete `sop_versions` rows; use snapshots to restore prior manual content", "Ops lead"),
      item("If an approved suggestion was wrong: create a new version row that restores the previous snapshot (do not delete history)", "PM"),
      item("Re-run after rollback: validate one project end-to-end (suggest -> approve -> verify state)", "Engineering"),
    ],
  };
}

