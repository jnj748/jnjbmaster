// [Task #689] 전유부 조회를 표제부 PK 단독 호출에서 토지 식별자(시군구·법정동·본번·부번)
//   호출로 전환한 회귀 테스트.
//
//   검증 시나리오:
//     A. fetchAreaInfoByLandCode 가 sigunguCd/bjdongCd/bun/ji 를 그대로 query 로 보내고,
//        totalCount 기반 페이징을 끝까지 돌려 전 호실을 모은다.
//     B. extractLandCodeFromBuilding 이 building.registerData.title 의 식별자를 추출한다.
//     C. classifyRegisterBuildingKind 가 regstrGbCdNm "집합"/"일반"/코드 1·2 를 분류한다.
//     D. loadAreaInfoForBuilding 이 토지 식별자가 있으면 land-code 경로를 우선 사용하고,
//        없으면 PK 폴백을 시도한다. 일반건축물에서는 빈 응답이라도 kind="general" 을 돌려준다.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-area-info-tests";

const {
  fetchAreaInfoByLandCode,
  extractLandCodeFromBuilding,
  classifyRegisterBuildingKind,
  loadAreaInfoForBuilding,
} = await import("../routes/buildings/register-lookup");

type FakeFetchHandler = (url: string) => Response | Promise<Response>;

function installFakeFetch(handler: FakeFetchHandler) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("apis.data.go.kr")) return handler(url);
    return original(input);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("[#689] fetchAreaInfoByLandCode — 토지 식별자 기반 전유부 조회", () => {
  let restoreFetch: () => void = () => {};

  beforeEach(() => {
    process.env.BUILDING_REGISTER_API_KEY = "test-key";
  });
  afterEach(() => {
    restoreFetch();
    delete process.env.BUILDING_REGISTER_API_KEY;
  });

  it("쿼리에 sigunguCd/bjdongCd/bun/ji 를 보내고 mgmBldrgstPk 는 보내지 않는다", async () => {
    const seenUrls: string[] = [];
    restoreFetch = installFakeFetch((url) => {
      seenUrls.push(url);
      return new Response(
        JSON.stringify({
          response: {
            body: {
              totalCount: 2,
              items: {
                item: [
                  { dongNm: "본관", flrNoNm: "5", hoNm: "501", area: 60.12, cmmnPuprpsArea: 10.5, mainPurpsCdNm: "공동주택" },
                  { dongNm: "본관", flrNoNm: "5", hoNm: "502", area: 70.34, cmmnPuprpsArea: 11.2, mainPurpsCdNm: "공동주택" },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const rows = await fetchAreaInfoByLandCode({
      sigunguCd: "47190",
      bjdongCd: "11000",
      bun: "0074",
      ji: "0000",
    });

    assert.equal(seenUrls.length, 1);
    assert.match(seenUrls[0], /getBrExposPubuseAreaInfo/);
    assert.match(seenUrls[0], /sigunguCd=47190/);
    assert.match(seenUrls[0], /bjdongCd=11000/);
    assert.match(seenUrls[0], /bun=0074/);
    assert.match(seenUrls[0], /ji=0000/);
    assert.ok(!seenUrls[0].includes("mgmBldrgstPk"), "토지 식별자 호출에는 mgmBldrgstPk 가 포함되면 안 된다");
    assert.equal(rows?.length, 2);
    assert.equal(rows?.[0].hoNm, "501");
    assert.equal(rows?.[0].dong, "본관");
    assert.equal(rows?.[0].exposArea, 60.12);
  });

  it("totalCount 기반으로 끝까지 페이징한다 (예: 250건 → 3페이지)", async () => {
    const TOTAL = 250;
    const PAGE = 100;
    const pages: number[] = [];
    restoreFetch = installFakeFetch((url) => {
      const m = url.match(/pageNo=(\d+)/);
      const pageNo = m ? Number(m[1]) : 1;
      pages.push(pageNo);
      const start = (pageNo - 1) * PAGE;
      const end = Math.min(start + PAGE, TOTAL);
      const items = [];
      for (let i = start; i < end; i++) {
        items.push({
          dongNm: "A",
          flrNoNm: String(Math.floor(i / 10) + 1),
          hoNm: String(100 + i),
          area: 50 + (i % 10),
          cmmnPuprpsArea: 10,
          mainPurpsCdNm: "오피스텔",
        });
      }
      return new Response(
        JSON.stringify({ response: { body: { totalCount: TOTAL, items: { item: items } } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const rows = await fetchAreaInfoByLandCode({
      sigunguCd: "47190",
      bjdongCd: "11000",
      bun: "0074",
      ji: "0000",
    });
    assert.equal(rows?.length, TOTAL);
    assert.deepEqual(pages, [1, 2, 3], "totalCount 250 ⇒ 3 페이지를 모두 호출");
  });

  it("토지 식별자가 비어 있으면 호출 자체를 하지 않고 null 반환", async () => {
    let called = 0;
    restoreFetch = installFakeFetch(() => {
      called++;
      return new Response("{}", { status: 200 });
    });
    const rows = await fetchAreaInfoByLandCode({ sigunguCd: "", bjdongCd: "11000", bun: "0074", ji: "0000" });
    assert.equal(rows, null);
    assert.equal(called, 0);
  });

  it("API 키가 없으면 명시적 에러를 던져 호출 측이 안내 분기를 탈 수 있게 한다", async () => {
    delete process.env.BUILDING_REGISTER_API_KEY;
    await assert.rejects(
      () => fetchAreaInfoByLandCode({ sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0000" }),
      /API_KEY_MISSING/,
    );
  });
});

describe("[#689] extractLandCodeFromBuilding", () => {
  it("registerData.title 의 sigunguCd/bjdongCd/bun/ji 를 추출한다", () => {
    const code = extractLandCodeFromBuilding({
      registerData: {
        title: { sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0000" },
      },
    });
    assert.deepEqual(code, { sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0000" });
  });

  it("title 이 비어 있으면 recap 에서 폴백한다", () => {
    const code = extractLandCodeFromBuilding({
      registerData: {
        title: null,
        recap: { sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0001" },
      },
    });
    assert.deepEqual(code, { sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0001" });
  });

  it("필수 식별자(sigunguCd/bjdongCd/bun) 가 한 개라도 비어 있으면 null", () => {
    assert.equal(
      extractLandCodeFromBuilding({ registerData: { title: { sigunguCd: "", bjdongCd: "11000", bun: "0074" } } }),
      null,
    );
    assert.equal(
      extractLandCodeFromBuilding({ registerData: null }),
      null,
    );
  });

  it("ji 만 비어 있으면 '0' 으로 보정해 부번 0 인 토지를 정상 조회한다", () => {
    const code = extractLandCodeFromBuilding({
      registerData: { title: { sigunguCd: "47190", bjdongCd: "11000", bun: "0074" } },
    });
    assert.equal(code?.ji, "0");
  });
});

describe("[#689] classifyRegisterBuildingKind", () => {
  it("regstrGbCdNm 에 '집합' 이 들어 있으면 collective", () => {
    assert.equal(
      classifyRegisterBuildingKind({ registerData: { title: { regstrGbCdNm: "집합" } } }),
      "collective",
    );
  });
  it("regstrGbCdNm 에 '일반' 이 들어 있으면 general", () => {
    assert.equal(
      classifyRegisterBuildingKind({ registerData: { title: { regstrGbCdNm: "일반" } } }),
      "general",
    );
  });
  it("이름이 없고 코드가 '2' 면 collective, '1' 이면 general", () => {
    assert.equal(
      classifyRegisterBuildingKind({ registerData: { title: { regstrGbCd: "2" } } }),
      "collective",
    );
    assert.equal(
      classifyRegisterBuildingKind({ registerData: { title: { regstrGbCd: "1" } } }),
      "general",
    );
  });
  it("registerData 가 비어 있거나 알 수 없으면 unknown", () => {
    assert.equal(classifyRegisterBuildingKind({ registerData: null }), "unknown");
    assert.equal(
      classifyRegisterBuildingKind({ registerData: { title: { regstrGbCdNm: "기타" } } }),
      "unknown",
    );
  });
});

describe("[#689] loadAreaInfoForBuilding — 토지 식별자 우선, PK 폴백, 일반건축물 분기", () => {
  let restoreFetch: () => void = () => {};
  beforeEach(() => {
    process.env.BUILDING_REGISTER_API_KEY = "test-key";
  });
  afterEach(() => {
    restoreFetch();
    delete process.env.BUILDING_REGISTER_API_KEY;
  });

  it("토지 식별자가 있으면 land-code 경로로 호출하고 PK 호출은 시도하지 않는다", async () => {
    const seen: string[] = [];
    restoreFetch = installFakeFetch((url) => {
      seen.push(url);
      return new Response(
        JSON.stringify({
          response: {
            body: {
              totalCount: 1,
              items: {
                item: { dongNm: "", flrNoNm: "1", hoNm: "101", area: 50, cmmnPuprpsArea: 5, mainPurpsCdNm: "오피스텔" },
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const out = await loadAreaInfoForBuilding({
      registerData: {
        title: { sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0000", regstrGbCdNm: "집합" },
      },
      buildingRegisterPk: "1234567890123",
      registerDongPks: [{ mgmBldrgstPk: "1234567890123", dongName: "본관", isMain: true }],
    });

    assert.equal(out.source, "land-code");
    assert.equal(out.kind, "collective");
    assert.equal(out.areas.length, 1);
    assert.equal(seen.length, 1, "토지 식별자 1회 호출만 발생해야 한다 (PK 순회 없음)");
    assert.match(seen[0], /sigunguCd=47190/);
    assert.ok(!seen[0].includes("mgmBldrgstPk="), "land-code 경로에서는 mgmBldrgstPk query 가 빠져야 한다");
  });

  it("regstrGbCdNm = '일반' + 응답이 비어 있어도 kind=general 로 분류한다 (API 오류 아님)", async () => {
    restoreFetch = installFakeFetch(() => {
      // 일반건축물은 보통 totalCount=0 / body:{} 가 내려온다.
      return new Response(JSON.stringify({ response: { body: { totalCount: 0 } } }), { status: 200 });
    });
    const out = await loadAreaInfoForBuilding({
      registerData: {
        title: { sigunguCd: "47190", bjdongCd: "11000", bun: "0074", ji: "0000", regstrGbCdNm: "일반" },
      },
      buildingRegisterPk: "1234567890999",
      registerDongPks: [],
    });
    assert.equal(out.areas.length, 0);
    assert.equal(out.source, "land-code");
    assert.equal(out.kind, "general");
  });

  it("토지 식별자가 없으면 PK 폴백 경로를 사용한다", async () => {
    const seen: string[] = [];
    restoreFetch = installFakeFetch((url) => {
      seen.push(url);
      return new Response(
        JSON.stringify({
          response: {
            body: {
              totalCount: 1,
              items: { item: { dongNm: "A", flrNoNm: "1", hoNm: "101", area: 50, cmmnPuprpsArea: 5 } },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await loadAreaInfoForBuilding({
      registerData: null,
      buildingRegisterPk: "1234567890123",
      registerDongPks: [],
    });
    assert.equal(out.source, "pk-fallback");
    assert.equal(out.kind, "unknown");
    assert.equal(out.areas.length, 1);
    assert.match(seen[0], /mgmBldrgstPk=1234567890123/);
  });

  it("토지 식별자도 PK 도 없으면 즉시 빈 결과(source='none') 를 돌려준다", async () => {
    let called = 0;
    restoreFetch = installFakeFetch(() => {
      called++;
      return new Response("{}", { status: 200 });
    });
    const out = await loadAreaInfoForBuilding({
      registerData: null,
      buildingRegisterPk: null,
      registerDongPks: null,
    });
    assert.equal(out.areas.length, 0);
    assert.equal(out.source, "none");
    assert.equal(called, 0, "외부 호출이 일어나선 안 된다");
  });
});
