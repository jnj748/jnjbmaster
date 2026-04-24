const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";

type RequestOptions = Omit<RequestInit, "body"> & {
  jsonBody?: unknown;
};

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { jsonBody, headers, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  };
  if (jsonBody !== undefined) {
    init.body = JSON.stringify(jsonBody);
  }
  const res = await fetch(BASE + url, init);
  const text = await res.text();
  let data: unknown = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    const err = new Error(message) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type DailyJournal = {
  date: string;
  securityStatus: string | null;
  securityMemo: string | null;
  securityPhotoUrl: string | null;
  cleaningStatus: string | null;
  cleaningMemo: string | null;
  cleaningPhotoUrl: string | null;
  facilityStatus: string | null;
  facilityMemo: string | null;
  facilityPhotoUrl: string | null;
  complaintStatus: string | null;
  complaintMemo: string | null;
  complaintPhotoUrl: string | null;
  updatedAt: number | string;
};

export type WorkLogCategory = "facility" | "complaint" | "general";

export type WorkLogEntry = {
  id: number;
  occurredDate: string;
  occurredAt: number | string;
  category: WorkLogCategory;
  memo: string;
  photoUrl: string | null;
  createdAt: number | string;
};

export type ReportSummary = {
  days: number;
  facility: number;
  complaint: number;
  general: number;
  special: number;
};

export type ReportPayload = {
  start: string;
  end: string;
  journals: DailyJournal[];
  entries: WorkLogEntry[];
  summary?: ReportSummary;
};

export const api = {
  today: () => request<{ date: string }>("/today"),
  getJournal: (date: string) =>
    request<DailyJournal | null>(`/daily-journals/${date}`),
  saveJournal: (date: string, body: Partial<DailyJournal>) =>
    request<DailyJournal>(`/daily-journals/${date}`, {
      method: "PUT",
      jsonBody: body,
    }),
  listEntries: (params: {
    from?: string;
    to?: string;
    category?: WorkLogCategory;
  }) => {
    const usp = new URLSearchParams();
    if (params.from) usp.set("from", params.from);
    if (params.to) usp.set("to", params.to);
    if (params.category) usp.set("category", params.category);
    const qs = usp.toString();
    return request<WorkLogEntry[]>(`/work-logs${qs ? "?" + qs : ""}`);
  },
  createEntry: (body: {
    category: WorkLogCategory;
    memo: string;
    photoUrl?: string | null;
    occurredDate?: string;
  }) =>
    request<WorkLogEntry>("/work-logs", {
      method: "POST",
      jsonBody: body,
    }),
  updateEntry: (id: number, body: Partial<WorkLogEntry>) =>
    request<WorkLogEntry>(`/work-logs/${id}`, {
      method: "PATCH",
      jsonBody: body,
    }),
  deleteEntry: (id: number) =>
    request<{ success: true }>(`/work-logs/${id}`, { method: "DELETE" }),
  dailyReport: (date: string) =>
    request<ReportPayload>(`/reports/daily?date=${date}`),
  weeklyReport: (date: string) =>
    request<ReportPayload>(`/reports/weekly?date=${date}`),
  monthlyReport: (date: string) =>
    request<ReportPayload>(`/reports/monthly?date=${date}`),
};
