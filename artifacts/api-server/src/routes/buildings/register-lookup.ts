// [Task #496] buildings 라우터 분리 — 건축물대장(공공데이터 API) 조회 핸들러.
//   원본 routes/buildings.ts 의 GET /buildings/lookup-register 와
//   /buildings/lookup-area-info, AreaInfoRow 타입, fetchAreaInfoFromRegister 헬퍼를
//   그대로 옮긴다. units-import.ts 가 AreaInfoRow / fetchAreaInfoFromRegister 를 import 한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, type Building } from "@workspace/db";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

const router: IRouter = Router();

/**
 * [Task #552] 건축물대장 응답의 큰 정수 ID(mgmBldrgstPk 등) 가 JSON number 로
 *   내려와도 정밀도가 깨지지 않도록 파싱 전에 문자열로 감싸 둔다.
 *
 *   배경: `JSON.parse` 는 자바스크립트 Number 로 받은 뒤 다시 String() 으로 바꾸면
 *   16~17자리 이상 정수에서 정밀도 손실이 발생한다. 예) 1000000000000000412345 →
 *   `1.0000000000000004e+21`. 이 값이 그대로 buildings.building_register_pk 에 저장되면
 *   이후 `getBrExposPubuseAreaInfo` 호출이 가짜 PK 로 나가 404 가 발생한다(아티스톤 사례).
 *
 *   대상 키는 식별자 필드만 한정해 표시용 숫자(면적/층수 등) 의 의미가 바뀌지 않도록 한다.
 *   외부에 export 해 단위 테스트(`registerLookup-pk-precision.test.ts`) 에서도 검증한다.
 */
const ID_FIELDS_TO_PRESERVE = [
  "mgmBldrgstPk",
  "bun",
  "ji",
  "sigunguCd",
  "bjdongCd",
  "platGbCd",
  "regstrGbCd",
  "regstrKindCd",
] as const;

export function preserveBigIntegerIds(jsonText: string): string {
  let out = jsonText;
  for (const field of ID_FIELDS_TO_PRESERVE) {
    // "field":<digits> (no quotes, no decimal) → "field":"<digits>"
    // 뒤따르는 문자가 ',' '}' ']' '공백' 중 하나여야 매칭 — 구조적 위치만 잡는다.
    const re = new RegExp(`"${field}"\\s*:\\s*(-?\\d+)(?=\\s*[,}\\]\\s])`, "g");
    out = out.replace(re, `"${field}":"$1"`);
  }
  return out;
}

export function parseRegisterJsonText(jsonText: string): unknown {
  return JSON.parse(preserveBigIntegerIds(jsonText));
}

/**
 * [Task #698] 외부 건축물대장 API 의 "진짜 장애" 를 호출 측에 전달하기 위한 에러 타입.
 *   네트워크 끊김·DNS 실패·HTTP 5xx·응답 본문 파싱 실패 등은 사용자에게는
 *   "잠시 후 다시 시도" 안내가 필요한 케이스이고, 운영 로그에서도 "응답은 왔는데
 *   호실 자료가 비어 있음(=일반건축물 등 정상 케이스)" 과 명확히 구분돼야 한다.
 *   units-import.ts 의 503 + REGISTER_FETCH_FAILED 매핑이 이 신호에 의존한다.
 */
export class RegisterFetchError extends Error {
  readonly name = "RegisterFetchError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/**
 * [Task #698] 기존 `fetchRegisterJsonSafe` 의 관대한 동작 — 모든 실패를 null 로 흡수 — 을
 *   유지하되, 호출 측이 "외부 API 장애" 와 "정상 응답인데 본문 없음" 을 구분할 수
 *   있도록 throwing 변형을 별도로 노출한다.
 *
 *   동작:
 *     - fetch 자체 throw / HTTP non-2xx → RegisterFetchError throw.
 *     - 정상 응답이지만 본문이 비어 있음 → null (=API 는 살아 있고 단지 데이터가 0 건).
 *     - JSON 파싱 실패 → RegisterFetchError throw (응답이 손상된 상태).
 *
 *   "정상이지만 비어 있음" 은 일반건축물처럼 자료 자체가 없는 정상 케이스이므로
 *   기존 0-row 처리 로직(noUnitData 안내) 으로 흘러야 한다 — 그래서 null 반환을 유지한다.
 */
async function fetchRegisterJsonOrThrow(url: string): Promise<unknown | null> {
  // [Task #698] 이 파일은 Express 의 Response 타입을 import 해 쓰므로, fetch 의 Response 는
  //   globalThis 에서 명시적으로 가져와 타입 충돌을 피한다.
  let r: globalThis.Response;
  try {
    r = await fetch(url);
  } catch (e) {
    throw new RegisterFetchError(
      e instanceof Error ? `register fetch failed: ${e.message}` : "register fetch failed",
      { cause: e },
    );
  }
  if (!r.ok) {
    throw new RegisterFetchError(`register fetch HTTP ${r.status}`);
  }
  const text = await r.text();
  if (!text) return null;
  try {
    return parseRegisterJsonText(text);
  } catch (e) {
    throw new RegisterFetchError(
      e instanceof Error ? `register response parse failed: ${e.message}` : "register response parse failed",
      { cause: e },
    );
  }
}

/**
 * 관대한 변형 — 어떤 실패든 null 로 흡수한다. 다음 두 부류의 호출 측에서만 사용한다:
 *   1) Promise.allSettled 로 묶여 있는 보조 호출 (lookup-register 의 recap, dong-pks).
 *   2) 다중 PK 를 순회하는 폴백 (fetchAreaInfoForAllDongs) — 일부 동만 실패한 부분
 *      장애에서도 가능한 데이터를 모은다.
 */
async function fetchRegisterJsonSafe(url: string): Promise<unknown | null> {
  try {
    return await fetchRegisterJsonOrThrow(url);
  } catch {
    return null;
  }
}

/**
 * [Task #502] 공공데이터 표제부의 useAprDay(YYYYMMDD) 를 ISO YYYY-MM-DD 로 변환.
 *  - 8자리 숫자가 아니면 빈 문자열을 반환한다(외부 응답이 비어 있거나 형식이 깨졌을 때).
 *  - 사용승인일이 등록되지 않은 건물(예: 일부 미등록 건축물)에 대비해 안전 폴백.
 */
export function formatUseAprDayToIso(useAprDay: unknown): string {
  if (typeof useAprDay !== "string") return "";
  const s = useAprDay.trim();
  if (!/^\d{8}$/.test(s)) return "";
  return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
}

// [Task #516] 건축물대장 표제부(BrTitleInfo) 응답에서 동(棟)별 PK·동명·주건축물 여부를 추출.
//   집합건축물(아파트·오피스텔)은 동마다 표제부가 한 행씩 따로 있으므로, 한 단지의 모든
//   동을 끝까지 페이징해 모은 뒤 호실 가져오기 단계가 동별로 전유부를 호출하도록 한다.
export interface RegisterDongPk {
  mgmBldrgstPk: string;
  dongName: string;
  isMain: boolean;
}

type BldTitleItem = Record<string, unknown>;
type BldRgstResp = {
  response?: {
    header?: { resultCode?: string };
    body?: {
      items?: { item?: unknown };
      totalCount?: number | string;
    };
  };
};

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

/**
 * [Task #552] 식별자 전용 picker — number 입력을 절대 받지 않는다.
 *
 *   `pickStr` 은 표시용 문자열(면적·층수 표기 등)에 number → String 폴백이 유용하지만,
 *   PK·본번·부번 같은 식별자에는 number 가 한 번이라도 끼면 자릿수/정밀도가 손상된다.
 *   응답 파싱 단계에서 `preserveBigIntegerIds` 가 큰 정수 ID 를 문자열로 보존하므로,
 *   여기로 number 가 흘러오는 경우는 곧 "정밀도 보존이 깨진 경로" 라는 신호다.
 *   조용히 폴백하지 않고 빈 문자열을 돌려 호출 측이 "수기 재조회 필요" 로 분기하게 한다.
 */
export function pickIdString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    // number 는 의도적으로 거부 — 큰 정수 PK 가 손상되는 경로를 차단한다.
  }
  return "";
}

function isMainBuilding(item: BldTitleItem): boolean {
  // 표제부 mainAtchGbCdNm = "주건축물" / "부속건축물". 코드(mainAtchGbCd) "0" = 주건축물.
  const name = pickStr(item.mainAtchGbCdNm);
  if (name) return name.includes("주건축물") && !name.includes("부속");
  const code = pickStr(item.mainAtchGbCd);
  return code === "" || code === "0";
}

function extractDongName(item: BldTitleItem): string {
  // 동 이름 후보: dongNm(전유부에는 있지만 표제부에는 비어 있을 때가 많음), bldNm(표제부 동 이름).
  // bldNm 은 단지명일 수도 있어, 동명만 깔끔히 잡히지 않으면 그대로 둔다(클라이언트에서 표시).
  return pickStr(item.dongNm, item.bldNm, item.bldNm2);
}

/**
 * [Task #516] 같은 (시군구·법정동·본번·부번)에 대해 표제부를 끝까지 페이징해
 * 동별 mgmBldrgstPk 와 메타데이터를 모두 모은다. 단지 내 동 수가 많아도(예: 30~40동)
 * 한 번 호출로 끝까지 모인다. 안전 장치: 페이지당 100건, 최대 50페이지(=5,000동) 까지.
 *
 * 반환 첫 항목은 "대표 동" 으로 사용한다(주건축물 우선, 없으면 첫 응답 그대로).
 */
export async function fetchAllDongPksFromRegister(params: {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}): Promise<{ dongs: RegisterDongPk[]; firstItem: BldTitleItem | null; resultCode?: string }> {
  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");

  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  const all: BldTitleItem[] = [];
  let totalCount = Number.POSITIVE_INFINITY;
  let resultCode: string | undefined;

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const queryParams = new URLSearchParams({
      sigunguCd: String(params.sigunguCd || ""),
      bjdongCd: String(params.bjdongCd || ""),
      bun: String(params.bun || "").padStart(4, "0"),
      ji: String(params.ji || "0").padStart(4, "0"),
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;
    // [Task #552] 정밀도 보존 파서를 통해 mgmBldrgstPk 가 항상 문자열로 들어오도록 한다.
    const res = (await fetchRegisterJsonSafe(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${qs}`,
    )) as BldRgstResp | null;

    const body = res?.response?.body;
    if (pageNo === 1) {
      resultCode = res?.response?.header?.resultCode;
      const tc = body?.totalCount;
      if (typeof tc === "number") totalCount = tc;
      else if (typeof tc === "string") totalCount = Number(tc) || 0;
    }
    const items = body?.items?.item;
    if (!items) break;
    const list = Array.isArray(items) ? items : [items];
    for (const it of list) all.push(it as BldTitleItem);
    if (all.length >= totalCount) break;
    if (list.length < PAGE_SIZE) break;
  }

  const dongs: RegisterDongPk[] = all
    .map((it) => ({
      // [Task #552] PK 는 식별자이므로 number 폴백을 거부하는 pickIdString 으로 추출.
      mgmBldrgstPk: pickIdString(it.mgmBldrgstPk),
      dongName: extractDongName(it),
      isMain: isMainBuilding(it),
    }))
    .filter((d) => d.mgmBldrgstPk !== "");
  // 대표 동: 주건축물이 있으면 그 동, 없으면 첫 동.
  dongs.sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const firstPk = dongs[0]?.mgmBldrgstPk ?? "";
  const firstItem = all.find((it) => pickIdString(it.mgmBldrgstPk) === firstPk) ?? all[0] ?? null;

  return { dongs, firstItem, resultCode };
}

router.get("/buildings/lookup-register", async (req: Request, res: Response) => {
  const { sigunguCd, bjdongCd, bun, ji } = req.query;

  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
    return;
  }

  try {
    // [Task #516] 표제부(getBrTitleInfo) 는 다동 페이징, 총괄표제부(getBrRecapTitleInfo) 는 1건만 조회.
    const recapQuery = new URLSearchParams({
      sigunguCd: String(sigunguCd || ""),
      bjdongCd: String(bjdongCd || ""),
      bun: String(bun || "").padStart(4, "0"),
      ji: String(ji || "0").padStart(4, "0"),
      numOfRows: "1",
      pageNo: "1",
      _type: "json",
    });
    const recapQs = `serviceKey=${apiKey}&${recapQuery.toString()}`;

    const [titleResult, recapResult] = await Promise.allSettled([
      fetchAllDongPksFromRegister({
        sigunguCd: String(sigunguCd || ""),
        bjdongCd: String(bjdongCd || ""),
        bun: String(bun || ""),
        ji: String(ji || "0"),
      }),
      // [Task #552] 총괄표제부도 정밀도 보존 파서로 받는다.
      fetchRegisterJsonSafe(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?${recapQs}`),
    ]);

    const titleAll = titleResult.status === "fulfilled" ? titleResult.value : null;
    const recapData = (recapResult.status === "fulfilled" ? recapResult.value : null) as BldRgstResp | null;

    const recapItems = recapData?.response?.body?.items?.item;
    const extractFirst = (items: unknown) => {
      if (!items) return null;
      if (Array.isArray(items)) return items.length > 0 ? items[0] : null;
      return items;
    };
    const recapItem = extractFirst(recapItems) as BldTitleItem | null;
    const titleItem = (titleAll?.firstItem ?? null) as BldTitleItem | null;

    if (!titleItem && !recapItem) {
      req.log.info({
        sigunguCd: String(sigunguCd),
        bjdongCd: String(bjdongCd),
        bun: String(bun),
        ji: String(ji),
        titleResultCode: titleAll?.resultCode,
        recapResultCode: recapData?.response?.header?.resultCode,
      }, "Building register lookup returned no results");
      res.json({ found: false, data: null });
      return;
    }

    const t: BldTitleItem = titleItem || {};
    const r: BldTitleItem = recapItem || {};

    const useAprDayRaw = pickStr(t.useAprDay, r.useAprDay);
    const approvalDateIso = formatUseAprDayToIso(useAprDayRaw);
    const dongs: RegisterDongPk[] = titleAll?.dongs ?? [];

    // [Task #516] 외부 API 호출 결과 요약 로그 — 표제부 페이지 수 / 동 수 / totalCount.
    //   개인정보(소유자)는 본 라우트에서 다루지 않으므로 본문 단순 메타만 남긴다.
    req.log.info({
      sigunguCd: String(sigunguCd),
      bjdongCd: String(bjdongCd),
      bun: String(bun),
      ji: String(ji),
      dongCount: dongs.length,
    }, "Building register lookup ok (multi-dong)");

    const buildingInfo = {
      found: true,
      raw: {
        title: titleItem || null,
        recap: recapItem || null,
      },
      // [Task #516] 동(棟)별 표제부 PK 목록. 호실 가져오기 단계가 동별 전유부를 페이징할 때 사용.
      // 단일 동 건물은 길이 1, 다동 건물(아파트 등)은 N. 클라이언트는 buildings.registerDongPks 에 보관.
      dongs,
      data: {
        buildingName: pickStr(t.bldNm, r.bldNm),
        mainPurpose: pickStr(t.mainPurpsCdNm, t.etcPurps, r.mainPurpsCdNm),
        totalArea: pickStr(t.totArea, r.totArea),
        buildingArea: pickStr(t.archArea, r.archArea),
        totalFloors: t.grndFlrCnt ? parseInt(String(t.grndFlrCnt)) : (r.grndFlrCnt ? parseInt(String(r.grndFlrCnt)) : 0),
        basementFloors: t.ugrndFlrCnt ? parseInt(String(t.ugrndFlrCnt)) : (r.ugrndFlrCnt ? parseInt(String(r.ugrndFlrCnt)) : 0),
        structureType: pickStr(t.strctCdNm, r.strctCdNm),
        totalUnits: t.hhldCnt ? parseInt(String(t.hhldCnt)) : (t.hoCnt ? parseInt(String(t.hoCnt)) : (r.hhldCnt ? parseInt(String(r.hhldCnt)) : 0)),
        completionDate: pickStr(t.useAprDay, r.useAprDay),
        approvalDate: approvalDateIso,
        elevatorCount: (t.rideUseElvtCnt ? parseInt(String(t.rideUseElvtCnt)) : 0)
          + (t.emgenUseElvtCnt ? parseInt(String(t.emgenUseElvtCnt)) : 0),
        platPlc: pickStr(t.platPlc, r.platPlc),
        newPlatPlc: pickStr(t.newPlatPlc, r.newPlatPlc),
        // [Task #552] 식별자(시군구·법정동·본번·부번·PK) 는 number 폴백을 거부한다.
        sigunguCd: pickIdString(t.sigunguCd, r.sigunguCd),
        bjdongCd: pickIdString(t.bjdongCd, r.bjdongCd),
        bun: pickIdString(t.bun, r.bun),
        ji: pickIdString(t.ji, r.ji),
        // [Task #516] 대표 동의 PK. 단일 동 건물에서는 기존 단일 PK 와 동일하며,
        // 다동 건물에서는 주건축물(주건축물 표시가 없으면 첫 동)의 PK 가 들어간다.
        // [Task #552] PK 는 식별자 — pickIdString 으로 number 입력을 거부한다.
        mgmBldrgstPk: dongs[0]?.mgmBldrgstPk ?? pickIdString(t.mgmBldrgstPk, r.mgmBldrgstPk),
        landArea: pickStr(r.platArea),
        buildingCoverageRatio: pickStr(r.bcRat),
        floorAreaRatio: pickStr(r.vlRat),
        parkingCount: r.totPkngCnt ? parseInt(String(r.totPkngCnt)) : 0,
      },
    };

    res.json(buildingInfo);
  } catch (error) {
    if (error instanceof Error && error.message === "API_KEY_MISSING") {
      res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
      return;
    }
    req.log.error({ err: error }, "Error looking up building register");
    res.status(500).json({ error: "건축물대장 조회 실패" });
  }
});

// [Task #348] 건축물대장 전유부/공용부 면적 정보 조회. 호실 미리보기/일괄 가져오기에서
// 동일하게 호출하므로 라우트 핸들러와 별도로 분리해 둔다.
//
// [Task #693] 한 행 = 한 호실 (1 row per unit). 공공데이터 `getBrExposPubuseAreaInfo`
//   응답은 호실 1개당 여러 행으로 내려온다 (전유 1행 + 공용 N행, 공용은 계단실/승강기/홀,
//   주차장, 방재실, 전기실 등으로 부분별 분리). 별도의 합계 필드(`cmmnPuprpsArea`) 는
//   응답에 들어 있지 않으므로 호실 단위 합산은 본 모듈의 `groupAreaInfoItems` 가 담당한다.
export interface AreaInfoRow {
  // [Task #516] 전유부 응답에는 동(棟) 이름이 포함된다. 동별로 페이징한 결과를 모두
  //   합친 뒤 매칭 키 (dong + 정규화 층 + 호실번호) 로 사용한다.
  dong: string;
  floorNo: string;
  purposeName: string;
  hoNm: string;
  // [Task #693] 호실의 전용면적 합 (`exposPubuseGbCd = 1` 행들의 area 합).
  exposArea: number;
  // [Task #693] 호실의 공용면적 합 (`exposPubuseGbCd = 2` 행들의 area 합).
  //   응답에 별도 합계 필드는 없고, 부분별(승강기/주차장/방재실 등) 행을 모두 더한 값.
  pubUseArea: number;
}

/**
 * [Task #693] 공공데이터 전유부 응답(`getBrExposPubuseAreaInfo`) 의 raw item 배열을
 *   호실 단위로 그룹핑·합산해 한 호실 = 한 `AreaInfoRow` 가 되도록 변환한다.
 *
 *   응답 구조 (실측):
 *     - `exposPubuseGbCd = "1"` (전유): 호실당 1 행, `area` = 전용면적,
 *       `flrNoNm` 에 호실 층, `mainPurpsCdNm` 에 호실 용도.
 *     - `exposPubuseGbCd = "2"` (공용): 호실당 N 행 (계단실/승강기/홀, 주차장,
 *       방재실/관리실, 전기실 등 부분별). 공용 행의 `flrNoNm` 은 그 공용 부분이
 *       위치한 층을 가리키며 호실 층이 아니다(예: 22층 호실의 주차장 공용은
 *       "지하1"). 비어 있거나 "각층" 으로 내려오기도 한다. `etcPurps` 는 부분
 *       설명("계단실/승강기") 이라 호실 용도로 쓰지 않는다.
 *
 *   호실 식별: 매칭 키 정책(`동 + 정규화 층 + 호실번호`) 과 일관되게 unit identity 는
 *     `(dong + floorNo + hoNm)` 로 잡는다 — 전유 행의 `flrNoNm` 이 호실 층의
 *     단일 권위 소스. 같은 (dong, hoNm) 이라도 floor 가 다르면 서로 다른 호실로
 *     취급한다.
 *
 *   2-pass 처리:
 *     1) 전유 행(gbCd=1, 또는 gbCd 미상의 보수적 처리)으로 unit identity 를 확정.
 *        같은 (dong, hoNm) 의 floor 집합도 함께 기록.
 *     2) 공용 행(gbCd=2)을 호실에 라우팅:
 *        - 그 (dong, hoNm) 의 호실이 정확히 1개면 그 호실에 합산.
 *        - 호실이 여러 개(같은 hoNm 다른 floor 충돌)면 공용 행의 flrNoNm 이 그 중
 *          한 호실의 floor 와 정확히 일치할 때만 그 호실에 합산. 일치하지 않으면
 *          (예: "각층"/공백) 어느 호실 것인지 모호하므로 건너뛴다(방어적).
 *        - 그 (dong, hoNm) 의 전유 행이 하나도 없으면, 공용만 있는 합성 호실을
 *          만들어 합산한다. 같은 (dong, hoNm) 의 공용 행들은 한 호실로 합치고,
 *          floorNo 는 첫 유효한 flrNoNm 을 폴백으로 채운다("각층"/공백 제외).
 *
 *   `hoNm` 이 비어 있는 행(층 합계·건물 전체 공용 등) 은 호실 단위 데이터가 아니므로
 *   결과에 포함하지 않는다.
 */
export function groupAreaInfoItems(items: Record<string, unknown>[]): AreaInfoRow[] {
  type Acc = {
    dong: string;
    floorNo: string;
    purposeName: string;
    hoNm: string;
    exposArea: number;
    pubUseArea: number;
  };

  // 1차 분류: hoNm 이 비어 있는 행은 즉시 제외.
  const exclusiveRows: Record<string, unknown>[] = [];
  const publicRows: Record<string, unknown>[] = [];
  for (const item of items) {
    const hoNm = String(item.hoNm ?? "").trim();
    if (!hoNm) continue;
    const gbCd = String(item.exposPubuseGbCd ?? "").trim();
    if (gbCd === "2") publicRows.push(item);
    else exclusiveRows.push(item); // gbCd === "1" 또는 코드 미상(보수적 전유 처리)
  }

  // Pass 1: 전유 행으로 unit identity 확정. 키 = (dong + floorNo + hoNm).
  const units = new Map<string, Acc>();
  // (dong + hoNm) → 그 호실들의 floor 집합. Pass 2 의 공용 행 라우팅에 사용.
  const dongHoFloors = new Map<string, Set<string>>();

  for (const item of exclusiveRows) {
    const dong = String(item.dongNm ?? "").trim();
    const hoNm = String(item.hoNm ?? "").trim();
    const floorNo = String(item.flrNoNm ?? item.flrNo ?? "").trim();
    const area = item.area ? parseFloat(String(item.area)) : 0;
    const main = String(item.mainPurpsCdNm ?? "").trim();
    const etc = String(item.etcPurps ?? "").trim();
    const purpose = main || etc;

    const key = `${dong}||${floorNo}||${hoNm}`;
    let g = units.get(key);
    if (!g) {
      g = { dong, floorNo, purposeName: "", hoNm, exposArea: 0, pubUseArea: 0 };
      units.set(key, g);
    }
    g.exposArea += area;
    if (purpose && !g.purposeName) g.purposeName = purpose;

    const dongHoKey = `${dong}||${hoNm}`;
    let floors = dongHoFloors.get(dongHoKey);
    if (!floors) {
      floors = new Set<string>();
      dongHoFloors.set(dongHoKey, floors);
    }
    floors.add(floorNo);
  }

  // Pass 2: 공용 행을 호실에 라우팅.
  for (const item of publicRows) {
    const dong = String(item.dongNm ?? "").trim();
    const hoNm = String(item.hoNm ?? "").trim();
    const floorNo = String(item.flrNoNm ?? item.flrNo ?? "").trim();
    const area = item.area ? parseFloat(String(item.area)) : 0;

    const dongHoKey = `${dong}||${hoNm}`;
    const floors = dongHoFloors.get(dongHoKey);

    if (floors && floors.size === 1) {
      // 그 (dong, hoNm) 의 호실이 단 하나 — 공용 행의 flrNoNm 이 무엇이든 그 호실에 합산.
      const onlyFloor = floors.values().next().value as string;
      const u = units.get(`${dong}||${onlyFloor}||${hoNm}`);
      if (u) u.pubUseArea += area;
    } else if (floors && floors.size > 1) {
      // 충돌 — 공용 행의 flrNoNm 이 호실 floor 중 하나와 정확히 일치할 때만 합산.
      // 일치하지 않으면(예: "각층") 어느 호실의 공용인지 모호하므로 건너뛴다(방어적).
      if (floors.has(floorNo)) {
        const u = units.get(`${dong}||${floorNo}||${hoNm}`);
        if (u) u.pubUseArea += area;
      }
    } else {
      // 전유 행이 없는 (dong, hoNm) — 공용만 있는 합성 호실로 모은다.
      // 같은 (dong, hoNm) 의 공용 행들은 한 호실로 합쳐야 하므로, 키에 floor 대신 마커 사용.
      const key = `${dong}||*public-only*||${hoNm}`;
      let g = units.get(key);
      if (!g) {
        g = { dong, floorNo: "", purposeName: "", hoNm, exposArea: 0, pubUseArea: 0 };
        units.set(key, g);
      }
      g.pubUseArea += area;
      if (!g.floorNo && floorNo && floorNo !== "각층") {
        g.floorNo = floorNo;
      }
    }
  }

  return Array.from(units.values()).map((g) => ({
    dong: g.dong,
    floorNo: g.floorNo,
    purposeName: g.purposeName,
    hoNm: g.hoNm,
    exposArea: g.exposArea,
    pubUseArea: g.pubUseArea,
  }));
}

// [Task #689] 공공데이터 API의 페이지 크기/안전 상한. 토지 식별자 1회 호출만으로도
//   대형 오피스텔(수백~수천 호실)을 모두 가져와야 하므로 PK 단위 조회와 동일한 한도 사용.
const AREA_INFO_PAGE_SIZE = 100;
const AREA_INFO_MAX_PAGES = 50;

type BldExposBody = {
  items?: { item?: unknown };
  totalCount?: number | string;
};
type BldExposResp = { response?: { body?: BldExposBody } };

/**
 * [Task #689] 표제부 PK 가 아니라 토지 식별자(시군구·법정동·본번·부번) 로 전유부를
 *   조회한다. `getBrExposPubuseAreaInfo` 는 mgmBldrgstPk 단독 호출 시 빈 응답(`body:{}`)
 *   을 돌려주는 사례(집합건축물 표제부 PK)가 있어, 토지 식별자 호출이 실질적인
 *   "한 단지의 모든 동·호실" 조회 경로다. 단일 호출로 단지 안 모든 동/호실이 한 번에
 *   내려오므로 PK 별 순회가 더 이상 필요 없다.
 *
 *   페이징: totalCount 기반. 안전 상한 50페이지(=5,000건). 페이지당 100건.
 */
export async function fetchAreaInfoByLandCode(params: {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}): Promise<AreaInfoRow[] | null> {
  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");

  const sigunguCd = String(params.sigunguCd || "").trim();
  const bjdongCd = String(params.bjdongCd || "").trim();
  const bun = String(params.bun || "").trim();
  const ji = String(params.ji || "0").trim();
  if (!sigunguCd || !bjdongCd || !bun) return null;

  const all: Record<string, unknown>[] = [];
  let totalCount = Number.POSITIVE_INFINITY;
  let firstFetchOk = false;

  for (let pageNo = 1; pageNo <= AREA_INFO_MAX_PAGES; pageNo++) {
    const queryParams = new URLSearchParams({
      sigunguCd,
      bjdongCd,
      bun: bun.padStart(4, "0"),
      ji: (ji || "0").padStart(4, "0"),
      numOfRows: String(AREA_INFO_PAGE_SIZE),
      pageNo: String(pageNo),
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;
    // [Task #552] 정밀도 보존 파서를 통해 응답 안 식별자(mgmBldrgstPk/bun/ji 등)
    //   가 number 로 와도 문자열로 보존된다.
    // [Task #698] 외부 API 진짜 장애는 RegisterFetchError 로 throw 시켜 호출 측이
    //   503 + REGISTER_FETCH_FAILED 로 응답하도록 한다.
    const result = (await fetchRegisterJsonOrThrow(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${qs}`,
    )) as BldExposResp | null;

    const body = result?.response?.body;
    const items = body?.items?.item;

    if (pageNo === 1) {
      firstFetchOk = result != null;
      if (typeof body?.totalCount === "number") totalCount = body.totalCount;
      else if (typeof body?.totalCount === "string") totalCount = Number(body.totalCount) || 0;
    }

    if (!items) break;
    const list = Array.isArray(items) ? items : [items];
    all.push(...(list as Record<string, unknown>[]));

    if (all.length >= totalCount) break;
    if (list.length < AREA_INFO_PAGE_SIZE) break;
  }

  // [Task #698] 첫 페이지 응답이 정상적으로 왔지만 본문이 없는 경우(=정상 케이스)는 null 로 반환.
  if (!firstFetchOk) return null;
  // [Task #693] 호실 단위로 그룹핑·합산해 한 호실 = 한 행이 되도록 한다. 응답 자체는
  //   호실당 N 행(전유 1 + 공용 N) 으로 내려오므로 그대로 1:1 매핑하면 미리보기에
  //   같은 호실이 여러 줄 중복으로 나타나고 공용면적 합산이 빠진다.
  return groupAreaInfoItems(all);
}

/**
 * [Task #689] 빌딩 행에서 전유부 조회용 토지 식별자(시군구·법정동·본번·부번) 를
 *   추출한다. 우선순위:
 *     1) `building.registerData.title` 의 sigunguCd/bjdongCd/bun/ji
 *     2) 비어 있으면 `building.registerData.recap` 의 동일 필드 폴백
 *
 *   buildings 테이블에는 별도의 코드 컬럼이 없고 표제부 응답 원본을 통째로 보관하므로
 *   해당 원본에서만 안전하게 복원할 수 있다. 정밀도 보존 파서가 number → string 으로
 *   감싸 둔 값을 그대로 받는다 — 손상된 값은 pickIdString 이 빈 문자열로 떨어뜨려
 *   호출 측이 "PK 기반 폴백" 으로 분기하게 한다.
 */
export function extractLandCodeFromBuilding(
  building: Pick<Building, "registerData">,
): { sigunguCd: string; bjdongCd: string; bun: string; ji: string } | null {
  const reg = (building.registerData ?? null) as
    | { title?: Record<string, unknown> | null; recap?: Record<string, unknown> | null }
    | null;
  if (!reg) return null;
  const title = reg.title ?? null;
  const recap = reg.recap ?? null;
  const sigunguCd = pickIdString(title?.sigunguCd, recap?.sigunguCd);
  const bjdongCd = pickIdString(title?.bjdongCd, recap?.bjdongCd);
  const bun = pickIdString(title?.bun, recap?.bun);
  // ji 는 "0" 도 유효한 부번. 빈 문자열일 때만 폴백 후 기본값 "0".
  const ji = pickIdString(title?.ji, recap?.ji) || "0";
  if (!sigunguCd || !bjdongCd || !bun) return null;
  return { sigunguCd, bjdongCd, bun, ji };
}

/**
 * [Task #689] 빌딩 행에서 건축물대장 구분(`regstrGbCdNm`)을 추출한다.
 *   "집합" = 집합건축물(전유부 단위 자료가 있음), "일반" = 일반건축물(전유부 자료 없음).
 *   값이 비어 있거나 알 수 없는 형태면 "unknown" 으로 분류해 호출 측이 보수적으로
 *   "API 오류" 와 "해당 없음" 을 구분할 수 있게 한다.
 */
export type RegisterBuildingKind = "general" | "collective" | "unknown";

export function classifyRegisterBuildingKind(
  building: Pick<Building, "registerData">,
): RegisterBuildingKind {
  const reg = (building.registerData ?? null) as
    | { title?: Record<string, unknown> | null; recap?: Record<string, unknown> | null }
    | null;
  const t = reg?.title ?? null;
  const r = reg?.recap ?? null;
  const name = pickStr(t?.regstrGbCdNm, r?.regstrGbCdNm);
  if (name.includes("집합")) return "collective";
  if (name.includes("일반")) return "general";
  // 코드 폴백: 1=일반, 2=집합 (건축물대장 코드 표 기준).
  const code = pickStr(t?.regstrGbCd, r?.regstrGbCd);
  if (code === "2") return "collective";
  if (code === "1") return "general";
  return "unknown";
}

export async function fetchAreaInfoFromRegister(mgmBldrgstPk: string): Promise<AreaInfoRow[] | null> {
  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");

  // [Task #348] 공공데이터 API는 페이지당 최대 100건까지 반환하므로, 100건이 넘는
  // 호실(예: 대형 오피스텔/주상복합)이 누락되지 않도록 totalCount 기반으로 끝까지 순회한다.
  // 안전 장치: 최대 50페이지(=5,000건)까지만 시도. 그 이상은 거의 단일 건물에서 발생하지 않음.
  const all: Record<string, unknown>[] = [];
  let totalCount = Number.POSITIVE_INFINITY;
  let firstFetchOk = false;

  for (let pageNo = 1; pageNo <= AREA_INFO_MAX_PAGES; pageNo++) {
    const queryParams = new URLSearchParams({
      mgmBldrgstPk,
      numOfRows: String(AREA_INFO_PAGE_SIZE),
      pageNo: String(pageNo),
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;
    // [Task #552] 전유부 응답에도 mgmBldrgstPk·bun·ji 같은 식별자가 포함될 수 있어 정밀도 보존 파서로 받는다.
    const result = (await fetchRegisterJsonSafe(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${qs}`,
    )) as BldExposResp | null;

    const body = result?.response?.body;
    const items = body?.items?.item;

    if (pageNo === 1) {
      firstFetchOk = result != null;
      if (typeof body?.totalCount === "number") totalCount = body.totalCount;
      else if (typeof body?.totalCount === "string") totalCount = Number(body.totalCount) || 0;
    }

    if (!items) break;
    const list = Array.isArray(items) ? items : [items];
    all.push(...(list as Record<string, unknown>[]));

    if (all.length >= totalCount) break;
    if (list.length < AREA_INFO_PAGE_SIZE) break;
  }

  if (!firstFetchOk) return null;
  if (all.length === 0) return null;

  // [Task #693] 호실 단위 그룹핑·합산. 표제부 PK 한 동의 응답 안에서도 호실당 다중 행
  //   (전유 1행 + 공용 N행) 으로 내려오므로 본 함수 안에서 합산해 호출 측의 부담을 없앤다.
  return groupAreaInfoItems(all);
}

// [Task #516] 빌딩 행에 저장돼 있는 동(棟) PK 목록 전체를 순회해 전유부 면적을 모은다.
//   동별 호출은 직렬로 처리해 외부 API 의 동시성 제한을 보호하고, 한 동의 응답이
//   비어 있어도(`body:{}`) 다음 동을 계속 진행한다. 빈 동/실패 동은 로그로만 남긴다.
export async function fetchAreaInfoForAllDongs(
  pks: string[],
  log?: (info: { mgmBldrgstPk: string; rows: number; ok: boolean }) => void,
): Promise<AreaInfoRow[]> {
  const merged: AreaInfoRow[] = [];
  for (const pk of pks) {
    if (!pk) continue;
    try {
      const rows = await fetchAreaInfoFromRegister(pk);
      log?.({ mgmBldrgstPk: pk, rows: rows?.length ?? 0, ok: rows !== null });
      if (rows && rows.length > 0) merged.push(...rows);
    } catch (e) {
      if (e instanceof Error && e.message === "API_KEY_MISSING") throw e;
      log?.({ mgmBldrgstPk: pk, rows: 0, ok: false });
    }
  }
  return merged;
}

/**
 * [Task #689] 빌딩 행과 (선택적으로) PK 를 받아 전유부 면적 행을 가져오는 공통 코어.
 *   - 우선 토지 식별자(시군구·법정동·본번·부번) 기반으로 1회 호출 → 단지 모든 동/호실
 *     이 한 번에 들어온다. 이것이 정상 경로.
 *   - 토지 식별자가 비어 있으면(레거시 / register_data 미보존) 표제부 PK 폴백.
 *   - 일반건축물(`regstrGbCdNm = "일반"`) 응답이 비어 있는 경우는 "API 오류" 가 아니라
 *     "해당 없음" 으로 호출 측이 분기할 수 있게 kind 를 함께 반환한다.
 *
 *   [Task #698] 외부 API 진짜 장애(네트워크 끊김, HTTP non-2xx, 응답 파싱 실패) 는
 *     fetchAreaInfoByLandCode 가 RegisterFetchError 로 throw 하므로, 그대로 호출 측에
 *     propagate 된다(여기서 catch 해 PK 폴백으로 내려가지 않는다). 이렇게 해야 호출
 *     측이 503 + REGISTER_FETCH_FAILED 로 안내할 수 있고, 외부 장애 중인 상황에서 PK
 *     폴백을 한 번 더 두드려 응답 시간을 가중시키지 않는다. 토지 식별자가 아예 없거나
 *     입력 검증에서 떨어진 케이스(=null 반환)에 한해서만 PK 폴백을 시도한다.
 */
export async function loadAreaInfoForBuilding(
  building: Pick<Building, "registerData" | "buildingRegisterPk" | "registerDongPks">,
  log?: (info: { mgmBldrgstPk: string; rows: number; ok: boolean }) => void,
): Promise<{
  areas: AreaInfoRow[];
  source: "land-code" | "pk-fallback" | "none";
  kind: RegisterBuildingKind;
}> {
  const kind = classifyRegisterBuildingKind(building);
  const landCode = extractLandCodeFromBuilding(building);

  if (landCode) {
    // [Task #698] 진짜 외부 API 장애는 RegisterFetchError 로 throw 되어 그대로 propagate 된다.
    //   null 반환은 "API 응답 자체는 정상인데 본문/items 가 비어 있음" 의 신호이며,
    //   이 경우에만 PK 폴백을 한 번 더 시도한다.
    const rows = await fetchAreaInfoByLandCode(landCode);
    if (rows !== null) return { areas: rows, source: "land-code", kind };
  }

  // [Task #689] 폴백 — 저장된 동(棟) PK 들을 순회해서 모은다. 일반건축물에서는
  //   대개 비어 있고, 토지 식별자 응답이 정상이지만 비어 있는 드문 경우의 백업 경로다.
  const pks: string[] = (building.registerDongPks ?? []).map((d) => d.mgmBldrgstPk).filter(Boolean);
  if (pks.length === 0 && building.buildingRegisterPk) pks.push(building.buildingRegisterPk);
  if (pks.length === 0) return { areas: [], source: "none", kind };
  const merged = await fetchAreaInfoForAllDongs(pks, log);
  return { areas: merged, source: "pk-fallback", kind };
}

router.get("/buildings/lookup-area-info", async (req: Request, res: Response) => {
  const { mgmBldrgstPk, buildingId } = req.query;

  // [Task #689] 진입점은 buildingId / mgmBldrgstPk 어느 쪽이든 받지만, 내부적으로는
  //   항상 "빌딩 행 → 토지 식별자(또는 PK 폴백)" 경로로 위임한다. mgmBldrgstPk 만
  //   들어와도 빌딩 행을 한 번 조회해 토지 식별자를 복원한다.
  let building: Building | null = null;
  if (buildingId) {
    const id = parseInt(String(buildingId));
    if (!Number.isFinite(id)) { res.status(400).json({ error: "buildingId 가 유효하지 않습니다" }); return; }
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id));
    if (!b) { res.status(404).json({ error: "건물을 찾을 수 없습니다" }); return; }
    building = b;
  } else if (mgmBldrgstPk) {
    // [Task #689] 호출자가 동(棟) PK 를 넘기는 경우(예: 멀티-동 건물에서 특정 동을 가리킴)
    //   buildingRegisterPk 매칭만으로는 빌딩을 못 찾아 legacy pk-only 폴백으로 빠진다.
    //   register_dong_pks(jsonb) 안에 같은 PK 가 들어 있는지도 함께 검사해 빌딩을 복원한다.
    const pk = String(mgmBldrgstPk);
    const [b] = await db
      .select()
      .from(buildingsTable)
      .where(
        or(
          eq(buildingsTable.buildingRegisterPk, pk),
          sql`${buildingsTable.registerDongPks} @> ${JSON.stringify([{ mgmBldrgstPk: pk }])}::jsonb`,
        ),
      );
    if (b) building = b;
  } else {
    res.status(400).json({ error: "buildingId 또는 mgmBldrgstPk 가 필요합니다" });
    return;
  }

  // mgmBldrgstPk 만 들어왔는데 매칭 빌딩이 없는 경우 — 레거시 직접 호출 폴백.
  if (!building) {
    try {
      const areas = await fetchAreaInfoFromRegister(String(mgmBldrgstPk));
      if (!areas) { res.json({ found: false, areas: [] }); return; }
      res.json({ found: true, areas });
    } catch (error) {
      if (error instanceof Error && error.message === "API_KEY_MISSING") {
        res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
        return;
      }
      req.log.error({ err: error }, "Error looking up area info (legacy pk-only)");
      res.status(500).json({ error: "전용/공용면적 조회 실패" });
    }
    return;
  }

  try {
    const result = await loadAreaInfoForBuilding(building, (info) => {
      req.log.info({ buildingId: building?.id, ...info }, "Register area info fetched per dong (fallback)");
    });
    res.json({ found: result.areas.length > 0, areas: result.areas });
  } catch (e) {
    if (e instanceof Error && e.message === "API_KEY_MISSING") {
      res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
      return;
    }
    req.log.error({ err: e, buildingId: building.id }, "Error looking up area info");
    res.status(500).json({ error: "전용/공용면적 조회 실패" });
  }
});

// [Task #552] 손상된 building_register_pk 식별·복구 — 운영 DB 원샷 복구용 엔드포인트.
//
//   문제: 일부 행이 `1.0000000000000004e+21` 같은 지수표기 문자열, 또는 비정상적으로
//   짧은(13자 미만) / 비정상적으로 긴(22자 초과) PK 로 저장돼 있어
//   `getBrExposPubuseAreaInfo` 호출이 가짜 PK 로 나가 404 가 발생한다.
//
//   복구 방법: 행의 register_data.title 에 보존된 sigunguCd/bjdongCd/bun/ji 를 이용해
//   `fetchAllDongPksFromRegister` 를 다시 호출 → 정밀도가 보존된 PK 로 building_register_pk
//   와 register_dong_pks 를 갱신한다. 실패 행은 "수기 재조회 필요" 로 응답에 분리해 남긴다.
//
//   접근권한: platform_admin 만. dryRun=true 면 스캔 결과만 돌려주고 DB 를 변경하지 않는다.
function isPkSuspicious(pk: string | null | undefined): boolean {
  if (!pk) return false;
  if (pk.includes("e+") || pk.includes("E+")) return true;
  if (pk.includes(".")) return true;
  if (pk.length < 13) return true;
  if (pk.length > 22) return true;
  return false;
}

router.post("/buildings/repair-register-pks", async (req: Request, res: Response): Promise<void> => {
  // platform_admin 만 — buildings 라우터 진입점에서 이미 인증/역할 검사가 1차 적용되지만,
  // 본 라우트는 운영 DB 정정용이라 명시적으로 한 번 더 잠근다.
  if (!req.user || req.user.role !== "platform_admin") {
    res.status(403).json({ error: "platform_admin 만 사용할 수 있습니다." });
    return;
  }
  const dryRun = req.body?.dryRun === true;
  const onlyIds: number[] | undefined = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : undefined;

  // 손상 후보 추출. SQL 측에서 1차 필터링 후 JS 에서 isPkSuspicious 로 재확인.
  const baseWhere = and(
    isNotNull(buildingsTable.buildingRegisterPk),
    or(
      sql`${buildingsTable.buildingRegisterPk} LIKE '%e+%'`,
      sql`${buildingsTable.buildingRegisterPk} LIKE '%E+%'`,
      sql`${buildingsTable.buildingRegisterPk} LIKE '%.%'`,
      sql`length(${buildingsTable.buildingRegisterPk}) < 13`,
      sql`length(${buildingsTable.buildingRegisterPk}) > 22`,
    ),
  );
  const where = onlyIds && onlyIds.length > 0
    ? and(baseWhere, inArray(buildingsTable.id, onlyIds))
    : baseWhere;
  const candidates = await db.select().from(buildingsTable).where(where);

  type ReportRow = {
    id: number;
    name: string;
    addressJibun: string | null;
    addressFull: string | null;
    before: string | null;
    beforeLen: number;
    beforeDongCount: number;
    after?: string | null;
    afterDongCount?: number;
    status: "repaired" | "manual_review_needed" | "preview";
    reason?: string;
  };

  const repaired: ReportRow[] = [];
  const manual: ReportRow[] = [];
  const preview: ReportRow[] = [];

  for (const b of candidates) {
    const before = b.buildingRegisterPk ?? "";
    const beforeRow: ReportRow = {
      id: b.id,
      name: b.name,
      addressJibun: b.addressJibun ?? null,
      addressFull: b.addressFull ?? null,
      before,
      beforeLen: before.length,
      beforeDongCount: (b.registerDongPks ?? []).length,
      status: "preview",
    };

    if (!isPkSuspicious(before)) continue; // SQL 1차 통과했지만 JS 검사에서 통과한 경우.

    // register_data.title 에서 시군구·법정동·본번·부번을 추출. 셋 중 하나라도 비어 있으면 자동 복구 보류.
    const reg = (b.registerData ?? null) as { title?: Record<string, unknown> | null } | null;
    const title = reg?.title ?? null;
    const sigunguCd = title ? pickIdString(title.sigunguCd) : "";
    const bjdongCd = title ? pickIdString(title.bjdongCd) : "";
    const bun = title ? pickIdString(title.bun) : "";
    const ji = title ? pickIdString(title.ji) : "";

    if (!sigunguCd || !bjdongCd || !bun) {
      manual.push({
        ...beforeRow,
        status: "manual_review_needed",
        reason: "register_data.title 에 sigunguCd/bjdongCd/bun 식별자가 없어 자동 재조회가 불가합니다.",
      });
      continue;
    }

    if (dryRun) {
      preview.push({
        ...beforeRow,
        status: "preview",
        reason: `재조회 후보 — sigunguCd=${sigunguCd}, bjdongCd=${bjdongCd}, bun=${bun}, ji=${ji || "0"}`,
      });
      continue;
    }

    try {
      const lookup = await fetchAllDongPksFromRegister({ sigunguCd, bjdongCd, bun, ji: ji || "0" });
      const newPk = lookup.dongs[0]?.mgmBldrgstPk ?? "";
      if (!newPk || !/^\d+$/.test(newPk) || isPkSuspicious(newPk)) {
        manual.push({
          ...beforeRow,
          status: "manual_review_needed",
          reason: `재조회 응답에서 정상 PK 를 얻지 못했습니다 (resultCode=${lookup.resultCode ?? "?"}, dongs=${lookup.dongs.length}).`,
        });
        continue;
      }
      await db
        .update(buildingsTable)
        .set({
          buildingRegisterPk: newPk,
          registerDongPks: lookup.dongs,
        })
        .where(eq(buildingsTable.id, b.id));
      repaired.push({
        ...beforeRow,
        status: "repaired",
        after: newPk,
        afterDongCount: lookup.dongs.length,
      });
      req.log.info(
        { buildingId: b.id, before, after: newPk, dongCount: lookup.dongs.length },
        "Repaired corrupted building_register_pk",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "재조회 실패";
      manual.push({
        ...beforeRow,
        status: "manual_review_needed",
        reason: `재조회 호출이 실패했습니다: ${msg}`,
      });
      req.log.warn({ err: e, buildingId: b.id }, "Failed to repair building_register_pk");
    }
  }

  res.json({
    dryRun,
    scanned: candidates.length,
    repairedCount: repaired.length,
    manualReviewCount: manual.length,
    previewCount: preview.length,
    repaired,
    manualReviewNeeded: manual,
    preview,
  });
});

export default router;
