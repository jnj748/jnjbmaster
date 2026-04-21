// [Task #174] 관리소장 모바일 우선 온보딩 위저드.
// 한 화면 = 한 단계. 압박 어휘(반드시/필수/권장)를 빼고, AI 자동 입력과
// 준공일 기준 폴백을 적극 활용해 가입 마찰을 낮춥니다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  Sparkles,
  MapPin,
  Search,
  ShieldCheck,
  CalendarDays,
  Image as ImageIcon,
  Upload,
  Camera,
  CheckCircle2,
  PartyPopper,
  ChevronRight,
  ChevronLeft,
  X,
  HelpCircle,
  FileText,
  Megaphone,
  ScrollText,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useOnboarding } from "@/contexts/onboarding-context";
import { PhotoUploadField } from "@/components/photo-upload-field";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

declare global {
  interface Window {
    daum?: { Postcode: new (opts: { oncomplete: (d: DaumResult) => void }) => { open: () => void } };
  }
}

interface DaumResult {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  sido: string;
  sigungu: string;
  bname: string;
  buildingName: string;
  bcode: string;
  address: string;
}

type StepKey =
  | "intro"
  | "address"
  | "loading"
  | "info"
  | "ins-fire"
  | "ins-elec"
  | "ins-bsafe"
  | "ins-mech"
  | "logo"
  | "bill"
  | "done";

interface BuildingState {
  id: number | null;
  name: string;
  addressFull: string;
  addressJibun: string;
  zipCode: string;
  sido: string;
  sigungu: string;
  dong: string;
  totalArea: string;
  totalFloors: string;
  basementFloors: string;
  totalUnits: string;
  buildingUsage: string;
  structureType: string;
  completionDate: string;
  elevatorCount: string;
  parkingSpaces: string;
  logoUrl: string | null;
}

interface SafetyField {
  field: string;
  required: boolean;
  grade?: string;
  type?: string;
  legalBasis?: string;
  notes: string[];
}
interface SafetyResult {
  safetyManagerRequired: boolean;
  safetyManagerType: string | null;
  requiredInspections: string[];
  fields?: SafetyField[];
}

const EMPTY: BuildingState = {
  id: null,
  name: "",
  addressFull: "",
  addressJibun: "",
  zipCode: "",
  sido: "",
  sigungu: "",
  dong: "",
  totalArea: "",
  totalFloors: "",
  basementFloors: "",
  totalUnits: "",
  buildingUsage: "",
  structureType: "",
  completionDate: "",
  elevatorCount: "",
  parkingSpaces: "",
  logoUrl: null,
};

const INS_DEFS: Record<string, { category: string; name: string; title: string; help: string }> = {
  "ins-fire":  { category: "fire_safety",     name: "소방시설 종합점검",   title: "소방시설 점검",     help: "준공일 기준으로 다음 일정을 자동 산정합니다." },
  "ins-elec":  { category: "electrical",      name: "전기설비 정기점검",   title: "전기 안전점검",     help: "전기안전관리법에 따른 정기점검입니다." },
  "ins-bsafe": { category: "building_safety", name: "건축물 정기점검",     title: "건축물 정기점검",   help: "준공 후 일정 기간 경과 시 첫 점검이 시작됩니다." },
  "ins-mech":  { category: "mechanical",      name: "기계설비 성능점검",   title: "기계설비 점검",     help: "연면적 10,000㎡ 이상 건물에 적용됩니다." },
};

export default function ManagerWizardPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { setPreference } = useOnboarding();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<StepKey>("intro");
  const [building, setBuilding] = useState<BuildingState>(EMPTY);
  const [safety, setSafety] = useState<SafetyResult | null>(null);
  const [postcodeReady, setPostcodeReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // 점검일 입력 상태: stepKey -> { date | "", unknown }
  const [insState, setInsState] = useState<Record<string, { date: string; unknown: boolean }>>({});

  // 관리비 OCR 상태
  const [billOcr, setBillOcr] = useState<null | { id: number; billingMonth: string; totalAmount: number; lineItems: Record<string, number> }>(null);
  const [billBusy, setBillBusy] = useState(false);
  const billCamRef = useRef<HTMLInputElement>(null);
  const billFileRef = useRef<HTMLInputElement>(null);

  // ── 부팅: 다음 우편번호 SDK + 기존 건물 로드 ──
  useEffect(() => {
    if (!document.getElementById("daum-postcode-script")) {
      const s = document.createElement("script");
      s.id = "daum-postcode-script";
      s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      s.onload = () => setPostcodeReady(true);
      document.head.appendChild(s);
    } else {
      setPostcodeReady(true);
    }
    if (!token) return;
    fetch(`${API_BASE}/buildings/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.building) hydrateBuilding(d.building);
      })
      .catch(() => null);
  }, [token]);

  function hydrateBuilding(b: Record<string, unknown>) {
    setBuilding((prev) => ({
      ...prev,
      id: (b.id as number) ?? prev.id,
      name: (b.name as string) ?? prev.name,
      addressFull: (b.addressFull as string) ?? prev.addressFull,
      addressJibun: (b.addressJibun as string) ?? prev.addressJibun,
      zipCode: (b.zipCode as string) ?? prev.zipCode,
      sido: (b.sido as string) ?? prev.sido,
      sigungu: (b.sigungu as string) ?? prev.sigungu,
      dong: (b.dong as string) ?? prev.dong,
      totalArea: (b.totalArea as string) ?? prev.totalArea,
      totalFloors: b.totalFloors != null ? String(b.totalFloors) : prev.totalFloors,
      basementFloors: b.basementFloors != null ? String(b.basementFloors) : prev.basementFloors,
      totalUnits: b.totalUnits != null ? String(b.totalUnits) : prev.totalUnits,
      buildingUsage: (b.buildingUsage as string) ?? prev.buildingUsage,
      structureType: (b.structureType as string) ?? prev.structureType,
      completionDate: (b.completionDate as string) ?? prev.completionDate,
      elevatorCount: b.elevatorCount != null ? String(b.elevatorCount) : prev.elevatorCount,
      parkingSpaces: b.parkingSpaces != null ? String(b.parkingSpaces) : prev.parkingSpaces,
      logoUrl: (b.logoUrl as string) ?? prev.logoUrl,
    }));
  }

  // ── 단계 시퀀스 (기계설비는 연면적 10,000㎡ 이상에서만 노출) ──
  const sequence: StepKey[] = useMemo(() => {
    const includeMech = Number(building.totalArea || 0) >= 10000;
    const base: StepKey[] = ["intro", "address", "loading", "info", "ins-fire", "ins-elec", "ins-bsafe"];
    if (includeMech) base.push("ins-mech");
    base.push("logo", "bill", "done");
    return base;
  }, [building.totalArea]);

  const stepIdx = sequence.indexOf(step);
  const totalSteps = sequence.length;

  function goNext() {
    const i = sequence.indexOf(step);
    if (i >= 0 && i < sequence.length - 1) setStep(sequence[i + 1]);
  }
  function goPrev() {
    const i = sequence.indexOf(step);
    if (i > 0) setStep(sequence[i - 1]);
  }

  // ── 주소 검색 + 대장 조회 + 건물 저장 ──
  function openPostcode() {
    if (!window.daum?.Postcode) {
      toast({ title: "주소 검색 모듈을 로딩 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    new window.daum.Postcode({
      oncomplete: async (d) => {
        const next: Partial<BuildingState> = {
          addressFull: d.roadAddress || d.address,
          addressJibun: d.jibunAddress || "",
          zipCode: d.zonecode || "",
          sido: d.sido || "",
          sigungu: d.sigungu || "",
          dong: d.bname || "",
          name: d.buildingName || "",
        };
        setBuilding((p) => ({ ...p, ...next }));
        setStep("loading");
        await runRegisterLookupAndSave(d, next);
      },
    }).open();
  }

  async function runRegisterLookupAndSave(d: DaumResult, picked: Partial<BuildingState>) {
    setBusy(true);
    let merged: BuildingState = { ...building, ...picked } as BuildingState;
    try {
      // 1) 건축물대장 조회
      const bcode = d.bcode || "";
      const sigunguCd = bcode.substring(0, 5);
      const bjdongCd = bcode.substring(5, 10);
      const jibun = d.jibunAddress || d.address || "";
      const m = jibun.match(/(\d+)(?:-(\d+))?$/);
      const bun = m?.[1] || "";
      const ji = m?.[2] || "0";
      if (sigunguCd && bjdongCd && bun) {
        const params = new URLSearchParams({ sigunguCd, bjdongCd, bun, ji });
        const r = await fetch(`${API_BASE}/buildings/lookup-register?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        if (j?.found && j.data) {
          const x = j.data;
          merged = {
            ...merged,
            name: x.buildingName || merged.name,
            addressFull: x.newPlatPlc || merged.addressFull,
            addressJibun: x.platPlc || merged.addressJibun,
            totalUnits: x.totalUnits ? String(x.totalUnits) : merged.totalUnits,
            totalFloors: x.totalFloors ? String(x.totalFloors) : merged.totalFloors,
            basementFloors: x.basementFloors ? String(x.basementFloors) : merged.basementFloors,
            totalArea: x.totalArea || merged.totalArea,
            buildingUsage: x.mainPurpose || merged.buildingUsage,
            structureType: x.structureType || merged.structureType,
            completionDate: x.completionDate
              ? `${String(x.completionDate).substring(0, 4)}-${String(x.completionDate).substring(4, 6)}-${String(x.completionDate).substring(6, 8)}`
              : merged.completionDate,
            elevatorCount: x.elevatorCount ? String(x.elevatorCount) : merged.elevatorCount,
            parkingSpaces: x.parkingCount ? String(x.parkingCount) : merged.parkingSpaces,
          };
        }
      }

      // 2) 안전관리자/필수 점검 분석
      const safetyRes = await fetch(`${API_BASE}/buildings/calculate-safety`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          totalArea: merged.totalArea || "0",
          totalFloors: merged.totalFloors || "0",
          basementFloors: merged.basementFloors || "0",
          totalUnits: merged.totalUnits || "0",
          elevatorCount: merged.elevatorCount || "0",
          buildingUsage: merged.buildingUsage || "",
          electricCapacityKw: "0",
          gasUsageMonthly: "0",
          hasGas: "true",
        }),
      });
      const safetyJson = (await safetyRes.json()) as SafetyResult;
      setSafety(safetyJson);

      // 3) 건물 저장 (생성 또는 수정)
      const payload = {
        name: merged.name || d.buildingName || "(신규 건물)",
        addressFull: merged.addressFull,
        addressJibun: merged.addressJibun,
        zipCode: merged.zipCode,
        sido: merged.sido,
        sigungu: merged.sigungu,
        dong: merged.dong,
        totalArea: merged.totalArea,
        totalFloors: merged.totalFloors ? Number(merged.totalFloors) : null,
        basementFloors: merged.basementFloors ? Number(merged.basementFloors) : null,
        totalUnits: merged.totalUnits ? Number(merged.totalUnits) : null,
        buildingUsage: merged.buildingUsage,
        structureType: merged.structureType,
        completionDate: merged.completionDate,
        elevatorCount: merged.elevatorCount ? Number(merged.elevatorCount) : null,
        parkingSpaces: merged.parkingSpaces ? Number(merged.parkingSpaces) : null,
        safetyManagerRequired: safetyJson?.safetyManagerRequired ?? false,
        safetyManagerType: safetyJson?.safetyManagerType ?? null,
      };
      const method = merged.id ? "PUT" : "POST";
      const url = merged.id ? `${API_BASE}/buildings/${merged.id}` : `${API_BASE}/buildings`;
      const saveRes = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveJson.building?.id) {
        // 저장 실패 시 info 단계로 진행하지 않는다(이후 점검/완료 단계는 building.id에 의존).
        toast({ title: saveJson.error || "건물 정보 저장에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
        setBuilding((prev) => ({ ...prev, ...merged, id: prev.id }));
        setStep("address");
        return;
      }
      merged.id = saveJson.building.id;
      setBuilding(merged);
      setStep("info");
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.", variant: "destructive" });
      setStep("address");
    } finally {
      setBusy(false);
    }
  }

  // ── 점검일 단일 화면 처리 ──
  function getInsStep(key: string) {
    return insState[key] ?? { date: "", unknown: false };
  }
  function setInsStep(key: string, patch: Partial<{ date: string; unknown: boolean }>) {
    setInsState((p) => ({ ...p, [key]: { ...getInsStep(key), ...patch } }));
  }

  // ── 일정 일괄 생성 (logo 다음에 별도 호출 대신, 점검 단계 끝나는 시점에) ──
  async function persistInspections() {
    if (!building.id) return;
    const inspectionDates: Record<string, Record<string, string>> = {};
    let useFallback = false;
    for (const key of Object.keys(INS_DEFS)) {
      if (!sequence.includes(key as StepKey)) continue;
      const def = INS_DEFS[key];
      const v = getInsStep(key);
      if (v.unknown) useFallback = true;
      const d = v.unknown ? "" : v.date;
      if (!inspectionDates[def.category]) inspectionDates[def.category] = {};
      inspectionDates[def.category][def.name] = d;
    }
    const res = await fetch(`${API_BASE}/buildings/auto-schedule-inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        buildingId: building.id,
        inspectionDates,
        useFallbackCompletionDate: useFallback,
      }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast({ title: j.error || "법정 점검 일정 생성에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
      return false;
    }
    return true;
  }

  // ── 로고 저장 (PhotoUploadField에서 logoUrl 갱신될 때 즉시 PUT) ──
  async function saveLogo(url: string | null) {
    setBuilding((p) => ({ ...p, logoUrl: url }));
    if (!building.id) return;
    try {
      await fetch(`${API_BASE}/buildings/${building.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ logoUrl: url }),
      });
    } catch {/* non-blocking */}
  }

  // ── 관리비 고지서 OCR (accountant-wizard 패턴 재사용) ──
  async function runBillOcr(file: File) {
    if (!building.id) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "파일이 너무 큽니다. 최대 10MB까지 가능합니다.", variant: "destructive" });
      return;
    }
    setBillBusy(true);
    try {
      const sign = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      }).then((r) => r.json());
      await fetch(sign.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath: sign.objectPath }),
      });
      const r = await fetch(`${API_BASE}/fees/bill-ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath: sign.objectPath, fileName: file.name }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 202) {
        toast({ title: "고지서 인식에 실패했어요. 잠시 후 다시 시도해 주세요.", variant: "destructive" });
        return;
      }
      if (!r.ok) throw new Error(j.error || "OCR 실패");
      setBillOcr(j);
      toast({ title: `${j.billingMonth} 인식 완료` });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "오류", variant: "destructive" });
    } finally {
      setBillBusy(false);
    }
  }

  // ── 완료: preference=started + 주소 잠금 ──
  async function finalize() {
    setBusy(true);
    try {
      await setPreference("started").catch(() => {});
      if (building.id) {
        await fetch(`${API_BASE}/buildings/${building.id}/lock-address`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      setLocation("/");
    } finally {
      setBusy(false);
    }
  }

  // ── 화면 렌더 ──
  return (
    <Shell
      stepIdx={Math.max(0, stepIdx)}
      total={totalSteps}
      onClose={() => setLocation("/")}
      hideProgress={step === "intro"}
    >
      {step === "intro" && (
        <IntroStep onStart={() => setStep("address")} />
      )}

      {step === "address" && (
        <AddressStep
          ready={postcodeReady}
          building={building}
          onSearch={openPostcode}
          onPrev={goPrev}
        />
      )}

      {step === "loading" && <LoadingStep />}

      {step === "info" && (
        <InfoStep
          building={building}
          safety={safety}
          onPrev={() => setStep("address")}
          onNext={() => setStep("ins-fire")}
        />
      )}

      {step.startsWith("ins-") && (
        <InspectionStep
          stepKey={step}
          completionDate={building.completionDate}
          state={getInsStep(step)}
          onChange={(patch) => setInsStep(step, patch)}
          onPrev={goPrev}
          onNext={async () => {
            // 항목별 누락 방지: 날짜 입력 또는 '잘 모르겠어요' 중 하나는 반드시 선택해야 한다.
            const v = getInsStep(step);
            if (!v.unknown && !v.date) {
              toast({
                title: "마지막 점검일을 입력하거나 '잘 모르겠어요'를 선택해 주세요.",
                variant: "destructive",
              });
              return;
            }
            // 마지막 점검 단계에서 일정 일괄 생성. 실패 시 다음 단계로 진행하지 않는다.
            const remaining = sequence.slice(stepIdx + 1).find((k) => k.startsWith("ins-"));
            if (!remaining) {
              setBusy(true);
              const ok = await persistInspections();
              setBusy(false);
              if (!ok) return;
            }
            goNext();
          }}
          busy={busy}
        />
      )}

      {step === "logo" && (
        <LogoStep
          building={building}
          onChange={saveLogo}
          onPrev={goPrev}
          onNext={goNext}
          onSkip={goNext}
        />
      )}

      {step === "bill" && (
        <BillStep
          busy={billBusy}
          preview={billOcr}
          onPickCamera={() => billCamRef.current?.click()}
          onPickFile={() => billFileRef.current?.click()}
          onPrev={goPrev}
          onNext={goNext}
          onSkip={goNext}
        />
      )}

      {step === "done" && (
        <DoneStep busy={busy} building={building} onStart={finalize} />
      )}

      {/* 숨겨진 파일 입력 */}
      <input
        ref={billCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) runBillOcr(f);
        }}
      />
      <input
        ref={billFileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) runBillOcr(f);
        }}
      />
    </Shell>
  );
}

/* ───────────────────────── Shell ───────────────────────── */

function Shell({
  stepIdx,
  total,
  onClose,
  hideProgress,
  children,
}: {
  stepIdx: number;
  total: number;
  onClose: () => void;
  hideProgress?: boolean;
  children: React.ReactNode;
}) {
  const percent = Math.round(((stepIdx + 1) / total) * 100);
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md min-h-screen flex flex-col bg-white">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-slate-400">
              {hideProgress ? "관리의달인 시작하기" : ""}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          </div>
          {!hideProgress && (
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        <div className="flex-1 px-4 py-5">{children}</div>
      </div>
    </div>
  );
}

function NavBar({
  onPrev,
  onNext,
  onSkip,
  nextLabel = "다음",
  nextDisabled,
  busy,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="mt-6 space-y-2">
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || !onNext || busy}
        className="w-full h-12 inline-flex items-center justify-center gap-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{nextLabel}<ChevronRight className="w-4 h-4" /></>}
      </button>
      <div className="flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev || busy}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 px-2 py-2"
        >
          <ChevronLeft className="w-4 h-4" /> 이전
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} disabled={busy} className="text-slate-500 hover:text-slate-800 px-2 py-2">
            건너뛰기
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── 단계: 인트로 ───────────────────────── */

function IntroStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center text-center pt-6">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-blue-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">관리의달인이 도와드릴게요</h1>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        매일 쓰는 보고서·공고문·기안서를 AI가 자동으로 작성해 드려요.<br/>
        주소만 알려주시면, 건축물대장에서 정보를 자동으로 가져옵니다.
      </p>

      <div className="grid grid-cols-1 gap-3 w-full mt-6">
        <FeatureCard icon={<FileText className="w-5 h-5 text-blue-600" />} title="관리비 보고서 자동화" desc="고지서 한 장이면 표·차트가 알아서 채워져요." />
        <FeatureCard icon={<Megaphone className="w-5 h-5 text-emerald-600" />} title="공고문 즉시 생성" desc="단수·정전·점검 안내문을 1분 안에 완성." />
        <FeatureCard icon={<ScrollText className="w-5 h-5 text-purple-600" />} title="기안서·결재 한 곳에서" desc="법정점검 일정도 자동으로 관리돼요." />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-7 w-full h-12 inline-flex items-center justify-center gap-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
      >
        시작하기 <ChevronRight className="w-4 h-4" />
      </button>
      <p className="text-[11px] text-slate-400 mt-2">약 1분이면 끝나요. 모르는 건 비워두셔도 됩니다.</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-left">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── 단계: 주소 ───────────────────────── */

function AddressStep({
  ready,
  building,
  onSearch,
  onPrev,
}: {
  ready: boolean;
  building: BuildingState;
  onSearch: () => void;
  onPrev: () => void;
}) {
  const has = !!building.addressFull;
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">건물 주소를 알려주세요</h2>
      <p className="text-sm text-slate-500 mt-1">주소만 입력하면 건축물대장에서 정보를 자동으로 가져옵니다.</p>

      {has && (
        <div className="mt-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="min-w-0 text-xs">
              <div className="text-emerald-800 font-medium">선택된 주소</div>
              <div className="text-slate-700 mt-0.5">{building.addressFull}</div>
              {building.addressJibun && <div className="text-slate-500 mt-0.5">(지번) {building.addressJibun}</div>}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSearch}
        disabled={!ready}
        className="mt-5 w-full h-12 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
      >
        <MapPin className="w-4 h-4" />
        {has ? "주소 다시 검색" : ready ? "주소 검색" : "주소 검색 모듈 로딩 중..."}
      </button>

      <ul className="mt-5 space-y-2 text-xs text-slate-500">
        <li className="flex gap-2"><Search className="w-3.5 h-3.5 text-slate-400 mt-0.5" /> 도로명·지번 모두 검색돼요.</li>
        <li className="flex gap-2"><Sparkles className="w-3.5 h-3.5 text-slate-400 mt-0.5" /> 건축물대장 정보(준공일·면적·층수)는 자동으로 채워져요.</li>
      </ul>

      <NavBar onPrev={onPrev} />
    </div>
  );
}

/* ───────────────────────── 단계: 로딩 ───────────────────────── */

function LoadingStep() {
  return (
    <div className="flex flex-col items-center text-center py-16">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      <h2 className="mt-5 text-lg font-bold text-slate-900">건물 정보를 가져오는 중이에요</h2>
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
        건축물대장에서 준공일·면적·용도·층수 등을 불러옵니다.<br/>
        보통 5~10초 정도 걸려요.
      </p>
    </div>
  );
}

/* ───────────────────────── 단계: 정보 확인 ───────────────────────── */

function InfoStep({
  building,
  safety,
  onPrev,
  onNext,
}: {
  building: BuildingState;
  safety: SafetyResult | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const safetyType = safety?.safetyManagerType ?? null;

  const grade =
    safety?.fields?.find((f) => f.required && f.grade)?.grade ??
    null;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">건물 정보를 확인해 주세요</h2>
      <p className="text-sm text-slate-500 mt-1">아래 정보는 건축물대장에서 자동으로 가져왔어요.</p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        <Row label="건물명" value={building.name || "-"} />
        <Row label="주소" value={building.addressFull || "-"} small />
        <Row label="준공일" value={building.completionDate || "(미상)"} />
        <Row label="연면적" value={building.totalArea ? `${Number(building.totalArea).toLocaleString()} ㎡` : "-"} />
        <Row label="층수" value={`지상 ${building.totalFloors || 0}층 / 지하 ${building.basementFloors || 0}층`} />
        <Row label="세대수" value={building.totalUnits ? `${building.totalUnits} 세대` : "-"} />
        <Row label="용도" value={building.buildingUsage || "-"} />
      </div>

      {(safetyType || grade) && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-blue-800">안전관리자 선임 등급</div>
              <div className="text-sm text-slate-800 mt-0.5">
                {grade ? <span className="font-medium">{grade}</span> : null}
                {grade && safetyType ? " · " : null}
                {safetyType}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">법정 기준에 맞춰 자동으로 추천된 등급이에요. 다음 단계에서 점검 일정을 만들어 드릴게요.</p>
            </div>
          </div>
        </div>
      )}

      <NavBar onPrev={onPrev} onNext={onNext} nextLabel="이대로 진행할게요" />
    </div>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="px-3 py-2.5 flex items-start gap-2">
      <div className="w-20 shrink-0 text-xs text-slate-500">{label}</div>
      <div className={`flex-1 text-slate-800 ${small ? "text-xs" : "text-sm"}`}>{value}</div>
    </div>
  );
}

/* ───────────────────────── 단계: 점검 ───────────────────────── */

function InspectionStep({
  stepKey,
  completionDate,
  state,
  onChange,
  onPrev,
  onNext,
  busy,
}: {
  stepKey: StepKey;
  completionDate: string;
  state: { date: string; unknown: boolean };
  onChange: (patch: Partial<{ date: string; unknown: boolean }>) => void;
  onPrev: () => void;
  onNext: () => void;
  busy?: boolean;
}) {
  const def = INS_DEFS[stepKey];
  return (
    <div>
      <div className="flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-bold text-slate-900">{def.title}</h2>
      </div>
      <p className="text-sm text-slate-500 mt-1">가장 최근 점검일을 알려주세요.</p>

      <div className="mt-5">
        <label className="text-xs text-slate-600">최근 점검일</label>
        <input
          type="date"
          value={state.unknown ? "" : state.date}
          disabled={state.unknown}
          onChange={(e) => onChange({ date: e.target.value })}
          className="mt-1 w-full h-12 px-3 border border-slate-300 rounded-xl text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      <label className="mt-3 flex items-start gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
        <input
          type="checkbox"
          checked={state.unknown}
          onChange={(e) => onChange({ unknown: e.target.checked, date: e.target.checked ? "" : state.date })}
          className="mt-0.5"
        />
        <div className="text-xs">
          <div className="font-medium text-slate-800">잘 모르겠어요</div>
          <div className="text-slate-500 mt-0.5">
            준공일({completionDate || "미상"}) 기준으로 다음 점검일을 임시로 잡아 드릴게요. 나중에 실제 점검일을 알게 되면 바로 수정할 수 있어요.
          </div>
        </div>
      </label>

      <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400">
        <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{def.help}</span>
      </div>

      <NavBar onPrev={onPrev} onNext={onNext} busy={busy} />
    </div>
  );
}

/* ───────────────────────── 단계: 로고 ───────────────────────── */

function LogoStep({
  building,
  onChange,
  onPrev,
  onNext,
  onSkip,
}: {
  building: BuildingState;
  onChange: (url: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-bold text-slate-900">건물 로고 (선택)</h2>
      </div>
      <p className="text-sm text-slate-500 mt-1">
        업로드한 로고는 공고문·점검 안내문·기안서 상단에 자동으로 표시돼요. 등록하지 않으면 건물명이 글자로 표시됩니다.
      </p>

      <div className="mt-5">
        <PhotoUploadField
          label="로고 이미지 (PNG · JPG)"
          value={building.logoUrl}
          onChange={onChange}
        />
      </div>

      <NavBar onPrev={onPrev} onNext={onNext} onSkip={onSkip} nextLabel="다음" />
    </div>
  );
}

/* ───────────────────────── 단계: 관리비 OCR ───────────────────────── */

function BillStep({
  busy,
  preview,
  onPickCamera,
  onPickFile,
  onPrev,
  onNext,
  onSkip,
}: {
  busy: boolean;
  preview: { id: number; billingMonth: string; totalAmount: number; lineItems: Record<string, number> } | null;
  onPickCamera: () => void;
  onPickFile: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-bold text-slate-900">최근 관리비 고지서 (선택)</h2>
      </div>
      <p className="text-sm text-slate-500 mt-1">
        가장 최근 한 달치 고지서 1장을 올리면 항목·금액을 자동 인식해 첫날부터 데이터가 채워져요.
      </p>

      <div className="mt-4">
        {busy ? (
          <div className="w-full p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            <span className="text-xs text-slate-600">관리비 내역을 AI 분석 중이에요...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPickCamera}
              className="p-5 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition flex flex-col items-center gap-2"
            >
              <Camera className="w-6 h-6 text-slate-600" />
              <span className="text-xs text-slate-700 font-medium">촬영</span>
            </button>
            <button
              type="button"
              onClick={onPickFile}
              className="p-5 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition flex flex-col items-center gap-2"
            >
              <Upload className="w-6 h-6 text-slate-600" />
              <span className="text-xs text-slate-700 font-medium">갤러리·파일</span>
            </button>
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">{preview.billingMonth} 인식 완료</span>
          </div>
          <div className="text-xs text-slate-700">
            총액 <span className="font-mono font-bold">₩{Math.round(preview.totalAmount).toLocaleString()}</span>
          </div>
          {Object.keys(preview.lineItems || {}).length > 0 && (
            <div className="text-[11px] text-slate-600">
              {Object.entries(preview.lineItems).slice(0, 5).map(([k, v]) => `${k} ₩${Math.round(v).toLocaleString()}`).join(" · ")}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-3">건너뛰어도 나중에 회계 메뉴에서 추가할 수 있어요.</p>

      <NavBar onPrev={onPrev} onNext={onNext} onSkip={onSkip} nextLabel={preview ? "다음" : "다음"} />
    </div>
  );
}

/* ───────────────────────── 단계: 완료 ───────────────────────── */

function DoneStep({ busy, building, onStart }: { busy: boolean; building: BuildingState; onStart: () => void }) {
  return (
    <div className="flex flex-col items-center text-center pt-8">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
        <PartyPopper className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">준비 완료!</h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        {building.name || "건물"} 운영을 시작할 수 있어요.<br />
        법정점검 일정과 하자담보 D-Day가 자동으로 표시됩니다.
      </p>

      <ul className="mt-6 w-full space-y-2 text-left">
        <DoneRow text="건물 정보가 등록되었어요" />
        <DoneRow text="안전관리 등급이 분석되었어요" />
        <DoneRow text="법정점검 일정이 생성되었어요" />
      </ul>

      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="mt-7 w-full h-12 inline-flex items-center justify-center gap-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>홈으로 이동<ChevronRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

function DoneRow({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      <span className="text-sm text-slate-800">{text}</span>
    </li>
  );
}
