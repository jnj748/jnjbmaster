// [Task #608] 본사 관리자 편집 다이얼로그에 항상 보이는 "사용 가능한 가변항목" 패널.
//   - NOTICE_TOKEN_DEFS 의 모든 토큰을 라벨/토큰명/짧은 설명·샘플과 함께 카드로 노출.
//   - customA/B/C 는 다이얼로그에 입력된 사용자 입력칸 라벨이 있으면 그 라벨을 보여준다.
//   - 카드를 클릭하면 호출자가 넘겨준 onInsert(token) 으로 본문 커서 위치에 칩 삽입.
//   - 관리소장(`mode='filled'`) 화면에서는 호출되지 않으므로 권한 체크는 호출 측 책임.
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTICE_TOKEN_DEFS, buildNoticeTokenLabels } from "@/lib/notice-layout";

const TOKEN_DESCRIPTIONS: Record<string, string> = {
  buildingName: "건물 이름. 예: 그린아파트 102동",
  addressFull: "관리사무소 주소(도로명). 예: 서울특별시 ○○구 ○○로 1",
  managementOfficePhone: "관리사무소 대표 전화. 예: 02-1234-5678",
  feeInquiryPhone: "관리비 문의 전화. 예: 02-1234-5679",
  facilitySafetyPhone: "시설 방재실 전화. 예: 02-1234-5680",
  date: "공고문 작성일(오늘). 예: 2026년 4월 29일",
  customA: "다이얼로그 상단 '사용자 입력칸 라벨' 의 첫 번째 항목.",
  customB: "다이얼로그 상단 '사용자 입력칸 라벨' 의 두 번째 항목.",
  customC: "다이얼로그 상단 '사용자 입력칸 라벨' 의 세 번째 항목.",
};

export interface NoticeVariablesPanelProps {
  /** 다이얼로그 상단에 입력된 사용자 입력칸 라벨 (콤마 분리 첫 3개). */
  customLabels?: { a?: string; b?: string; c?: string };
  /** 토큰 카드 클릭 시 호출 — 호출자(부모)가 NoticeBodyEditorHandle.insertToken 을 호출. */
  onInsert: (token: string) => void;
  className?: string;
  /** data-testid prefix. */
  testIdPrefix?: string;
}

export function NoticeVariablesPanel(props: NoticeVariablesPanelProps) {
  const { customLabels, onInsert, className, testIdPrefix = "notice-variables-panel" } = props;
  const labels = useMemo(
    () => buildNoticeTokenLabels(customLabels ?? {}),
    [customLabels?.a, customLabels?.b, customLabels?.c],
  );

  return (
    <div
      className={cn("rounded-md border border-slate-200 bg-slate-50 p-2", className)}
      data-testid={testIdPrefix}
    >
      <div className="px-1 pb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
        사용 가능한 가변항목
      </div>
      <p className="px-1 pb-2 text-[11px] text-slate-500 leading-snug">
        클릭하면 본문 커서 위치에 칩으로 들어갑니다. 매니저 화면에서는 우리 건물의
        실제값으로 자동 치환되어 보입니다.
      </p>
      <ul className="space-y-1" data-testid={`${testIdPrefix}-list`}>
        {NOTICE_TOKEN_DEFS.map((def) => {
          const label = labels[def.token] ?? def.defaultLabel;
          const description = TOKEN_DESCRIPTIONS[def.token] ?? "";
          // customA/B/C 는 라벨이 사용자 정의로 바뀌었는지 별도로 표시.
          const customRenamed =
            def.isCustom &&
            customLabels &&
            label !== def.defaultLabel;
          return (
            <li key={def.token}>
              <button
                type="button"
                className="w-full text-left bg-white border border-slate-200 rounded px-2 py-1.5 hover:border-slate-400 hover:bg-slate-50 transition flex items-start gap-2"
                onClick={() => onInsert(def.token)}
                data-testid={`${testIdPrefix}-insert-${def.token}`}
              >
                <Plus className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    [{label}]
                    {customRenamed && (
                      <span className="text-[9px] uppercase tracking-wide font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1">
                        사용자 정의
                      </span>
                    )}
                  </span>
                  <span className="block text-[10px] font-mono text-slate-400">
                    {`{{${def.token}}}`}
                  </span>
                  {description && (
                    <span className="block text-[11px] text-slate-500 mt-0.5">{description}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
