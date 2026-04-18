export type LegalField = "electrical" | "fire_safety" | "mechanical" | "telecom";

export interface BuildingSpecForStaffing {
  totalArea?: number | string | null;
  electricCapacityKw?: number | string | null;
}

export interface LegalAppointee {
  name: string;
  certificateExpiry?: string | null;
}

export interface LegalAppointment {
  field: LegalField;
  label: string;
  required: boolean;
  grade: string | null;
  legalBasis: string;
  threshold: string;
  appointee?: LegalAppointee | null;
}

export const ELECTRICAL_REQUIRED_KW = 75;
export const ELECTRICAL_HIGH_VOLTAGE_KW = 2000;

export const FIRE_GRADE_1_AREA = 15000;
export const FIRE_GRADE_2_AREA = 5000;
export const FIRE_GRADE_3_AREA = 1500;

export const MECH_REQUIRED_AREA = 10000;

export const TELECOM_REQUIRED_AREA = 5000;

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

function electrical(kw: number): Pick<LegalAppointment, "required" | "grade" | "threshold"> {
  if (kw >= ELECTRICAL_HIGH_VOLTAGE_KW) {
    return { required: true, grade: "1·2종 (특고압)", threshold: `≥ ${ELECTRICAL_HIGH_VOLTAGE_KW.toLocaleString()}kW` };
  }
  if (kw >= ELECTRICAL_REQUIRED_KW) {
    return { required: true, grade: "3종 (저압)", threshold: `${ELECTRICAL_REQUIRED_KW.toLocaleString()}~${ELECTRICAL_HIGH_VOLTAGE_KW.toLocaleString()}kW` };
  }
  return { required: false, grade: null, threshold: `< ${ELECTRICAL_REQUIRED_KW.toLocaleString()}kW (선임 불요)` };
}

function fireSafety(area: number): Pick<LegalAppointment, "required" | "grade" | "threshold"> {
  if (area >= FIRE_GRADE_1_AREA) {
    return { required: true, grade: "1급 소방안전관리자", threshold: `≥ ${FIRE_GRADE_1_AREA.toLocaleString()}㎡` };
  }
  if (area >= FIRE_GRADE_2_AREA) {
    return { required: true, grade: "2급 소방안전관리자", threshold: `${FIRE_GRADE_2_AREA.toLocaleString()}~${FIRE_GRADE_1_AREA.toLocaleString()}㎡` };
  }
  if (area >= FIRE_GRADE_3_AREA) {
    return { required: true, grade: "3급 소방안전관리자", threshold: `${FIRE_GRADE_3_AREA.toLocaleString()}~${FIRE_GRADE_2_AREA.toLocaleString()}㎡` };
  }
  return { required: false, grade: null, threshold: `< ${FIRE_GRADE_3_AREA.toLocaleString()}㎡ (선임 불요)` };
}

function mechanical(area: number): Pick<LegalAppointment, "required" | "grade" | "threshold"> {
  if (area >= MECH_REQUIRED_AREA) {
    return { required: true, grade: "기계설비 유지관리자", threshold: `≥ ${MECH_REQUIRED_AREA.toLocaleString()}㎡` };
  }
  return { required: false, grade: null, threshold: `< ${MECH_REQUIRED_AREA.toLocaleString()}㎡ (선임 불요)` };
}

function telecom(area: number): Pick<LegalAppointment, "required" | "grade" | "threshold"> {
  if (area >= TELECOM_REQUIRED_AREA) {
    return { required: true, grade: "정보통신 유지보수 책임자", threshold: `≥ ${TELECOM_REQUIRED_AREA.toLocaleString()}㎡` };
  }
  return { required: false, grade: null, threshold: `< ${TELECOM_REQUIRED_AREA.toLocaleString()}㎡ (선임 불요)` };
}

export function classifyLegalStaffing(
  spec: BuildingSpecForStaffing,
  appointees: Partial<Record<LegalField, LegalAppointee>> = {},
): LegalAppointment[] {
  const area = num(spec.totalArea);
  const kw = num(spec.electricCapacityKw);

  return [
    {
      field: "electrical",
      label: "전기",
      legalBasis: "전기안전관리법 제22조",
      ...electrical(kw),
      appointee: appointees.electrical ?? null,
    },
    {
      field: "fire_safety",
      label: "소방",
      legalBasis: "소방시설 설치 및 관리에 관한 법률 제24조",
      ...fireSafety(area),
      appointee: appointees.fire_safety ?? null,
    },
    {
      field: "mechanical",
      label: "기계",
      legalBasis: "기계설비법 제19조",
      ...mechanical(area),
      appointee: appointees.mechanical ?? null,
    },
    {
      field: "telecom",
      label: "정보통신",
      legalBasis: "정보통신공사업법 제37조의2",
      ...telecom(area),
      appointee: appointees.telecom ?? null,
    },
  ];
}

export function daysUntil(dateStr: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
