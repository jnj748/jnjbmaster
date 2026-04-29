import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { MenuOverride } from "@/lib/permissions";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

const CACHE: { data: MenuOverride[]; ts: number; loaded: boolean } = {
  data: [],
  ts: 0,
  loaded: false,
};
const TTL_MS = 60_000;
const subscribers = new Set<(d: MenuOverride[]) => void>();
const loadSubscribers = new Set<(loaded: boolean) => void>();

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
          CACHE.loaded = true;
          subscribers.forEach((s) => s(d));
          loadSubscribers.forEach((s) => s(true));
        })
        .catch(() => {
          // 실패해도 "loaded" 로 간주(=기본값으로 폴백). 라우트 가드가 영구히 보류되지 않게.
          CACHE.loaded = true;
          loadSubscribers.forEach((s) => s(true));
        });
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

/**
 * 모듈 캐시가 첫 fetch 를 마쳤는지 여부.
 *  - 라우트 등록(getRoutesForRole)이 access 화이트리스트가 비어 있어도 explicit ON 메뉴를
 *    추가로 등록하기 때문에, 첫 fetch 전에 catch-all redirect 가 동작하면 사용자가 의도한
 *    URL 을 잃을 수 있다. 이 hook 으로 보류 시점을 결정한다.
 */
export function useMenuOverridesLoaded(enabled: boolean): boolean {
  const [loaded, setLoaded] = useState<boolean>(CACHE.loaded);
  useEffect(() => {
    if (!enabled) return;
    const cb = (v: boolean) => setLoaded(v);
    loadSubscribers.add(cb);
    setLoaded(CACHE.loaded);
    return () => {
      loadSubscribers.delete(cb);
    };
  }, [enabled]);
  return loaded;
}

/** 그리드 페이지에서 저장 직후 사이드바를 즉시 갱신할 때 사용. */
export function refreshMenuOverridesCache(next: MenuOverride[]) {
  CACHE.data = next;
  CACHE.ts = Date.now();
  CACHE.loaded = true;
  subscribers.forEach((s) => s(next));
  loadSubscribers.forEach((s) => s(true));
}
