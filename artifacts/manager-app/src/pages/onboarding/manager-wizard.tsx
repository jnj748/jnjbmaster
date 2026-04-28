// [Task #174] 관리소장 모바일 우선 온보딩 위저드.
// 한 화면 = 한 단계. 압박 어휘(반드시/필수/권장)를 빼고, AI 자동 입력과
// 준공일 기준 폴백을 적극 활용해 가입 마찰을 낮춥니다.
import { useEffect, useMemo, useState } from "react";
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
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { formatPhoneNumberPartial } from "@/lib/format-korean";
import { LegalAppointmentList } from "@/components/building-setup/legal-appointment-list";
import type { AppointmentField } from "@/components/building-setup/types";
import {
  getGetDashboardAlertsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

// [건물 등록 SoT] window.daum 글로벌 타입 정의는 building-setup.tsx 에 단일
// 선언이 있다. 동일 글로벌을 여기서 또 declare 하면 modifier 차이로
// TS2687/TS2717 이 발생하므로 import 만 한다.

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
  | "name"
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
  // [Task #406] 위저드 건물명 입력 단계에서 함께 받는 관리사무소 대표 전화번호.
  // 표제부에는 없는 직접 입력 항목. 빈 문자열 허용(선택).
  managementOfficePhone: string;
  // [Task #328] 표제부/총괄표제부 응답 원본. 위저드 lookup-register 응답에서
  // raw 를 받아 두었다가 건물 저장 payload 에 함께 보내 buildings.register_data 에 보관한다.
  registerData?: {
    title?: Record<string, unknown> | null;
    recap?: Record<string, unknown> | null;
  } | null;
  // [Task #489] 건축물대장 관리PK(mgmBldrgstPk). 위저드에서 lookup-register 응답으로 받은
  // 값을 슬롯에 보존했다가 POST/PUT 페이로드에 그대로 실어 buildings.building_register_pk
  // 컬럼을 NULL 이 아닌 상태로 저장한다. 호실 일괄 가져오기 게이트와 백엔드 매칭에 사용.
  buildingRegisterPk?: string | null;
}

// [Task #501] 백엔드 calculate-safety 응답 구조와 정합한 타입.
//   status / pendingInputs 가 새로 내려오므로 LegalAppointmentList 가
//   "선임 필요 / 확인 필요 / 선임 불요" 3-상태로 분기 렌더링한다.
type SafetyStatus = "required" | "pending_input" | "not_required";
interface SafetyField {
  field: string;
  required: boolean;
  status?: SafetyStatus;
  grade?: string | null;
  type?: string | null;
  legalBasis?: string;
  notes: string[];
  pendingInputs?: string[];
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
  managementOfficePhone: "",
  registerData: null,
  // [Task #489] 신규 위저드 진입 시 식별자는 비어 있다.
  buildingRegisterPk: null,
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
  const queryClient = useQueryClient();

  // [Task #278] 위저드의 건물 저장 직후 (POST/PUT/finalize/X 닫기 무관) 항상
  // 호출되는 멱등 시드 + 대시보드 캐시 무효화 헬퍼. 비차단으로 처리하고,
  // 시드 응답의 seeded/skipped 값을 디버깅 로그로 남겨 회귀 추적을 돕는다.
  async function seedTestInspectionsAndInvalidate(origin: string) {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/buildings/seed-test-inspections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));
      // eslint-disable-next-line no-console
      console.debug("[manager-wizard] seed-test-inspections", origin, {
        status: r.status,
        seeded: j?.seeded,
        skipped: j?.skipped,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.debug("[manager-wizard] seed-test-inspections failed", origin, e);
    } finally {
      // 시드 성공/실패와 무관하게 대시보드 알림·요약 쿼리를 무효화해
      // 사용자가 대시보드로 이동하자마자 (테스트업무) 3건이 즉시 보이게 한다.
      void queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      // [Task #489] BuildingProvider 캐시(`["building","my", userId]`) 도 함께 무효화한다.
      //   위저드에서 막 저장한 건물명/시도·시군구/식별자가 즉시 RFQ 다이얼로그·다른
      //   화면에 반영되도록 보장(stale 캐시 때문에 "남은 필수 항목: 건물 정보" 가
      //   표기되는 회귀를 차단). userId 가 무엇이든 prefix 매칭으로 한 번에 처리.
      void queryClient.invalidateQueries({ queryKey: ["building", "my"] });
    }
  }

  const [step, setStep] = useState<StepKey>("intro");
  const [building, setBuilding] = useState<BuildingState>(EMPTY);
  const [safety, setSafety] = useState<SafetyResult | null>(null);
  const [postcodeReady, setPostcodeReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // 점검일 입력 상태: stepKey -> { date | "", unknown }
  const [insState, setInsState] = useState<Record<string, { date: string; unknown: boolean }>>({});

  // [Task #227] 관리소장 중복 가입 차단 안내. 주소 검색 직후 사전 점검 결과 또는 서버 409 응답을 화면에 노출한다.
  const [dupMessage, setDupMessage] = useState<string | null>(null);

  // 관리비 OCR 상태
  const [billOcr, setBillOcr] = useState<null | { id: number; billingMonth: string; totalAmount: number; lineItems: Record<string, number> }>(null);
  const [billBusy, setBillBusy] = useState(false);
  // [Task #507] 촬영/갤러리·파일 분리 버튼을 단일 트리거 + 공용 시트로 통일.
  const [billPickerOpen, setBillPickerOpen] = useState(false);

  // ── 부팅: 다음 우편번호 SDK + 기존 건물 로드 ──
  useEffect(() => {
    // [Task #489] use-building-setup 와 동일하게 "스크립트 태그 존재"가 아니라
    //   "window.daum.Postcode 가 실제로 정의됐는지" 를 확인한 뒤 게이트를 푼다.
    //   기존 코드는 위저드 → 건물설정 → 위저드 재진입 등의 시나리오에서 SDK 가
    //   아직 준비되지 않은 채 ready=true 가 되면서 .open() 호출 시 토스트 안내가
    //   잘못 노출되는 회귀를 야기했다. 폴링은 100ms × 최대 100회(약 10초)로 상한을
    //   두어 네트워크/CSP/광고차단으로 SDK 가 영영 안 뜨는 환경에서 무한 타이머가
    //   돌지 않도록 한다.
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;
    const ensureReady = () => {
      if (cancelled) return;
      const w = window as Window & { daum?: { Postcode?: unknown } };
      if (w.daum?.Postcode) {
        setPostcodeReady(true);
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        toast({
          title: "주소검색 모듈을 불러오지 못했습니다. 네트워크를 확인 후 새로고침해 주세요.",
          variant: "destructive",
        });
        return;
      }
      window.setTimeout(ensureReady, 100);
    };
    if (!document.getElementById("daum-postcode-script")) {
      const s = document.createElement("script");
      s.id = "daum-postcode-script";
      s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      s.onload = ensureReady;
      s.onerror = () => {
        if (cancelled) return;
        toast({
          title: "주소검색 모듈을 불러오지 못했습니다. 네트워크를 확인해 주세요.",
          variant: "destructive",
        });
      };
      document.head.appendChild(s);
    } else {
      ensureReady();
    }
    if (!token) return () => { cancelled = true; };
    fetch(`${API_BASE}/buildings/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.building) hydrateBuilding(d.building);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
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
      // [Task #406] 위저드 재진입 시 기 입력된 관리사무소 전화번호를 그대로 보여준다.
      managementOfficePhone:
        (b.managementOfficePhone as string) ?? prev.managementOfficePhone ?? "",
      // [Task #328] 기존 building_register_data 를 보존한다. lookup-register 를 다시
      // 실행하지 않은 채 위저드를 저장해도 raw 응답이 사라지지 않도록 한다.
      registerData:
        (b.registerData as BuildingState["registerData"]) ?? prev.registerData ?? null,
      // [Task #489] 기존 건물 재진입 시 서버에서 받은 mgmBldrgstPk 를 위저드 상태에
      // 복원한다. 서버 응답이 비었더라도 위저드에서 새로 받은 값이 있다면 보존한다
      // (use-building-setup 의 동일 위치 머지 규칙과 동일).
      buildingRegisterPk:
        (b.buildingRegisterPk as string | null) ?? prev.buildingRegisterPk ?? null,
    }));
  }

  // ── 단계 시퀀스 (기계설비는 연면적 10,000㎡ 이상에서만 노출) ──
  const sequence: StepKey[] = useMemo(() => {
    const includeMech = Number(building.totalArea || 0) >= 10000;
    // [Task #340] info(건축물대장 자동조회 결과) 단계 직후 사용자가 실제로 사용할 건물명을
    // 입력/확정하는 name 단계를 추가한다. buildings.name 컬럼을 그대로 사용해 모든 출력
    // (관리사무소·알림·견적서 등)이 사용자가 입력한 이름으로 일관되게 표시되도록 한다.
    const base: StepKey[] = ["intro", "address", "loading", "info", "name", "ins-fire", "ins-elec", "ins-bsafe"];
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
    // [Task #227] 새 주소를 다시 검색할 때 직전 차단 안내를 초기화한다.
    setDupMessage(null);
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

        // [Task #227] 주소 선택 직후 관리소장 중복 가입 사전 점검. 중복이면 안내만 띄우고
        // 위저드는 다음 단계로 진행하지 않는다(주소 다시 검색 가능).
        try {
          const params = new URLSearchParams({ addressJibun: next.addressJibun || "" });
          const r = await fetch(`${API_BASE}/buildings/check-manager?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.exists) {
            setDupMessage(j.message || "이미 해당 건물의 가입자가 존재합니다. 자세한 문의는 관리의달인으로 문의주시기 바랍니다. 1800-0416");
            setStep("address");
            return;
          }
        } catch {/* 사전 점검 실패는 무시하고 서버단 검증으로 폴백 */}

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
          // [Task #328] 표제부/총괄표제부 응답 원본도 함께 보관해 저장 시 함께 전송한다.
          const rawFromServer = (j as { raw?: { title?: unknown; recap?: unknown } }).raw;
          const nextRegisterData = rawFromServer && (rawFromServer.title || rawFromServer.recap)
            ? {
                title: (rawFromServer.title as Record<string, unknown> | null) ?? null,
                recap: (rawFromServer.recap as Record<string, unknown> | null) ?? null,
              }
            : null;
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
            registerData: nextRegisterData ?? merged.registerData ?? null,
            // [Task #489] 건축물대장 관리PK(mgmBldrgstPk) 를 위저드 상태에 즉시 반영해
            // 이후 POST/PUT 페이로드에 함께 실려 buildings.building_register_pk 컬럼이
            // NULL 로 남지 않도록 한다. 빈 응답이 오면 기존 값을 보존한다.
            buildingRegisterPk: x.mgmBldrgstPk
              ? String(x.mgmBldrgstPk)
              : merged.buildingRegisterPk ?? null,
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
        // [Task #328] 표제부/총괄표제부 응답 원본을 함께 전송해 buildings.register_data 컬럼에 저장한다.
        registerData: merged.registerData ?? null,
        // [Task #489] mgmBldrgstPk 영속화. 서버 BUILDING_TEXT_FIELDS 화이트리스트가
        // 이미 buildingRegisterPk 를 허용하므로 페이로드에 함께 실어 보내면
        // POST/PUT 어느 경로로 끝내든 buildings.building_register_pk 컬럼이 채워진다.
        buildingRegisterPk: merged.buildingRegisterPk ?? null,
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
        // [Task #227] 서버 우회 차단(409 매니저 중복) 응답을 동일한 한국어 안내로 화면에 띄운다.
        if (saveRes.status === 409 && typeof saveJson.error === "string") {
          setDupMessage(saveJson.error);
        } else {
          toast({ title: saveJson.error || "건물 정보 저장에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
        }
        setBuilding((prev) => ({ ...prev, ...merged, id: prev.id }));
        setStep("address");
        return;
      }
      merged.id = saveJson.building.id;
      // [Task #489] 저장 응답으로 받은 building 행에서 식별자/주소·시도/시군구·이름 등
      // 을 위저드 상태로 되돌려 채워, 이후 단계(name/PUT, finalize/closeWizard)에서
      // 누락 없이 사용할 수 있게 한다(특히 building_register_pk).
      const saved = saveJson.building as Record<string, unknown>;
      merged.buildingRegisterPk =
        (saved.buildingRegisterPk as string | null) ?? merged.buildingRegisterPk ?? null;
      merged.name = (saved.name as string) || merged.name;
      merged.sido = (saved.sido as string) ?? merged.sido;
      merged.sigungu = (saved.sigungu as string) ?? merged.sigungu;
      setBuilding(merged);
      // [Task #278] 건물 정보 저장 성공 직후 (POST/PUT 무관) 멱등 시드 보장.
      // finalize/closeWizard 의 다중 안전망은 그대로 두고, 저장→다음 단계 사이의
      // 빈 구간에서도 (테스트업무) 3건이 누락 없이 노출되도록 한다.
      void seedTestInspectionsAndInvalidate(method === "POST" ? "post-save" : "put-save");
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

  // [Task #340/#406] 사용자가 입력한 건물명(buildings.name)과 관리사무소 전화번호
  //   (buildings.management_office_phone)를 한 번의 PUT 으로 함께 갱신한다.
  //   - 건물명: trim 후 빈 문자열이면 안내 토스트 후 false 반환(다음 단계로 진행하지 않음).
  //   - 전화번호: 선택 항목. 빈 문자열이면 PUT 페이로드에서 빼지 않고 빈 문자열로
  //     보내어 사용자가 명시적으로 지운 경우도 반영되도록 한다.
  //   - 서버 저장 실패 시 토스트 후 false 반환.
  //   - 성공 시 로컬 building.name / managementOfficePhone state 도 동기화.
  async function saveBuildingNameAndPhone(
    rawName: string,
    rawPhone: string,
  ): Promise<boolean> {
    const name = rawName.trim();
    const phone = rawPhone.trim();
    if (!name) {
      toast({ title: "건물명을 입력해 주세요.", variant: "destructive" });
      return false;
    }
    if (!building.id) {
      // 이론상 info 단계에서 이미 저장돼 있어야 한다. 안전망으로 state만 갱신.
      setBuilding((p) => ({ ...p, name, managementOfficePhone: phone }));
      return true;
    }
    try {
      const res = await fetch(`${API_BASE}/buildings/${building.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, managementOfficePhone: phone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: j.error || "건물명 저장에 실패했습니다. 다시 시도해 주세요.",
          variant: "destructive",
        });
        return false;
      }
      setBuilding((p) => ({ ...p, name, managementOfficePhone: phone }));
      // [Task #489] 이름이 막 저장됐으니 BuildingProvider 캐시도 즉시 무효화한다.
      //   RFQ 다이얼로그의 buildingReady 체크가 stale 캐시(=빈 이름)로 막히지 않게 한다.
      void queryClient.invalidateQueries({ queryKey: ["building", "my"] });
      return true;
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "건물명 저장에 실패했습니다.",
        variant: "destructive",
      });
      return false;
    }
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
  // [Task #410] setPreference 실패 시 silent swallow → 대시보드 이동 → 다시 위저드로
  // 튕기는 무한 루프를 차단한다. preference 저장이 실패하면 사용자에게 알리고
  // 위저드에 머무른 채 다시 시도할 수 있게 한다.
  async function finalize() {
    setBusy(true);
    try {
      try {
        await setPreference("started");
      } catch (e) {
        console.error("[finalize] setPreference failed", e);
        toast({
          title: "마지막 저장에 실패했어요. 잠시 후 ‘완료’를 다시 눌러 주세요.",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
        return; // 위저드에 머무른다 — 대시보드로 이동하지 않음.
      }
      if (building.id) {
        await fetch(`${API_BASE}/buildings/${building.id}/lock-address`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch((e) => {
          console.error("[finalize] lock-address failed", e);
        });
        // [Task #268/#278] 정상 완료 경로에서도 (테스트업무) 3건 누락이 없는지 한 번 더
        // 멱등 보장 + 대시보드 캐시 무효화. 첫 POST /buildings 에서 이미 시드돼 있으면
        // 추가 insert 없음. 새로고침 없이도 즉시 두 섹션이 채워진다.
        await seedTestInspectionsAndInvalidate("finalize");
      }
      setLocation("/");
    } finally {
      setBusy(false);
    }
  }

  // ── 화면 렌더 ──
  // [Task #404] X(닫기) 동작을 두 갈래로 분기한다.
  //   A) building.id 가 아직 없는 경우(주소 검색 전): 어떤 변경도 만들지 않고
  //      `/` 로 이동한다. ManagerOnboardingRedirect 가 다음 진입 시 자동으로
  //      `/onboarding/manager` 로 강제하므로, 주소 없이 대시보드로 들어가는
  //      경로가 생기지 않는다.
  //   B) building.id 가 이미 있는 경우(주소 입력 + 건물 저장 완료): 사용자가
  //      "주소 입력 후 꺼지면 건물명은 API에서, 점검일은 사용승인일 기준으로
  //      자동 생성하고 위저드 마친 것으로" 라고 요청한 동작을 그대로 수행한다.
  //      - 건물명: lookup-register 응답으로 buildings.name 에 이미 저장됨(추가 작업 없음)
  //      - 점검일 4종: useFallbackCompletionDate=true 로 사용승인일 기준 산정
  //      - finalize 와 동일하게 lock-address + preference=started + 시드 + 캐시 무효화
  async function closeWizard() {
    if (!building.id) {
      setLocation("/");
      return;
    }
    setBusy(true);
    try {
      // [Task #404] 점검 대상은 sequence(연면적 1만㎡ 조건 포함)와 동일 기준으로 제한.
      //   - 1만㎡ 미만 건물은 기계설비(ins-mech) 미포함을 그대로 유지해 일반 진행 흐름과
      //     동일한 결과(법정 점검 3종)가 나오도록 한다.
      const inspectionDates: Record<string, Record<string, string>> = {};
      for (const key of Object.keys(INS_DEFS)) {
        if (!sequence.includes(key as StepKey)) continue;
        const def = INS_DEFS[key];
        if (!inspectionDates[def.category]) inspectionDates[def.category] = {};
        inspectionDates[def.category][def.name] = "";
      }
      // [Task #404] 자동 점검 생성이 실패하면 위저드 종료 처리(preference=started)
      //   를 하지 않는다. 사용자에게 토스트로 알리고 위저드 화면에 머물러 재시도할 수 있게 한다.
      const autoRes = await fetch(`${API_BASE}/buildings/auto-schedule-inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          buildingId: building.id,
          inspectionDates,
          useFallbackCompletionDate: true,
        }),
      }).catch(() => null);
      if (!autoRes || !autoRes.ok) {
        toast({ title: "법정 점검 일정 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", variant: "destructive" });
        return;
      }
      // [Task #410] finalize() 와 동일한 무한 루프 방지: setPreference 가 실패하면
      // 토스트로 알리고 위저드에 머무른다(setLocation 호출 안 함).
      try {
        await setPreference("started");
      } catch (e) {
        console.error("[closeWizard] setPreference failed", e);
        toast({
          title: "마지막 저장에 실패했어요. 잠시 후 닫기를 다시 눌러 주세요.",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
        return;
      }
      await fetch(`${API_BASE}/buildings/${building.id}/lock-address`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch((e) => {
        console.error("[closeWizard] lock-address failed", e);
      });
      await seedTestInspectionsAndInvalidate("closeWizard-auto");
      setLocation("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      stepIdx={Math.max(0, stepIdx)}
      total={totalSteps}
      onClose={closeWizard}
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
          dupMessage={dupMessage}
        />
      )}

      {step === "loading" && <LoadingStep />}

      {step === "info" && (
        <InfoStep
          building={building}
          safety={safety}
          onPrev={() => setStep("address")}
          onNext={() => setStep("name")}
        />
      )}

      {step === "name" && (
        <BuildingNameStep
          initialName={building.name}
          initialPhone={building.managementOfficePhone}
          busy={busy}
          onPrev={goPrev}
          onSubmit={async (vals) => {
            setBusy(true);
            const ok = await saveBuildingNameAndPhone(vals.name, vals.managementOfficePhone);
            setBusy(false);
            if (ok) goNext();
          }}
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
          onPick={() => setBillPickerOpen(true)}
          onPrev={goPrev}
          onNext={goNext}
          onSkip={goNext}
        />
      )}

      {step === "done" && (
        <DoneStep busy={busy} building={building} onStart={finalize} />
      )}

      {/* [Task #507] 단일 트리거 + 공용 시트(촬영/앨범에서 선택/파일에서 선택). */}
      <AttachmentPickerSheet
        open={billPickerOpen}
        onOpenChange={setBillPickerOpen}
        title="고지서 첨부"
        description="JPG · PNG · HEIC · PDF, 최대 10MB"
        onPick={(f) => runBillOcr(f)}
        fileOption={{
          accept: "application/pdf",
          label: "파일에서 선택",
          description: "PDF 고지서",
        }}
        testId="onboarding-bill-picker"
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
  // [Task #403] 헤더가 세로 공간을 너무 차지한다는 사용자 피드백.
  //   - hideProgress=true(인트로) 에서는 빈 "관리의달인 시작하기" 라벨이 한 줄을
  //     통째로 차지했었다 → 라벨 제거, X 만 우측 정렬해 단일 행 헤더로 축소.
  //   - hideProgress=false 에서는 진행 막대를 X 옆에 합쳐 한 행으로 노출,
  //     상하 패딩도 줄여 hero 가 잘리지 않도록 한다.
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md min-h-screen flex flex-col bg-white">
        <div className="px-4 py-2 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            {!hideProgress ? (
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600 p-1 -m-1" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 px-4 py-3">{children}</div>
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
  // [Task #403] 시니어 가독성을 위해 본문 폰트는 유지하면서 hero 의 상단 여백,
  //   sparkles 아이콘 박스, 카드 그리드/시작 버튼 사이 간격만 좁혀 한 화면에
  //   카드 3장 + 시작 버튼이 들어오도록 한다.
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-2">
        <Sparkles className="w-6 h-6 text-blue-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">관리의달인이 도와드릴게요</h1>
      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
        매일 쓰는 보고서·공고문·기안서를 AI가 자동으로 작성해 드려요.<br/>
        주소만 알려주시면, 건축물대장에서 정보를 자동으로 가져옵니다.
      </p>

      <div className="grid grid-cols-1 gap-2 w-full mt-4">
        <FeatureCard icon={<FileText className="w-5 h-5 text-blue-600" />} title="관리문서 자동생성" desc="공고문, 보고서, 기안서 등 모든 서류가 자동으로 생성되요" />
        <FeatureCard icon={<Megaphone className="w-5 h-5 text-emerald-600" />} title="보고서 자동생성" desc="일일, 주간, 월간 보고서가 자동으로 생성되요" />
        <FeatureCard icon={<ScrollText className="w-5 h-5 text-purple-600" />} title="법정점검검사 알림" desc="필수 법정점검과 검사를 주기에 맞춰 자동으로 알려줘요" />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-4 w-full h-12 inline-flex items-center justify-center gap-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
      >
        시작하기 <ChevronRight className="w-4 h-4" />
      </button>
      <p className="text-[11px] text-slate-400 mt-1.5">약 1분이면 끝나요. 모르는 건 비워두셔도 됩니다.</p>
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
  dupMessage,
}: {
  ready: boolean;
  building: BuildingState;
  onSearch: () => void;
  onPrev: () => void;
  dupMessage?: string | null;
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

      {/* [Task #227] 관리소장 중복 가입 차단 안내 */}
      {dupMessage && (
        <div
          role="alert"
          data-testid="manager-duplicate-notice"
          className="mt-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800 leading-relaxed"
        >
          {dupMessage}
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

      {/* [Task #501] 6종 법정 선임 항목을 "선임 필요 / 확인 필요 / 선임 불요" 3-상태로 모두 노출.
          입력값 부족(전기 용량/가스 사용량/승강기 대수 등) 항목이 보이지 않고 사라지지 않도록 한다. */}
      {safety?.fields && safety.fields.length > 0 && (
        <div className="mt-4">
          <LegalAppointmentList fields={safety.fields as AppointmentField[]} />
        </div>
      )}

      {/* [Task #340] 다음 단계에서 사용자가 실제 사용할 건물명을 직접 확인·수정한다. */}
      <NavBar onPrev={onPrev} onNext={onNext} nextLabel="건물명 확인하기" />
    </div>
  );
}

/* ───────────────────────── 단계: 건물명 입력/확인 ───────────────────────── */

// [Task #340] 건축물대장 자동 입력값(bldNm)이 실제 사용자가 부르는 이름과 다른 경우가 많아
// 사용자가 직접 입력/수정한 값을 buildings.name 으로 저장하는 단계. 빈 값 차단, 위저드 재진입
// 시 마지막 저장값을 기본값으로 보여 준다.
function BuildingNameStep({
  initialName,
  initialPhone,
  onPrev,
  onSubmit,
  busy,
}: {
  initialName: string;
  initialPhone: string;
  onPrev: () => void;
  onSubmit: (vals: { name: string; managementOfficePhone: string }) => void | Promise<void>;
  busy?: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");
  // [Task #406] 관리사무소 대표 전화번호. 선택 입력. 위저드 재진입 시 기존 값 표시.
  const [phone, setPhone] = useState(initialPhone ?? "");
  // 위저드 재진입/자동조회 결과 갱신 시 외부에서 들어온 initialName 을 따라간다.
  useEffect(() => {
    setName(initialName ?? "");
  }, [initialName]);
  useEffect(() => {
    setPhone(initialPhone ?? "");
  }, [initialPhone]);
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const disabled = trimmedName.length === 0;
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">실제 사용할 건물명을 입력해 주세요</h2>
      <p className="text-sm text-slate-500 mt-1 leading-relaxed">
        이 이름이 관리사무소·알림·문서·견적 요청서에 그대로 사용됩니다.
        건축물대장 이름이 실제로 부르는 이름과 다르면 수정해 주세요.
      </p>

      <div className="mt-5">
        <label htmlFor="building-name-input" className="text-xs text-slate-600">
          건물명
        </label>
        <input
          id="building-name-input"
          data-testid="building-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예) 달인아파트, 행복빌딩 1차"
          maxLength={120}
          className="mt-1 w-full h-12 px-3 border border-slate-300 rounded-xl text-sm bg-white"
          autoFocus
        />
        <p className="text-[11px] text-slate-400 mt-2">
          예: "주건축물1" 처럼 표시되었다면, 입주민·관리자가 부르는 정식 명칭으로 바꿔 주세요.
        </p>
      </div>

      {/* [Task #406] 관리사무소 대표 전화번호 — 선택 입력. 공고문/안내문/문서 발송 등에서 활용. */}
      <div className="mt-4">
        <label htmlFor="building-phone-input" className="text-xs text-slate-600">
          관리사무소 전화번호 <span className="text-slate-400">(선택)</span>
        </label>
        <input
          id="building-phone-input"
          data-testid="building-phone-input"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhoneNumberPartial(e.target.value))}
          placeholder="예) 02-1234-5678"
          maxLength={14}
          className="mt-1 w-full h-12 px-3 border border-slate-300 rounded-xl text-sm bg-white"
        />
        <p className="text-[11px] text-slate-400 mt-2">
          입주민 안내문·공고문·견적 요청서 등에서 대표 연락처로 사용됩니다. 나중에 설정에서 바꿀 수 있어요.
        </p>
      </div>

      <NavBar
        onPrev={onPrev}
        onNext={() => onSubmit({ name: trimmedName, managementOfficePhone: trimmedPhone })}
        nextLabel="저장하고 다음"
        nextDisabled={disabled}
        busy={busy}
      />
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
  onPick,
  onPrev,
  onNext,
  onSkip,
}: {
  busy: boolean;
  preview: { id: number; billingMonth: string; totalAmount: number; lineItems: Record<string, number> } | null;
  onPick: () => void;
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
          <div className="w-full p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center gap-2 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            <span className="text-sm text-slate-700 font-medium">관리비 내역을 AI 분석 중이에요</span>
            <span className="text-[11px] text-slate-500 leading-relaxed">
              관리비 고지서를 AI로 분석하는 데 1~2분 정도 걸려요.<br />
              휴대폰을 끄지 말고 잠시만 기다려 주세요.
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPick}
            className="w-full p-5 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition flex flex-col items-center gap-2"
            data-testid="onboarding-bill-trigger"
          >
            <Upload className="w-6 h-6 text-slate-600" />
            <span className="text-xs text-slate-700 font-medium">고지서 첨부</span>
            <span className="text-[10px] text-slate-500">촬영 · 앨범에서 선택 · 파일에서 선택</span>
          </button>
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
