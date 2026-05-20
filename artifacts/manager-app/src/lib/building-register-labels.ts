// [Task #328] 건축물대장 표제부/총괄표제부(getBrTitleInfo / getBrRecapTitleInfo)
// 응답 항목을 건물정보 상세 화면에 그룹별로 노출하기 위한 한국어 라벨/포매터.
// 이미 buildings 테이블 컬럼으로 평탄화돼 화면에 따로 노출되는 항목(연면적, 세대수, 승강기 등)은
// 중복 표시를 피하려고 여기서 제외한다.
//
// [Task #568] 화이트리스트(REGISTER_FIELD_GROUPS)에 정의되지 않은 나머지 표제부/총괄표제부
// 키도 "기타 (표제부)" / "기타 (총괄표제부)" 그룹으로 자동 노출한다. 라벨이 없는 키는 원본
// 키 문자열을 라벨로 사용하고, 값은 자동 추정 포매터(YYYYMMDD 일자 / Y·N 토글 / 숫자 천단위 /
// 객체·배열 JSON 한 줄)로 표시한다. 빈 값/완전 빈 객체는 자동 숨김.

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

// [Task #873] "기타 (표제부)" / "기타 (총괄표제부)" 그룹에서 화이트리스트
//   필드가 아닌 키도 한국어 라벨로 노출하기 위한 보조 사전. 화이트리스트와
//   중복돼도 무방(화이트리스트가 먼저 소비되므로 여기 정의는 fallback).
//   키 발견 시 라벨을 우선 사용하고, 미정의 키는 기존처럼 영문 키 원본을 노출.
export const EXTRA_KOREAN_LABELS: Record<string, string> = {
  // 표제부 기본 식별
  bldNm: "건물명",
  dongNm: "동 이름",
  rnum: "순번",
  // 면적·비율
  archArea: "건축면적",
  bcRat: "건폐율",
  vlRat: "용적률",
  totArea: "연면적",
  platArea: "대지면적",
  // 층·세대
  grndFlrCnt: "지상 층수",
  ugrndFlrCnt: "지하 층수",
  hhldCnt: "세대수",
  sumHhldCnt: "총 세대수",
  hoCnt: "호수",
  fmlyCnt: "가구수",
  // 용도·구조·지붕
  mainPurpsCd: "주용도 코드",
  mainPurpsCdNm: "주용도",
  etcPurps: "기타 용도",
  strctCd: "구조 코드",
  strctCdNm: "구조",
  roofCd: "지붕 코드",
  mainAtchGbCd: "주/부속 구분 코드",
  mainAtchGbCdNm: "주/부속 구분",
  // 승강기
  rideUseElvtCnt: "승용 승강기 수",
  emgenUseElvtCnt: "비상용 승강기 수",
  // 주소
  platPlc: "지번주소",
  newPlatPlc: "도로명주소",
  naRoadCd: "새주소 도로 코드",
  naBjdongCd: "새주소 법정동 코드",
  naUgrndCd: "새주소 지상/지하 구분",
  naMainBun: "새주소 본번",
  naSubBun: "새주소 부번",
  // 대장·허가 코드
  regstrGbCd: "대장구분 코드",
  regstrKindCd: "대장종류 코드",
  pmsnoGbCd: "허가번호 구분 코드",
  pmsnoKikCd: "허가번호 기관 코드",
};

// [Task #568] 화이트리스트에 없는 키 값을 사람이 읽을 수 있는 문자열로 자동 변환.
//   - YYYYMMDD 8자리 숫자 문자열 → "YYYY-MM-DD" 일자
//   - "Y" / "N" → "적용" / "미적용"
//   - 유한 숫자 → 천단위 콤마
//   - 불리언 → "예" / "아니오"
//   - 객체/배열 → JSON 한 줄. 비어 있으면 빈 문자열로 숨김.
//   - 그 외 문자열 → trim. 빈 문자열은 빈 값으로 숨김.
export function autoFormatRegisterValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return "";
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (s === "Y") return "적용";
    if (s === "N") return "미적용";
    // 숫자 모양 문자열은 천단위 콤마로(소수도 허용).
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return n.toLocaleString();
    }
    return s;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return v.toLocaleString();
  }
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "";
    try {
      return JSON.stringify(obj);
    } catch {
      return "";
    }
  }
  return String(v);
}

export function resolveRegisterFields(
  raw: RegisterRaw,
): Array<{ title: string; rows: ResolvedField[] }> {
  if (!raw || (!raw.title && !raw.recap)) return [];
  const out: Array<{ title: string; rows: ResolvedField[] }> = [];

  // [Task #568] 화이트리스트가 "소유"한 키는 양쪽(title/recap) 모두에서 소비 처리해
  //   "기타" 그룹에서 다시 노출되지 않게 한다. 값 유무와 무관하게 키 자체를 차감한다.
  const consumedFromTitle = new Set<string>();
  const consumedFromRecap = new Set<string>();

  for (const group of REGISTER_FIELD_GROUPS) {
    const rows: ResolvedField[] = [];
    for (const f of group.fields) {
      consumedFromTitle.add(f.key);
      consumedFromRecap.add(f.key);

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

  // [Task #568] 화이트리스트에 잡히지 않은 나머지 항목을 "기타 (표제부)" /
  //   "기타 (총괄표제부)" 그룹으로 자동 구성한다. 키는 원본 그대로(라벨), 값은 autoFormat.
  const sources: Array<["title" | "recap", string, Record<string, unknown> | null]> = [
    ["title", "기타 (표제부)", raw.title ?? null],
    ["recap", "기타 (총괄표제부)", raw.recap ?? null],
  ];
  for (const [src, groupTitle, all] of sources) {
    if (!all) continue;
    const consumed = src === "title" ? consumedFromTitle : consumedFromRecap;
    const rows: ResolvedField[] = [];
    // 안정적 표시 순서를 위해 키 알파벳 순으로 정렬.
    const keys = Object.keys(all).sort();
    for (const k of keys) {
      if (consumed.has(k)) continue;
      const display = autoFormatRegisterValue(all[k]);
      if (!display) continue;
      // [Task #873] 라벨 사전(EXTRA_KOREAN_LABELS) 우선, 미정의 키는 원본 영문 키.
      // 같은 키 이름이 title/recap 양쪽에 있을 수 있으므로 키 충돌 방지를 위해 prefix.
      rows.push({ key: `${src}.${k}`, label: EXTRA_KOREAN_LABELS[k] ?? k, display });
    }
    if (rows.length > 0) out.push({ title: groupTitle, rows });
  }

  return out;
}
