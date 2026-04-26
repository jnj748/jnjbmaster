// [Task #434] 한국 표준 전화번호 / 사업자등록번호 자동 하이픈 포맷터.
//
// 모든 전화번호 입력란에서 숫자만 눌러도 시작 번호와 길이에 따라 자동으로
// 하이픈이 들어가도록 통일하기 위한 공용 유틸. 입력 중 점진적으로 포맷이
// 적용되어야 하므로(`010` → `010-0`), 부분 입력 상태에서도 자연스러운
// 출력을 만들어 낸다.
//
// 적용 규칙(요약):
//   - 02 서울:        9자리 → 02-000-0000, 10자리 → 02-0000-0000
//   - 03X/04X/05X/06X 지역(02 제외): 10자리 → AAA-BBB-CCCC, 11자리 → AAA-BBBB-CCCC
//   - 010 휴대폰:     11자리 → 010-0000-0000, 10자리(구번호) → 010-000-0000
//   - 011/016~019:   10자리 → AAA-BBB-CCCC
//   - 070 인터넷전화: 10/11자리 → 070-XXX-XXXX / 070-XXXX-XXXX
//   - 050X 개인번호:  11~12자리 → 0506-000-0000 / 0506-0000-0000
//   - 080 수신자부담: 9~10자리 → 080-000-000 / 080-000-0000
//   - 1588/1577/1644/1566/1899 등 대표번호: 8자리 → 1588-0000
//   - 그 외: 길이별 베스트에포트(휴대폰 패턴 기준).

const SEOUL_PREFIX = "02";

const REGIONAL_PREFIXES_3 = new Set([
  "031", "032", "033",
  "041", "042", "043", "044",
  "051", "052", "053", "054", "055",
  "061", "062", "063", "064",
]);

const MOBILE_PREFIXES_3 = new Set([
  "010", "011", "016", "017", "018", "019",
]);

const VOIP_PREFIX_3 = "070";
const TOLL_FREE_PREFIX_3 = "080";

// 8자리 대표번호(전국대표번호) 4자리 prefix.
// 대표적인 사업자 번호만 등록해두고, 그 외는 일반 패턴(베스트에포트)으로 처리.
const REPRESENTATIVE_PREFIXES_4 = new Set([
  "1588", "1577", "1644", "1566", "1599", "1899",
  "1670", "1666", "1855", "1811", "1688",
  "1577", "1500", "1330", "1800",
]);

/** 입력 문자열에서 숫자만 추출. */
export function extractDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/\D+/g, "");
}

/**
 * 한국 표준 전화번호 포맷터.
 *
 * 전체/부분 입력 모두에서 동일하게 동작한다. 숫자가 누적되는 동안에도
 * 자연스럽게 하이픈이 점진적으로 붙도록 길이별로 분기한다.
 */
export function formatPhoneNumber(raw: string | null | undefined): string {
  const d = extractDigits(raw).slice(0, 12);
  if (!d) return "";

  // 1XXX 대표번호 (총 8자리). 4자리 prefix 가 알려진 경우만 4-4 로 자르고,
  // 나머지는 베스트에포트로 흘려보낸다.
  if (d.length >= 4 && d[0] === "1") {
    const head4 = d.slice(0, 4);
    if (REPRESENTATIVE_PREFIXES_4.has(head4)) {
      if (d.length <= 4) return head4;
      return `${head4}-${d.slice(4, 8)}`;
    }
  }

  // 050X 개인번호 (4자리 prefix + 7~8자리).
  if (d.startsWith("050") && d.length >= 4) {
    const head4 = d.slice(0, 4);
    if (d.length <= 4) return head4;
    if (d.length <= 7) return `${head4}-${d.slice(4)}`;
    if (d.length <= 11) return `${head4}-${d.slice(4, 7)}-${d.slice(7)}`;
    return `${head4}-${d.slice(4, 8)}-${d.slice(8, 12)}`;
  }

  // 02 서울 (2자리 지역번호).
  if (d.startsWith(SEOUL_PREFIX)) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${SEOUL_PREFIX}-${d.slice(2)}`;
    if (d.length <= 9) return `${SEOUL_PREFIX}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${SEOUL_PREFIX}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }

  // 3자리 prefix (지역/휴대폰/070/080).
  const head3 = d.slice(0, 3);
  const isKnown3 =
    REGIONAL_PREFIXES_3.has(head3) ||
    MOBILE_PREFIXES_3.has(head3) ||
    head3 === VOIP_PREFIX_3 ||
    head3 === TOLL_FREE_PREFIX_3;

  if (isKnown3) {
    if (d.length <= 3) return head3;
    if (d.length <= 6) return `${head3}-${d.slice(3)}`;
    if (d.length <= 10) return `${head3}-${d.slice(3, 6)}-${d.slice(6)}`;
    return `${head3}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
  }

  // 그 외(국제/특수 번호 등) 베스트에포트: 휴대폰 패턴(3-4-4) 기준.
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

/**
 * `formatPhoneNumber` 와 동일하지만, "입력 중 부분 포맷팅" 의도를 명시적으로
 * 드러내고 싶은 호출부(예: 포커스된 입력 필드 onChange)를 위한 별칭.
 */
export const formatPhoneNumberPartial = formatPhoneNumber;

/**
 * 사업자등록번호(10자리)를 `000-00-00000` 형식으로 포맷팅. 길이가 부족한
 * 입력에서는 가능한 만큼만 하이픈을 붙여 점진적으로 동작한다.
 */
export function formatBusinessNumber(raw: string | null | undefined): string {
  const d = extractDigits(raw).slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** `tel:` 링크용 — 숫자만 남긴다. */
export function phoneToTelHref(raw: string | null | undefined): string {
  return extractDigits(raw);
}
