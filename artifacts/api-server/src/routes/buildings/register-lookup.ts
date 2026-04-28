// [Task #496] buildings 라우터 분리 — 건축물대장(공공데이터 API) 조회 핸들러.
//   원본 routes/buildings.ts 의 GET /buildings/lookup-register 와
//   /buildings/lookup-area-info, AreaInfoRow 타입, fetchAreaInfoFromRegister 헬퍼를
//   그대로 옮긴다. units-import.ts 가 AreaInfoRow / fetchAreaInfoFromRegister 를 import 한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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
    const res = await fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as BldRgstResp | null;

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
      mgmBldrgstPk: pickStr(it.mgmBldrgstPk),
      dongName: extractDongName(it),
      isMain: isMainBuilding(it),
    }))
    .filter((d) => d.mgmBldrgstPk !== "");
  // 대표 동: 주건축물이 있으면 그 동, 없으면 첫 동.
  dongs.sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const firstPk = dongs[0]?.mgmBldrgstPk ?? "";
  const firstItem = all.find((it) => pickStr(it.mgmBldrgstPk) === firstPk) ?? all[0] ?? null;

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
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?${recapQs}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
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
        sigunguCd: pickStr(t.sigunguCd, r.sigunguCd),
        bjdongCd: pickStr(t.bjdongCd, r.bjdongCd),
        bun: pickStr(t.bun, r.bun),
        ji: pickStr(t.ji, r.ji),
        // [Task #516] 대표 동의 PK. 단일 동 건물에서는 기존 단일 PK 와 동일하며,
        // 다동 건물에서는 주건축물(주건축물 표시가 없으면 첫 동)의 PK 가 들어간다.
        mgmBldrgstPk: dongs[0]?.mgmBldrgstPk ?? pickStr(t.mgmBldrgstPk, r.mgmBldrgstPk),
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
export interface AreaInfoRow {
  // [Task #516] 전유부 응답에는 동(棟) 이름이 포함된다. 동별로 페이징한 결과를 모두
  //   합친 뒤 매칭 키 (dong + 정규화 층 + 호실번호) 로 사용한다.
  dong: string;
  floorNo: string;
  purposeName: string;
  hoNm: string;
  exposArea: number;
  pubUseArea: number;
}

export async function fetchAreaInfoFromRegister(mgmBldrgstPk: string): Promise<AreaInfoRow[] | null> {
  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");

  // [Task #348] 공공데이터 API는 페이지당 최대 100건까지 반환하므로, 100건이 넘는
  // 호실(예: 대형 오피스텔/주상복합)이 누락되지 않도록 totalCount 기반으로 끝까지 순회한다.
  // 안전 장치: 최대 50페이지(=5,000건)까지만 시도. 그 이상은 거의 단일 건물에서 발생하지 않음.
  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  const all: Record<string, unknown>[] = [];
  let totalCount = Number.POSITIVE_INFINITY;
  let firstFetchOk = false;

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const queryParams = new URLSearchParams({
      mgmBldrgstPk,
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;

    type BldExposResp = {
      response?: {
        body?: {
          items?: { item?: unknown };
          totalCount?: number;
        };
      };
    };
    const result = (await fetch(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${qs}`,
    ).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as BldExposResp | null;

    const body = result?.response?.body;
    const items = body?.items?.item;

    if (pageNo === 1) {
      firstFetchOk = result != null;
      if (typeof body?.totalCount === "number") totalCount = body.totalCount;
      else if (typeof body?.totalCount === "string") totalCount = Number(body.totalCount) || 0;
    }

    if (!items) break;
    const list = Array.isArray(items) ? items : [items];
    all.push(...list);

    if (all.length >= totalCount) break;
    if (list.length < PAGE_SIZE) break;
  }

  if (!firstFetchOk) return null;
  if (all.length === 0) return null;

  return all.map((item) => ({
    // [Task #516] 동 이름. 전유부 응답은 dongNm 키로 동을 노출한다(없으면 빈 문자열).
    dong: String(item.dongNm ?? "").trim(),
    floorNo: String(item.flrNoNm ?? item.flrNo ?? ""),
    purposeName: String(item.mainPurpsCdNm ?? item.etcPurps ?? ""),
    // 호실번호는 hoNm 필드에 들어 있다. 비어 있으면 층/면적만 가져오는 일반 항목.
    hoNm: String(item.hoNm ?? ""),
    exposArea: item.area ? parseFloat(String(item.area)) : 0,
    pubUseArea: item.cmmnPuprpsArea ? parseFloat(String(item.cmmnPuprpsArea)) : 0,
  }));
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

router.get("/buildings/lookup-area-info", async (req: Request, res: Response) => {
  const { mgmBldrgstPk, buildingId } = req.query;

  // [Task #516] buildingId 가 들어오면 저장된 register_dong_pks 를 모두 순회해 한 번에 합쳐 돌려준다.
  if (buildingId) {
    const id = parseInt(String(buildingId));
    if (!Number.isFinite(id)) { res.status(400).json({ error: "buildingId 가 유효하지 않습니다" }); return; }
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id));
    if (!b) { res.status(404).json({ error: "건물을 찾을 수 없습니다" }); return; }
    const pks: string[] = (b.registerDongPks ?? []).map((d) => d.mgmBldrgstPk).filter(Boolean);
    if (pks.length === 0 && b.buildingRegisterPk) pks.push(b.buildingRegisterPk);
    if (pks.length === 0) { res.json({ found: false, areas: [] }); return; }
    try {
      const areas = await fetchAreaInfoForAllDongs(pks);
      res.json({ found: areas.length > 0, areas });
    } catch (e) {
      if (e instanceof Error && e.message === "API_KEY_MISSING") {
        res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
        return;
      }
      req.log.error({ err: e, buildingId: id }, "Error looking up area info (multi-dong)");
      res.status(500).json({ error: "전용/공용면적 조회 실패" });
    }
    return;
  }

  if (!mgmBldrgstPk) {
    res.status(400).json({ error: "mgmBldrgstPk가 필요합니다" });
    return;
  }

  try {
    const areas = await fetchAreaInfoFromRegister(String(mgmBldrgstPk));
    if (!areas) {
      res.json({ found: false, areas: [] });
      return;
    }
    res.json({ found: true, areas });
  } catch (error) {
    if (error instanceof Error && error.message === "API_KEY_MISSING") {
      res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
      return;
    }
    req.log.error({ err: error }, "Error looking up area info");
    res.status(500).json({ error: "전용/공용면적 조회 실패" });
  }
});

export default router;
