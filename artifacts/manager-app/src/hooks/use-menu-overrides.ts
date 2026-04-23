import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { MenuOverride } from "@/lib/permissions";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

const CACHE: { data: MenuOverride[]; ts: number } = { data: [], ts: 0 };
const TTL_MS = 60_000;
const subscribers = new Set<(d: MenuOverride[]) => void>();

async function fetchOverrides(token: string | null): Promise<MenuOverride[]> {
  const res = await fetch(`${API_BASE}/platform/menu-overrides`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as MenuOverride[];
}

/**
 * 사이드바·하단 네비에서 사용하는 역할×메뉴 오버라이드 훅.
 *  - 모듈 단위 1분 캐시(앱 전역에 1회만 fetch).
 *  - 401/오프라인은 빈 배열로 폴백 → 기본값(전체 활성) 보장.
 */
export function useMenuOverrides(enabled: boolean): MenuOverride[] {
  const { token } = useAuth();
  const [data, setData] = useState<MenuOverride[]>(CACHE.data);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const cb = (d: MenuOverride[]) => {
      if (alive) setData(d);
    };
    subscribers.add(cb);

    const now = Date.now();
    if (now - CACHE.ts > TTL_MS) {
      CACHE.ts = now;
      fetchOverrides(tokenRef.current)
        .then((d) => {
          CACHE.data = d;
          subscribers.forEach((s) => s(d));
        })
        .catch(() => {});
    } else {
      cb(CACHE.data);
    }
    return () => {
      alive = false;
      subscribers.delete(cb);
    };
  }, [enabled, token]);

  return data;
}

/** 그리드 페이지에서 저장 직후 사이드바를 즉시 갱신할 때 사용. */
export function refreshMenuOverridesCache(next: MenuOverride[]) {
  CACHE.data = next;
  CACHE.ts = Date.now();
  subscribers.forEach((s) => s(next));
}
