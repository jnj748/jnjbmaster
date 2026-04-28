import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  CATEGORY_LABELS,
  INSPECTION_TYPE_LABELS,
} from "@/lib/page-constants/building-setup";
import type {
  BuildingData,
  SafetyResult,
  PresetItem,
  SelectedTask,
  InspectionDates,
} from "@/components/building-setup/types";

interface DaumPostcodeResult {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  sido: string;
  sigungu: string;
  bname: string;
  buildingName: string;
  bcode: string;
  jibunAddressEnglish: string;
  address: string;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

export const EMPTY_BUILDING: BuildingData = {
  name: "",
  addressFull: "",
  addressJibun: "",
  sido: "",
  sigungu: "",
  dong: "",
  zipCode: "",
  totalUnits: "",
  totalFloors: "",
  basementFloors: "",
  totalArea: "",
  buildingUsage: "",
  structureType: "",
  completionDate: "",
  elevatorCount: "",
  parkingSpaces: "",
  hasPlayground: false,
  hasGas: true,
  hasSepticTank: true,
  managementOfficePhone: "",
  managementOfficeFax: "",
  feeInquiryPhone: "",
  facilitySafetyPhone: "",
  logoUrl: null,
  landArea: "",
  buildingArea: "",
  buildingCoverageRatio: "",
  floorAreaRatio: "",
  electricCapacityKw: "",
  gasUsageMonthly: "",
  approvalDate: "",
  registerData: null,
  // [Task #348] 호실 일괄 가져오기 단계 게이팅에 사용. 주소→건축물대장 조회 시 저장된 PK.
  buildingRegisterPk: null as string | null,
  // [Task #516] 다동 단지의 동(棟)별 표제부 PK 캐시.
  registerDongPks: null as { mgmBldrgstPk: string; dongName: string; isMain: boolean }[] | null,
};

export function useBuildingSetup() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [building, setBuilding] = useState<BuildingData>(EMPTY_BUILDING);
  const [existingId, setExistingId] = useState<number | null>(null);
  // [Task #458] 건물정보 수정 화면의 편집 가드.
  //   - 기본 false (읽기 전용) — 진입 시 모든 입력이 비활성화돼 실수로 값이 바뀌지 않게 한다.
  //   - 사용자가 ‘수정하기’ 버튼을 눌러야 true 가 되어 입력이 풀린다.
  //   - lastSavedBuildingRef 는 ‘취소’ 시 되돌릴 마지막 저장 상태(=서버에서 마지막으로 받은 값
  //     또는 가장 최근 저장 직전의 building 스냅샷)를 보관한다.
  const [isEditing, setIsEditing] = useState(false);
  const lastSavedBuildingRef = useRef<BuildingData>(EMPTY_BUILDING);
  const [safetyResult, setSafetyResult] = useState<SafetyResult | null>(null);
  // [Task #458] 편집 진입 시 안전관리자 분석 결과를 함께 스냅샷하여, 취소 시 폼과 함께 되돌린다.
  //   (편집 도중 다시 분석을 돌려 결과가 바뀌었을 수 있는데, 취소가 폼 값을 되돌리므로
  //   분석 결과도 같이 되돌리지 않으면 화면 상태가 어긋나 보인다.)
  const lastSavedSafetyResultRef = useRef<SafetyResult | null>(null);
  const [calculatingSafety, setCalculatingSafety] = useState(false);
  const [inspectionDates, setInspectionDates] = useState<InspectionDates>({});
  const [schedulingInspections, setSchedulingInspections] = useState(false);
  const [inspectionsScheduled, setInspectionsScheduled] = useState(false);
  // [Task #297] "다음 주기 시작일을 잘 모르겠음" 토글. 켜면 표제부 사용승인일을
  //   기준으로 다음 실행일을 자동 산정해 저장한다(서버의 useFallbackCompletionDate
  //   동일 의미; 빈 lastDate 항목에 대해 fallback 적용).
  const [useApprovalDateFallback, setUseApprovalDateFallback] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const [registerPreview, setRegisterPreview] = useState<Record<string, unknown> | null>(null);
  const [areaInfo, setAreaInfo] = useState<{ floorNo: string; purposeName: string; exposArea: number; pubUseArea: number }[]>([]);
  const [postcodeLoaded, setPostcodeLoaded] = useState(false);

  const [allPresets, setAllPresets] = useState<PresetItem[]>([]);
  const allPresetsRef = useRef<PresetItem[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<SelectedTask[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customTaskName, setCustomTaskName] = useState("");
  const [customTaskCategory, setCustomTaskCategory] = useState("fire_safety");
  const [customTaskCycle, setCustomTaskCycle] = useState("12");
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchBuilding();
    fetchPresets();
    // [Task #489] 카카오 우편번호 SDK 로딩 게이트.
    //   기존 코드는 "스크립트 태그가 DOM 에 존재"하기만 하면 즉시 postcodeLoaded=true 로
    //   바꿔, `window.daum.Postcode` 가 아직 정의되지 않은 시점에 임베드 effect 가 한 번
    //   실행 후 빈 컨테이너로 닫혀 버리는 회귀를 만들었다(주소 다시 조회 다이얼로그가
    //   빈 화면으로 뜨는 원인). 스크립트 객체와 SDK 준비 여부를 분리해서, SDK 가 실제로
    //   준비된 시점에만 게이트를 풀도록 폴링한다. 폴링은 100ms × 최대 100회(약 10초)로
    //   상한을 두고, 그 시점까지도 SDK 가 안 떠 있으면 토스트로 안내한 뒤 폴링을 종료한다
    //   (네트워크/CSP/광고차단으로 스크립트 자체가 막히는 환경에서 무한 타이머 방지).
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;
    const ensureLoaded = () => {
      if (cancelled) return;
      const w = window as Window & { daum?: { Postcode?: unknown } };
      if (w.daum?.Postcode) {
        setPostcodeLoaded(true);
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
      window.setTimeout(ensureLoaded, 100);
    };
    const existing = document.getElementById("daum-postcode-script") as HTMLScriptElement | null;
    if (!existing) {
      const script = document.createElement("script");
      script.id = "daum-postcode-script";
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.onload = ensureLoaded;
      script.onerror = () => {
        if (cancelled) return;
        toast({
          title: "주소검색 모듈을 불러오지 못했습니다. 네트워크를 확인해 주세요.",
          variant: "destructive",
        });
      };
      document.head.appendChild(script);
    } else {
      ensureLoaded();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchPresets() {
    try {
      const res = await fetch(`${apiBase}/inspections/presets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setAllPresets(data);
        allPresetsRef.current = data;
      }
    } catch {}
  }

  const filteredSuggestions = useCallback(() => {
    const query = taskSearch.toLowerCase().trim();
    if (!query) return allPresets.filter((p) => !selectedTasks.some((t) => t.name === p.name));
    return allPresets.filter(
      (p) =>
        !selectedTasks.some((t) => t.name === p.name) &&
        (p.name.toLowerCase().includes(query) ||
          (CATEGORY_LABELS[p.category] || "").includes(query) ||
          (p.description || "").toLowerCase().includes(query) ||
          (INSPECTION_TYPE_LABELS[p.inspectionType] || "").includes(query))
    );
  }, [taskSearch, allPresets, selectedTasks]);

  function addPresetTask(preset: PresetItem) {
    setSelectedTasks((prev) => [
      ...prev,
      {
        name: preset.name,
        category: preset.category,
        legalCycleMonths: preset.legalCycleMonths,
        lastDate: "",
        description: preset.description,
        legalBasis: preset.legalBasis,
      },
    ]);
    setTaskSearch("");
    setShowSuggestions(false);
  }

  function addCustomTask() {
    if (!customTaskName.trim()) return;
    if (selectedTasks.some((t) => t.name === customTaskName.trim())) {
      toast({ title: "이미 추가된 업무입니다", variant: "destructive" });
      return;
    }
    setSelectedTasks((prev) => [
      ...prev,
      {
        name: customTaskName.trim(),
        category: customTaskCategory,
        legalCycleMonths: parseInt(customTaskCycle) || 12,
        lastDate: "",
      },
    ]);
    setCustomTaskName("");
  }

  function removeTask(name: string) {
    setSelectedTasks((prev) => prev.filter((t) => t.name !== name));
  }

  function updateTaskDate(name: string, date: string) {
    setSelectedTasks((prev) =>
      prev.map((t) => (t.name === name ? { ...t, lastDate: date } : t))
    );
  }

  async function fetchBuilding() {
    try {
      const res = await fetch(`${apiBase}/buildings/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.building) {
        setExistingId(data.building.id);
        const next: BuildingData = {
          name: data.building.name || "",
          addressFull: data.building.addressFull || "",
          addressJibun: data.building.addressJibun || "",
          sido: data.building.sido || "",
          sigungu: data.building.sigungu || "",
          dong: data.building.dong || "",
          zipCode: data.building.zipCode || "",
          totalUnits: data.building.totalUnits ? String(data.building.totalUnits) : "",
          totalFloors: data.building.totalFloors ? String(data.building.totalFloors) : "",
          basementFloors: data.building.basementFloors ? String(data.building.basementFloors) : "",
          totalArea: data.building.totalArea || "",
          buildingUsage: data.building.buildingUsage || "",
          structureType: data.building.structureType || "",
          completionDate: data.building.completionDate || "",
          elevatorCount: data.building.elevatorCount ? String(data.building.elevatorCount) : "",
          parkingSpaces: data.building.parkingSpaces ? String(data.building.parkingSpaces) : "",
          hasPlayground: data.building.hasPlayground || false,
          hasGas: data.building.hasGas ?? true,
          hasSepticTank: data.building.hasSepticTank ?? true,
          managementOfficePhone: data.building.managementOfficePhone || "",
          managementOfficeFax: data.building.managementOfficeFax || "",
          feeInquiryPhone: data.building.feeInquiryPhone || "",
          facilitySafetyPhone: data.building.facilitySafetyPhone || "",
          logoUrl: data.building.logoUrl ?? null,
          landArea: data.building.landArea || "",
          buildingArea: data.building.buildingArea || "",
          buildingCoverageRatio: data.building.buildingCoverageRatio || "",
          floorAreaRatio: data.building.floorAreaRatio || "",
          electricCapacityKw: data.building.electricCapacityKw || "",
          gasUsageMonthly: data.building.gasUsageMonthly || "",
          approvalDate: data.building.approvalDate || "",
          addressLocked: data.building.addressLocked || false,
          // [Task #328] 기존 건물의 표제부 원본 데이터를 위저드 상태로 복원해
          // 재저장 시 누락되지 않도록 한다(재조회를 하지 않은 경우 보존).
          registerData: data.building.registerData || null,
          buildingRegisterPk: data.building.buildingRegisterPk || null,
          // [Task #516] 다동 단지의 동(棟)별 PK 캐시. 서버 응답 그대로 보관.
          registerDongPks: (data.building as { registerDongPks?: { mgmBldrgstPk: string; dongName: string; isMain: boolean }[] | null }).registerDongPks ?? null,
        };
        setBuilding(next);
        // [Task #458] 폼이 새 데이터로 초기화될 때마다 마지막 저장 스냅샷을 갱신하고
        //   편집 모드를 강제로 종료한다. 건물 컨텍스트 변경 등으로 폼이 다시 채워질 때도
        //   읽기 전용 상태로 시작해야 한다.
        lastSavedBuildingRef.current = next;
        // 새 데이터 로드 직후에는 안전관리자 분석 결과도 새로 계산되므로 기준 스냅샷을 비워둔다
        // (calculateSafety 가 끝나면 fetchBuilding 재호출 없이도 자연스럽게 갱신된다).
        lastSavedSafetyResultRef.current = null;
        setIsEditing(false);
        if (data.building.totalArea || data.building.totalFloors) {
          calculateSafety({
            totalArea: data.building.totalArea || "0",
            totalFloors: String(data.building.totalFloors || 0),
            basementFloors: String(data.building.basementFloors || 0),
            totalUnits: String(data.building.totalUnits || 0),
            elevatorCount: String(data.building.elevatorCount || 0),
            buildingUsage: data.building.buildingUsage || "",
            electricCapacityKw: data.building.electricCapacityKw || "0",
            gasUsageMonthly: data.building.gasUsageMonthly || "0",
            hasGas: String(data.building.hasGas ?? true),
          });
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  // 임베드 모달 상태 — `.open()` 새 창 방식은 안드로이드에서 OS 앱 선택창("연결 프로그램")을
  // 띄우므로 항상 인앱 다이얼로그로 임베드해 같은 페이지에서 검색하도록 한다.
  const [postcodeOpen, setPostcodeOpen] = useState(false);
  const postcodeContainerRef = useRef<HTMLDivElement | null>(null);
  const postcodeInstanceRef = useRef<unknown>(null);
  // [Task #427] 식별자 재조회 모드. true 일 때 카카오 주소검색으로 같은 주소를 다시 골라도
  //   주소 관련 필드(addressFull/addressJibun/zipCode/sido/sigungu/dong/name)와 건물 기본
  //   정보(연면적/층수/세대수 등)는 덮어쓰지 않고, buildingRegisterPk/registerData/전유부
  //   면적 정보만 갱신한다.
  const relookupModeRef = useRef(false);

  function buildPostcodeOptions() {
    return {
      oncomplete: (data: DaumPostcodeResult) => {
        handlePostcodeComplete(data);
        setPostcodeOpen(false);
      },
      width: "100%",
      height: "100%",
    };
  }

  function openKakaoPostcode() {
    if (!window.daum?.Postcode) {
      toast({ title: "주소검색 모듈을 로딩 중입니다. 잠시 후 다시 시도해주세요.", variant: "destructive" });
      return;
    }
    relookupModeRef.current = false;
    setPostcodeOpen(true);
  }

  // [Task #427] ‘건축물대장 다시 조회’ 버튼 전용 진입점. 주소는 그대로 두고 식별자만 채운다.
  function openRelookupPostcode() {
    if (!window.daum?.Postcode) {
      toast({ title: "주소검색 모듈을 로딩 중입니다. 잠시 후 다시 시도해주세요.", variant: "destructive" });
      return;
    }
    relookupModeRef.current = true;
    setPostcodeOpen(true);
  }

  // 다이얼로그가 열리고 컨테이너가 렌더되면 해당 div 안에 임베드한다.
  // [Task #489] SDK(`window.daum.Postcode`) 또는 컨테이너 ref 가 아직 준비되지 않은
  //   시점에 effect 가 한 번만 실행되면 빈 화면으로 그대로 닫혀 버리는 회귀가 있었다.
  //   ref/SDK 가 준비될 때까지 짧은 간격으로 재시도해 임베드를 보장한다.
  useEffect(() => {
    if (!postcodeOpen) return;
    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 100; // 100 × 100ms = 10s 상한.
    const tryEmbed = () => {
      if (cancelled) return;
      const el = postcodeContainerRef.current;
      if (!el || !window.daum?.Postcode) {
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) {
          toast({
            title: "주소검색을 열 수 없습니다. 네트워크를 확인 후 다시 시도해 주세요.",
            variant: "destructive",
          });
          setPostcodeOpen(false);
          return;
        }
        timer = window.setTimeout(tryEmbed, 100);
        return;
      }
      el.innerHTML = "";
      try {
        const inst = new window.daum.Postcode(buildPostcodeOptions());
        postcodeInstanceRef.current = inst;
        (inst as unknown as { embed: (e: HTMLElement) => void }).embed(el);
      } catch (e) {
        toast({ title: "주소검색을 열 수 없습니다", description: String(e), variant: "destructive" });
        setPostcodeOpen(false);
      }
    };
    tryEmbed();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcodeOpen, postcodeLoaded]);

  function handlePostcodeComplete(data: DaumPostcodeResult) {
        // [Task #427] 식별자 재조회 모드에서는 주소 관련 필드를 절대 덮어쓰지 않는다.
        if (!relookupModeRef.current) {
          setBuilding((prev) => ({
            ...prev,
            addressFull: data.roadAddress || data.address,
            addressJibun: data.jibunAddress || "",
            zipCode: data.zonecode || "",
            sido: data.sido || prev.sido,
            sigungu: data.sigungu || prev.sigungu,
            dong: data.bname || prev.dong,
            name: data.buildingName || prev.name,
          }));
        }

        const bcode = data.bcode || "";
        const sigunguCd = bcode.substring(0, 5);
        const bjdongCd = bcode.substring(5, 10);

        const jibun = data.jibunAddress || data.address || "";
        const jibunMatch = jibun.match(/(\d+)(?:-(\d+))?$/);
        const bun = jibunMatch?.[1] || "";
        const ji = jibunMatch?.[2] || "0";

        if (sigunguCd && bjdongCd && bun) {
          lookupBuildingRegister(sigunguCd, bjdongCd, bun, ji);
        } else {
          toast({ title: "주소에서 건축물대장 조회코드를 추출할 수 없습니다. 건물 정보를 직접 입력해주세요." });
          relookupModeRef.current = false;
        }
  }

  async function lookupBuildingRegister(sigunguCd: string, bjdongCd: string, bun: string, ji: string) {
    setLookingUp(true);
    setRegisterPreview(null);
    try {
      const params = new URLSearchParams({ sigunguCd, bjdongCd, bun, ji });
      const res = await fetch(`${apiBase}/buildings/lookup-register?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();

      if (result.found && result.data) {
        const d = result.data;
        // [Task #328] 표제부/총괄표제부 응답 원본도 함께 보관해 저장 시 buildings.register_data
        // 컬럼에 담길 수 있게 한다. raw 가 비는 경우(서버 폴백)는 null 처리.
        const rawFromServer = (result as { raw?: { title?: unknown; recap?: unknown } }).raw;
        const nextRegisterData = rawFromServer && (rawFromServer.title || rawFromServer.recap)
          ? {
              title: (rawFromServer.title as Record<string, unknown> | null) ?? null,
              recap: (rawFromServer.recap as Record<string, unknown> | null) ?? null,
            }
          : null;
        // [Task #516] 다동 단지의 동별 PK 캐시. 서버가 dongs[] 를 내려주면 그대로 보관해
        //   호실 일괄 가져오기 단계가 모든 동을 순회할 수 있게 한다.
        const dongsFromServer = (result as { dongs?: { mgmBldrgstPk: string; dongName: string; isMain: boolean }[] }).dongs;
        const nextDongs = Array.isArray(dongsFromServer) ? dongsFromServer.filter((x) => x?.mgmBldrgstPk) : null;
        setRegisterPreview(d);
        // [Task #427] 식별자 재조회 모드에서는 주소·건물 기본 정보를 덮어쓰지 않고,
        //   buildingRegisterPk + registerData 만 갱신한다(전유부 면적은 아래 lookupAreaInfo).
        const isRelookup = relookupModeRef.current;
        setBuilding((prev) => {
          if (isRelookup) {
            return {
              ...prev,
              registerData: nextRegisterData ?? prev.registerData ?? null,
              buildingRegisterPk: d.mgmBldrgstPk ? String(d.mgmBldrgstPk) : prev.buildingRegisterPk,
              registerDongPks: nextDongs && nextDongs.length > 0 ? nextDongs : prev.registerDongPks ?? null,
            };
          }
          return {
            ...prev,
            name: d.buildingName || prev.name,
            addressFull: d.newPlatPlc || prev.addressFull,
            addressJibun: d.platPlc || prev.addressJibun,
            totalUnits: d.totalUnits ? String(d.totalUnits) : prev.totalUnits,
            totalFloors: d.totalFloors ? String(d.totalFloors) : prev.totalFloors,
            basementFloors: d.basementFloors ? String(d.basementFloors) : prev.basementFloors,
            totalArea: d.totalArea || prev.totalArea,
            buildingUsage: d.mainPurpose || prev.buildingUsage,
            structureType: d.structureType || prev.structureType,
            completionDate: d.completionDate
              ? `${d.completionDate.substring(0, 4)}-${d.completionDate.substring(4, 6)}-${d.completionDate.substring(6, 8)}`
              : prev.completionDate,
            // [Task #502] 표제부 사용승인일(useAprDay)을 ISO 형식으로 자동 채움.
            //   서버가 d.approvalDate(YYYY-MM-DD) 를 새로 노출. 사용자가 이미
            //   직접 입력해 둔 값이 있으면 절대 덮어쓰지 않는다.
            approvalDate: prev.approvalDate || d.approvalDate || prev.approvalDate,
            elevatorCount: d.elevatorCount ? String(d.elevatorCount) : prev.elevatorCount,
            parkingSpaces: d.parkingCount ? String(d.parkingCount) : prev.parkingSpaces,
            landArea: d.landArea || prev.landArea,
            buildingArea: d.buildingArea || prev.buildingArea,
            buildingCoverageRatio: d.buildingCoverageRatio || prev.buildingCoverageRatio,
            floorAreaRatio: d.floorAreaRatio || prev.floorAreaRatio,
            registerData: nextRegisterData ?? prev.registerData ?? null,
            // [Task #348] 대장 조회 직후 mgmBldrgstPk 를 위저드 상태에 즉시 반영해야
            // "호실 일괄 가져오기" 단계 게이트가 정확히 풀린다.
            buildingRegisterPk: d.mgmBldrgstPk ? String(d.mgmBldrgstPk) : prev.buildingRegisterPk,
            // [Task #516] 다동 단지의 동(棟)별 PK 캐시. 비면 이전 값을 유지(소실 방지).
            registerDongPks: nextDongs && nextDongs.length > 0 ? nextDongs : prev.registerDongPks ?? null,
          };
        });

        if (isRelookup) {
          if (d.mgmBldrgstPk) {
            toast({ title: "건축물대장 식별자를 가져왔습니다. 변경 내용을 저장하려면 아래 ‘건물 정보 저장’을 눌러주세요." });
          } else {
            toast({ title: "건축물대장 식별자를 찾지 못했습니다. 다시 시도해 주세요.", variant: "destructive" });
          }
        } else {
          toast({ title: "건축물대장 정보를 불러왔습니다 (총괄표제부 + 표제부)" });
        }

        if (d.mgmBldrgstPk) {
          lookupAreaInfo(d.mgmBldrgstPk);
        }

        // [Task #427] 재조회 모드에서는 건물 기본 정보를 건드리지 않으므로 안전관리 분석을
        //   다시 돌릴 필요가 없다(이전 저장값으로 산정된 결과를 그대로 유지).
        if (!isRelookup) {
          calculateSafety({
            totalArea: d.totalArea || "0",
            totalFloors: String(d.totalFloors || 0),
            basementFloors: String(d.basementFloors || 0),
            totalUnits: String(d.totalUnits || 0),
            elevatorCount: String(d.elevatorCount || 0),
            buildingUsage: d.mainPurpose || "",
            electricCapacityKw: "0",
            gasUsageMonthly: "0",
            hasGas: "true",
          });
        }
      } else {
        toast({ title: "해당 주소의 건축물대장 정보를 찾을 수 없습니다. 건물 정보를 직접 입력해주세요.", variant: "destructive" });
      }
    } catch {
      toast({ title: "건축물대장 조회 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setLookingUp(false);
      // [Task #427] 한 번의 재조회가 끝나면 모드를 초기화해, 이후 신규 흐름에서 영향이 없게 한다.
      relookupModeRef.current = false;
    }
  }

  async function lookupAreaInfo(mgmBldrgstPk: string) {
    try {
      const params = new URLSearchParams({ mgmBldrgstPk });
      const res = await fetch(`${apiBase}/buildings/lookup-area-info?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.found && result.areas?.length > 0) {
        setAreaInfo(result.areas);
      }
    } catch {}
  }

  async function calculateSafety(data: Record<string, string>) {
    setCalculatingSafety(true);
    try {
      const res = await fetch(`${apiBase}/buildings/calculate-safety`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      setSafetyResult(result);

      if (result.requiredInspections && result.requiredInspections.length > 0) {
        const requiredCategories: string[] = [...new Set(result.requiredInspections)] as string[];
        const autoTasks: SelectedTask[] = [];
        const presets = allPresetsRef.current;
        for (const cat of requiredCategories) {
          const matchingPresets = presets.filter((p) => p.category === cat);
          for (const preset of matchingPresets) {
            if (!selectedTasks.some((t) => t.name === preset.name) && !autoTasks.some((t) => t.name === preset.name)) {
              autoTasks.push({
                name: preset.name,
                category: preset.category,
                legalCycleMonths: preset.legalCycleMonths,
                lastDate: "",
                description: preset.description,
                legalBasis: preset.legalBasis,
              });
            }
          }
        }
        if (autoTasks.length > 0) {
          setSelectedTasks((prev) => [...prev, ...autoTasks.filter((at) => !prev.some((p) => p.name === at.name))]);
          toast({ title: `${autoTasks.length}건의 필수 법정업무가 자동 추가되었습니다` });
        }
      }
    } catch {
      toast({ title: "안전관리 분석 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setCalculatingSafety(false);
    }
  }

  async function saveBuilding() {
    if (!building.name) {
      toast({ title: "건물명을 입력해주세요", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const method = existingId ? "PUT" : "POST";
      const url = existingId ? `${apiBase}/buildings/${existingId}` : `${apiBase}/buildings`;

      const payload = {
        ...building,
        safetyManagerRequired: safetyResult?.safetyManagerRequired || false,
        safetyManagerType: safetyResult?.safetyManagerType || null,
        // [Task #328] 건축물대장 표제부 원본을 함께 전송해 buildings.register_data 컬럼에 저장.
        registerData: building.registerData ?? null,
        // [Task #348] mgmBldrgstPk 영속화 — 호실 일괄 가져오기 단계 게이트 및 백엔드 매칭에 사용.
        buildingRegisterPk: building.buildingRegisterPk ?? null,
        // [Task #516] 다동 단지의 동(棟)별 PK 캐시 — 호실 일괄 가져오기 단계가 모든 동을 순회.
        registerDongPks: building.registerDongPks ?? null,
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      // [Task #160] 상태 코드별 토스트 분기. 서버가 error 메시지를 주면 우선 사용한다.
      let body: { building?: { id: number }; error?: string } = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }

      if (!res.ok) {
        const fallback =
          res.status === 423 ? "건물 주소가 잠겨 있습니다. 변경이 필요한 경우 고객센터(1800-0416)로 문의하세요." :
          res.status === 400 ? "입력 데이터에 오류가 있습니다. 입력값을 확인해 주세요." :
          (res.status === 401 || res.status === 403) ? "이 건물을 수정할 권한이 없습니다." :
          res.status >= 500 ? "서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요." :
          "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        toast({
          title: body.error || fallback,
          variant: "destructive",
        });
        return;
      }

      if (body.building) {
        setExistingId(body.building.id);
        toast({ title: "건물 정보가 저장되었습니다" });
        // [Task #458] 저장 성공 시 마지막 저장 스냅샷을 현재 폼 값으로 갱신하고
        //   편집 모드를 종료해 다시 읽기 전용 상태로 돌아가게 한다.
        lastSavedBuildingRef.current = building;
        setIsEditing(false);
        // [Task #412] 단일 화면 구조에서는 단계 이동이 없으므로 setActiveStep 호출 제거.
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        if (returnTo && returnTo.startsWith("/onboarding/")) {
          window.location.href = `${import.meta.env.BASE_URL}${returnTo.replace(/^\//, "")}`;
        }
      } else {
        toast({
          title: "저장 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function scheduleInspections() {
    if (!existingId) {
      toast({ title: "먼저 건물 정보를 저장해주세요", variant: "destructive" });
      return;
    }

    const tasksWithDates = selectedTasks.filter((t) => t.lastDate);
    // [Task #297] 사용승인일 기반 자동 산정을 켰다면 lastDate 가 비어 있어도
    //   서버가 fallback 으로 다음 실행일을 계산해 준다.
    if (tasksWithDates.length === 0 && !useApprovalDateFallback) {
      toast({ title: "최소 1개 이상의 최근 실시일을 입력해주세요", variant: "destructive" });
      return;
    }

    // [Task #297] fallback 이 켜져 있으면 lastDate 가 비어 있는 항목도 payload 에
    //   포함해 서버가 사용승인일을 기준으로 자동 산정하도록 한다.
    const tasksToSend = useApprovalDateFallback ? selectedTasks : tasksWithDates;
    const datesByCategory: InspectionDates = {};
    for (const t of tasksToSend) {
      if (!datesByCategory[t.category]) datesByCategory[t.category] = {};
      datesByCategory[t.category][t.name] = t.lastDate ?? "";
    }

    setSchedulingInspections(true);
    try {
      const res = await fetch(`${apiBase}/buildings/auto-schedule-inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          buildingId: existingId,
          inspectionDates: datesByCategory,
          // [Task #297] 사용승인일 기반 fallback 사용 여부.
          useFallbackCompletionDate: useApprovalDateFallback,
        }),
      });

      const result = await res.json();
      if (result.count > 0) {
        toast({ title: `${result.count}건의 법정점검 일정이 생성되었습니다` });
        setInspectionsScheduled(true);
      } else {
        toast({ title: "생성할 점검 일정이 없습니다" });
      }
    } catch {
      toast({ title: "점검 일정 생성 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setSchedulingInspections(false);
    }
  }

  function handleFieldChange(field: keyof BuildingData, value: string | boolean) {
    setBuilding((prev) => ({ ...prev, [field]: value }));
  }

  // [Task #458] ‘수정하기’ 버튼 진입점. 현재 폼 값과 안전관리자 분석 결과를 cancel 시 되돌릴
  //   스냅샷으로 함께 보관하고 편집 모드로 전환한다.
  function enterEditMode() {
    lastSavedBuildingRef.current = building;
    lastSavedSafetyResultRef.current = safetyResult;
    setIsEditing(true);
  }

  // [Task #458] ‘취소’ 버튼 — 마지막 저장 스냅샷으로 폼과 안전관리자 분석 결과를 함께 되돌리고
  //   읽기 전용으로 돌아간다. (편집 도중 안전관리자 분석을 다시 돌렸더라도 폼이 되돌아가므로
  //   분석 카드도 같이 되돌려야 화면 상태가 일관된다.)
  function cancelEdit() {
    setBuilding(lastSavedBuildingRef.current);
    setSafetyResult(lastSavedSafetyResultRef.current);
    setIsEditing(false);
  }

  return {
    token,
    loading,
    saving,
    lookingUp,
    building,
    setBuilding,
    existingId,
    safetyResult,
    calculatingSafety,
    schedulingInspections,
    inspectionsScheduled,
    useApprovalDateFallback,
    setUseApprovalDateFallback,
    activeStep,
    setActiveStep,
    registerPreview,
    areaInfo,
    postcodeLoaded,
    selectedTasks,
    taskSearch,
    setTaskSearch,
    showSuggestions,
    setShowSuggestions,
    customTaskName,
    setCustomTaskName,
    customTaskCategory,
    setCustomTaskCategory,
    customTaskCycle,
    setCustomTaskCycle,
    searchRef,
    filteredSuggestions,
    addPresetTask,
    addCustomTask,
    removeTask,
    updateTaskDate,
    openKakaoPostcode,
    // [Task #427] 식별자 재조회 진입점.
    openRelookupPostcode,
    postcodeOpen,
    setPostcodeOpen,
    postcodeContainerRef,
    calculateSafety,
    saveBuilding,
    scheduleInspections,
    handleFieldChange,
    // [Task #458] 편집 가드 외부 노출.
    isEditing,
    enterEditMode,
    cancelEdit,
  };
}
