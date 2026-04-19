/** API 엔드포인트 URL 반환 — 경로만 입력 (auth/user, admin/stats 등) */
export function getApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `/api/${clean}`;
}

/** JSON을 포함한 fetch 헬퍼 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        msg = parsed.error || parsed.message || text;
      } catch {
        msg = text;
      }
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
