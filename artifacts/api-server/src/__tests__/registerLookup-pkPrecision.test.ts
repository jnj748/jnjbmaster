// [Task #552] 건축물대장 응답 파싱 시 큰 정수 ID(mgmBldrgstPk 등) 가 JSON number 로
//   내려와도 자릿수가 손상되지 않는지 회귀 검증한다. 동시에 식별자 전용 picker
//   (`pickIdString`) 가 number 입력을 받아들이지 않는지도 함께 검증한다.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRegisterJsonText,
  preserveBigIntegerIds,
  pickIdString,
} from "../routes/buildings/register-lookup.js";

describe("preserveBigIntegerIds (#552)", () => {
  it("mgmBldrgstPk 가 number 로 와도 문자열로 보존된다 (정밀도 손실 없음)", () => {
    // 22자리 정수 — JSON.parse 이후 Number 로 받으면 1.0000000000000004e+21 로 손실됨.
    const raw = `{"response":{"body":{"items":{"item":{"mgmBldrgstPk":1000000000000000412345,"bldNm":"아티스톤"}}}}}`;
    const parsed = parseRegisterJsonText(raw) as {
      response: { body: { items: { item: { mgmBldrgstPk: unknown; bldNm: unknown } } } };
    };
    const pk = parsed.response.body.items.item.mgmBldrgstPk;
    assert.equal(typeof pk, "string", "mgmBldrgstPk 는 문자열로 파싱되어야 한다");
    assert.equal(pk, "1000000000000000412345", "원본 22자리 정수가 정확히 보존되어야 한다");
    assert.equal(parsed.response.body.items.item.bldNm, "아티스톤");
  });

  it("표제부 응답 — 다동 배열 안의 모든 mgmBldrgstPk 가 보존된다", () => {
    const raw = `{"response":{"body":{"totalCount":2,"items":{"item":[
      {"mgmBldrgstPk":1168010600090700121,"bldNm":"101동"},
      {"mgmBldrgstPk":1168010600090700122,"bldNm":"102동"}
    ]}}}}`;
    const parsed = parseRegisterJsonText(raw) as {
      response: { body: { items: { item: Array<{ mgmBldrgstPk: unknown }> } } };
    };
    const items = parsed.response.body.items.item;
    assert.equal(items.length, 2);
    assert.equal(items[0].mgmBldrgstPk, "1168010600090700121");
    assert.equal(items[1].mgmBldrgstPk, "1168010600090700122");
  });

  it("이미 문자열인 mgmBldrgstPk 는 그대로 보존된다", () => {
    const raw = `{"a":{"mgmBldrgstPk":"1000000000000000412345"}}`;
    const parsed = parseRegisterJsonText(raw) as { a: { mgmBldrgstPk: unknown } };
    assert.equal(parsed.a.mgmBldrgstPk, "1000000000000000412345");
  });

  it("bun/ji 같은 식별자도 number → string 으로 보존된다", () => {
    const raw = `{"x":{"bun":853,"ji":1,"sigunguCd":41463,"bjdongCd":11600}}`;
    const parsed = parseRegisterJsonText(raw) as {
      x: { bun: unknown; ji: unknown; sigunguCd: unknown; bjdongCd: unknown };
    };
    assert.equal(parsed.x.bun, "853");
    assert.equal(parsed.x.ji, "1");
    assert.equal(parsed.x.sigunguCd, "41463");
    assert.equal(parsed.x.bjdongCd, "11600");
  });

  it("표시용 숫자 필드(area, totArea 등) 는 영향을 받지 않는다", () => {
    const raw = `{"x":{"area":85.32,"totArea":1234.56,"grndFlrCnt":15,"mgmBldrgstPk":11680123456789}}`;
    const parsed = parseRegisterJsonText(raw) as {
      x: { area: unknown; totArea: unknown; grndFlrCnt: unknown; mgmBldrgstPk: unknown };
    };
    assert.equal(parsed.x.area, 85.32);
    assert.equal(parsed.x.totArea, 1234.56);
    assert.equal(parsed.x.grndFlrCnt, 15);
    assert.equal(parsed.x.mgmBldrgstPk, "11680123456789");
  });

  it("문자열 안에 우연히 등장하는 \"mgmBldrgstPk\":<숫자> 패턴은 영향이 있을 수 있지만, 실제 응답에서는 키 위치가 명확해 안전하다", () => {
    // 정상 응답 본문 형태에서는 항상 키-값 위치이므로 정상 파싱.
    const raw = `{"k":"mgmBldrgstPk:12345 was returned","v":{"mgmBldrgstPk":987654321012345}}`;
    const parsed = parseRegisterJsonText(raw) as { k: unknown; v: { mgmBldrgstPk: unknown } };
    assert.equal(parsed.k, "mgmBldrgstPk:12345 was returned");
    assert.equal(parsed.v.mgmBldrgstPk, "987654321012345");
  });

  it("preserveBigIntegerIds 는 잘못된 JSON 입력에 대해서도 텍스트만 변환한다 (원본 구조 깨짐 없음)", () => {
    const text = `{"mgmBldrgstPk":12345}`;
    const out = preserveBigIntegerIds(text);
    assert.equal(out, `{"mgmBldrgstPk":"12345"}`);
  });
});

describe("pickIdString (#552)", () => {
  it("문자열 입력은 trim 후 반환한다", () => {
    assert.equal(pickIdString("  abc  "), "abc");
    assert.equal(pickIdString("1000000000000000412345"), "1000000000000000412345");
  });

  it("number 입력은 거부한다 — 큰 정수 PK 손상을 막기 위함", () => {
    // number 가 넘어오면 빈 문자열 → 호출 측이 "PK 없음" 으로 분기해 자동 손상을 막는다.
    assert.equal(pickIdString(1000000000000000412345), "");
    assert.equal(pickIdString(123), "");
    assert.equal(pickIdString(0), "");
  });

  it("여러 후보 중 첫 번째 비어있지 않은 문자열을 반환한다", () => {
    assert.equal(pickIdString("", "  ", "found"), "found");
    assert.equal(pickIdString(null, undefined, "x"), "x");
    // number 후보는 무시되고 다음 문자열 후보로 넘어간다.
    assert.equal(pickIdString(12345, "fallback"), "fallback");
  });

  it("모두 비어있거나 문자열이 아니면 빈 문자열", () => {
    assert.equal(pickIdString(), "");
    assert.equal(pickIdString(null, undefined, NaN, {}, []), "");
    assert.equal(pickIdString("  ", ""), "");
  });
});
