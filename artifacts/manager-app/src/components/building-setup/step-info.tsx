import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Building,
  Save,
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  X,
} from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/page-constants/building-setup";
import type { BuildingData, SafetyResult } from "./types";
import { LegalAppointmentList } from "./legal-appointment-list";

interface Props {
  building: BuildingData;
  setBuilding: React.Dispatch<React.SetStateAction<BuildingData>>;
  handleFieldChange: (field: keyof BuildingData, value: string | boolean) => void;
  safetyResult: SafetyResult | null;
  calculatingSafety: boolean;
  calculateSafety: (input: Record<string, string>) => void;
  saving: boolean;
  existingId: number | null;
  saveBuilding: () => void;
  // [Task #458] 편집 가드 prop. isEditing=false 면 모든 입력이 비활성화된다.
  isEditing: boolean;
  enterEditMode: () => void;
  cancelEdit: () => void;
  // [Task #629] "빈 placeholder 건물" 여부. 훅에서 단일 SoT 로 계산해 내려준다.
  //   - true 이면 안내 박스를 노출하고, 저장 버튼을 항상 보여 준다.
  isPlaceholderBuilding?: boolean;
}

export function StepInfo({
  building,
  handleFieldChange,
  safetyResult,
  calculatingSafety,
  calculateSafety,
  saving,
  existingId,
  saveBuilding,
  isEditing,
  enterEditMode,
  cancelEdit,
  isPlaceholderBuilding = false,
}: Props) {
  // [Task #458] 읽기 전용일 때 모든 입력 필드를 비활성화한다.
  //   - 도로명 주소처럼 별도 잠금 정책이 있는 필드는 (잠금 || 읽기전용) OR 결합으로 가드.
  const readOnly = !isEditing;
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
          {/* [Task #629] 빈 placeholder 건물 안내. seed/회귀 등으로 사용자가 비어 있는
              건물 행에 묶여 들어왔을 때 잠긴 화면 대신 시작 가이드를 노출한다. */}
          {isPlaceholderBuilding && (
            <div
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 leading-relaxed"
              data-testid="banner-empty-building-placeholder"
            >
              <strong>이 건물은 정보가 비어 있습니다.</strong>{" "}
              위쪽 ‘건물 주소’ 카드에서 <strong>주소 검색</strong>을 눌러 건축물대장을 자동으로 불러오거나,
              아래 입력 필드에 직접 입력 후 <strong>건물 정보 저장</strong>을 눌러 시작하세요.
            </div>
          )}
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
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>도로명 주소</Label>
              <Input
                value={building.addressFull}
                onChange={(e) => handleFieldChange("addressFull", e.target.value)}
                placeholder="도로명 주소"
                disabled={readOnly || building.addressLocked}
              />
            </div>
            <div>
              <Label>지번 주소</Label>
              <Input
                value={building.addressJibun}
                onChange={(e) => handleFieldChange("addressJibun", e.target.value)}
                placeholder="지번 주소"
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>우편번호</Label>
              <Input
                value={building.zipCode}
                onChange={(e) => handleFieldChange("zipCode", e.target.value)}
                placeholder="우편번호"
                disabled={readOnly}
              />
            </div>
          </div>
          {/* [Task #412] 시/도, 시/군/구, 동/읍/면 드롭다운 UI 제거.
              주소 검색 결과로 자동 세팅되는 값은 building 상태와 저장 페이로드에 그대로 보존된다. */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          {/* [Task #458/#531] 카드 제목 옆 ‘수정하기’ 버튼. 누르면 페이지 전체 입력 필드가 풀린다.
              신규 건물(existingId === null)에서는 수정할 대상 자체가 없으므로 노출하지 않는다 —
              이미 진입 시점부터 편집 모드라서 무의미한 데다, 사용자에게 ‘저장 전에 또 뭘 눌러야
              하나’ 라는 혼선을 키운다. */}
          <div className="flex items-center justify-between gap-2">
            <CardTitle>건물 상세 정보</CardTitle>
            {!isEditing && existingId !== null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={enterEditMode}
                data-testid="button-edit-building-info"
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                수정하기
              </Button>
            )}
          </div>
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
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>지상 층수</Label>
              <Input
                type="number"
                value={building.totalFloors}
                onChange={(e) => handleFieldChange("totalFloors", e.target.value)}
                placeholder="지상 층수"
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>지하 층수</Label>
              <Input
                type="number"
                value={building.basementFloors}
                onChange={(e) => handleFieldChange("basementFloors", e.target.value)}
                placeholder="지하 층수"
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>연면적 (㎡)</Label>
              <Input
                type="number"
                value={building.totalArea}
                onChange={(e) => handleFieldChange("totalArea", e.target.value)}
                placeholder="연면적"
                disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>건축면적 (㎡)</Label>
              <Input
                type="number"
                value={building.buildingArea}
                onChange={(e) => handleFieldChange("buildingArea", e.target.value)}
                placeholder="건축면적"
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>구조</Label>
              <Input
                value={building.structureType}
                onChange={(e) => handleFieldChange("structureType", e.target.value)}
                placeholder="예: 철근콘크리트"
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>준공일</Label>
              <Input
                type="date"
                value={building.completionDate}
                onChange={(e) => handleFieldChange("completionDate", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>사용승인일</Label>
              <Input
                type="date"
                value={building.approvalDate}
                onChange={(e) => handleFieldChange("approvalDate", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>승강기 수</Label>
              <Input
                type="number"
                value={building.elevatorCount}
                onChange={(e) => handleFieldChange("elevatorCount", e.target.value)}
                placeholder="승강기 수"
                disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>수전설비 용량 (kW)</Label>
              <Input
                type="number"
                value={building.electricCapacityKw}
                onChange={(e) => handleFieldChange("electricCapacityKw", e.target.value)}
                placeholder="예: 75, 300, 1000"
                disabled={readOnly}
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
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground mt-1">2,000㎥/월 이상 시 가스안전관리자 선임</p>
            </div>
          </div>

          {/* [Task #399] 입주민 안내·공지에 사용되는 건물 연락처 4종 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">입주민 안내용 연락처</Label>
            <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
              <div>
                <Label>관리사무소 전화번호</Label>
                <Input
                  value={building.managementOfficePhone}
                  onChange={(e) => handleFieldChange("managementOfficePhone", e.target.value)}
                  placeholder="02-000-0000"
                  data-testid="input-management-office-phone"
                  disabled={readOnly}
                />
              </div>
              <div>
                <Label>관리비문의 전화번호</Label>
                <Input
                  value={building.feeInquiryPhone}
                  onChange={(e) => handleFieldChange("feeInquiryPhone", e.target.value)}
                  placeholder="02-000-0000"
                  data-testid="input-fee-inquiry-phone"
                  disabled={readOnly}
                />
              </div>
              <div>
                <Label>시설방재실 전화번호</Label>
                <Input
                  value={building.facilitySafetyPhone}
                  onChange={(e) => handleFieldChange("facilitySafetyPhone", e.target.value)}
                  placeholder="02-000-0000"
                  data-testid="input-facility-safety-phone"
                  disabled={readOnly}
                />
              </div>
              <div>
                <Label>관리사무소 팩스</Label>
                <Input
                  value={building.managementOfficeFax}
                  onChange={(e) => handleFieldChange("managementOfficeFax", e.target.value)}
                  placeholder="02-000-0000"
                  disabled={readOnly}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              위 번호는 자동 공지문·안내문에 사용됩니다(관리소장 개인 연락처 아님).
            </p>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={building.hasPlayground}
                onCheckedChange={(v) => handleFieldChange("hasPlayground", v)}
                disabled={readOnly}
              />
              <Label className="text-sm">어린이 놀이터</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={building.hasGas}
                onCheckedChange={(v) => handleFieldChange("hasGas", v)}
                disabled={readOnly}
              />
              <Label className="text-sm">도시가스</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={building.hasSepticTank}
                onCheckedChange={(v) => handleFieldChange("hasSepticTank", v)}
                disabled={readOnly}
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

          {/* [Task #501] 위저드 InfoStep 과 동일한 공용 컴포넌트로 통합.
              "선임 필요 / 확인 필요 / 선임 불요" 3-상태를 한 화면에 모아 표시한다. */}
          {safetyResult.fields && safetyResult.fields.length > 0 && (
            <LegalAppointmentList fields={safetyResult.fields} />
          )}
        </div>
      )}
      {/* [Task #412] "법정업무 선택" 탭 제거에 따라 선택된 법정업무 안내 박스도 제거.
          관련 자동 추가 로직은 use-building-setup.ts에 그대로 보존되어 백엔드 스케줄에 반영. */}

      {/* [Task #458/#531/#629] 편집 모드(isEditing) 또는 신규 건물(existingId === null),
          또는 빈 placeholder 건물(isPlaceholderBuilding) 일 때 저장 버튼을 노출한다.
          - 신규 건물에서는 hook 이 진입 시 isEditing=true 로 두므로 두 조건 모두 만족하지만,
            방어적으로 OR 결합을 유지해 isEditing 초기값에 의존하지 않게 한다.
          - placeholder 건물(주소·세대수·완공일 중 두 개 이상이 비어 있음)이 어떤 경로로든
            다시 들어와도 즉시 저장 버튼을 노출해, "수정하기 → 저장" 동선이 사라지지 않게
            한다(Task #629 의 핵심 가드 — 이전 회귀: existingId 만 보고 read-only 잠금).
          - 저장 성공 시 hook 이 isEditing 을 false 로 되돌리며, 이때 existingId 가 채워져
            ‘수정하기’ 버튼이 다시 보이는 흐름으로 자연스럽게 전환된다.
          - 취소 버튼은 신규 건물에서는 ‘되돌릴 마지막 저장 스냅샷’ 자체가 비어 있어 의미가
            없으므로 숨긴다. 기존 건물 편집 흐름에서만 노출. */}
      {(isEditing || existingId === null || isPlaceholderBuilding) && (
        <div className="flex flex-col-reverse desktop:flex-row gap-2">
          {isEditing && existingId !== null && (
            <Button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              variant="outline"
              className="desktop:w-32"
              size="lg"
              data-testid="button-cancel-edit-building-info"
            >
              <X className="w-4 h-4 mr-2" />
              취소
            </Button>
          )}
          <Button
            onClick={saveBuilding}
            disabled={saving || !building.name}
            className="flex-1"
            size="lg"
            data-testid="button-save-building-info"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />저장 중...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />{existingId ? "건물 정보 수정" : "건물 정보 저장"}</>
            )}
          </Button>
        </div>
      )}
      {/* [Task #160] 주소 잠금 상태에서 저장 버튼 인근에 보조 안내 표시 */}
      {isEditing && existingId && building.addressLocked && (
        <p className="mt-2 text-xs text-amber-700 text-center">
          🔒 주소 외 정보만 수정 가능 (변경 필요 시 1800-0416)
        </p>
      )}
    </>
  );
}
