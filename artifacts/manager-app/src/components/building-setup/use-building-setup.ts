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
  logoUrl: null,
  landArea: "",
  buildingArea: "",
  buildingCoverageRatio: "",
  floorAreaRatio: "",
  electricCapacityKw: "",
  gasUsageMonthly: "",
  approvalDate: "",
};

export function useBuildingSetup() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [building, setBuilding] = useState<BuildingData>(EMPTY_BUILDING);
  const [existingId, setExistingId] = useState<number | null>(null);
  const [safetyResult, setSafetyResult] = useState<SafetyResult | null>(null);
  const [calculatingSafety, setCalculatingSafety] = useState(false);
  const [inspectionDates, setInspectionDates] = useState<InspectionDates>({});
  const [schedulingInspections, setSchedulingInspections] = useState(false);
  const [inspectionsScheduled, setInspectionsScheduled] = useState(false);
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
    if (!document.getElementById("daum-postcode-script")) {
      const script = document.createElement("script");
      script.id = "daum-postcode-script";
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.onload = () => setPostcodeLoaded(true);
      document.head.appendChild(script);
    } else {
      setPostcodeLoaded(true);
    }
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
        setBuilding({
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
          logoUrl: data.building.logoUrl ?? null,
          landArea: data.building.landArea || "",
          buildingArea: data.building.buildingArea || "",
          buildingCoverageRatio: data.building.buildingCoverageRatio || "",
          floorAreaRatio: data.building.floorAreaRatio || "",
          electricCapacityKw: data.building.electricCapacityKw || "",
          gasUsageMonthly: data.building.gasUsageMonthly || "",
          approvalDate: data.building.approvalDate || "",
          addressLocked: data.building.addressLocked || false,
        });
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

  function openKakaoPostcode() {
    if (!window.daum?.Postcode) {
      toast({ title: "주소검색 모듈을 로딩 중입니다. 잠시 후 다시 시도해주세요.", variant: "destructive" });
      return;
    }

    new window.daum.Postcode({
      oncomplete: (data: DaumPostcodeResult) => {
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
        }
      },
    }).open();
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
        setRegisterPreview(d);
        setBuilding((prev) => ({
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
          elevatorCount: d.elevatorCount ? String(d.elevatorCount) : prev.elevatorCount,
          parkingSpaces: d.parkingCount ? String(d.parkingCount) : prev.parkingSpaces,
          landArea: d.landArea || prev.landArea,
          buildingArea: d.buildingArea || prev.buildingArea,
          buildingCoverageRatio: d.buildingCoverageRatio || prev.buildingCoverageRatio,
          floorAreaRatio: d.floorAreaRatio || prev.floorAreaRatio,
        }));

        toast({ title: "건축물대장 정보를 불러왔습니다 (총괄표제부 + 표제부)" });

        if (d.mgmBldrgstPk) {
          lookupAreaInfo(d.mgmBldrgstPk);
        }

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
      } else {
        toast({ title: "해당 주소의 건축물대장 정보를 찾을 수 없습니다. 건물 정보를 직접 입력해주세요.", variant: "destructive" });
      }
    } catch {
      toast({ title: "건축물대장 조회 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setLookingUp(false);
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
        setActiveStep(2);
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
    if (tasksWithDates.length === 0) {
      toast({ title: "최소 1개 이상의 최근 실시일을 입력해주세요", variant: "destructive" });
      return;
    }

    const datesByCategory: InspectionDates = {};
    for (const t of tasksWithDates) {
      if (!datesByCategory[t.category]) datesByCategory[t.category] = {};
      datesByCategory[t.category][t.name] = t.lastDate;
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
    calculateSafety,
    saveBuilding,
    scheduleInspections,
    handleFieldChange,
  };
}
