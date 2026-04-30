// [Task #708] 메모 텍스트에서 한국식 호실 표기를 추출하는 결정적 파서.
//
// 입력 텍스트에 등장한 "101호", "1동 101호", "A동 502호", "지하1층 B-12호",
// "B동102호" 등 다양한 표기를 끌어모은 뒤, 같은 빌딩의 units 목록과 매칭해
// `unitId` 배열을 돌려준다.
//
// 매칭 규칙(거짓 양성 방지가 최우선):
//   1. 메모에 동(棟) 정보가 있으면 (dong, unitNumber) 동시 매칭만 인정.
//      - 동 표기 정규화: "1동" → "1", "A동" → "A", "가동" → "가", "지하1층 B" → "B".
//   2. 메모에 동 정보가 없을 때는 unitNumber 가 빌딩 내에서 유일한 경우에만
//      매칭. 동이 다르고 호번이 같은 호실이 둘 이상이면 사용자 칩 선택을
//      요구하기 위해 자동 매칭하지 않는다.
//   3. 빌딩의 units 가 모두 단일 동(dong = "") 인 경우, 동 정보 없는 메모도
//      그대로 호번으로 매칭한다(가장 흔한 일반 케이스).
//
// 본 파서는 클라이언트(QuickEntryDialog 디바운스 미리보기) 와 서버
// (work_logs POST/PATCH 저장 시점, 백필 스크립트) 가 동일한 결정적 결과를
// 내도록 lib/shared 에 두고 양쪽에서 import 한다.

export interface UnitRef {
  id: number;
  dong: string;
  unitNumber: string;
}

/** 메모 한 줄에서 발견된 후보. unitNumberRaw 는 정규화 전 표기, dongRaw 는 동 표기(없으면 null). */
export interface ParsedUnitToken {
  dongRaw: string | null;
  unitNumberRaw: string;
}

/** dong / unitNumber 정규화 — 공백/하이픈/한글호 접미사 제거, 대소문자 보존(영문 동명). */
function normalizeUnit(s: string): string {
  return s.replace(/\s+/g, "").replace(/[-]/g, "").trim();
}
function normalizeDong(s: string | null): string {
  if (s === null) return "";
  // 동(棟) 식별자 정규화: 공백/하이픈 제거 + 대문자 통일.
  // 과거에는 "마지막 한 글자" 만 남기는 잘못된 코드가 있었는데, 그 결과
  // "101동" → "1", "201동" → "2" 처럼 다른 동이 같은 키로 충돌해
  // 같은 호번이 잘못된 동의 호실에 매칭되는 회귀가 있었다.
  // 이제는 끝쪽의 영문/숫자/한글 그룹을 통째로 보존한다.
  //  - 입력 케이스
  //    · 메모 추출본 (e.g. "1", "A", "가", "101", "B12"): 그대로 보존
  //    · DB raw 값 (e.g. "송정태왕아너스타워", "지하1층 B"): trailing 그룹 보존
  const trimmed = s.replace(/\s+/g, "").replace(/-/g, "");
  if (!trimmed) return "";
  const m = trimmed.match(/([A-Za-z0-9가-힣]+)$/);
  return (m ? m[1] : trimmed).toUpperCase();
}
function normalizeDongFromUnit(d: string): string {
  return normalizeDong(d);
}

/**
 * 메모 텍스트에서 호실 표기 후보를 모두 추출.
 *  - "1동 101호", "A동 502호" → { dongRaw: "1"/"A", unitNumberRaw: "101"/"502" }
 *  - "B동102호" → { dongRaw: "B", unitNumberRaw: "102" }
 *  - "101호, 102호" → 두 토큰 (둘 다 dongRaw=null)
 *  - "지하1층 B-12호" → { dongRaw: null, unitNumberRaw: "B-12" } (B 가 동인지 모호 → 동 없음 처리)
 *  - "ㅇㅇ건물 101호" → { dongRaw: null, unitNumberRaw: "101" }
 */
export function extractUnitTokens(memo: string): ParsedUnitToken[] {
  if (!memo) return [];
  const tokens: ParsedUnitToken[] = [];

  // 1) "X동 NNN호" / "X동NNN호" — 동 그룹은 한글/영문/숫자 1~4자.
  //    호 그룹은 영문/숫자/하이픈 1~10자.
  const withDong = /([0-9]{1,4}|[A-Za-z]{1,3}|[가-힣]{1,3})동\s*([A-Za-z0-9\-]{1,10})\s*호/g;
  // 2) "NNN호" (앞에 "동" 키워드 없음). 한글/영문/숫자/하이픈 허용.
  const noDong = /(?<![가-힣A-Za-z0-9])([A-Za-z]?[0-9]{2,5}(?:-[0-9]{1,3})?|[A-Za-z]-?[0-9]{1,4})\s*호/g;

  const seen = new Set<string>();
  // withDong 으로 이미 소비된 (시작, 끝) 범위. noDong 매치가 이 범위 안에 들어가면
  // 중복 토큰으로 보고 건너뛴다.
  const consumed: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = withDong.exec(memo)) !== null) {
    const dongRaw = m[1];
    const unitNumberRaw = m[2];
    const start = m.index;
    const end = m.index + m[0].length;
    consumed.push([start, end]);
    const key = `D:${dongRaw.toUpperCase()}|U:${unitNumberRaw.toUpperCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push({ dongRaw, unitNumberRaw });
    }
  }

  // noDong 으로 잡히는 토큰 중 이미 withDong 범위에 포함된 것은 동일 표기의 중복.
  while ((m = noDong.exec(memo)) !== null) {
    const unitNumberRaw = m[1];
    const start = m.index;
    const end = m.index + m[0].length;
    const overlaps = consumed.some(([s, e]) => start >= s && end <= e);
    if (overlaps) continue;
    const key = `D:|U:${unitNumberRaw.toUpperCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push({ dongRaw: null, unitNumberRaw });
    }
  }

  return tokens;
}

/**
 * [Task #713] 메모에 동(棟) 정보 없이 호수만 있고, 빌딩 내에서 동일 호번을 가진
 * 호실이 여러 개라 자동 매칭되지 않은 토큰들을 찾는다.
 *
 * 호출자(서버 추천 엔드포인트, 클라이언트 칩 UI)는 이 결과로 각 토큰의 후보
 * 호실 ids 를 알 수 있고, 별도 신호(작성자 과거 이력 / 최근 활동) 로 가장
 * 가능성 높은 후보를 추천한다.
 *
 * 반환: 각 모호 토큰별 { unitNumberRaw, candidates(같은 호번의 unit id 들) }
 */
export interface AmbiguousUnitToken {
  /** 메모에서 인식된 호수 원문 (정규화 전). */
  unitNumberRaw: string;
  /** 같은 호번을 갖는 빌딩 내 호실 id 목록 (메모에 동이 명시되지 않아 모호). */
  candidateUnitIds: number[];
}

export function findAmbiguousUnitTokens(
  memo: string,
  units: ReadonlyArray<UnitRef>,
): AmbiguousUnitToken[] {
  const tokens = extractUnitTokens(memo);
  if (tokens.length === 0 || units.length === 0) return [];

  // 빌딩 전체가 단일 동인 경우엔 모호 자체가 없다(호번 중복 시 데이터 이상).
  let allSingleDong = true;
  const byNumber = new Map<string, UnitRef[]>();
  for (const u of units) {
    const n = normalizeUnit(u.unitNumber);
    if (!n) continue;
    const arr = byNumber.get(n) ?? [];
    arr.push(u);
    byNumber.set(n, arr);
    if (u.dong && u.dong.length > 0) allSingleDong = false;
  }
  if (allSingleDong) return [];

  const seen = new Set<string>();
  const out: AmbiguousUnitToken[] = [];
  for (const t of tokens) {
    if (t.dongRaw !== null) continue; // 동이 명시된 토큰은 모호하지 않음.
    const num = normalizeUnit(t.unitNumberRaw);
    if (!num) continue;
    if (seen.has(num)) continue;
    const candidates = byNumber.get(num) ?? [];
    if (candidates.length < 2) continue; // 유일 매칭은 자동으로 잡힘.
    seen.add(num);
    out.push({
      unitNumberRaw: t.unitNumberRaw,
      candidateUnitIds: candidates.map((u) => u.id),
    });
  }
  return out;
}

/**
 * 빌딩의 units 목록과 메모를 매칭해 일치하는 unit id 배열을 반환.
 * 결과는 매칭 순서대로, 중복 없이 나온다.
 */
export function matchUnitsInMemo(memo: string, units: ReadonlyArray<UnitRef>): number[] {
  const tokens = extractUnitTokens(memo);
  if (tokens.length === 0) return [];

  // unitNumber 정규화 인덱스: number → unit[]
  const byNumber = new Map<string, UnitRef[]>();
  // (dong, number) 정규화 인덱스: "D|N" → unit
  const byDongNumber = new Map<string, UnitRef>();
  // 빌딩 전체가 단일 동(dong="") 인지 판단 (동 무시 매칭 허용).
  let allSingleDong = true;
  for (const u of units) {
    const n = normalizeUnit(u.unitNumber);
    if (!n) continue;
    const arr = byNumber.get(n) ?? [];
    arr.push(u);
    byNumber.set(n, arr);
    if (u.dong && u.dong.length > 0) {
      allSingleDong = false;
      const dKey = `${normalizeDongFromUnit(u.dong)}|${n}`;
      byDongNumber.set(dKey, u);
    } else {
      // 빈 동도 dong="" 키로 인덱스에 두어 단일동 빌딩의 (동 없는 메모) 매칭 허용.
      const dKey = `|${n}`;
      byDongNumber.set(dKey, u);
    }
  }

  const matched: number[] = [];
  const matchedSet = new Set<number>();

  for (const t of tokens) {
    const num = normalizeUnit(t.unitNumberRaw);
    if (!num) continue;

    if (t.dongRaw !== null) {
      // 동이 메모에 명시된 경우 — (dong, number) 정확 매칭만.
      const dKey = `${normalizeDong(t.dongRaw)}|${num}`;
      const u = byDongNumber.get(dKey);
      if (u && !matchedSet.has(u.id)) {
        matchedSet.add(u.id);
        matched.push(u.id);
      }
      continue;
    }

    // 동이 메모에 없는 경우.
    const candidates = byNumber.get(num) ?? [];
    if (candidates.length === 1) {
      // 호번이 빌딩에서 유일 — 안전하게 매칭.
      const u = candidates[0];
      if (!matchedSet.has(u.id)) {
        matchedSet.add(u.id);
        matched.push(u.id);
      }
    } else if (candidates.length > 1 && allSingleDong) {
      // 빌딩 전체가 단일 동인데도 같은 호번이 여러 행이라는 건 데이터 이상.
      // 안전 측에서 매칭하지 않는다.
      continue;
    } // candidates.length === 0 또는 다동 빌딩에서 모호 → 매칭하지 않음.
  }
  return matched;
}
