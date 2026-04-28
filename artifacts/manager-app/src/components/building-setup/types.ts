export interface BuildingData {
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
  // [Task #399] 입주민 안내용 추가 연락처 (관리비문의/시설방재실).
  feeInquiryPhone: string;
  facilitySafetyPhone: string;
  logoUrl: string | null;
  landArea: string;
  buildingArea: string;
  buildingCoverageRatio: string;
  floorAreaRatio: string;
  electricCapacityKw: string;
  gasUsageMonthly: string;
  approvalDate: string;
  areaBasis?: string | null;
  addressLocked?: boolean;
  // [Task #328] 표제부/총괄표제부 응답 원본. 위저드에서 조회 시 받아 두었다가
  // 저장 시 함께 전송해 buildings.register_data 컬럼에 보관한다.
  registerData?: {
    title?: Record<string, unknown> | null;
    recap?: Record<string, unknown> | null;
  } | null;
  // [Task #348] 건축물대장 관리PK(mgmBldrgstPk). 호실 일괄 가져오기/단계 게이트에 사용.
  buildingRegisterPk?: string | null;
  // [Task #516] 다동 단지의 동(棟)별 표제부 PK 캐시. lookup-register 응답에 dongs[] 가
  // 들어 있으면 그대로 보관해 호실 일괄 가져오기 시 모든 동을 순회한다.
  registerDongPks?: { mgmBldrgstPk: string; dongName: string; isMain: boolean }[] | null;
}

// [Task #501] 항목별 3-상태. 백엔드 calculate-safety 와 동일 정의를 유지한다.
//   - required:      법정 기준 충족 → 선임 필요
//   - pending_input: 입력값 부족(0/누락) → "확인 필요"
//   - not_required:  법령 기준 미달이 분명함 → 선임 불요
export type AppointmentStatus = "required" | "pending_input" | "not_required";

export interface AppointmentField {
  field: string;
  required: boolean;
  // [Task #501] 백엔드가 내려주지 않는 구버전 응답을 고려해 옵셔널로 둔다.
  status?: AppointmentStatus;
  grade: string | null;
  type: string | null;
  legalBasis: string;
  notes: string[];
  // [Task #501] status==="pending_input" 일 때 부족한 입력 키 목록.
  pendingInputs?: string[];
}

export interface SafetyResult {
  safetyManagerRequired: boolean;
  safetyManagerType: string | null;
  requiredInspections: string[];
  safetyNotes: string[];
  facilityManagerCriteria: string[];
  fields?: AppointmentField[];
}

export interface PresetItem {
  id?: number;
  name: string;
  category: string;
  inspectionType: string;
  legalCycleMonths: number;
  description?: string;
  legalBasis?: string;
}

export interface SelectedTask {
  name: string;
  category: string;
  legalCycleMonths: number;
  lastDate: string;
  description?: string;
  legalBasis?: string;
}

export interface InspectionDates {
  [category: string]: {
    [presetName: string]: string;
  };
}
