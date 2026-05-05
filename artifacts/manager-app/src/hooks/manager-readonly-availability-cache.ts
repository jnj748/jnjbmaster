// [Task #861] 관리소장 readonly 가용성 — 토큰별 1분 캐시 (React-free 모듈).
//
// 훅(use-manager-readonly-availability) 과 분리한 이유:
//  - React/Auth 컨텍스트와 무관한 순수 캐시 정책으로 노드 단독 테스트 가능.
//  - 캐시 키를 토큰으로 분리하여 로그아웃/계정 전환 시 이전 사용자의 가용성이
//    1분 동안 잔존하지 않도록 한다(보안 회귀 방지).

export type ReadonlyAvailability = Record<string, boolean>;

type CacheEntry = { data: ReadonlyAvailability; ts: number; loaded: boolean };

const CACHE_BY_TOKEN = new Map<string, CacheEntry>();
const TTL_MS = 60_000;
type Subscriber = (d: ReadonlyAvailability) => void;
const subscribersByToken = new Map<string, Set<Subscriber>>();

function getCache(token: string): CacheEntry {
  let entry = CACHE_BY_TOKEN.get(token);
  if (!entry) {
    entry = { data: {}, ts: 0, loaded: false };
    CACHE_BY_TOKEN.set(token, entry);
  }
  return entry;
}

function getSubscribers(token: string): Set<Subscriber> {
  let set = subscribersByToken.get(token);
  if (!set) {
    set = new Set();
    subscribersByToken.set(token, set);
  }
  return set;
}

/** 사이드바 가용성 fetch — 빈 객체로 폴백(401/오프라인 안전). */
async function fetchAvailability(
  apiBase: string,
  token: string | null,
): Promise<ReadonlyAvailability> {
  const res = await fetch(`${apiBase}/manager-readonly-availability`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return {};
  const json = (await res.json()) as { items?: ReadonlyAvailability };
  return json.items ?? {};
}

/** 현재 캐시된 데이터(없으면 빈 객체) — 동기 반환. 훅 초기 렌더에서 사용. */
export function readCachedAvailability(token: string | null): ReadonlyAvailability {
  return getCache(token ?? "anon").data;
}

/** 토큰별 캐시 구독자 등록 — fetch 완료 시 같은 토큰의 모든 구독자에게 전파. */
export function subscribeAvailability(
  token: string | null,
  cb: (d: ReadonlyAvailability) => void,
): () => void {
  const subs = getSubscribers(token ?? "anon");
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

/**
 * 토큰별 캐시를 통한 비동기 가용성 조회.
 *  - TTL 내면 캐시 반환(추가 fetch 없음).
 *  - 토큰별 격리: token A 의 응답이 token B 의 캐시에 절대 들어가지 않는다.
 *  - 실패 시 해당 키의 기존 캐시(또는 빈 객체) 반환 — 사이드바 기본값(전체 노출) 보장.
 */
export async function loadManagerReadonlyAvailability(
  apiBase: string,
  token: string | null,
): Promise<ReadonlyAvailability> {
  const key = token ?? "anon";
  const cache = getCache(key);
  const now = Date.now();
  if (cache.loaded && now - cache.ts <= TTL_MS) {
    return cache.data;
  }
  cache.ts = now;
  try {
    const data = await fetchAvailability(apiBase, token);
    cache.data = data;
    cache.loaded = true;
    getSubscribers(key).forEach((s) => s(data));
    return data;
  } catch {
    cache.loaded = true;
    return cache.data;
  }
}

/** 테스트 전용: 모듈 캐시를 비운다(역할/토큰 전환 회귀 테스트용). */
export function __resetManagerReadonlyAvailabilityCacheForTests(): void {
  CACHE_BY_TOKEN.clear();
  subscribersByToken.clear();
}
