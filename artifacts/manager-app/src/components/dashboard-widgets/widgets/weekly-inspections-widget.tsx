// [Task #658] 시설담당 대시보드 우측 1행 위젯 — "금주 안전점검표 작성".
//   6개 카테고리(전기/소방/기계/통신/승강기/기타) 버튼 그리드.
//   각 버튼은 카테고리 라벨 + 이번 주(KST 월~일) 작성 건수 큰 숫자를 보여 준다.
//
// [Task #669] 위젯이 가리키는 화면을 법정점검(/inspections) → 안전점검표
//   (/safety-checklists) 로 교정. 카드 본문 안내 문구도 "안전점검표 작성 건수"
//   기준으로 정리하고, 카테고리 버튼 클릭 시 해당 카테고리가 자동 선택된 상태로
//   안전점검표 화면을 연다. 카운트 자체는 서버 라우트에서 safety_checklists 단일
//   테이블 집계로 바뀌었지만 응답 스키마(키 구성)는 그대로이므로 이 컴포넌트의
//   훅 사용은 변경 없음.
//
// [요청] 0건 항목의 빨강 강조(테두리/배경/글자색/빨간 점) 모두 제거 — 모든
//   카테고리 버튼이 동일한 기본 스타일로 보인다.

import { useLocation } from "wouter";
import { useGetFacilityWeeklyInspectionCounts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";

type BucketKey =
  | "electrical"
  | "fire_safety"
  | "mechanical"
  | "communication"
  | "elevator"
  | "other";

interface BucketDef {
  key: BucketKey;
  label: string;
  // [Task #669] 안전점검표(/safety-checklists) 화면에 넘길 카테고리 슬러그.
  //   safety_checklist_template_categories.value 와 같은 텍스트 슬러그를 사용한다.
  //   - electrical/fire_safety/mechanical/elevator: 슬러그가 라벨 키와 동일.
  //   - communication 버킷: 안전점검표의 "통신" 카테고리 슬러그(`telecom`).
  //   - other: 위 5개에 속하지 않는 모든 카테고리(본사 admin 이 추가한 사용자
  //     정의 카테고리 포함). 안전점검표 화면이 이 슬러그를 알지 못하면 필터를
  //     기본값("all") 그대로 둔다.
  checklistCategory: string;
}

const BUCKETS: BucketDef[] = [
  { key: "electrical", label: "전기", checklistCategory: "electrical" },
  { key: "fire_safety", label: "소방", checklistCategory: "fire_safety" },
  { key: "mechanical", label: "기계", checklistCategory: "mechanical" },
  { key: "communication", label: "통신", checklistCategory: "telecom" },
  { key: "elevator", label: "승강기", checklistCategory: "elevator" },
  { key: "other", label: "기타", checklistCategory: "other" },
];

export default function WeeklyInspectionsWidget() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetFacilityWeeklyInspectionCounts({
    query: { staleTime: 60 * 1000, refetchOnWindowFocus: true },
  });

  const buckets = data?.buckets;

  function handleClick(b: BucketDef) {
    setLocation(`/safety-checklists?category=${encodeURIComponent(b.checklistCategory)}`);
  }

  return (
    <Card className="h-full" data-testid="weekly-inspections-widget">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          금주 안전점검표 작성
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          이번 주(월~일) 우리 건물의 안전점검표 작성 건수입니다.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {BUCKETS.map((b) => {
            const count = buckets?.[b.key] ?? 0;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => handleClick(b)}
                data-testid={`weekly-inspection-bucket-${b.key}`}
                className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card py-3 px-2 transition-colors hover-elevate active-elevate-2"
              >
                <span
                  className="text-2xl font-bold leading-none text-foreground"
                  data-testid={`weekly-inspection-count-${b.key}`}
                >
                  {isLoading ? "·" : count}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
