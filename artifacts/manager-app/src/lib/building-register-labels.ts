// [Task #328] 건축물대장 표제부/총괄표제부(getBrTitleInfo / getBrRecapTitleInfo)
// 응답 항목을 건물정보 상세 화면에 그룹별로 노출하기 위한 한국어 라벨/포매터.
// 이미 buildings 테이블 컬럼으로 평탄화돼 화면에 따로 노출되는 항목(연면적, 세대수, 승강기 등)은
// 중복 표시를 피하려고 여기서 제외한다.

export type RegisterRaw = {
  title?: Record<string, unknown> | null;
  recap?: Record<string, unknown> | null;
} | null | undefined;

type Source = "title" | "recap" | "any";
type Formatter = (v: unknown) => string;

export interface RegisterField {
  key: string;
  label: string;
  source?: Source;
  format?: Formatter;
  unit?: string;
}

export interface RegisterFieldGroup {
  title: string;
  description?: string;
  fields: RegisterField[];
}

const fmtNumber: Formatter = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  return n.toLocaleString();
};
// [Task #328] 숫자 0 도 의미 있는 정보(예: 부속건축물 0동, 옥내 자주식 0대)이므로
// 단위와 함께 표시한다. 비유효 숫자(NaN)일 때만 빈 문자열을 반환해 숨긴다.
const fmtArea: Formatter = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toLocaleString()}㎡`;
};
const fmtPercent: Formatter = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)}%`;
};
const fmtMeter: Formatter = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n}m`;
};
const fmtCount: Formatter = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toLocaleString()}대`;
};
const fmtUnit: Formatter = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toLocaleString()}동`;
};
// 정부 API 일자 필드는 YYYYMMDD 문자열로 들어온다.
const fmtDate: Formatter = (v) => {
  const s = String(v ?? "").trim();
  if (!/^\d{8}$/.test(s)) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};
const fmtYesNo: Formatter = (v) => {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "Y") return "적용";
  if (s === "N") return "미적용";
  return s;
};

export const REGISTER_FIELD_GROUPS: RegisterFieldGroup[] = [
  {
    title: "개요",
    fields: [
      { key: "regstrKindCdNm", label: "대장종류", source: "any" },
      { key: "regstrGbCdNm", label: "대장구분", source: "any" },
      { key: "splotNm", label: "특수지명", source: "any" },
      { key: "block", label: "블록", source: "any" },
      { key: "lot", label: "로트", source: "any" },
      { key: "jiyukCdNm", label: "지역", source: "any" },
      { key: "jiguCdNm", label: "지구", source: "any" },
      { key: "guyukCdNm", label: "구역", source: "any" },
    ],
  },
  {
    title: "규모",
    fields: [
      { key: "heit", label: "건물 높이", format: fmtMeter, source: "title" },
      { key: "vlRatEstmTotArea", label: "용적률 산정 연면적", format: fmtArea, source: "title" },
      { key: "totDongTotArea", label: "총동 연면적", format: fmtArea, source: "any" },
      { key: "fmlyCnt", label: "가구수", format: (v) => `${fmtNumber(v)}가구`, source: "title" },
      { key: "hoCnt", label: "호수", format: (v) => `${fmtNumber(v)}호`, source: "title" },
      { key: "mainBldCnt", label: "주건축물 수", format: fmtUnit, source: "recap" },
      { key: "atchBldCnt", label: "부속건축물 수", format: fmtUnit, source: "any" },
      { key: "atchBldArea", label: "부속건축물 면적", format: fmtArea, source: "any" },
      { key: "bylotCnt", label: "외필지 수", format: (v) => `${fmtNumber(v)}필지`, source: "recap" },
    ],
  },
  {
    title: "구조·지붕",
    fields: [
      { key: "etcStrct", label: "기타 구조", source: "title" },
      { key: "roofCdNm", label: "지붕", source: "title" },
      { key: "etcRoof", label: "기타 지붕", source: "title" },
    ],
  },
  {
    title: "주차 상세",
    fields: [
      { key: "indrAutoUtcnt", label: "옥내 자주식 (대)", format: fmtCount, source: "any" },
      { key: "indrAutoArea", label: "옥내 자주식 면적", format: fmtArea, source: "any" },
      { key: "oudrAutoUtcnt", label: "옥외 자주식 (대)", format: fmtCount, source: "any" },
      { key: "oudrAutoArea", label: "옥외 자주식 면적", format: fmtArea, source: "any" },
      { key: "indrMechUtcnt", label: "옥내 기계식 (대)", format: fmtCount, source: "any" },
      { key: "indrMechArea", label: "옥내 기계식 면적", format: fmtArea, source: "any" },
      { key: "oudrMechUtcnt", label: "옥외 기계식 (대)", format: fmtCount, source: "any" },
      { key: "oudrMechArea", label: "옥외 기계식 면적", format: fmtArea, source: "any" },
    ],
  },
  {
    title: "에너지·친환경",
    fields: [
      { key: "engrGrade", label: "에너지효율 등급", source: "title" },
      { key: "engrRat", label: "에너지 절감율", format: fmtPercent, source: "title" },
      { key: "engrEpi", label: "EPI 점수", source: "title" },
      { key: "gnBldGrade", label: "친환경 건축물 등급", source: "title" },
      { key: "gnBldCert", label: "친환경 인증 점수", source: "title" },
      { key: "itgBldGrade", label: "지능형 건축물 등급", source: "title" },
      { key: "itgBldCert", label: "지능형 인증 점수", source: "title" },
    ],
  },
  {
    title: "내진",
    fields: [
      { key: "rserthqkDsgnApplyYn", label: "내진설계 적용", format: fmtYesNo, source: "title" },
      { key: "rserthqkAblty", label: "내진능력", source: "title" },
    ],
  },
  {
    title: "허가·승인 일정",
    fields: [
      { key: "pmsDay", label: "허가일", format: fmtDate, source: "title" },
      { key: "stcnsDay", label: "착공일", format: fmtDate, source: "title" },
      { key: "useAprDay", label: "사용승인일", format: fmtDate, source: "any" },
      { key: "pmsnoYear", label: "허가번호 년", source: "title" },
      { key: "pmsnoKikCdNm", label: "허가번호 기관", source: "title" },
      { key: "pmsnoGbCdNm", label: "허가번호 구분", source: "title" },
      { key: "crtnDay", label: "대장 생성일", format: fmtDate, source: "any" },
    ],
  },
  {
    title: "식별자",
    fields: [
      { key: "mgmBldrgstPk", label: "건축물대장 PK", source: "any" },
      { key: "sigunguCd", label: "시군구 코드", source: "any" },
      { key: "bjdongCd", label: "법정동 코드", source: "any" },
      { key: "platGbCd", label: "대지 구분", source: "any" },
      { key: "bun", label: "본번", source: "any" },
      { key: "ji", label: "부번", source: "any" },
    ],
  },
];

function pick(raw: NonNullable<RegisterRaw>, key: string, source: Source): unknown {
  const t = raw.title ?? {};
  const r = raw.recap ?? {};
  if (source === "title") return t[key];
  if (source === "recap") return r[key];
  return t[key] ?? r[key];
}

export interface ResolvedField {
  key: string;
  label: string;
  display: string;
}

export function resolveRegisterFields(
  raw: RegisterRaw,
): Array<{ title: string; rows: ResolvedField[] }> {
  if (!raw || (!raw.title && !raw.recap)) return [];
  const out: Array<{ title: string; rows: ResolvedField[] }> = [];
  for (const group of REGISTER_FIELD_GROUPS) {
    const rows: ResolvedField[] = [];
    for (const f of group.fields) {
      const v = pick(raw, f.key, f.source ?? "any");
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      // [Task #328] 빈 문자열만 숨긴다. 숫자 0(예: 부속건축물 수=0, 지하주차 수=0)
      // 은 의미 있는 값이므로 그대로 노출한다.
      if (s === "") continue;
      const display = f.format ? f.format(v) : s;
      if (!display) continue;
      rows.push({ key: f.key, label: f.label, display });
    }
    if (rows.length > 0) out.push({ title: group.title, rows });
  }
  return out;
}
