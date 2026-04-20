// [Task #132] 경리·행정 위저드. 주소 확인 → 부과면적 기준 선택 → 회계 초기 자료 업로드.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Upload, FileText, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WizardShell } from "@/components/wizard/wizard-shell";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

const FILE_CATEGORIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "monthly_bill", label: "최근 관리비 고지서", hint: "PDF/이미지 모두 가능" },
  { value: "bank_transactions", label: "통장 거래내역", hint: "최근 3개월 권장" },
  { value: "energy_meter", label: "에너지 검침자료", hint: "전기/수도/가스 검침표" },
  { value: "extra_service", label: "부가서비스 자료", hint: "주차/임대 등" },
  { value: "accounting_evidence", label: "회계 증빙자료", hint: "영수증 / 계약서 등" },
  { value: "other", label: "기타 행정자료", hint: "필요한 경우 첨부" },
];

const AREA_BASIS_OPTIONS = [
  { value: "standard", label: "전용 + 공용 (표준)", desc: "전용면적과 공용면적을 모두 부과 기준에 포함" },
  { value: "exclusive", label: "전용면적만", desc: "분양면적/등기면적을 사용하지 않고 전용면적만 사용" },
  { value: "common", label: "공용면적만", desc: "공용 시설 부과 위주의 단지" },
];

export default function AccountantWizardPage() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [building, setBuilding] = useState<{ id: number; name: string; addressFull: string | null; areaBasis: string | null } | null>(null);
  const [areaBasis, setAreaBasis] = useState<string>("standard");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [uploads, setUploads] = useState<Record<string, { name: string; uploading: boolean; saved: boolean }>>({});

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/buildings/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setBuilding(d.building);
        if (d.building?.areaBasis) setAreaBasis(d.building.areaBasis);
      });
  }, [token]);

  async function uploadFile(category: string, file: File) {
    if (!building) return;
    setUploads((u) => ({ ...u, [category]: { name: file.name, uploading: true, saved: false } }));
    try {
      const signRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!signRes.ok) throw new Error("업로드 URL 발급 실패");
      const { uploadURL, objectPath } = await signRes.json();
      const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!putRes.ok) throw new Error("파일 업로드 실패");
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      const saveRes = await fetch(`${API_BASE}/accounting-initial-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, fileUrl: objectPath, originalName: file.name, buildingId: building.id }),
      });
      if (!saveRes.ok) throw new Error("저장 실패");
      setUploads((u) => ({ ...u, [category]: { name: file.name, uploading: false, saved: true } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
      setUploads((u) => ({ ...u, [category]: { name: file.name, uploading: false, saved: false } }));
    }
  }

  if (step === 1) {
    const hasBuilding = !!building?.id;
    return (
      <WizardShell
        title="건물 주소 확인"
        subtitle="회계 자료가 적용될 건물을 확인하거나 주소로 조회합니다."
        currentStep={1}
        totalSteps={3}
        onNext={() => {
          if (hasBuilding) setStep(2);
          else setLocation("/onboarding?returnTo=/onboarding/accountant");
        }}
        nextLabel={hasBuilding ? "다음" : "주소 입력·대장 조회"}
      >
        <div className="space-y-3 text-sm">
          {!building && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
              아직 연결된 건물이 없습니다. 주소를 입력하면 건축물대장 조회 후 등록을 마칠 수 있습니다.
            </div>
          )}
          {building && (
            <div className="rounded-lg border border-slate-200 p-4 bg-white">
              <div className="text-xs text-slate-500">대상 건물</div>
              <div className="mt-1 text-base font-semibold text-slate-900">{building.name || "(이름 미설정)"}</div>
              <div className="text-xs text-slate-600 mt-0.5">{building.addressFull || "(주소 미입력)"}</div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            건물 주소는 관리소장 위저드에서 잠긴 후로 변경할 수 없습니다. 변경이 필요한 경우 1800-0416으로 연락해 주세요.
          </p>
        </div>
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        title="부과면적 기준 선택"
        subtitle="관리비 부과의 기준이 될 면적 산정 방식을 선택합니다."
        currentStep={2}
        totalSteps={3}
        onPrev={() => setStep(1)}
        loading={loading}
        allowSkip
        onSkip={() => setStep(3)}
        onNext={async () => {
          if (!building) return;
          setLoading(true);
          try {
            const res = await fetch(`${API_BASE}/buildings/${building.id}/area-basis`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ areaBasis }),
            });
            if (!res.ok) throw new Error("저장 실패");
            setStep(3);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "오류");
          } finally {
            setLoading(false);
          }
        }}
      >
        {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
        <div className="space-y-2">
          {AREA_BASIS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                areaBasis === opt.value ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                className="mt-1"
                checked={areaBasis === opt.value}
                onChange={() => setAreaBasis(opt.value)}
              />
              <div>
                <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      title="회계 초기 자료 업로드"
      subtitle="필수 자료가 없다면 건너뛰고 나중에 등록할 수 있습니다."
      currentStep={3}
      totalSteps={3}
      onPrev={() => setStep(2)}
      onNext={() => setLocation("/")}
      nextLabel="완료하고 시작하기"
      allowSkip
      onSkip={() => setLocation("/")}
    >
      {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
      <div className="space-y-3">
        {FILE_CATEGORIES.map((cat) => {
          const u = uploads[cat.value];
          return (
            <div key={cat.value} className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg bg-white">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{cat.label}</div>
                <div className="text-xs text-slate-500 truncate">{u?.saved ? `등록됨 · ${u.name}` : cat.hint}</div>
              </div>
              <label className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md cursor-pointer hover:bg-slate-50">
                {u?.uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : u?.saved ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Upload className="w-3 h-3" />}
                {u?.saved ? "교체" : "파일 선택"}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(cat.value, f);
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1">
        <FileText className="w-3 h-3" /> 업로드한 파일은 회계 메뉴 &gt; 초기 자료 보관함에서 관리됩니다.
      </p>
    </WizardShell>
  );
}
