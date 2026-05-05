// [Task #861] 관리소장 "회계 결과 열람" 사이드바 자동 숨김 훅.
//
// 7개 읽기 전용 항목(부과총괄표·고지서 발행·관리비 요약·미납대장·검침·결산·세금)에
// 대해 path → boolean 가용성 맵을 1분 캐시로 가져온다. 데이터가 1건도 없으면 false,
// 1건이라도 있으면 true. 빈 객체({}) 는 "아직 미로드" 상태로 간주해 사이드바는 기존
// 항목을 그대로 노출하고, 로드 후 false 인 항목만 제거된다.
//
// 캐시 정책은 manager-readonly-availability-cache 모듈로 분리되어 있으며,
// 토큰별 키 분리로 로그아웃/계정 전환 시 이전 사용자의 가용성이 잔존하지 않는다.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  loadManagerReadonlyAvailability,
  readCachedAvailability,
  subscribeAvailability,
  type ReadonlyAvailability,
} from "./manager-readonly-availability-cache";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

export type { ReadonlyAvailability } from "./manager-readonly-availability-cache";

/**
 * 관리소장 사이드바에서 "회계 결과 열람" 7항목의 path → 가용성(boolean) 맵.
 *  - 토큰별 1분 캐시(앱 전역에 토큰당 1회 fetch).
 *  - 401/오프라인은 빈 객체로 폴백 → 기본값(전체 노출) 보장.
 *  - enabled=false 면 fetch 하지 않으며, 빈 객체를 반환한다(role≠manager 일 때 사용).
 *  - 토큰이 바뀌면(로그아웃/재로그인/계정 전환) 즉시 새 키로 fetch 하여
 *    이전 사용자의 가용성이 잔존하지 않도록 한다.
 */
export function useManagerReadonlyAvailability(enabled: boolean): ReadonlyAvailability {
  const { token } = useAuth();
  const cacheKey = token ?? "anon";
  const [data, setData] = useState<ReadonlyAvailability>(() => readCachedAvailability(token));
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!enabled) {
      // 비활성화 시 직전 토큰의 데이터를 그대로 반환하지 않고 빈 객체로 리셋.
      setData({});
      return;
    }
    let alive = true;
    const cb = (d: ReadonlyAvailability) => {
      if (alive) setData(d);
    };
    const unsubscribe = subscribeAvailability(tokenRef.current, cb);

    // 새 토큰 키로 전환된 경우 즉시 해당 키의 현재 캐시 값으로 동기화한 뒤,
    // 공유 헬퍼로 (TTL 만료 시) fetch — 응답은 같은 키의 모든 구독자에게 전파.
    cb(readCachedAvailability(tokenRef.current));
    void loadManagerReadonlyAvailability(API_BASE, tokenRef.current);

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [enabled, cacheKey]);

  return data;
}
