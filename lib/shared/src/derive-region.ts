// [Task #475] 한국어 주소 문자열에서 sido(시·도) / sigungu(시·군·구)를
// 안전하게 도출한다. 주소를 Kakao postcode 로 등록한 새 건물에는 이미
// 구조화된 sido/sigungu 가 들어 있지만, 기존/이관 건물 또는 카카오 외 경로로
// 들어온 행에는 addressFull/addressJibun 텍스트만 있고 두 컬럼이 NULL 일 수
// 있다. 이 경우 RFQ 화면이 막혀 막다른 길이 되는 문제를 풀기 위한 공용 유틸.
//
// 규칙(보수적):
//   1) 첫 토큰이 알려진 sido 면 그대로 사용. 아니면 짧은 별칭("서울","경기"…)도
//      허용해 정식 명칭으로 정규화한다.
//   2) sigungu 는 두 번째 토큰을 기본으로 하되, "수원시 영통구" 처럼 "X시 Y구/군"
//      복합 케이스는 두·세 번째 토큰을 합쳐서 반환한다.
//   3) "세종특별자치시" 처럼 sigungu 가 생략되는 케이스는 sigungu = null.
//   4) 인식 불가능하면 { sido: null, sigungu: null } — 도출 실패는 조용히
//      통과시키고 기존 NULL 상태를 유지한다(절대 잘못된 값으로 채우지 않는다).

const SIDO_SET = new Set([
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "강원도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
  "제주도",
]);

// 짧은/구버전 별칭 → 정식 명칭. Kakao postcode 응답이 항상 정식 명칭을 주지만,
// 기존 데이터(엑셀 import 등)가 짧은 형태로 들어와 있을 수 있다.
const SIDO_ALIASES: Record<string, string> = {
  "서울": "서울특별시",
  "부산": "부산광역시",
  "대구": "대구광역시",
  "인천": "인천광역시",
  "광주": "광주광역시",
  "대전": "대전광역시",
  "울산": "울산광역시",
  "세종": "세종특별자치시",
  "세종시": "세종특별자치시",
  "경기": "경기도",
  "강원": "강원특별자치도",
  "충북": "충청북도",
  "충남": "충청남도",
  "전북": "전북특별자치도",
  "전남": "전라남도",
  "경북": "경상북도",
  "경남": "경상남도",
  "제주": "제주특별자치도",
};

// sigungu 가 "X시 Y구" 처럼 두 단어로 표기되는 광역시급 이외의 통합시 모음.
// 행정구를 가진 일반시는 모두 여기에 들어간다(이 외 시·군·구는 단일 토큰).
const COMPOUND_SIGUNGU_CITIES = new Set([
  "수원시",
  "성남시",
  "안양시",
  "안산시",
  "고양시",
  "용인시",
  "청주시",
  "천안시",
  "전주시",
  "포항시",
  "창원시",
]);

export interface DerivedRegion {
  sido: string | null;
  sigungu: string | null;
}

const EMPTY: DerivedRegion = { sido: null, sigungu: null };

function normalizeSido(token: string): string | null {
  if (SIDO_SET.has(token)) return token;
  if (token in SIDO_ALIASES) return SIDO_ALIASES[token];
  return null;
}

function deriveFromAddress(address: string | null | undefined): DerivedRegion {
  if (!address) return EMPTY;
  const trimmed = address.trim();
  if (trimmed.length === 0) return EMPTY;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return EMPTY;

  const sido = normalizeSido(tokens[0]);
  if (!sido) return EMPTY;

  // 세종특별자치시는 sigungu 가 사실상 없음(자치구·군 미설치).
  if (sido === "세종특별자치시") {
    return { sido, sigungu: null };
  }

  if (tokens.length < 2) return { sido, sigungu: null };

  const second = tokens[1];
  // "수원시 영통구" 같은 두 단어 sigungu.
  if (
    COMPOUND_SIGUNGU_CITIES.has(second) &&
    tokens.length >= 3 &&
    /(구|군)$/.test(tokens[2])
  ) {
    return { sido, sigungu: `${second} ${tokens[2]}` };
  }
  // 기본: 단일 토큰 sigungu (XX구/군/시).
  if (/(구|군|시)$/.test(second)) {
    return { sido, sigungu: second };
  }
  // 인식 불가 — sido 만 채우고 sigungu 는 비워 둔다.
  return { sido, sigungu: null };
}

export function deriveSidoSigungu(
  addressFull: string | null | undefined,
  addressJibun?: string | null | undefined,
): DerivedRegion {
  const fromFull = deriveFromAddress(addressFull);
  if (fromFull.sido) return fromFull;
  const fromJibun = deriveFromAddress(addressJibun);
  if (fromJibun.sido) return fromJibun;
  return EMPTY;
}
