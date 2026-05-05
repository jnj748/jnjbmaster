// [Task #861] 관리소장 readonly 가용성 캐시 — 토큰 격리/TTL 회귀 테스트.
//
// code-review 피드백: 토큰만 바뀌어도 이전 사용자의 가용성 맵이 1분 동안 잔존하면
// 안 된다. 토큰별 캐시 키 분리가 회귀하지 않도록 직접 검증한다.
//
// React/Auth 컨텍스트 의존성을 피하기 위해 캐시는 별도 모듈로 분리되어 있고,
// 본 테스트는 그 순수 모듈을 직접 호출한다.

import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  loadManagerReadonlyAvailability,
  __resetManagerReadonlyAvailabilityCacheForTests,
} from "./manager-readonly-availability-cache.ts";

const API_BASE = "/api";
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function installFetchStub(
  responder: (args: FetchArgs) =>
    | { items?: Record<string, boolean> }
    | Promise<{ items?: Record<string, boolean> }>,
): { calls: FetchArgs[] } {
  const calls: FetchArgs[] = [];
  const stub = mock.fn(async (...args: FetchArgs) => {
    calls.push(args);
    const body = await responder(args);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = stub as unknown as typeof fetch;
  return { calls };
}

beforeEach(() => {
  __resetManagerReadonlyAvailabilityCacheForTests();
});

test("동일 토큰의 두 번째 호출은 fetch 를 다시 부르지 않는다 (TTL 캐시)", async () => {
  const { calls } = installFetchStub(() => ({ items: { "/closing": true } }));

  const a = await loadManagerReadonlyAvailability(API_BASE, "token-A");
  const b = await loadManagerReadonlyAvailability(API_BASE, "token-A");

  assert.equal(calls.length, 1, "fetch should be called only once for the same token");
  assert.deepEqual(a, { "/closing": true });
  assert.deepEqual(b, { "/closing": true });
});

test("토큰이 바뀌면 새로 fetch 하고, 이전 토큰의 캐시 데이터가 새 토큰에 노출되지 않는다", async () => {
  const { calls } = installFetchStub(([_input, init]) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth === "Bearer token-A") return { items: { "/closing": true, "/tax": true } };
    if (auth === "Bearer token-B") return { items: { "/closing": false, "/tax": false } };
    return { items: {} };
  });

  const a = await loadManagerReadonlyAvailability(API_BASE, "token-A");
  const b = await loadManagerReadonlyAvailability(API_BASE, "token-B");

  assert.equal(calls.length, 2, "different tokens must trigger separate fetches");
  assert.deepEqual(a, { "/closing": true, "/tax": true }, "token-A keeps its own data");
  assert.deepEqual(b, { "/closing": false, "/tax": false }, "token-B sees only its own data");

  const aAgain = await loadManagerReadonlyAvailability(API_BASE, "token-A");
  assert.deepEqual(aAgain, { "/closing": true, "/tax": true });
  assert.equal(calls.length, 2, "cached A response should still be served — no extra fetch");
});

test("로그아웃→재로그인 시나리오: token-A → null(anon) → token-B 도 격리된다", async () => {
  const { calls } = installFetchStub(([_input, init]) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth === "Bearer token-A") return { items: { "/billing/summary": true } };
    if (auth === "Bearer token-B") return { items: { "/billing/summary": false } };
    return { items: {} };
  });

  await loadManagerReadonlyAvailability(API_BASE, "token-A");
  await loadManagerReadonlyAvailability(API_BASE, null);
  const b = await loadManagerReadonlyAvailability(API_BASE, "token-B");

  assert.equal(calls.length, 3, "anon, A, B must each trigger their own fetch");
  assert.deepEqual(b, { "/billing/summary": false });
});

test("fetch 가 실패해도 빈 객체를 반환하고, 다른 토큰 캐시에 영향 없다", async () => {
  const { calls } = installFetchStub(([_input, init]) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth === "Bearer token-A") return { items: { "/tax": true } };
    if (auth === "Bearer token-B") {
      throw new Error("network down");
    }
    return { items: {} };
  });

  const a = await loadManagerReadonlyAvailability(API_BASE, "token-A");
  const b = await loadManagerReadonlyAvailability(API_BASE, "token-B");

  assert.deepEqual(a, { "/tax": true });
  assert.deepEqual(b, {}, "failure falls back to empty (= show all by default)");
  assert.equal(calls.length, 2);

  const aAgain = await loadManagerReadonlyAvailability(API_BASE, "token-A");
  assert.deepEqual(aAgain, { "/tax": true });
});
