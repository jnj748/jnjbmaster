import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import type { RefObject } from "react";
import type { BuildingData } from "./types";

interface Props {
  building: BuildingData;
  postcodeLoaded: boolean;
  lookingUp: boolean;
  registerPreview: Record<string, unknown> | null;
  areaInfo: { floorNo: string; purposeName: string; exposArea: number; pubUseArea: number }[];
  openKakaoPostcode: () => void;
  // [Task #427] ‘건축물대장 다시 조회’ 전용 진입점. 주소 잠금은 유지한 채 식별자만 재조회.
  openRelookupPostcode: () => void;
  postcodeOpen: boolean;
  setPostcodeOpen: (v: boolean) => void;
  postcodeContainerRef: RefObject<HTMLDivElement | null>;
}

export function StepAddress({
  building,
  postcodeLoaded,
  lookingUp,
  registerPreview,
  areaInfo,
  openKakaoPostcode,
  openRelookupPostcode,
  postcodeOpen,
  setPostcodeOpen,
  postcodeContainerRef,
}: Props) {
  // [Task #412] 1건물 1유저 원칙에 따라 이미 등록된 주소는 표시 전용으로 잠그고
  // ‘주소 다시 검색’ 버튼을 노출하지 않는다. 신규(주소 미입력) 흐름만 검색 버튼을 노출.
  const hasAddress = Boolean(building.addressFull);
  // [Task #427] 주소는 저장돼 있으나 건축물대장 식별자(mgmBldrgstPk)가 비어 있는
  // 기존 건물에 한해 ‘건축물대장 다시 조회’ 동선을 노출한다.
  const needsRegisterPkRelookup = hasAddress && !building.buildingRegisterPk;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            건물 주소
          </CardTitle>
          <CardDescription>
            {hasAddress
              ? "이 건물의 주소는 회계·법무 문서 일관성을 위해 변경할 수 없습니다."
              : "주소를 검색하면 건축물대장(총괄표제부 + 표제부) 정보가 자동으로 불러와집니다."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAddress && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-green-900">등록된 주소</p>
                  <p className="text-sm text-green-800 mt-1">{building.addressFull}</p>
                  {building.addressJibun && (
                    <p className="text-xs text-green-700 mt-0.5">(지번) {building.addressJibun}</p>
                  )}
                  {building.zipCode && (
                    <p className="text-xs text-green-700 mt-0.5">우편번호 {building.zipCode}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* [Task #427] 주소는 저장돼 있으나 건축물대장 식별자가 비어 있는 기존 건물.
              주소 변경 정책은 그대로 두고, 카카오 주소검색을 다시 열어 같은 주소로
              ‘건축물대장만 재조회’할 수 있도록 안내한다. */}
          {needsRegisterPkRelookup && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-medium text-amber-900">건축물대장 식별자가 없습니다</p>
                  <p className="text-sm text-amber-800">
                    주소가 잠긴 상태로 저장된 기존 건물입니다. 호실정보 불러오기를 사용하려면
                    같은 주소로 건축물대장을 다시 조회해 식별자를 채워 주세요.
                    주소·우편번호 등은 변경되지 않고, 식별자와 표제부 정보만 갱신됩니다.
                  </p>
                  <Button
                    onClick={openRelookupPostcode}
                    disabled={!postcodeLoaded || lookingUp}
                    variant="outline"
                    size="sm"
                    className="border-amber-400 text-amber-900 hover:bg-amber-100"
                    data-testid="button-relookup-register"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    건축물대장 다시 조회
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!hasAddress && (
            <Button
              onClick={openKakaoPostcode}
              disabled={!postcodeLoaded}
              className="w-full"
              size="lg"
            >
              <MapPin className="w-4 h-4 mr-2" />
              주소 검색하기
            </Button>
          )}

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
                  {Boolean(registerPreview.buildingName) && (
                    <div><span className="text-muted-foreground">건물명:</span> <span className="font-medium">{String(registerPreview.buildingName)}</span></div>
                  )}
                  {Boolean(registerPreview.mainPurpose) && (
                    <div><span className="text-muted-foreground">주용도:</span> <span className="font-medium">{String(registerPreview.mainPurpose)}</span></div>
                  )}
                  {Boolean(registerPreview.structureType) && (
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
                  {Boolean(registerPreview.totalArea) && (
                    <div><span className="text-muted-foreground">연면적:</span> <span className="font-medium">{Number(registerPreview.totalArea).toLocaleString()}㎡</span></div>
                  )}
                  {Boolean(registerPreview.landArea) && (
                    <div><span className="text-muted-foreground">대지면적:</span> <span className="font-medium">{Number(registerPreview.landArea).toLocaleString()}㎡</span></div>
                  )}
                  {Boolean(registerPreview.buildingArea) && (
                    <div><span className="text-muted-foreground">건축면적:</span> <span className="font-medium">{Number(registerPreview.buildingArea).toLocaleString()}㎡</span></div>
                  )}
                  {Boolean(registerPreview.buildingCoverageRatio) && (
                    <div><span className="text-muted-foreground">건폐율:</span> <span className="font-medium">{Number(registerPreview.buildingCoverageRatio).toFixed(2)}%</span></div>
                  )}
                  {Boolean(registerPreview.floorAreaRatio) && (
                    <div><span className="text-muted-foreground">용적률:</span> <span className="font-medium">{Number(registerPreview.floorAreaRatio).toFixed(2)}%</span></div>
                  )}
                  {Number(registerPreview.elevatorCount) > 0 && (
                    <div><span className="text-muted-foreground">승강기:</span> <span className="font-medium">{String(registerPreview.elevatorCount)}대</span></div>
                  )}
                  {Number(registerPreview.parkingCount) > 0 && (
                    <div><span className="text-muted-foreground">주차대수:</span> <span className="font-medium">{String(registerPreview.parkingCount)}대</span></div>
                  )}
                  {Boolean(registerPreview.completionDate) && (
                    <div><span className="text-muted-foreground">사용승인일:</span> <span className="font-medium">{String(registerPreview.completionDate)}</span></div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {areaInfo.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">전용/공용 면적 정보</CardTitle>
                <CardDescription>건축물대장 전유부 데이터 (층별)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-1 pr-2">층</th>
                        <th className="text-left py-1 pr-2">용도</th>
                        <th className="text-right py-1 pr-2">전용면적(㎡)</th>
                        <th className="text-right py-1">공용면적(㎡)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {areaInfo.slice(0, 20).map((a, i) => (
                        <tr key={i} className="border-b border-muted/30">
                          <td className="py-1 pr-2">{a.floorNo}</td>
                          <td className="py-1 pr-2">{a.purposeName}</td>
                          <td className="text-right py-1 pr-2">{a.exposArea.toFixed(2)}</td>
                          <td className="text-right py-1">{a.pubUseArea.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {areaInfo.length > 20 && (
                    <p className="text-xs text-muted-foreground mt-1">외 {areaInfo.length - 20}건</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Dialog open={postcodeOpen} onOpenChange={setPostcodeOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>주소 검색</DialogTitle>
          </DialogHeader>
          <div ref={postcodeContainerRef} className="w-full h-[70vh] min-h-[420px]" />
        </DialogContent>
      </Dialog>
    </>
  );
}
