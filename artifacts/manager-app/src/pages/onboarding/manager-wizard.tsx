// [Task #132] 관리소장 위저드.
// 단계: 1) 주소·대장 조회  2) 등록 결과 요약 확인  3) 법정점검 최종일자 입력 (모름 시 준공일 fallback)  4) 주소 잠금
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WizardShell } from "@/components/wizard/wizard-shell";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

type Building = {
  id: number;
  name: string | null;
  addressFull: string | null;
  completionDate: string | null;
  totalArea: string | null;
  floorsAbove: number | null;
  addressLocked?: boolean;
};

const INSPECTION_PRESETS: Array<{ category: string; name: string; label: string }> = [
  { category: "electrical", name: "전기설비 정기점검", label: "전기설비 정기점검" },
  { category: "fire_safety", name: "소방시설 종합점검", label: "소방시설 종합점검" },
  { category: "elevator", name: "승강기 정기검사", label: "승강기 정기검사" },
  { category: "water_tank", name: "저수조 청소·수질검사", label: "저수조 청소·수질검사" },
  { category: "septic", name: "정화조 청소", label: "정화조 청소" },
];

export default function ManagerWizardPage() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const [building, setBuilding] = useState<Building | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [editedBuildingName, setEditedBuildingName] = useState<string>("");
  const [savingName, setSavingName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [skipDates, setSkipDates] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/buildings/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBuilding(d.building))
      .catch(() => null);
  }, [token]);

  const hasBuilding = !!building?.id;
  const totalSteps = 5;

  async function saveBuildingName() {
    if (!building?.id || !token) return;
    setSavingName(true);
    try {
      const res = await fetch(`${API_BASE}/buildings/${building.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editedBuildingName }),
      });
      if (res.ok) {
        const d = await res.json();
        setBuilding(d.building ?? building);
        setStep(4);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "건물명 저장에 실패했습니다");
      }
    } finally { setSavingName(false); }
  }

  // ───────── Step 1: 주소·대장 조회 ─────────
  if (step === 1) {
    return (
      <WizardShell
        title="건물 주소·대장 조회"
        subtitle="관리하실 건물 주소를 입력하고 건축물대장을 조회합니다."
        currentStep={1}
        totalSteps={totalSteps}
        onNext={() => {
          if (hasBuilding) setStep(2);
          else setLocation("/onboarding?returnTo=/onboarding/manager");
        }}
        nextLabel={hasBuilding ? "다음" : "건물 등록 시작"}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>주소를 입력하면 건축물대장에서 준공일·면적·층수·용도를 자동으로 채워옵니다.</p>
          {hasBuilding ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              등록된 건물 <strong>{building?.name || "(이름 미설정)"}</strong>이(가) 확인되었습니다.
            </div>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>주소 입력 → 건축물대장 자동 조회</li>
              <li>준공일 / 면적 / 용도 / 층수 자동 채움</li>
            </ul>
          )}
        </div>
      </WizardShell>
    );
  }

  // ───────── Step 2: 등록 결과 요약 확인 ─────────
  if (step === 2) {
    return (
      <WizardShell
        title="등록 정보 확인"
        subtitle="자동 조회된 정보를 확인합니다."
        currentStep={2}
        totalSteps={totalSteps}
        onPrev={() => setStep(1)}
        onNext={() => { setEditedBuildingName(building?.name ?? ""); setStep(3); }}
        nextLabel="다음"
        allowSkip
        onSkip={() => setStep(4)}
      >
        <div className="space-y-3 text-sm text-slate-600">
          {!building && (
            <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> 정보를 불러오는 중...</div>
          )}
          {building && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1 text-sm">
              <div><span className="text-slate-500">건물명</span> <strong className="ml-2">{building.name || "(미설정)"}</strong></div>
              <div><span className="text-slate-500">주소</span> <span className="ml-2">{building.addressFull || "(주소 미입력)"}</span></div>
              <div><span className="text-slate-500">준공일</span> <span className="ml-2">{building.completionDate || "(미상)"}</span></div>
              <div><span className="text-slate-500">연면적</span> <span className="ml-2">{building.totalArea ? `${building.totalArea} ㎡` : "(미상)"}</span></div>
              <div><span className="text-slate-500">지상 층수</span> <span className="ml-2">{building.floorsAbove ?? "(미상)"}</span></div>
            </div>
          )}
          <p className="text-xs text-slate-500">정보가 다르다면 [이전]에서 다시 등록해 주세요.</p>
        </div>
      </WizardShell>
    );
  }

  // ───────── Step 3: 건물명 직접 입력/수정 ─────────
  if (step === 3) {
    return (
      <WizardShell
        title="건물명 확인"
        subtitle="대장 자동 등록값을 그대로 두거나 자주 쓰는 명칭으로 변경하세요. 변경하지 않으려면 [건너뛰기]."
        currentStep={3}
        totalSteps={totalSteps}
        onPrev={() => setStep(2)}
        loading={savingName}
        allowSkip
        onSkip={() => setStep(4)}
        nextLabel="저장하고 다음"
        onNext={saveBuildingName}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <label className="block text-xs text-slate-700">건물명</label>
          <input
            type="text"
            value={editedBuildingName}
            onChange={(e) => setEditedBuildingName(e.target.value)}
            placeholder={building?.name || "예: 우리빌딩"}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            data-testid="input-building-name"
          />
          <p className="text-xs text-slate-500">대장상의 명칭과 운영명이 다른 경우 운영명으로 변경해 두면 모든 문서·알림에 반영됩니다.</p>
        </div>
      </WizardShell>
    );
  }

  // ───────── Step 4: 법정점검 최종일자 ─────────
  if (step === 4) {
    return (
      <WizardShell
        title="법정점검 최종 점검일자"
        subtitle="가장 최근 점검일을 입력하면 다음 일정이 자동 생성됩니다. 모르면 [건너뛰기]를 선택하세요."
        currentStep={4}
        totalSteps={totalSteps}
        onPrev={() => setStep(3)}
        loading={loading}
        allowSkip
        onSkip={() => setStep(5)}
        nextLabel={skipDates ? "준공일 기준으로 자동 생성" : "일정 생성"}
        onNext={async () => {
          if (!building?.id) { setErr("건물 정보가 없습니다."); return; }
          setLoading(true);
          setErr("");
          try {
            const inspectionDates: Record<string, Record<string, string>> = {};
            for (const p of INSPECTION_PRESETS) {
              if (!inspectionDates[p.category]) inspectionDates[p.category] = {};
              inspectionDates[p.category][p.name] = dates[p.name] ?? "";
            }
            const res = await fetch(`${API_BASE}/buildings/auto-schedule-inspections`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                buildingId: building.id,
                inspectionDates,
                useFallbackCompletionDate: skipDates,
              }),
            });
            if (!res.ok) throw new Error("법정점검 일정 생성에 실패했습니다");
            setStep(5);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "오류");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-3 text-sm text-slate-600">
          {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs">{err}</div>}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={skipDates} onChange={(e) => setSkipDates(e.target.checked)} />
            <span>최종 점검일을 모릅니다. <strong>준공일({building?.completionDate || "미상"})</strong>을 기준으로 자동 산정해 주세요.</span>
          </label>
          {!skipDates && (
            <div className="space-y-2">
              {INSPECTION_PRESETS.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-slate-400" />
                  <label className="flex-1 text-xs text-slate-700">{p.label}</label>
                  <input
                    type="date"
                    value={dates[p.name] ?? ""}
                    onChange={(e) => setDates((d) => ({ ...d, [p.name]: e.target.value }))}
                    className="px-2 py-1 border border-slate-300 rounded text-xs"
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500">비워둔 항목은 다음 단계에서 직접 추가할 수 있습니다.</p>
            </div>
          )}
        </div>
      </WizardShell>
    );
  }

  // ───────── Step 5: 주소 잠금 ─────────
  return (
    <WizardShell
      title="등록 완료 및 주소 잠금"
      subtitle="등록한 건물 주소를 확정합니다."
      currentStep={5}
      totalSteps={totalSteps}
      onPrev={() => setStep(4)}
      loading={loading}
      nextLabel="주소 잠그고 시작"
      onNext={async () => {
        if (!building?.id) { setErr("등록된 건물이 없습니다."); return; }
        setLoading(true);
        try {
          const res = await fetch(`${API_BASE}/buildings/${building.id}/lock-address`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("주소 잠금에 실패했습니다");
          setLocation("/");
        } catch (e) {
          setErr(e instanceof Error ? e.message : "오류");
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="space-y-3 text-sm text-slate-600">
        {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs">{err}</div>}
        {building && (
          <div className="rounded-lg border border-slate-200 p-4 bg-white">
            <div className="text-xs text-slate-500">등록된 건물</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{building.name || "(이름 미설정)"}</div>
            <div className="text-xs text-slate-600 mt-0.5">{building.addressFull || "(주소 미입력)"}</div>
          </div>
        )}
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
          <span>주소를 잠그면 모든 회계·법무·계약 문서에 동일 주소가 사용됩니다. 변경이 필요한 경우 1800-0416으로 연락해 주세요.</span>
        </div>
      </div>
    </WizardShell>
  );
}
