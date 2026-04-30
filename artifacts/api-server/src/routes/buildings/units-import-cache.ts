// [Task #698] 호실 일괄 가져오기 미리보기 캐시 (in-memory).
//
//   목적:
//     "확정 적용" 단계가 외부 건축물대장/소유자 조회 API 를 다시 호출하지 않도록,
//     미리보기 단계에서 만든 분류 결과(items) 와 그대로 적용 가능한 upsert 작업
//     리스트를 같은 사용자·건물 단위로 짧은 TTL 동안 보관한다.
//
//   설계:
//     - 키: `${userId}:${buildingId}` — 한 사용자가 같은 건물 미리보기를 새로 받으면
//       이전 토큰은 무효화된다 (Map.set 으로 자연스럽게 덮어씀).
//     - 값: 발급된 token, 만료 시각, 그대로 재사용할 upserts 와 응답 메타데이터.
//     - TTL: 10분. 미리보기 후 사용자가 검토·수정하는 시간 + 네트워크 여유.
//     - 만료 항목은 lookup 시점에 즉시 정리하고 별도 GC 는 두지 않는다 — 항목 수는
//       활성 매니저 수와 같은 수준이라 메모리 부담이 없다.
//
//   왜 메모리 캐시인가:
//     - 매니저별로 동시에 1개의 미리보기 → 확정 흐름만 활성화돼 있어 단일 인스턴스
//       메모리로 충분. 멀티 인스턴스/스케일아웃 환경에서는 만료 시 클라이언트가 자동
//       재미리보기 → 재확정 동선으로 자연스럽게 흡수된다(410 PREVIEW_EXPIRED).
//     - 별도 캐시 테이블을 만들면 운영 부담만 늘고 회수 책임이 또 생긴다.

import crypto from "node:crypto";

export const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 분.

export interface CachedUpsert {
  // 기존 행 id (있으면 update). 없으면 신규 insert.
  id?: number;
  values: Record<string, unknown>;
}

export interface CachedPreview {
  token: string;
  expiresAt: number;
  // 응답에 그대로 다시 실어 보낼 메타.
  created: number;
  updated: number;
  skipped: number;
  items: Array<{
    dong: string;
    floor: string;
    unitNumber: string;
    exclusiveArea: number;
    commonArea: number;
    usage: string | null;
    ownerName: string | null;
    ownerAddress: string | null;
    action: "create" | "update" | "skip";
  }>;
  ownerLookupEnabled: boolean;
  ownerLookupAttempted: number;
  ownerLookupHit: number;
  // 적용 시 사용할 raw upsert 작업.
  upserts: CachedUpsert[];
  // 디버깅용 메타 (관측용 로그에 쓸 수 있게 남겨 둠).
  buildingId: number;
  userId: number;
}

const cache = new Map<string, CachedPreview>();

function keyFor(userId: number, buildingId: number): string {
  return `${userId}:${buildingId}`;
}

export function makePreviewToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 미리보기 결과를 저장하고 token 을 발급한다. 같은 (userId, buildingId) 의 이전
 * 토큰은 자동으로 폐기된다 (Map.set 덮어씀).
 */
export function savePreview(args: {
  userId: number;
  buildingId: number;
  created: number;
  updated: number;
  skipped: number;
  items: CachedPreview["items"];
  ownerLookupEnabled: boolean;
  ownerLookupAttempted: number;
  ownerLookupHit: number;
  upserts: CachedUpsert[];
}): CachedPreview {
  const token = makePreviewToken();
  const entry: CachedPreview = {
    token,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
    created: args.created,
    updated: args.updated,
    skipped: args.skipped,
    items: args.items,
    ownerLookupEnabled: args.ownerLookupEnabled,
    ownerLookupAttempted: args.ownerLookupAttempted,
    ownerLookupHit: args.ownerLookupHit,
    upserts: args.upserts,
    userId: args.userId,
    buildingId: args.buildingId,
  };
  cache.set(keyFor(args.userId, args.buildingId), entry);
  return entry;
}

/**
 * token 으로 캐시 항목을 가져온다. 만료/불일치/없음 모두 null. 사용 직후 cache 에서
 * 제거(consume) 해 같은 토큰으로 두 번 적용되지 않게 한다.
 */
export function consumePreview(args: {
  userId: number;
  buildingId: number;
  token: string;
}): CachedPreview | null {
  const k = keyFor(args.userId, args.buildingId);
  const entry = cache.get(k);
  if (!entry) return null;
  if (entry.token !== args.token) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(k);
    return null;
  }
  cache.delete(k);
  return entry;
}

// 테스트 전용 — 캐시 상태를 확인하거나 비울 때 사용.
export function _resetPreviewCacheForTest(): void {
  cache.clear();
}
