// [Task #496] buildings 라우터 분리 — 건축물대장(공공데이터 API) 조회 핸들러.
//   원본 routes/buildings.ts 의 GET /buildings/lookup-register 와
//   /buildings/lookup-area-info, AreaInfoRow 타입, fetchAreaInfoFromRegister 헬퍼를
//   그대로 옮긴다. units-import.ts 가 AreaInfoRow / fetchAreaInfoFromRegister 를 import 한다.
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/buildings/lookup-register", async (req: Request, res: Response) => {
  const { sigunguCd, bjdongCd, bun, ji } = req.query;

  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
    return;
  }

  try {
    const queryParams = new URLSearchParams({
      sigunguCd: String(sigunguCd || ""),
      bjdongCd: String(bjdongCd || ""),
      bun: String(bun || "").padStart(4, "0"),
      ji: String(ji || "0").padStart(4, "0"),
      numOfRows: "1",
      pageNo: "1",
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;

    const [titleResult, recapResult] = await Promise.allSettled([
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${qs}`).then(r => r.ok ? r.json() : null),
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?${qs}`).then(r => r.ok ? r.json() : null),
    ]);

    // 외부 공공API 응답이라 unknown — 사용 필드만 좁게 단언한다.
    type BldRgstResp = {
      response?: {
        header?: { resultCode?: string };
        body?: { items?: { item?: unknown } };
      };
    };
    const titleData = (titleResult.status === "fulfilled" ? titleResult.value : null) as BldRgstResp | null;
    const recapData = (recapResult.status === "fulfilled" ? recapResult.value : null) as BldRgstResp | null;

    const titleItems = titleData?.response?.body?.items?.item;
    const recapItems = recapData?.response?.body?.items?.item;

    const extractFirst = (items: unknown) => {
      if (!items) return null;
      if (Array.isArray(items)) return items.length > 0 ? items[0] : null;
      return items;
    };
    const titleItem = extractFirst(titleItems);
    const recapItem = extractFirst(recapItems);

    if (!titleItem && !recapItem) {
      req.log.info({ sigunguCd: String(sigunguCd), bjdongCd: String(bjdongCd), bun: String(bun), ji: String(ji), titleResultCode: titleData?.response?.header?.resultCode, recapResultCode: recapData?.response?.header?.resultCode }, "Building register lookup returned no results");
      res.json({ found: false, data: null });
      return;
    }

    const t = titleItem || {};
    const r = recapItem || {};

    const buildingInfo = {
      found: true,
      // [Task #328] 표제부/총괄표제부 응답 원본을 그대로 전달해 클라이언트가
      // 신규 항목(지붕/높이/에너지등급/내진설계/부속건축물/허가일·착공일/주차 상세 등)을
      // 잃지 않고 저장·표시할 수 있게 한다. 기존 평탄화 필드(data.*)는 하위 호환 유지.
      raw: {
        title: titleItem || null,
        recap: recapItem || null,
      },
      data: {
        buildingName: t.bldNm || r.bldNm || "",
        mainPurpose: t.mainPurpsCdNm || t.etcPurps || r.mainPurpsCdNm || "",
        totalArea: t.totArea ? String(t.totArea) : (r.totArea ? String(r.totArea) : ""),
        buildingArea: t.archArea ? String(t.archArea) : (r.archArea ? String(r.archArea) : ""),
        totalFloors: t.grndFlrCnt ? parseInt(t.grndFlrCnt) : (r.grndFlrCnt ? parseInt(r.grndFlrCnt) : 0),
        basementFloors: t.ugrndFlrCnt ? parseInt(t.ugrndFlrCnt) : (r.ugrndFlrCnt ? parseInt(r.ugrndFlrCnt) : 0),
        structureType: t.strctCdNm || r.strctCdNm || "",
        totalUnits: t.hhldCnt ? parseInt(t.hhldCnt) : (t.hoCnt ? parseInt(t.hoCnt) : (r.hhldCnt ? parseInt(r.hhldCnt) : 0)),
        completionDate: t.useAprDay || r.useAprDay || "",
        elevatorCount: (t.rideUseElvtCnt ? parseInt(t.rideUseElvtCnt) : 0)
          + (t.emgenUseElvtCnt ? parseInt(t.emgenUseElvtCnt) : 0),
        platPlc: t.platPlc || r.platPlc || "",
        newPlatPlc: t.newPlatPlc || r.newPlatPlc || "",
        sigunguCd: t.sigunguCd || r.sigunguCd || "",
        bjdongCd: t.bjdongCd || r.bjdongCd || "",
        bun: t.bun || r.bun || "",
        ji: t.ji || r.ji || "",
        mgmBldrgstPk: t.mgmBldrgstPk || r.mgmBldrgstPk || "",
        landArea: r.platArea ? String(r.platArea) : "",
        buildingCoverageRatio: r.bcRat ? String(r.bcRat) : "",
        floorAreaRatio: r.vlRat ? String(r.vlRat) : "",
        parkingCount: r.totPkngCnt ? parseInt(r.totPkngCnt) : 0,
      },
    };

    res.json(buildingInfo);
  } catch (error) {
    req.log.error({ err: error }, "Error looking up building register");
    res.status(500).json({ error: "건축물대장 조회 실패" });
  }
});

// [Task #348] 건축물대장 전유부/공용부 면적 정보 조회. 호실 미리보기/일괄 가져오기에서
// 동일하게 호출하므로 라우트 핸들러와 별도로 분리해 둔다.
export interface AreaInfoRow {
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
    ).then((r) => (r.ok ? r.json() : null))) as BldExposResp | null;

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
    floorNo: String(item.flrNoNm ?? item.flrNo ?? ""),
    purposeName: String(item.mainPurpsCdNm ?? item.etcPurps ?? ""),
    // 호실번호는 hoNm 필드에 들어 있다. 비어 있으면 층/면적만 가져오는 일반 항목.
    hoNm: String(item.hoNm ?? ""),
    exposArea: item.area ? parseFloat(String(item.area)) : 0,
    pubUseArea: item.cmmnPuprpsArea ? parseFloat(String(item.cmmnPuprpsArea)) : 0,
  }));
}

router.get("/buildings/lookup-area-info", async (req: Request, res: Response) => {
  const { mgmBldrgstPk } = req.query;
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
