export type JobStatus = "success" | "partial" | "failed";

export type SchedulerJobRun = {
  id: string;
  job_name: string;
  started_at: string;
  finished_at?: string;
  status: JobStatus;
  schedule?: string;
  timezone?: string;
  attempt: number;
  max_attempts: number;
  summary: Record<string, unknown>;
  error?: { message: string; stack?: string };
};

export type DashboardJob = {
  name: string;
  path: string;
  schedule: string;
  timezone: string;
  next_run_utc: string | null;
  last_run: SchedulerJobRun | null;
};

