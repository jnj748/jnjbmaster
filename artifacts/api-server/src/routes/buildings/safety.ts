// [Task #496] buildings 라우터 분리 — 안전관리자/법정 점검 자동 산정 핸들러.
//   원본 routes/buildings.ts 의 POST /buildings/calculate-safety 와
//   AppointmentField 인터페이스를 그대로 옮긴다.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ELECTRICAL_RESIDENT_KW,
  ELECTRICAL_REQUIRED_KW,
  FIRE_SPECIAL_GRADE_FLOORS,
  FIRE_SPECIAL_GRADE_AREA,
  FIRE_GRADE_1_FLOORS,
  FIRE_GRADE_1_AREA,
  FIRE_GRADE_1_BASEMENT_MIN,
  FIRE_GRADE_1_BASEMENT_AREA,
  FIRE_GRADE_2_FLOORS,
  FIRE_GRADE_2_AREA,
  GAS_PROTECTION_CLASS1_UNITS,
  GAS_THRESHOLD_PROTECTED_M3,
  GAS_THRESHOLD_DEFAULT_M3,
  GAS_SELF_CHECK_AREA,
  GAS_SELF_CHECK_FLOORS,
  MECH_REQUIRED_AREA,
  MECH_SPECIAL_GRADE_AREA,
  MECH_ADVANCED_GRADE_AREA,
  MECH_INTERMEDIATE_GRADE_AREA,
  TELECOM_REQUIRED_AREA,
  TELECOM_LARGE_AREA,
  TELECOM_MEDIUM_AREA,
  TELECOM_ENFORCEMENT_DATE_LARGE,
  TELECOM_ENFORCEMENT_DATE_MEDIUM,
  TELECOM_ENFORCEMENT_DATE_SMALL,
  ELEVATOR_REQUIRED_COUNT,
  DISINF_RESIDENTIAL_UNITS,
  DISINF_OFFICE_AREA,
  SAFETY_MGR_REQUIRED_AREA,
  SAFETY_MGR_REQUIRED_FLOORS,
  SAFETY_MGR_REQUIRED_BASEMENT,
  SAFETY_MGR_SPECIALIST_AREA,
  SAFETY_MGR_SPECIALIST_FLOORS,
  SAFETY_MGR_PRO_AREA,
  SAFETY_MGR_PRO_FLOORS,
} from "../../domain/statutory";

interface AppointmentField {
  field: string;
  required: boolean;
  grade: string | null;
  type: string | null;
  legalBasis: string;
  notes: string[];
}

const router: IRouter = Router();

router.post("/buildings/calculate-safety", async (req: Request, res: Response) => {
  const { totalArea, totalFloors, basementFloors, totalUnits, buildingUsage, elevatorCount, electricCapacityKw, gasUsageMonthly, hasGas } = req.body;

  const area = parseFloat(totalArea) || 0;
  const floors = parseInt(totalFloors) || 0;
  const basement = parseInt(basementFloors) || 0;
  const units = parseInt(totalUnits) || 0;
  const elevators = parseInt(elevatorCount) || 0;
  const electricKw = parseFloat(electricCapacityKw) || 0;
  const gasMonthly = parseFloat(gasUsageMonthly) || 0;
  const gasEnabled = hasGas !== false && hasGas !== "false";
  const usage = (buildingUsage || "").toLowerCase();
  const isResidential = usage.includes("아파트") || usage.includes("주거") || usage.includes("공동주택") || usage.includes("연립") || usage.includes("다세대");
  const isOffice = usage.includes("사무") || usage.includes("업무") || usage.includes("오피스");
  const isComplex = usage.includes("복합") || usage.includes("근린생활") || usage.includes("판매");

  const fields: AppointmentField[] = [];
  const requiredInspections: string[] = [];

  // 1. 전기안전관리자
  const elecField: AppointmentField = {
    field: "electrical",
    required: false,
    grade: null,
    type: null,
    legalBasis: "전기안전관리법 제22조",
    notes: [],
  };
  if (electricKw >= ELECTRICAL_RESIDENT_KW) {
    elecField.required = true;
    elecField.grade = "상주 전기안전관리자";
    elecField.type = "상주";
    elecField.notes.push("수전설비 용량 1,000kW 이상: 상주 전기안전관리자 선임 필수");
  } else if (electricKw >= ELECTRICAL_REQUIRED_KW) {
    elecField.required = true;
    elecField.grade = "전기안전관리자";
    elecField.type = "선임 또는 대행";
    elecField.notes.push("수전설비 용량 75kW 이상: 전기안전관리자 선임 또는 대행 필수");
  } else {
    elecField.notes.push("수전설비 용량 75kW 미만: 전기안전관리자 선임 불요 (전기용량을 입력하면 정확한 판정이 가능합니다)");
  }
  fields.push(elecField);
  requiredInspections.push("electrical");

  // 2. 소방안전관리자
  const fireField: AppointmentField = {
    field: "fire_safety",
    required: true,
    grade: null,
    type: "선임",
    legalBasis: "소방시설 설치 및 관리에 관한 법률 제24조",
    notes: [],
  };
  if (floors >= FIRE_SPECIAL_GRADE_FLOORS || area >= FIRE_SPECIAL_GRADE_AREA) {
    fireField.grade = "특급 소방안전관리자";
    fireField.notes.push("30층 이상 또는 연면적 10만㎡ 이상: 특급");
  } else if (floors >= FIRE_GRADE_1_FLOORS || area >= FIRE_GRADE_1_AREA || (basement >= FIRE_GRADE_1_BASEMENT_MIN && area >= FIRE_GRADE_1_BASEMENT_AREA)) {
    fireField.grade = "1급 소방안전관리자";
    fireField.notes.push("11층 이상 또는 연면적 1.5만㎡ 이상: 1급");
  } else if (floors >= FIRE_GRADE_2_FLOORS || area >= FIRE_GRADE_2_AREA) {
    fireField.grade = "2급 소방안전관리자";
    fireField.notes.push("5층 이상 또는 연면적 2천㎡ 이상: 2급");
  } else {
    fireField.grade = "3급 소방안전관리자";
    fireField.notes.push("그 외: 3급 (소규모 건축물)");
  }
  fields.push(fireField);
  requiredInspections.push("fire_safety");

  // 3. 가스안전관리자
  const gasField: AppointmentField = {
    field: "gas",
    required: false,
    grade: null,
    type: null,
    legalBasis: "도시가스사업법 제29조",
    notes: [],
  };
  const isFirstClassProtection = isResidential && units >= GAS_PROTECTION_CLASS1_UNITS;
  const gasThreshold = isFirstClassProtection ? GAS_THRESHOLD_PROTECTED_M3 : GAS_THRESHOLD_DEFAULT_M3;
  if (gasEnabled && gasMonthly >= gasThreshold) {
    gasField.required = true;
    gasField.grade = "가스안전관리자";
    gasField.type = "선임 또는 대행";
    gasField.notes.push(`월 사용량 ${gasMonthly.toLocaleString()}㎥ ≥ ${gasThreshold.toLocaleString()}㎥${isFirstClassProtection ? " (1종 보호시설)" : ""}: 가스안전관리자 선임 필수`);
    requiredInspections.push("gas");
  } else if (gasEnabled) {
    gasField.notes.push(`월 가스사용량 ${gasThreshold.toLocaleString()}㎥ 미만: 가스안전관리자 선임 불요 (가스사용량을 입력하면 정확한 판정이 가능합니다)`);
    if (area >= GAS_SELF_CHECK_AREA || floors >= GAS_SELF_CHECK_FLOORS) {
      requiredInspections.push("gas");
      gasField.notes.push("다만 가스 안전점검(연 1회)은 대상");
    }
  }
  fields.push(gasField);

  // 4. 기계설비유지관리자
  const mechField: AppointmentField = {
    field: "mechanical",
    required: false,
    grade: null,
    type: null,
    legalBasis: "기계설비법 제18조",
    notes: [],
  };
  if (area >= MECH_REQUIRED_AREA) {
    mechField.required = true;
    if (area >= MECH_SPECIAL_GRADE_AREA) {
      mechField.grade = "특급 기계설비유지관리자";
    } else if (area >= MECH_ADVANCED_GRADE_AREA) {
      mechField.grade = "고급 기계설비유지관리자";
    } else if (area >= MECH_INTERMEDIATE_GRADE_AREA) {
      mechField.grade = "중급 기계설비유지관리자";
    } else {
      mechField.grade = "초급 기계설비유지관리자";
    }
    mechField.type = "선임";
    mechField.notes.push(`연면적 ${area.toLocaleString()}㎡: ${mechField.grade} 선임 필수`);
    requiredInspections.push("mechanical");
  } else {
    mechField.notes.push("연면적 1만㎡ 미만: 기계설비유지관리자 선임 불요");
  }
  fields.push(mechField);

  // 5. 정보통신공사 유지관리자
  const teleField: AppointmentField = {
    field: "telecom",
    required: false,
    grade: null,
    type: null,
    legalBasis: "정보통신공사업법 제36조의3",
    notes: [],
  };
  if (area >= TELECOM_REQUIRED_AREA) {
    teleField.type = "선임";
    teleField.grade = "정보통신 유지관리자";
    const today = new Date();
    let enforcementDate: Date;
    if (area >= TELECOM_LARGE_AREA) {
      enforcementDate = new Date(TELECOM_ENFORCEMENT_DATE_LARGE);
      teleField.notes.push("연면적 3만㎡ 이상: 2025.7.18부터 선임 의무");
    } else if (area >= TELECOM_MEDIUM_AREA) {
      enforcementDate = new Date(TELECOM_ENFORCEMENT_DATE_MEDIUM);
      teleField.notes.push("연면적 1~3만㎡: 2026.7.18부터 선임 의무");
    } else {
      enforcementDate = new Date(TELECOM_ENFORCEMENT_DATE_SMALL);
      teleField.notes.push("연면적 5천~1만㎡: 2027.7.18부터 선임 의무");
    }
    if (today >= enforcementDate) {
      teleField.required = true;
      requiredInspections.push("telecom");
    } else {
      teleField.notes.push(`⚠ 시행 예정 (${enforcementDate.toISOString().split("T")[0]}) — 현재는 선임 의무 없음`);
    }
  } else {
    teleField.notes.push(`연면적 ${TELECOM_REQUIRED_AREA.toLocaleString()}㎡ 미만: 정보통신 유지관리자 선임 불요`);
  }
  fields.push(teleField);

  // 6. 승강기안전관리자
  const elevField: AppointmentField = {
    field: "elevator",
    required: false,
    grade: null,
    type: null,
    legalBasis: "승강기 안전관리법 제29조",
    notes: [],
  };
  if (elevators >= ELEVATOR_REQUIRED_COUNT) {
    elevField.required = true;
    elevField.grade = "승강기 안전관리자";
    elevField.type = "선임 (관리소장 겸직 가능)";
    elevField.notes.push(`승강기 ${elevators}대 설치: 승강기 안전관리자 선임 필수 (관리소장 겸직 가능)`);
    requiredInspections.push("elevator");
  } else {
    elevField.notes.push("승강기 미설치: 선임 불요");
  }
  fields.push(elevField);

  // 7. 소독(방역)
  const disinfField: AppointmentField = {
    field: "disinfection",
    required: false,
    grade: null,
    type: null,
    legalBasis: "감염병의 예방 및 관리에 관한 법률 제51조",
    notes: [],
  };
  const disinfRequired = (isResidential && units >= DISINF_RESIDENTIAL_UNITS) || ((isOffice || isComplex) && area >= DISINF_OFFICE_AREA);
  if (disinfRequired) {
    disinfField.required = true;
    disinfField.type = "전문업체 위탁";
    if (isResidential && units >= DISINF_RESIDENTIAL_UNITS) {
      disinfField.notes.push("300세대 이상 공동주택: 의무소독 대상");
    } else {
      disinfField.notes.push("연면적 2,000㎡ 이상 사무실/복합용도: 의무소독 대상");
    }
    disinfField.notes.push("하절기(4~9월): 2개월 1회 / 동절기(10~3월): 3개월 1회");
    requiredInspections.push("disinfection");
  } else {
    disinfField.notes.push("의무소독 대상 아님 (300세대 미만 공동주택 또는 연면적 2,000㎡ 미만)");
  }
  fields.push(disinfField);

  // General building safety
  requiredInspections.push("building_safety");
  requiredInspections.push("water_tank");
  requiredInspections.push("hygiene");

  let safetyManagerRequired = false;
  let safetyManagerType: string | null = null;
  if (area >= SAFETY_MGR_REQUIRED_AREA || floors >= SAFETY_MGR_REQUIRED_FLOORS || basement >= SAFETY_MGR_REQUIRED_BASEMENT) {
    safetyManagerRequired = true;
    if (area >= SAFETY_MGR_SPECIALIST_AREA || floors >= SAFETY_MGR_SPECIALIST_FLOORS) {
      safetyManagerType = "건축물관리자(안전관리 전문기관 위탁 가능)";
    } else if (area >= SAFETY_MGR_PRO_AREA || floors >= SAFETY_MGR_PRO_FLOORS) {
      safetyManagerType = "안전관리자 선임 또는 전문기관 위탁";
    } else {
      safetyManagerType = "안전관리자 선임 (겸직 가능)";
    }
  }

  res.json({
    safetyManagerRequired,
    safetyManagerType,
    requiredInspections,
    fields,
    safetyNotes: fields.flatMap(f => f.notes),
    facilityManagerCriteria: fields.filter(f => f.required).map(f => `${f.grade || f.field} ${f.type || "선임"} 필수`),
  });
});

export default router;
