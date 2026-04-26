// [Task #411] 관리소장 ‘건물 관리정보 설정’의 ‘주소 검색’ 과 ‘건물 정보 입력’ 을
// 한 화면에 통합한 컴포넌트.
// - 위에는 주소 검색 카드(StepAddress) — 다음 단계 이동 버튼은 hideNavButtons 로 숨김.
// - 아래에는 건물 정보 입력 카드(StepInfo) — 안전관리자 분석/저장 버튼 포함.
// - 단계 인덱스가 줄었으므로 saveBuilding 후 점프 위치는 use-building-setup.ts 에서
//   setActiveStep(1)(=로고) 로 보정한다.
import type { RefObject } from "react";
import { StepAddress } from "./step-address";
import { StepInfo } from "./step-info";
import type { BuildingData, SafetyResult, SelectedTask } from "./types";

interface Props {
  building: BuildingData;
  setBuilding: React.Dispatch<React.SetStateAction<BuildingData>>;
  handleFieldChange: (field: keyof BuildingData, value: string | boolean) => void;
  postcodeLoaded: boolean;
  lookingUp: boolean;
  registerPreview: Record<string, unknown> | null;
  areaInfo: { floorNo: string; purposeName: string; exposArea: number; pubUseArea: number }[];
  openKakaoPostcode: () => void;
  postcodeOpen: boolean;
  setPostcodeOpen: (v: boolean) => void;
  postcodeContainerRef: RefObject<HTMLDivElement | null>;
  setActiveStep: (n: number) => void;
  safetyResult: SafetyResult | null;
  calculatingSafety: boolean;
  calculateSafety: (input: Record<string, string>) => void;
  selectedTasks: SelectedTask[];
  saving: boolean;
  existingId: number | null;
  saveBuilding: () => void;
}

export function StepAddressInfo(props: Props) {
  // [Task #411] 주소 검색을 마치면 아래 ‘건물 정보’ 폼으로 자동 채워진 값을 확인하고
  // 저장하면 된다는 흐름 안내. 주소가 채워졌을 때만 노출.
  const showHandoffHint = Boolean(props.building.addressFull);
  return (
    <div className="space-y-6">
      <StepAddress
        building={props.building}
        postcodeLoaded={props.postcodeLoaded}
        lookingUp={props.lookingUp}
        registerPreview={props.registerPreview}
        areaInfo={props.areaInfo}
        openKakaoPostcode={props.openKakaoPostcode}
        postcodeOpen={props.postcodeOpen}
        setPostcodeOpen={props.setPostcodeOpen}
        postcodeContainerRef={props.postcodeContainerRef}
        setActiveStep={props.setActiveStep}
        hideNavButtons
      />
      {showHandoffHint && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          아래 ‘건물 정보’ 를 확인·수정한 뒤 <strong>건물 정보 저장</strong> 버튼을 눌러 주세요.
        </div>
      )}
      <StepInfo
        building={props.building}
        setBuilding={props.setBuilding}
        handleFieldChange={props.handleFieldChange}
        safetyResult={props.safetyResult}
        calculatingSafety={props.calculatingSafety}
        calculateSafety={props.calculateSafety}
        selectedTasks={props.selectedTasks}
        saving={props.saving}
        existingId={props.existingId}
        saveBuilding={props.saveBuilding}
      />
    </div>
  );
}
