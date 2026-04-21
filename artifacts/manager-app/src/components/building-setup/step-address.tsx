import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, MapPin, Search } from "lucide-react";
import type { RefObject } from "react";
import type { BuildingData } from "./types";

interface Props {
  building: BuildingData;
  postcodeLoaded: boolean;
  lookingUp: boolean;
  registerPreview: Record<string, unknown> | null;
  areaInfo: { floorNo: string; purposeName: string; exposArea: number; pubUseArea: number }[];
  openKakaoPostcode: () => void;
  postcodeOpen: boolean;
  setPostcodeOpen: (v: boolean) => void;
  postcodeContainerRef: RefObject<HTMLDivElement | null>;
  setActiveStep: (n: number) => void;
}

export function StepAddress({
  building,
  postcodeLoaded,
  lookingUp,
  registerPreview,
  areaInfo,
  openKakaoPostcode,
  postcodeOpen,
  setPostcodeOpen,
  postcodeContainerRef,
  setActiveStep,
}: Props) {
  return (
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
