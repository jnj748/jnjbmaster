// [Task #411/#412] 관리소장 ‘건물정보 수정’ 단일 화면의 주소 + 건물 정보 섹션.
// - 위에는 주소 카드(StepAddress) — 이미 저장된 주소면 읽기 전용, 신규면 검색 진입.
// - 아래에는 건물 정보 입력 카드(StepInfo) — 안전관리자 분석/저장 버튼 포함.
import type { RefObject } from "react";
import { StepAddress } from "./step-address";
import { StepInfo } from "./step-info";
import type { BuildingData, SafetyResult } from "./types";
// [Task #568] 건물정보 수정 화면 하단에도 건축물대장 표제부/총괄표제부 상세와
// 전유부(호실별 면적) 카드를 노출해, 관리소장이 /settings/building 한 화면에서
// 모든 건축물대장 항목을 검토할 수 있게 한다.
import { BuildingRegisterDetailsCard } from "@/components/building-register/building-register-details-card";
import { BuildingExposeAreasCard } from "@/components/building-register/building-expose-areas-card";

interface Props {
  building: BuildingData;
  setBuilding: React.Dispatch<React.SetStateAction<BuildingData>>;
  handleFieldChange: (field: keyof BuildingData, value: string | boolean) => void;
  postcodeLoaded: boolean;
  lookingUp: boolean;
  registerPreview: Record<string, unknown> | null;
  // [Task #568] AreaInfoRow 와 동일 형태(동·호실 포함). StepAddress 의 미니 표 + 새
  //   BuildingExposeAreasCard 가 같은 in-memory 데이터를 공유한다.
  areaInfo: {
    dong: string;
    floorNo: string;
    purposeName: string;
    hoNm: string;
    exposArea: number;
    pubUseArea: number;
  }[];
  openKakaoPostcode: () => void;
  // [Task #427] 잠긴 주소에서도 식별자만 다시 받기 위한 진입점.
  openRelookupPostcode: () => void;
  postcodeOpen: boolean;
  setPostcodeOpen: (v: boolean) => void;
  postcodeContainerRef: RefObject<HTMLDivElement | null>;
  safetyResult: SafetyResult | null;
  calculatingSafety: boolean;
  calculateSafety: (input: Record<string, string>) => void;
  saving: boolean;
  existingId: number | null;
  saveBuilding: () => void;
  // [Task #458] 편집 가드 prop — 진입 시 false(읽기 전용).
  isEditing: boolean;
  enterEditMode: () => void;
  cancelEdit: () => void;
  // [Task #629] 빈 placeholder 건물 여부. step-info 의 안내 박스/저장 버튼 가시성에 사용.
  isPlaceholderBuilding: boolean;
}

export function StepAddressInfo(props: Props) {
  return (
    <div className="space-y-6">
      <StepAddress
        building={props.building}
        postcodeLoaded={props.postcodeLoaded}
        lookingUp={props.lookingUp}
        registerPreview={props.registerPreview}
        areaInfo={props.areaInfo}
        openKakaoPostcode={props.openKakaoPostcode}
        openRelookupPostcode={props.openRelookupPostcode}
        postcodeOpen={props.postcodeOpen}
        setPostcodeOpen={props.setPostcodeOpen}
        postcodeContainerRef={props.postcodeContainerRef}
      />
      <StepInfo
        building={props.building}
        setBuilding={props.setBuilding}
        handleFieldChange={props.handleFieldChange}
        safetyResult={props.safetyResult}
        calculatingSafety={props.calculatingSafety}
        calculateSafety={props.calculateSafety}
        saving={props.saving}
        existingId={props.existingId}
        saveBuilding={props.saveBuilding}
        isEditing={props.isEditing}
        enterEditMode={props.enterEditMode}
        cancelEdit={props.cancelEdit}
        isPlaceholderBuilding={props.isPlaceholderBuilding}
      />
      {/* [Task #568] 편집 여부와 관계없이 항상 읽기 전용으로 노출. registerData 가
          비어 있으면 BuildingRegisterDetailsCard 가 자체적으로 카드를 숨긴다.
          전유부 카드는 useBuildingSetup 의 in-memory areaInfo 를 seedAreas 로 받아
          "건축물대장 다시 조회" 직후(저장 전) 즉시 갱신되도록 한다. seedAreas 가
          비어 있을 때만 buildingId 기반 fallback 페치가 동작한다. */}
      <BuildingRegisterDetailsCard registerData={props.building.registerData ?? null} />
      <BuildingExposeAreasCard
        buildingId={props.existingId ?? null}
        seedAreas={props.areaInfo}
      />
    </div>
  );
}
