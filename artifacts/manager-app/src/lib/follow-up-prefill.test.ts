// [Task #407] 후속조치 다이얼로그가 만드는 prefill 쿼리 동작 회귀 테스트.
//   - RFQ 진입 시: body 자동 본문은 더 이상 주입하지 않는다 (분야/용역종류
//     기반 한 줄 본문은 견적요청 모달이 직접 만든다).
//   - RFQ 진입 시: source 에 closeUpPhotoUrl/widePhotoUrl 가 있으면 그대로
//     URL 쿼리에 실어 견적요청 모달의 사진 칸이 자동 채워지도록 한다.
//   - 기안서(approval) 진입 시: 기존대로 자동 본문/카테고리는 채워주되,
//     사진 파라미터는 보내지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrefilledBody,
  buildPrefillQuery,
} from "./follow-up-prefill";
import {
  type FollowUpDetection,
  type FollowUpSource,
} from "./follow-up-detection";

const baseSource: FollowUpSource = {
  type: "work_log_memo",
  id: 999,
  title: "3층 소화선 고장",
  occurredAt: "2026-04-26",
};

const detection: FollowUpDetection = {
  matched: [
    { keyword: "고장", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "maintenance" },
    { keyword: "교체", domain: "facility", rfqCategory: "maintenance_repair", approvalCategory: "equipment" },
  ],
  primaryDomain: "facility",
  recommendedRfqCategory: "maintenance_repair",
  recommendedApprovalCategory: "maintenance",
  snippet: "3층 소화선 고장 발생, 교체 필요",
};

test("RFQ 진입: body 자동 본문은 채우지 않는다", () => {
  const qs = buildPrefillQuery(baseSource, detection, "rfq");
  const params = new URLSearchParams(qs);
  assert.equal(params.get("prefill"), "1");
  assert.equal(params.get("title"), baseSource.title);
  assert.equal(params.get("body"), null, "RFQ body must not be injected");
  assert.equal(params.get("category"), "maintenance_repair");
  assert.equal(params.get("sourceType"), "work_log_memo");
  assert.equal(params.get("sourceId"), "999");
  assert.equal(params.get("sourceDate"), "2026-04-26");
});

test("RFQ 진입: source 에 사진이 있으면 closeUpPhoto/widePhoto 쿼리에 포함된다", () => {
  const src: FollowUpSource = {
    ...baseSource,
    closeUpPhotoUrl: "/api/storage/close-1.jpg",
    widePhotoUrl: "/api/storage/wide-1.jpg",
  };
  const qs = buildPrefillQuery(src, detection, "rfq");
  const params = new URLSearchParams(qs);
  assert.equal(params.get("closeUpPhoto"), "/api/storage/close-1.jpg");
  assert.equal(params.get("widePhoto"), "/api/storage/wide-1.jpg");
});

test("RFQ 진입: 사진이 없으면 photo 파라미터도 없다", () => {
  const qs = buildPrefillQuery(baseSource, detection, "rfq");
  const params = new URLSearchParams(qs);
  assert.equal(params.get("closeUpPhoto"), null);
  assert.equal(params.get("widePhoto"), null);
});

test("RFQ 진입: 한쪽 사진만 있으면 그쪽만 보낸다", () => {
  const onlyWide: FollowUpSource = {
    ...baseSource,
    widePhotoUrl: "/api/storage/wide-only.jpg",
  };
  const params = new URLSearchParams(buildPrefillQuery(onlyWide, detection, "rfq"));
  assert.equal(params.get("widePhoto"), "/api/storage/wide-only.jpg");
  assert.equal(params.get("closeUpPhoto"), null);

  const onlyClose: FollowUpSource = {
    ...baseSource,
    closeUpPhotoUrl: "/api/storage/close-only.jpg",
  };
  const p2 = new URLSearchParams(buildPrefillQuery(onlyClose, detection, "rfq"));
  assert.equal(p2.get("closeUpPhoto"), "/api/storage/close-only.jpg");
  assert.equal(p2.get("widePhoto"), null);
});

test("기안서(approval) 진입: 자동 본문은 그대로 채우고 사진은 보내지 않는다", () => {
  const src: FollowUpSource = {
    ...baseSource,
    closeUpPhotoUrl: "/api/storage/close-1.jpg",
    widePhotoUrl: "/api/storage/wide-1.jpg",
  };
  const qs = buildPrefillQuery(src, detection, "approval");
  const params = new URLSearchParams(qs);

  const body = params.get("body");
  assert.ok(body, "approval body must be set");
  assert.ok(body!.includes("[자동 제안]"));
  assert.ok(body!.includes("감지 키워드"));
  assert.ok(body!.includes("출처:"));

  // approval 카테고리 매핑이 살아있는지
  assert.equal(params.get("category"), "maintenance");

  // 사진 파라미터는 RFQ 전용이라 approval 에서는 절대 안 나간다
  assert.equal(params.get("closeUpPhoto"), null);
  assert.equal(params.get("widePhoto"), null);
});

test("buildPrefilledBody: detection 이 없을 때도 안전하게 본문을 만든다", () => {
  const body = buildPrefilledBody(baseSource, null);
  assert.ok(body.includes("[자동 제안]"));
  assert.ok(body.includes("출처:"));
  assert.ok(!body.includes("감지 키워드"));
});
