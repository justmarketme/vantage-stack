export type Client = {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  whatsapp?: string;
  active: boolean;
  metadata?: Record<string, unknown>;
};

export type AutomationRunStatus = "success" | "partial" | "failed";

export type AutomationRunRecord = {
  id: string;
  started_at: string;
  finished_at?: string;
  status: AutomationRunStatus;
  cron?: {
    schedule: string;
    timezone?: string;
  };
  summary: {
    clients_total: number;
    clients_success: number;
    clients_failed: number;
  };
  errors?: Array<{
    client_id?: string;
    step?: "research" | "report" | "delivery" | "storage";
    message: string;
  }>;
};

export type WeeklyReportRecord = {
  id: string;
  client_id: string;
  week_of: string; // ISO date (YYYY-MM-DD) for Tuesday of that week in target timezone
  created_at: string;
  sent_at?: string;
  channels?: Array<"email" | "whatsapp">;
  research_hash?: string;
  report_hash?: string;
  report_type?: string;
  delivery?: {
    status: "sent" | "skipped" | "failed";
    provider?: string;
    message_id?: string;
    error?: string;
  };
};

export type WeeklyPipelineResult = {
  run: AutomationRunRecord;
  per_client: Array<{
    client_id: string;
    ok: boolean;
    report_id?: string;
    error?: string;
  }>;
};
