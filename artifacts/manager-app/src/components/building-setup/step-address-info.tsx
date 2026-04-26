// [Task #411/#412] 관리소장 ‘건물정보 수정’ 단일 화면의 주소 + 건물 정보 섹션.
// - 위에는 주소 카드(StepAddress) — 이미 저장된 주소면 읽기 전용, 신규면 검색 진입.
// - 아래에는 건물 정보 입력 카드(StepInfo) — 안전관리자 분석/저장 버튼 포함.
import type { RefObject } from "react";
import { StepAddress } from "./step-address";
import { StepInfo } from "./step-info";
import type { BuildingData, SafetyResult } from "./types";

interface Props {
  building: BuildingData;
  setBuilding: React.Dispatch<React.SetStateAction<BuildingData>>;
  handleFieldChange: (field: keyof BuildingData, value: string | boolean) => void;
  postcodeLoaded: boolean;
  lookingUp: boolean;
  registerPreview: Record<string, unknown> | null;
  areaInfo: { floorNo: string; purposeName: string; exposArea: number; pubUseArea: number }[];
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
      />
    </div>
  );
}
