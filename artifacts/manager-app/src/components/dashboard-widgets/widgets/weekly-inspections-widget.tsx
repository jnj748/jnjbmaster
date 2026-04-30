// [Task #658] 시설담당 대시보드 우측 1행 위젯 — "금주 안전점검 작성".
//   6개 카테고리(전기/소방/기계/통신/승강기/기타) 버튼 그리드.
//   각 버튼은 카테고리 라벨 + 이번 주(KST 월~일) 작성 건수 큰 숫자를 보여 준다.
//   0건일 때는 시각적으로 강조(빨간 점 + 강조 색)해 시설담당이 즉시 알아본다.
//   클릭 시 /inspections?category=<key> 로 이동해 해당 카테고리가 자동 선택된 상태로 진입.
//   데이터: useGetFacilityWeeklyInspectionCounts (codegen 훅).

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
  // 이동 시 inspections 페이지에 넘길 카테고리 코드.
  //   - electrical/fire_safety/mechanical/elevator: inspections.category 값과 동일.
  //   - communication: inspections.category === "telecom" 으로 매핑됨.
  //   - other: inspections.category 가 위 5개가 아닌 모든 행을 의미.
  inspectionCategory: string;
}

const BUCKETS: BucketDef[] = [
  { key: "electrical", label: "전기", inspectionCategory: "electrical" },
  { key: "fire_safety", label: "소방", inspectionCategory: "fire_safety" },
  { key: "mechanical", label: "기계", inspectionCategory: "mechanical" },
  { key: "communication", label: "통신", inspectionCategory: "telecom" },
  { key: "elevator", label: "승강기", inspectionCategory: "elevator" },
  { key: "other", label: "기타", inspectionCategory: "other" },
];

export default function WeeklyInspectionsWidget() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetFacilityWeeklyInspectionCounts({
    query: { staleTime: 60 * 1000, refetchOnWindowFocus: true },
  });

  const buckets = data?.buckets;

  function handleClick(b: BucketDef) {
    setLocation(`/inspections?category=${encodeURIComponent(b.inspectionCategory)}`);
  }

  return (
    <Card className="h-full" data-testid="weekly-inspections-widget">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          금주 안전점검 작성
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          이번 주(월~일) 우리 건물에서 카테고리별로 작성된 안전점검 건수입니다.
          0건인 항목은 빨간 점으로 강조됩니다.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {BUCKETS.map((b) => {
            const count = buckets?.[b.key] ?? 0;
            const isZero = !isLoading && count === 0;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => handleClick(b)}
                data-testid={`weekly-inspection-bucket-${b.key}`}
                className={
                  "relative flex flex-col items-center justify-center gap-1 rounded-lg border py-3 px-2 transition-colors hover-elevate active-elevate-2 " +
                  (isZero
                    ? "border-rose-300 bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20"
                    : "border-border bg-card")
                }
              >
                {isZero && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"
                  />
                )}
                <span
                  className={
                    "text-2xl font-bold leading-none " +
                    (isZero
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground")
                  }
                  data-testid={`weekly-inspection-count-${b.key}`}
                >
                  {isLoading ? "·" : count}
                </span>
                <span
                  className={
                    "text-xs font-medium " +
                    (isZero
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-muted-foreground")
                  }
                >
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
