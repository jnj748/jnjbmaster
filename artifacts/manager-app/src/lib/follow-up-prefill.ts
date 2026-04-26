// [Task #407] 후속조치 다이얼로그가 만들어내는 prefill 쿼리 빌더.
//   다이얼로그 컴포넌트(`follow-up-suggestion-dialog.tsx`)에서 분리해
//   순수 함수로 단위 테스트할 수 있게 한다.
import {
  type FollowUpDetection,
  type FollowUpSource,
  SOURCE_TYPE_LABEL,
} from "./follow-up-detection";

export function buildPrefilledBody(
  source: FollowUpSource,
  detection: FollowUpDetection | null,
): string {
  const lines: string[] = [];
  lines.push(`[자동 제안] ${source.title}`);
  lines.push("");
  if (detection) {
    lines.push(`감지 키워드: ${detection.matched.map((m) => m.keyword).join(", ")}`);
    lines.push(`원문: ${detection.snippet}`);
    lines.push("");
  }
  lines.push(`출처: ${SOURCE_TYPE_LABEL[source.type]} #${source.id} (${source.occurredAt})`);
  lines.push("");
  lines.push("아래에 후속 조치 내용을 작성해주세요.");
  return lines.join("\n");
}

export function buildPrefillQuery(
  source: FollowUpSource,
  detection: FollowUpDetection | null,
  target: "approval" | "rfq",
): string {
  const params = new URLSearchParams();
  params.set("prefill", "1");
  params.set("title", source.title);
  // [Task #407] RFQ 진입 시에는 자동 본문(출처/감지 키워드/원문 등)을 더 이상 description 에
  //   주입하지 않는다. RFQ 작성 폼이 분야/용역종류로부터 한 줄 본문을 자동 생성하기 때문.
  //   기안서(approval) 흐름은 기존과 동일하게 자동 본문을 채워준다.
  if (target === "approval") {
    params.set("body", buildPrefilledBody(source, detection));
  }
  if (detection) {
    params.set(
      "category",
      target === "approval"
        ? detection.recommendedApprovalCategory
        : detection.recommendedRfqCategory,
    );
    params.set("keywords", detection.matched.map((m) => m.keyword).join(","));
  }
  params.set("sourceType", source.type);
  params.set("sourceId", String(source.id));
  params.set("sourceDate", source.occurredAt);
  // [Task #407] RFQ 진입 시 원본에 첨부된 근경/원경 사진 URL 을 함께 전달해
  //   새 견적 요청 모달의 사진 칸에 자동으로 채워지도록 한다 (있는 쪽만).
  if (target === "rfq") {
    if (source.closeUpPhotoUrl) params.set("closeUpPhoto", source.closeUpPhotoUrl);
    if (source.widePhotoUrl) params.set("widePhoto", source.widePhotoUrl);
  }
  return params.toString();
}
