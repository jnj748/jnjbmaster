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
}

export interface AppointmentField {
  field: string;
  required: boolean;
  grade: string | null;
  type: string | null;
  legalBasis: string;
  notes: string[];
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
