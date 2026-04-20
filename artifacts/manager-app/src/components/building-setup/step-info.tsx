import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Save,
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { CATEGORY_LABELS, FIELD_LABELS } from "@/lib/page-constants/building-setup";
import type { BuildingData, SafetyResult, SelectedTask } from "./types";

interface Props {
  building: BuildingData;
  setBuilding: React.Dispatch<React.SetStateAction<BuildingData>>;
  handleFieldChange: (field: keyof BuildingData, value: string | boolean) => void;
  safetyResult: SafetyResult | null;
  calculatingSafety: boolean;
  calculateSafety: (input: Record<string, string>) => void;
  selectedTasks: SelectedTask[];
  saving: boolean;
  existingId: number | null;
  saveBuilding: () => void;
}

export function StepInfo({
  building,
  setBuilding,
  handleFieldChange,
  safetyResult,
  calculatingSafety,
  calculateSafety,
  selectedTasks,
  saving,
  existingId,
  saveBuilding,
}: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            건물 기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {building.addressLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
              <strong>건물 주소가 잠겨 있습니다.</strong>{" "}
              관리소장 위저드 완료 후 모든 회계·법무 문서에 동일 주소가 사용되도록 잠겼습니다.
              변경이 필요한 경우 <strong>1800-0416</strong>으로 연락해 주세요.
            </div>
          )}
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
                disabled={building.addressLocked}
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
              <Select value={building.sido || undefined} onValueChange={(v) => {
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
              <Select value={building.sigungu || undefined} onValueChange={(v) => handleFieldChange("sigungu", v)}>
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
              <Label>사용승인일</Label>
              <Input
                type="date"
                value={building.approvalDate}
                onChange={(e) => handleFieldChange("approvalDate", e.target.value)}
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
              <Label>수전설비 용량 (kW)</Label>
              <Input
                type="number"
                value={building.electricCapacityKw}
                onChange={(e) => handleFieldChange("electricCapacityKw", e.target.value)}
                placeholder="예: 75, 300, 1000"
              />
              <p className="text-xs text-muted-foreground mt-1">75kW 이상 시 전기안전관리자 선임</p>
            </div>
            <div>
              <Label>가스사용량 (㎥/월)</Label>
              <Input
                type="number"
                value={building.gasUsageMonthly}
                onChange={(e) => handleFieldChange("gasUsageMonthly", e.target.value)}
                placeholder="예: 500, 2000"
              />
              <p className="text-xs text-muted-foreground mt-1">2,000㎥/월 이상 시 가스안전관리자 선임</p>
            </div>
          </div>

          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
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

          <div className="border rounded-lg p-3 bg-muted/30">
            <PhotoUploadField
              label="건물 로고 (공고문·의뢰서 상단에 자동 인쇄)"
              value={building.logoUrl}
              onChange={(url) => setBuilding((prev) => ({ ...prev, logoUrl: url }))}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              업로드한 로고는 점검 안내문, 처리완료 공지문, 업체 의뢰서 상단에 함께 인쇄됩니다.
            </p>
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
          electricCapacityKw: building.electricCapacityKw || "0",
          gasUsageMonthly: building.gasUsageMonthly || "0",
          hasGas: String(building.hasGas),
        });
      }} variant="outline" className="w-full" disabled={calculatingSafety}>
        {calculatingSafety ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />분석 중...</>
        ) : (
          <><Shield className="w-4 h-4 mr-2" />안전관리자 선임기준 및 법정점검 분석</>
        )}
      </Button>

      {safetyResult && (
        <div className="space-y-4">
          <Card className={safetyResult.safetyManagerRequired ? "border-orange-300 bg-orange-50/50" : "border-green-300 bg-green-50/50"}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {safetyResult.safetyManagerRequired ? (
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                )}
                안전관리자 선임기준 분석 결과
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={safetyResult.safetyManagerRequired ? "destructive" : "secondary"}>
                  {safetyResult.safetyManagerRequired ? "선임 필수" : "해당 없음"}
                </Badge>
                {safetyResult.safetyManagerType && (
                  <span className="text-sm font-medium">{safetyResult.safetyManagerType}</span>
                )}
              </div>
              {safetyResult.requiredInspections.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">필수 법정점검 항목:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(safetyResult.requiredInspections)].map((cat) => (
                      <span key={cat} className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {safetyResult.fields && safetyResult.fields.length > 0 && (
            <div className="grid grid-cols-1 desktop:grid-cols-2 gap-3">
              {safetyResult.fields.map((f) => (
                <Card key={f.field} className={`border ${f.required ? "border-orange-200 bg-orange-50/30" : "border-gray-200 bg-gray-50/30"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-bold">{FIELD_LABELS[f.field] || f.field}</h4>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${f.required ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-600"}`}>
                        {f.required ? "선임 필수" : "해당 없음"}
                      </span>
                    </div>
                    {f.grade && (
                      <p className="text-sm font-medium text-primary mb-1">{f.grade}</p>
                    )}
                    {f.type && f.required && (
                      <p className="text-xs text-muted-foreground mb-1">유형: {f.type}</p>
                    )}
                    <p className="text-xs text-muted-foreground mb-2">근거: {f.legalBasis}</p>
                    {f.notes.map((note, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                        <span className={`mt-0.5 ${f.required ? "text-orange-500" : "text-gray-400"}`}>•</span>
                        {note}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {safetyResult && selectedTasks.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Info className="w-4 h-4" />
            <span className="font-medium">
              {selectedTasks.length}건의 법정업무가 준비되었습니다.
              건물 저장 후 "법정업무 선택" 단계에서 확인하세요.
            </span>
          </div>
        </div>
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
  );
}
