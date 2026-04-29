import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { StepAddressInfo } from "@/components/building-setup/step-address-info";
import { StepLogo } from "@/components/building-setup/step-logo";
import { StepUnitsImport } from "@/components/building-setup/step-units-import";
import { useBuildingSetup } from "@/components/building-setup/use-building-setup";

declare global {
  interface Window {
    daum: {
      Postcode: new (config: {
        oncomplete: (data: {
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
        }) => void;
        width?: string;
        height?: string;
      }) => { open: () => void };
    };
  }
}

export default function BuildingSetup() {
  const setup = useBuildingSetup();
  const [location] = useLocation();
  const unitsImportRef = useRef<HTMLDivElement | null>(null);

  // [Task #412] 단일 화면 구조에서는 ?tab=units-import 진입 시 호실정보 불러오기
  // 섹션으로 부드럽게 스크롤한다(이전에는 setActiveStep으로 단계 전환).
  // 하위 카드들이 비동기로 컨텐츠를 채우면 위쪽 카드 높이가 변하면서 첫 스크롤이 빗나가므로
  // 여러 시점에 보정 스크롤을 수행한다(레이아웃이 안정될 때까지).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (setup.loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== "units-import") return;
    const scrollSmooth = () => {
      unitsImportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const scrollInstant = () => {
      unitsImportRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    };
    // 첫 렌더 직후, 컨텐츠 안정 후(약 600ms), 마지막 보정(1500ms) 으로 3회 스크롤.
    const t1 = window.setTimeout(scrollSmooth, 100);
    const t2 = window.setTimeout(scrollSmooth, 600);
    const t3 = window.setTimeout(scrollInstant, 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [location, setup.loading]);

  if (setup.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-[max(env(safe-area-inset-bottom),8rem)] [scroll-padding-bottom:8rem]">
      <div>
        <h1 className="text-2xl font-bold">건물정보 수정</h1>
        <p className="text-muted-foreground text-sm mt-1">
          건축물대장으로 자동 불러온 건물 정보·로고·호실정보를 한 화면에서 관리합니다.
        </p>
      </div>

      {/* [Task #412] 주소(읽기 전용 또는 신규 검색) + 건물 기본 정보 */}
      {/* [Task #458] 편집 가드 prop 전달 — 진입 시 모든 입력은 읽기 전용. */}
      {/* [Task #475] RFQ 다이얼로그의 "건물 정보 설정으로 이동" CTA 가
          /building-setup#address-info 로 이동했을 때 이 섹션으로 스크롤되도록 anchor 부여. */}
      <div id="address-info" className="scroll-mt-24">
      <StepAddressInfo
        building={setup.building}
        setBuilding={setup.setBuilding}
        handleFieldChange={setup.handleFieldChange}
        postcodeLoaded={setup.postcodeLoaded}
        lookingUp={setup.lookingUp}
        registerPreview={setup.registerPreview}
        areaInfo={setup.areaInfo}
        openKakaoPostcode={setup.openKakaoPostcode}
        openRelookupPostcode={setup.openRelookupPostcode}
        postcodeOpen={setup.postcodeOpen}
        setPostcodeOpen={setup.setPostcodeOpen}
        postcodeContainerRef={setup.postcodeContainerRef}
        safetyResult={setup.safetyResult}
        calculatingSafety={setup.calculatingSafety}
        calculateSafety={setup.calculateSafety}
        saving={setup.saving}
        existingId={setup.existingId}
        saveBuilding={setup.saveBuilding}
        isEditing={setup.isEditing}
        enterEditMode={setup.enterEditMode}
        cancelEdit={setup.cancelEdit}
        isPlaceholderBuilding={setup.isPlaceholderBuilding}
      />
      </div>

      {/* [Task #412] 로고 등록 섹션 */}
      {/* [Task #458] 로고 업로드도 편집 모드에서만 변경 가능. */}
      <StepLogo
        building={setup.building}
        setBuilding={setup.setBuilding}
        isEditing={setup.isEditing}
      />

      {/* [Task #412] 호실정보 불러오기 섹션 — ?tab=units-import 로 진입 시 스크롤 대상 */}
      <div ref={unitsImportRef} className="scroll-mt-20">
        <StepUnitsImport
          existingId={setup.existingId}
          hasRegisterPk={Boolean(setup.building.buildingRegisterPk)}
        />
      </div>
    </div>
  );
}
