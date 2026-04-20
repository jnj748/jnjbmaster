import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building,
  Search,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Calendar,
  Save,
  Loader2,
  Info,
  ChevronRight,
  Plus,
  X,
  MapPin,
} from "lucide-react";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";
import { PhotoUploadField } from "@/components/photo-upload-field";
import {
  CATEGORY_LABELS,
  FIELD_LABELS,
  INSPECTION_TYPE_LABELS,
  SMART_DATE_HINTS,
  formatCycle,
} from "@/lib/page-constants/building-setup";

declare global {
  interface Window {
    daum: {
      Postcode: new (config: {
        oncomplete: (data: DaumPostcodeResult) => void;
        width?: string;
        height?: string;
      }) => { open: () => void };
    };
  }
}

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

import type {
  BuildingData,
  SafetyResult,
  PresetItem,
  SelectedTask,
  InspectionDates,
} from "@/components/building-setup/types";
import { StepAddress } from "@/components/building-setup/step-address";
import { StepInfo } from "@/components/building-setup/step-info";
import { StepTasks } from "@/components/building-setup/step-tasks";
import { WarrantySection } from "@/components/building-setup/warranty-section";

const EMPTY_BUILDING: BuildingData = {
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

export default function BuildingSetup() {
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

      const result = await res.json();
      if (result.building) {
        setExistingId(result.building.id);
        toast({ title: "건물 정보가 저장되었습니다" });
        setActiveStep(2);
        // [Task #132] 위저드에서 진입한 경우 위저드로 복귀.
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        if (returnTo && returnTo.startsWith("/onboarding/")) {
          window.location.href = `${import.meta.env.BASE_URL}${returnTo.replace(/^\//, "")}`;
        }
      }
    } catch {
      toast({ title: "저장 중 오류가 발생했습니다", variant: "destructive" });
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

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const steps = [
    { label: "주소 검색", icon: MapPin },
    { label: "건물 정보 입력", icon: Building },
    { label: "법정업무 선택", icon: Calendar },
  ];

  return (
    <div className="space-y-6 pb-[max(env(safe-area-inset-bottom),8rem)] [scroll-padding-bottom:8rem]">
      <div>
        <h1 className="text-2xl font-bold">건물 관리정보 설정</h1>
        <p className="text-muted-foreground text-sm mt-1">
          건축물대장 조회로 건물 정보를 자동으로 불러오고, 법정점검 일정을 설정합니다
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <button
            key={i}
            onClick={() => setActiveStep(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeStep === i
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <step.icon className="w-4 h-4" />
            {step.label}
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 ml-1 text-muted-foreground" />}
          </button>
        ))}
      </div>

      {activeStep === 0 && (
          <StepAddress
            building={building}
            postcodeLoaded={postcodeLoaded}
            lookingUp={lookingUp}
            registerPreview={registerPreview}
            areaInfo={areaInfo}
            openKakaoPostcode={openKakaoPostcode}
            setActiveStep={setActiveStep}
          />
        )}

        {activeStep === 1 && (
          <StepInfo
            building={building}
            setBuilding={setBuilding}
            handleFieldChange={handleFieldChange}
            safetyResult={safetyResult}
            calculatingSafety={calculatingSafety}
            calculateSafety={calculateSafety}
            selectedTasks={selectedTasks}
            saving={saving}
            existingId={existingId}
            saveBuilding={saveBuilding}
          />
        )}

        {activeStep === 2 && (
          <>
            <StepTasks
              searchRef={searchRef}
              taskSearch={taskSearch}
              setTaskSearch={setTaskSearch}
              showSuggestions={showSuggestions}
              setShowSuggestions={setShowSuggestions}
              filteredSuggestions={filteredSuggestions}
              addPresetTask={addPresetTask}
              customTaskName={customTaskName}
              setCustomTaskName={setCustomTaskName}
              customTaskCategory={customTaskCategory}
              setCustomTaskCategory={setCustomTaskCategory}
              customTaskCycle={customTaskCycle}
              setCustomTaskCycle={setCustomTaskCycle}
              addCustomTask={addCustomTask}
              selectedTasks={selectedTasks}
              safetyResult={safetyResult}
              updateTaskDate={updateTaskDate}
              removeTask={removeTask}
              inspectionsScheduled={inspectionsScheduled}
              scheduleInspections={scheduleInspections}
              schedulingInspections={schedulingInspections}
              existingId={existingId}
            />
            {existingId && building.approvalDate && (
              <WarrantySection buildingId={existingId} approvalDate={building.approvalDate} token={token} />
            )}
          </>
        )}
    </div>
  );
}
