// [Task #801] 회계 기초·전표 페이지 공통 useApi 훅.
import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";

const BASE = (import.meta.env.BASE_URL ?? "/") as string;
export const apiBase = `${BASE}api`.replace(/\/+/g, "/");

export type ApiFn = <T>(path: string, init?: RequestInit) => Promise<T>;

export function useApi(): ApiFn {
  const { token } = useAuth();
  return useMemo<ApiFn>(() => async (path, init) => {
    const res = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!res.ok) {
      const msg = (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string")
        ? (data as { error: string }).error
        : `${res.status}`;
      throw new Error(msg);
    }
    return data as never;
  }, [token]);
}

export const won = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");
