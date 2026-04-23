export type JobStatus = "idle" | "running" | "completed" | "failed";

export interface JobSnapshot {
  status: JobStatus;
  started_at: number | null;
  finished_at: number | null;
  exit_code: number | null;
  error: string | null;
  current_step: string;
  duration: number | null;
  log_count: number;
}

export interface LogsResponse {
  offset: number;
  lines: string[];
}

export interface RunRequest {
  train_data?: string;
  test_data?: string | null;
  eval_data?: string | null;
  target_col?: string;
  no_optuna?: boolean;
  export_web?: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export interface ExportRequest {
  eval_data?: string;
  target_col?: string;
}

export const api = {
  run: (req: RunRequest = {}) =>
    request<{ ok: boolean; status: JobSnapshot }>("/api/run", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  exportSubmission: (req: ExportRequest = {}) =>
    request<{ ok: boolean; status: JobSnapshot }>("/api/export-submission", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  status: () => request<JobSnapshot>("/api/status"),
  logs: (offset: number = 0) => request<LogsResponse>(`/api/logs?offset=${offset}`),
  health: () => request<{ status: string }>("/api/health"),
};
