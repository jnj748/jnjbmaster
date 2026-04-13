import { useState, useEffect } from "react";
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
} from "lucide-react";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";

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
}

interface SafetyResult {
  safetyManagerRequired: boolean;
  safetyManagerType: string | null;
  requiredInspections: string[];
  safetyNotes: string[];
  facilityManagerCriteria: string[];
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
};

const INSPECTION_CATEGORIES = [
  {
    key: "fire_safety",
    label: "소방",
    presets: [
      { name: "소방 법정점검 (작동+정밀)", cycle: "연 1회" },
    ],
  },
  {
    key: "electrical",
    label: "전기",
    presets: [
      { name: "전기안전 법정점검", cycle: "2~3년 1회" },
    ],
  },
  {
    key: "elevator",
    label: "승강기",
    presets: [
      { name: "승강기 법정 안전검사", cycle: "연 1회" },
    ],
  },
  {
    key: "water_tank",
    label: "저수조",
    presets: [
      { name: "저수조 청소", cycle: "반기 1회" },
    ],
  },
  {
    key: "septic",
    label: "정화조",
    presets: [
      { name: "정화조 청소", cycle: "연 1회" },
    ],
  },
  {
    key: "hygiene",
    label: "위생/환경",
    presets: [
      { name: "수질 검사", cycle: "연 1회" },
      { name: "실내공기질 검사", cycle: "연 1회" },
    ],
  },
  {
    key: "building_safety",
    label: "건축물 안전",
    presets: [
      { name: "건축물 정기점검", cycle: "반기 1회" },
    ],
  },
  {
    key: "gas",
    label: "가스",
    presets: [
      { name: "가스 안전점검", cycle: "연 1회" },
    ],
  },
  {
    key: "playground",
    label: "놀이터",
    presets: [
      { name: "어린이 놀이터 법정 안전검사", cycle: "2년 1회" },
    ],
  },
];

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

  const [lookupSigunguCd, setLookupSigunguCd] = useState("");
  const [lookupBjdongCd, setLookupBjdongCd] = useState("");
  const [lookupBun, setLookupBun] = useState("");
  const [lookupJi, setLookupJi] = useState("");

  useEffect(() => {
    fetchBuilding();
  }, []);

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

  async function lookupBuildingRegister() {
    if (!lookupSigunguCd || !lookupBjdongCd || !lookupBun) {
      toast({ title: "시군구코드, 법정동코드, 본번을 입력해주세요", variant: "destructive" });
      return;
    }

    setLookingUp(true);
    try {
      const params = new URLSearchParams({
        sigunguCd: lookupSigunguCd,
        bjdongCd: lookupBjdongCd,
        bun: lookupBun,
        ji: lookupJi || "0",
      });

      const res = await fetch(`${apiBase}/buildings/lookup-register?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();

      if (result.found && result.data) {
        const d = result.data;
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
        }));

        toast({ title: "건축물대장 정보를 불러왔습니다" });

        calculateSafety({
          totalArea: d.totalArea || "0",
          totalFloors: String(d.totalFloors || 0),
          basementFloors: String(d.basementFloors || 0),
          totalUnits: String(d.totalUnits || 0),
          elevatorCount: String(d.elevatorCount || 0),
          buildingUsage: d.mainPurpose || "",
        });
      } else {
        toast({ title: "해당 건물 정보를 찾을 수 없습니다", variant: "destructive" });
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

    const hasAnyDate = Object.values(inspectionDates).some(
      (cat) => Object.values(cat).some((d) => d)
    );

    if (!hasAnyDate) {
      toast({ title: "최소 1개 이상의 점검 일자를 입력해주세요", variant: "destructive" });
      return;
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
          inspectionDates,
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

  function updateInspectionDate(category: string, presetName: string, date: string) {
    setInspectionDates((prev) => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [presetName]: date,
      },
    }));
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
    { label: "건축물대장 조회", icon: Search },
    { label: "건물 정보 입력", icon: Building },
    { label: "법정점검 초기값", icon: Calendar },
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              건축물대장 조회
            </CardTitle>
            <CardDescription>
              건축물대장 코드를 입력하면 건물 정보를 자동으로 가져옵니다.
              시군구코드와 법정동코드는 행정표준코드관리시스템에서 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">시군구코드 *</Label>
                <Input
                  placeholder="예: 11680"
                  value={lookupSigunguCd}
                  onChange={(e) => setLookupSigunguCd(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">법정동코드 *</Label>
                <Input
                  placeholder="예: 10300"
                  value={lookupBjdongCd}
                  onChange={(e) => setLookupBjdongCd(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">본번 *</Label>
                <Input
                  placeholder="예: 12"
                  value={lookupBun}
                  onChange={(e) => setLookupBun(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">부번</Label>
                <Input
                  placeholder="예: 0"
                  value={lookupJi}
                  onChange={(e) => setLookupJi(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">코드 확인 방법</p>
                  <p className="mt-1">1. 등기부등본 또는 건축물대장에서 지번 주소를 확인</p>
                  <p>2. 시군구코드 5자리 + 법정동코드 5자리를 입력</p>
                  <p>3. 지번의 본번과 부번을 각각 입력</p>
                  <p className="mt-1 text-blue-600">
                    예시) 서울 강남구(11680) 삼성동(10500) 12-3번지 → 시군구: 11680, 법정동: 10500, 본번: 12, 부번: 3
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={lookupBuildingRegister}
              disabled={lookingUp}
              className="w-full"
            >
              {lookingUp ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  건축물대장 조회 중...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  건축물대장 조회
                </>
              )}
            </Button>

            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={() => setActiveStep(1)}>
                직접 입력하기 →
              </Button>
            </div>
          </CardContent>
        </Card>
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
                      {safetyResult.requiredInspections.map((cat) => {
                        const found = INSPECTION_CATEGORIES.find((c) => c.key === cat);
                        return (
                          <Badge key={cat} variant="outline" className="text-xs">
                            {found?.label || cat}
                          </Badge>
                        );
                      })}
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
                법정점검 최근 실시일 입력
              </CardTitle>
              <CardDescription>
                각 법정점검의 최근 실시일을 입력하면 다음 점검일이 자동으로 계산됩니다.
                해당 없는 항목은 비워두세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {INSPECTION_CATEGORIES.map((cat) => {
                const isRequired = safetyResult?.requiredInspections?.includes(cat.key);
                const isRelevant =
                  !safetyResult ||
                  isRequired ||
                  (cat.key === "playground" && building.hasPlayground) ||
                  (cat.key === "gas" && building.hasGas) ||
                  (cat.key === "septic" && building.hasSepticTank);

                if (!isRelevant) return null;

                return (
                  <div key={cat.key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{cat.label}</h3>
                      {isRequired && (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300">필수</Badge>
                      )}
                    </div>
                    {cat.presets.map((preset) => (
                      <div key={preset.name} className="flex items-center gap-3 pl-3">
                        <Label className="text-sm flex-1 min-w-0">
                          {preset.name}
                          <span className="text-xs text-muted-foreground ml-1">({preset.cycle})</span>
                        </Label>
                        <Input
                          type="date"
                          className="w-40 flex-shrink-0"
                          value={inspectionDates[cat.key]?.[preset.name] || ""}
                          onChange={(e) => updateInspectionDate(cat.key, preset.name, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>

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
              disabled={schedulingInspections || !existingId}
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
