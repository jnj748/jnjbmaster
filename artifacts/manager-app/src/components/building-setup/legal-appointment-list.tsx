// [Task #501] 법정 선임자 6종(소독 제외) 을 한 곳에서 "선임 필요 / 확인 필요 / 선임 불요"
//   3-상태로 보여 주는 공용 컴포넌트.
//   온보딩 위저드 InfoStep 과 건물 셋업 화면 step-info.tsx 가 같은 SafetyResult 를
//   쓰므로 양쪽이 동일한 시각·문구를 갖도록 단일 컴포넌트로 통합한다.
import type { AppointmentField, AppointmentStatus } from "./types";

const FIELD_LABELS: Record<string, string> = {
  electrical: "전기안전관리자",
  fire_safety: "소방안전관리자",
  gas: "가스안전관리자",
  mechanical: "기계설비유지관리자",
  telecom: "정보통신 유지관리자",
  elevator: "승강기 안전관리자",
};

// [Task #501] pendingInputs 키 → 사용자 친화 라벨.
//   서버가 내려주는 키와 1:1 매칭되어야 한다.
const PENDING_INPUT_LABELS: Record<string, string> = {
  electricCapacityKw: "수전설비 용량",
  gasUsageMonthly: "월 가스사용량",
  elevatorCount: "승강기 대수",
  totalArea: "연면적",
};

// 소독은 인물 선임이 아니라 위탁이므로 본 리스트에서 제외한다.
const VISIBLE_ORDER = ["electrical", "fire_safety", "gas", "mechanical", "telecom", "elevator"];

function resolveStatus(f: AppointmentField): AppointmentStatus {
  if (f.status) return f.status;
  return f.required ? "required" : "not_required";
}

function pendingInputLabel(keys: string[] | undefined): string | null {
  if (!keys || keys.length === 0) return null;
  return keys.map((k) => PENDING_INPUT_LABELS[k] || k).join(", ");
}

function shortReason(notes: string[]): string {
  // not_required 항목의 첫 줄을 짧게 보여 준다. 없으면 빈 문자열.
  const first = notes[0] || "";
  // 괄호 안 보충 설명이나 부가 안내를 잘라 한 줄짜리 사유로 정리한다.
  return first.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function LegalAppointmentList({ fields }: { fields: AppointmentField[] | undefined }) {
  if (!fields || fields.length === 0) return null;

  const ordered = VISIBLE_ORDER
    .map((key) => fields.find((f) => f.field === key))
    .filter((f): f is AppointmentField => Boolean(f));

  if (ordered.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-testid="legal-appointment-list">
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="text-xs font-semibold text-slate-700">법정 선임자</div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          입력값이 부족한 항목은 "확인 필요" 로 표시돼요. 다음 단계에서 추가 입력하면 자동으로 갱신됩니다.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {ordered.map((f) => {
          const status = resolveStatus(f);
          const label = FIELD_LABELS[f.field] || f.field;

          if (status === "required") {
            const detail = [f.grade, f.type].filter(Boolean).join(" · ");
            return (
              <li
                key={f.field}
                className="px-3 py-2 flex items-start gap-2"
                data-testid={`legal-appointment-${f.field}`}
                data-status="required"
              >
                <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-[11px] font-semibold shrink-0 mt-0.5">
                  선임 필요
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  {detail && <div className="text-xs text-slate-600 mt-0.5">{detail}</div>}
                </div>
              </li>
            );
          }

          if (status === "pending_input") {
            const inputs = pendingInputLabel(f.pendingInputs);
            return (
              <li
                key={f.field}
                className="px-3 py-2 flex items-start gap-2"
                data-testid={`legal-appointment-${f.field}`}
                data-status="pending_input"
              >
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold shrink-0 mt-0.5">
                  확인 필요
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {inputs ? `${inputs} 입력 후 판정` : "추가 정보 입력 후 판정"}
                  </div>
                </div>
              </li>
            );
          }

          // not_required — 회색/축약형으로 강조하지 않는다.
          const reason = shortReason(f.notes);
          return (
            <li
              key={f.field}
              className="px-3 py-2 flex items-start gap-2"
              data-testid={`legal-appointment-${f.field}`}
              data-status="not_required"
            >
              <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[11px] font-medium shrink-0 mt-0.5">
                선임 불요
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-500">{label}</div>
                {reason && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{reason}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
