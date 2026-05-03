// [Task #797] 입주자관리 부가 기능 — fetch 헬퍼 (OpenAPI 코드젠 미사용).
const BASE = import.meta.env.BASE_URL ?? "/";
export const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export async function apiGet<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  token: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}
