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

interface BuildingData {
  id?: number;
  name: string;
  addressFull: string;
  addressJibun: string;
  sido: string;
  sigungu: string;
  dong: string;
  zipCode: string;
  totalUnits: string;
  totalFloors: string;
  basementFloors: string;
  totalArea: string;
  buildingUsage: string;
  structureType: string;
  completionDate: string;
  elevatorCount: string;
  parkingSpaces: string;
  hasPlayground: boolean;
  hasGas: boolean;
  hasSepticTank: boolean;
  managementOfficePhone: string;
  managementOfficeFax: string;
  landArea: string;
  buildingArea: string;
  buildingCoverageRatio: string;
  floorAreaRatio: string;
}

interface SafetyResult {
  safetyManagerRequired: boolean;
  safetyManagerType: string | null;
  requiredInspections: string[];
  safetyNotes: string[];
  facilityManagerCriteria: string[];
}

interface PresetItem {
  id?: number;
  name: string;
  category: string;
  inspectionType: string;
  legalCycleMonths: number;
  description?: string;
  legalBasis?: string;
}

interface SelectedTask {
  name: string;
  category: string;
  legalCycleMonths: number;
  lastDate: string;
  description?: string;
  legalBasis?: string;
}

interface InspectionDates {
  [category: string]: {
    [presetName: string]: string;
  };
}

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
  landArea: "",
  buildingArea: "",
  buildingCoverageRatio: "",
  floorAreaRatio: "",
};

const CATEGORY_LABELS: Record<string, string> = {
  fire_safety: "소방",
  electrical: "전기",
  elevator: "승강기",
  water_tank: "저수조",
  septic: "정화조",
  hygiene: "위생/환경",
  building_safety: "건축물 안전",
  safety_check: "안전점검",
  gas: "가스",
  playground: "놀이터",
};

function formatCycle(months: number): string {
  if (months === 1) return "매월";
  if (months === 3) return "분기 1회";
  if (months === 6) return "반기 1회";
  if (months === 12) return "연 1회";
  if (months === 24) return "2년 1회";
  if (months === 36) return "3년 1회";
  return `${months}개월`;
}

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  legal: "법정",
  self_regular: "자체정기",
  biweekly: "격주",
  seasonal: "계절별",
  administrative: "행정",
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
  const [postcodeLoaded, setPostcodeLoaded] = useState(false);

  const [allPresets, setAllPresets] = useState<PresetItem[]>([]);
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
          landArea: data.building.landArea || "",
          buildingArea: data.building.buildingArea || "",
          buildingCoverageRatio: data.building.buildingCoverageRatio || "",
          floorAreaRatio: data.building.floorAreaRatio || "",
        });
        if (data.building.totalArea || data.building.totalFloors) {
          calculateSafety({
            totalArea: data.building.totalArea || "0",
            totalFloors: String(data.building.totalFloors || 0),
            basementFloors: String(data.building.basementFloors || 0),
            totalUnits: String(data.building.totalUnits || 0),
            elevatorCount: String(data.building.elevatorCount || 0),
            buildingUsage: data.building.buildingUsage || "",
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

        calculateSafety({
          totalArea: d.totalArea || "0",
          totalFloors: String(d.totalFloors || 0),
          basementFloors: String(d.basementFloors || 0),
          totalUnits: String(d.totalUnits || 0),
          elevatorCount: String(d.elevatorCount || 0),
          buildingUsage: d.mainPurpose || "",
        });
      } else {
        toast({ title: "해당 건물의 건축물대장 정보를 찾을 수 없습니다", variant: "destructive" });
      }
    } catch {
      toast({ title: "건축물대장 조회 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setLookingUp(false);
    }
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
    } catch {
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
    <div className="space-y-6 pb-24">
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
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                주소 검색
              </CardTitle>
              <CardDescription>
                주소를 검색하면 건축물대장(총괄표제부 + 표제부) 정보가 자동으로 불러와집니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {building.addressFull && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-green-900">선택된 주소</p>
                      <p className="text-sm text-green-800 mt-1">{building.addressFull}</p>
                      {building.addressJibun && (
                        <p className="text-xs text-green-700 mt-0.5">(지번) {building.addressJibun}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {building.sido && <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{building.sido}</span>}
                        {building.sigungu && <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{building.sigungu}</span>}
                        {building.dong && <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{building.dong}</span>}
                        {building.zipCode && <span className="inline-flex items-center rounded-md border border-green-300 px-2 py-0.5 text-xs font-medium text-green-700">{building.zipCode}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={openKakaoPostcode}
                disabled={!postcodeLoaded}
                className="w-full"
                size="lg"
                variant={building.addressFull ? "outline" : "default"}
              >
                <MapPin className="w-4 h-4 mr-2" />
                {building.addressFull ? "주소 다시 검색" : "주소 검색하기"}
              </Button>

              {lookingUp && (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">건축물대장 정보 조회 중...</span>
                </div>
              )}

              {registerPreview && !lookingUp && (
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Search className="w-4 h-4 text-blue-600" />
                      건축물대장 조회 결과
                    </CardTitle>
                    <CardDescription>총괄표제부 + 표제부 정보가 아래 건물정보에 자동 반영되었습니다</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 desktop:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      {registerPreview.buildingName && (
                        <div><span className="text-muted-foreground">건물명:</span> <span className="font-medium">{String(registerPreview.buildingName)}</span></div>
                      )}
                      {registerPreview.mainPurpose && (
                        <div><span className="text-muted-foreground">주용도:</span> <span className="font-medium">{String(registerPreview.mainPurpose)}</span></div>
                      )}
                      {registerPreview.structureType && (
                        <div><span className="text-muted-foreground">구조:</span> <span className="font-medium">{String(registerPreview.structureType)}</span></div>
                      )}
                      {Number(registerPreview.totalFloors) > 0 && (
                        <div><span className="text-muted-foreground">지상층:</span> <span className="font-medium">{String(registerPreview.totalFloors)}층</span></div>
                      )}
                      {Number(registerPreview.basementFloors) > 0 && (
                        <div><span className="text-muted-foreground">지하층:</span> <span className="font-medium">{String(registerPreview.basementFloors)}층</span></div>
                      )}
                      {Number(registerPreview.totalUnits) > 0 && (
                        <div><span className="text-muted-foreground">세대수:</span> <span className="font-medium">{String(registerPreview.totalUnits)}세대</span></div>
                      )}
                      {registerPreview.totalArea && (
                        <div><span className="text-muted-foreground">연면적:</span> <span className="font-medium">{Number(registerPreview.totalArea).toLocaleString()}㎡</span></div>
                      )}
                      {registerPreview.landArea && (
                        <div><span className="text-muted-foreground">대지면적:</span> <span className="font-medium">{Number(registerPreview.landArea).toLocaleString()}㎡</span></div>
                      )}
                      {registerPreview.buildingArea && (
                        <div><span className="text-muted-foreground">건축면적:</span> <span className="font-medium">{Number(registerPreview.buildingArea).toLocaleString()}㎡</span></div>
                      )}
                      {registerPreview.buildingCoverageRatio && (
                        <div><span className="text-muted-foreground">건폐율:</span> <span className="font-medium">{Number(registerPreview.buildingCoverageRatio).toFixed(2)}%</span></div>
                      )}
                      {registerPreview.floorAreaRatio && (
                        <div><span className="text-muted-foreground">용적률:</span> <span className="font-medium">{Number(registerPreview.floorAreaRatio).toFixed(2)}%</span></div>
                      )}
                      {Number(registerPreview.elevatorCount) > 0 && (
                        <div><span className="text-muted-foreground">승강기:</span> <span className="font-medium">{String(registerPreview.elevatorCount)}대</span></div>
                      )}
                      {Number(registerPreview.parkingCount) > 0 && (
                        <div><span className="text-muted-foreground">주차대수:</span> <span className="font-medium">{String(registerPreview.parkingCount)}대</span></div>
                      )}
                      {registerPreview.completionDate && (
                        <div><span className="text-muted-foreground">사용승인일:</span> <span className="font-medium">{String(registerPreview.completionDate)}</span></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {building.addressFull && (
                <Button className="w-full" onClick={() => setActiveStep(1)}>
                  다음: 건물 정보 확인 및 수정 →
                </Button>
              )}

              <div className="text-center">
                <Button variant="ghost" size="sm" onClick={() => setActiveStep(1)}>
                  직접 입력하기 →
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeStep === 1 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5" />
                건물 기본 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
                <div>
                  <Label>건물명 *</Label>
                  <Input
                    value={building.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    placeholder="예: OO아파트"
                  />
                </div>
                <div>
                  <Label>도로명 주소</Label>
                  <Input
                    value={building.addressFull}
                    onChange={(e) => handleFieldChange("addressFull", e.target.value)}
                    placeholder="도로명 주소"
                  />
                </div>
                <div>
                  <Label>지번 주소</Label>
                  <Input
                    value={building.addressJibun}
                    onChange={(e) => handleFieldChange("addressJibun", e.target.value)}
                    placeholder="지번 주소"
                  />
                </div>
                <div>
                  <Label>우편번호</Label>
                  <Input
                    value={building.zipCode}
                    onChange={(e) => handleFieldChange("zipCode", e.target.value)}
                    placeholder="우편번호"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 desktop:grid-cols-3 gap-4">
                <div>
                  <Label>시/도</Label>
                  <Select value={building.sido} onValueChange={(v) => {
                    handleFieldChange("sido", v);
                    handleFieldChange("sigungu", "");
                  }}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {sidoList.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>시/군/구</Label>
                  <Select value={building.sigungu} onValueChange={(v) => handleFieldChange("sigungu", v)}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {(building.sido ? getSigunguList(building.sido) : []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>동/읍/면</Label>
                  <Input
                    value={building.dong}
                    onChange={(e) => handleFieldChange("dong", e.target.value)}
                    placeholder="동/읍/면"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>건물 상세 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
                <div>
                  <Label>세대수</Label>
                  <Input
                    type="number"
                    value={building.totalUnits}
                    onChange={(e) => handleFieldChange("totalUnits", e.target.value)}
                    placeholder="세대수"
                  />
                </div>
                <div>
                  <Label>지상 층수</Label>
                  <Input
                    type="number"
                    value={building.totalFloors}
                    onChange={(e) => handleFieldChange("totalFloors", e.target.value)}
                    placeholder="지상 층수"
                  />
                </div>
                <div>
                  <Label>지하 층수</Label>
                  <Input
                    type="number"
                    value={building.basementFloors}
                    onChange={(e) => handleFieldChange("basementFloors", e.target.value)}
                    placeholder="지하 층수"
                  />
                </div>
                <div>
                  <Label>연면적 (㎡)</Label>
                  <Input
                    type="number"
                    value={building.totalArea}
                    onChange={(e) => handleFieldChange("totalArea", e.target.value)}
                    placeholder="연면적"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
                <div>
                  <Label>대지면적 (㎡)</Label>
                  <Input
                    type="number"
                    value={building.landArea}
                    onChange={(e) => handleFieldChange("landArea", e.target.value)}
                    placeholder="대지면적"
                  />
                </div>
                <div>
                  <Label>건축면적 (㎡)</Label>
                  <Input
                    type="number"
                    value={building.buildingArea}
                    onChange={(e) => handleFieldChange("buildingArea", e.target.value)}
                    placeholder="건축면적"
                  />
                </div>
                <div>
                  <Label>건폐율 (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={building.buildingCoverageRatio}
                    onChange={(e) => handleFieldChange("buildingCoverageRatio", e.target.value)}
                    placeholder="건폐율"
                  />
                </div>
                <div>
                  <Label>용적률 (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={building.floorAreaRatio}
                    onChange={(e) => handleFieldChange("floorAreaRatio", e.target.value)}
                    placeholder="용적률"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
                <div>
                  <Label>용도</Label>
                  <Input
                    value={building.buildingUsage}
                    onChange={(e) => handleFieldChange("buildingUsage", e.target.value)}
                    placeholder="예: 아파트, 오피스텔"
                  />
                </div>
                <div>
                  <Label>구조</Label>
                  <Input
                    value={building.structureType}
                    onChange={(e) => handleFieldChange("structureType", e.target.value)}
                    placeholder="예: 철근콘크리트"
                  />
                </div>
                <div>
                  <Label>준공일</Label>
                  <Input
                    type="date"
                    value={building.completionDate}
                    onChange={(e) => handleFieldChange("completionDate", e.target.value)}
                  />
                </div>
                <div>
                  <Label>승강기 수</Label>
                  <Input
                    type="number"
                    value={building.elevatorCount}
                    onChange={(e) => handleFieldChange("elevatorCount", e.target.value)}
                    placeholder="승강기 수"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
                <div>
                  <Label>주차 대수</Label>
                  <Input
                    type="number"
                    value={building.parkingSpaces}
                    onChange={(e) => handleFieldChange("parkingSpaces", e.target.value)}
                    placeholder="주차 대수"
                  />
                </div>
                <div>
                  <Label>관리사무소 전화</Label>
                  <Input
                    value={building.managementOfficePhone}
                    onChange={(e) => handleFieldChange("managementOfficePhone", e.target.value)}
                    placeholder="02-000-0000"
                  />
                </div>
                <div>
                  <Label>관리사무소 팩스</Label>
                  <Input
                    value={building.managementOfficeFax}
                    onChange={(e) => handleFieldChange("managementOfficeFax", e.target.value)}
                    placeholder="02-000-0000"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={building.hasPlayground}
                    onCheckedChange={(v) => handleFieldChange("hasPlayground", v)}
                  />
                  <Label className="text-sm">어린이 놀이터</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={building.hasGas}
                    onCheckedChange={(v) => handleFieldChange("hasGas", v)}
                  />
                  <Label className="text-sm">도시가스</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={building.hasSepticTank}
                    onCheckedChange={(v) => handleFieldChange("hasSepticTank", v)}
                  />
                  <Label className="text-sm">정화조</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={() => {
            calculateSafety({
              totalArea: building.totalArea || "0",
              totalFloors: building.totalFloors || "0",
              basementFloors: building.basementFloors || "0",
              totalUnits: building.totalUnits || "0",
              elevatorCount: building.elevatorCount || "0",
              buildingUsage: building.buildingUsage || "",
            });
          }} variant="outline" className="w-full" disabled={calculatingSafety}>
            {calculatingSafety ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />분석 중...</>
            ) : (
              <><Shield className="w-4 h-4 mr-2" />안전관리자 선임기준 및 법정점검 분석</>
            )}
          </Button>

          {safetyResult && (
            <Card className={safetyResult.safetyManagerRequired ? "border-orange-300 bg-orange-50/50" : "border-green-300 bg-green-50/50"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {safetyResult.safetyManagerRequired ? (
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  안전관리자 선임기준 분석 결과
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={safetyResult.safetyManagerRequired ? "destructive" : "secondary"}>
                    {safetyResult.safetyManagerRequired ? "선임 필수" : "해당 없음"}
                  </Badge>
                  {safetyResult.safetyManagerType && (
                    <span className="text-sm font-medium">{safetyResult.safetyManagerType}</span>
                  )}
                </div>

                {safetyResult.safetyNotes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">관련 법적 기준:</p>
                    {safetyResult.safetyNotes.map((note, i) => (
                      <p key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">•</span>
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                {safetyResult.facilityManagerCriteria.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">시설관리자 기준:</p>
                    {safetyResult.facilityManagerCriteria.map((c, i) => (
                      <p key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                        <span className="text-orange-500 mt-0.5">⚠</span>
                        {c}
                      </p>
                    ))}
                  </div>
                )}

                {safetyResult.requiredInspections.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">필수 법정점검 항목:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {safetyResult.requiredInspections.map((cat) => (
                        <Badge key={cat} variant="outline" className="text-xs">
                          {CATEGORY_LABELS[cat] || cat}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Button
            onClick={saveBuilding}
            disabled={saving || !building.name}
            className="w-full"
            size="lg"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />저장 중...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />{existingId ? "건물 정보 수정" : "건물 정보 저장"}</>
            )}
          </Button>
        </>
      )}

      {activeStep === 2 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                법정업무 선택
              </CardTitle>
              <CardDescription>
                관리 대상 법정업무를 검색하여 추가하거나 직접 입력하세요.
                최근 실시일을 입력하면 다음 점검일이 자동으로 계산됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div ref={searchRef} className="relative">
                <Label className="text-sm font-semibold">법정업무 검색</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="업무명, 분야, 유형으로 검색 (예: 소방, 전기, 승강기, 법정...)"
                    value={taskSearch}
                    onChange={(e) => {
                      setTaskSearch(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="pl-9"
                  />
                </div>
                {showSuggestions && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {filteredSuggestions().length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        {taskSearch ? "검색 결과가 없습니다. 아래에서 직접 입력할 수 있습니다." : "모든 업무가 이미 추가되었습니다."}
                      </div>
                    ) : (
                      filteredSuggestions().map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => addPresetTask(preset)}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{preset.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {CATEGORY_LABELS[preset.category] || preset.category}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {INSPECTION_TYPE_LABELS[preset.inspectionType] || preset.inspectionType}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatCycle(preset.legalCycleMonths)}
                            </span>
                          </div>
                          {preset.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{preset.description}</p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-3 bg-muted/30">
                <Label className="text-sm font-semibold">직접 입력</Label>
                <div className="flex flex-col desktop:flex-row gap-2 mt-2">
                  <Input
                    placeholder="업무명 입력"
                    value={customTaskName}
                    onChange={(e) => setCustomTaskName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && addCustomTask()}
                  />
                  <Select value={customTaskCategory} onValueChange={setCustomTaskCategory}>
                    <SelectTrigger className="w-full desktop:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={customTaskCycle} onValueChange={setCustomTaskCycle}>
                    <SelectTrigger className="w-full desktop:w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">매월</SelectItem>
                      <SelectItem value="3">분기</SelectItem>
                      <SelectItem value="6">반기</SelectItem>
                      <SelectItem value="12">연 1회</SelectItem>
                      <SelectItem value="24">2년</SelectItem>
                      <SelectItem value="36">3년</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={addCustomTask}
                    disabled={!customTaskName.trim()}
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    추가
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>선택된 법정업무 ({selectedTasks.length}건)</span>
                </CardTitle>
                <CardDescription>
                  각 업무의 최근 실시일을 입력하면 다음 점검일이 자동 계산됩니다
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedTasks.map((task) => (
                  <div
                    key={task.name}
                    className="flex flex-col desktop:flex-row desktop:items-center gap-2 p-3 border rounded-lg bg-background"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{task.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {CATEGORY_LABELS[task.category] || task.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatCycle(task.legalCycleMonths)}
                        </span>
                      </div>
                      {task.legalBasis && (
                        <p className="text-xs text-muted-foreground mt-0.5">{task.legalBasis}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">최근 실시일</Label>
                      <Input
                        type="date"
                        className="w-40"
                        value={task.lastDate}
                        onChange={(e) => updateTaskDate(task.name, e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeTask(task.name)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {selectedTasks.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              위 검색창에서 법정업무를 검색하여 추가하거나, 직접 입력해주세요.
            </div>
          )}

          {inspectionsScheduled ? (
            <Card className="border-green-300 bg-green-50/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-semibold">법정점검 일정이 생성되었습니다</p>
                    <p className="text-sm text-muted-foreground">
                      법정 점검 페이지에서 상세 일정을 확인할 수 있습니다.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              onClick={scheduleInspections}
              disabled={schedulingInspections || !existingId || selectedTasks.length === 0}
              className="w-full"
              size="lg"
            >
              {schedulingInspections ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />점검 일정 생성 중...</>
              ) : (
                <><Calendar className="w-4 h-4 mr-2" />법정점검 일정 자동 생성</>
              )}
            </Button>
          )}

          {!existingId && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>먼저 "건물 정보 입력" 단계에서 건물 정보를 저장해주세요.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
