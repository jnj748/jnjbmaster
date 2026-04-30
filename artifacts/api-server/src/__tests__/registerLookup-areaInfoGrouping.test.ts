// [Task #693] 호실 단위 그룹핑·합산 회귀 테스트.
//
//   배경: 공공데이터 `getBrExposPubuseAreaInfo` 응답은 호실 1개당 여러 행으로 내려온다.
//     - exposPubuseGbCd = "1" (전유): 호실당 1 행, area = 전용면적
//     - exposPubuseGbCd = "2" (공용): 호실당 N 행 (계단실/승강기, 주차장, 방재실 등),
//       각 행의 area = 그 부분 공용면적. flrNoNm 이 비어 있거나 "각층" 으로 내려오기도 한다.
//
//   검증:
//     A. 전유 1 + 공용 4 → 한 호실 한 행, 전용·공용 각각 합산.
//     B. 전유만 있는 호실 → 공용면적 0.
//     C. 공용 행의 flrNoNm 이 "각층" / 빈 문자열이어도 호실 층은 전유 행을 따른다.
//     D. 같은 호실 행이 페이지 안에서 5번 등장해도 결과는 1 행 (중복 제거).
//     E. hoNm 이 비어 있는 행(층 합계·건물 전체 공용)은 결과에 포함되지 않는다.
//     F. 다른 동(棟) 의 같은 호실 번호("101")는 별도 호실로 보존된다.
//     G. 송정태왕아너스타워 호실 2203 실측 케이스: 35.7256 + (12.9289 + 17.2851 + 0.7821 + 1.2507).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { groupAreaInfoItems } = await import("../routes/buildings/register-lookup");

describe("[#693] groupAreaInfoItems — 호실 단위 그룹핑·합산", () => {
  it("전유 1 + 공용 4 → 1 행, 전용·공용 각각 합산", () => {
    const rows = groupAreaInfoItems([
      { dongNm: "본관", flrNoNm: "22", hoNm: "2203", exposPubuseGbCd: "1", area: "35.7256", mainPurpsCdNm: "공동주택(아파트)" },
      { dongNm: "본관", flrNoNm: "각층", hoNm: "2203", exposPubuseGbCd: "2", area: "12.9289", etcPurps: "계단실/승강기/홀" },
      { dongNm: "본관", flrNoNm: "지하1", hoNm: "2203", exposPubuseGbCd: "2", area: "17.2851", etcPurps: "주차장" },
      { dongNm: "본관", flrNoNm: "1", hoNm: "2203", exposPubuseGbCd: "2", area: "0.7821", etcPurps: "방재실/관리실" },
      { dongNm: "본관", flrNoNm: "지하1", hoNm: "2203", exposPubuseGbCd: "2", area: "1.2507", etcPurps: "전기실/펌프실" },
    ]);
    assert.equal(rows.length, 1, "한 호실은 한 행으로 합쳐져야 한다");
    const r = rows[0];
    assert.equal(r.dong, "본관");
    assert.equal(r.hoNm, "2203");
    assert.equal(r.floorNo, "22", "호실 층은 전유 행의 flrNoNm 을 따른다");
    assert.equal(r.purposeName, "공동주택(아파트)", "호실 용도는 전유 행의 mainPurpsCdNm 을 쓴다");
    assert.ok(Math.abs(r.exposArea - 35.7256) < 1e-9, `전용면적: ${r.exposArea}`);
    // 12.9289 + 17.2851 + 0.7821 + 1.2507 = 32.2468
    assert.ok(Math.abs(r.pubUseArea - 32.2468) < 1e-9, `공용면적 합산: ${r.pubUseArea}`);
  });

  it("전유만 있는 호실은 공용면적 0", () => {
    const rows = groupAreaInfoItems([
      { dongNm: "별관", flrNoNm: "5", hoNm: "505", exposPubuseGbCd: "1", area: "84.5", mainPurpsCdNm: "근린생활시설" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].exposArea, 84.5);
    assert.equal(rows[0].pubUseArea, 0);
    assert.equal(rows[0].purposeName, "근린생활시설");
  });

  it("공용 행만 있고 전유 행이 없으면 공용 행의 floorNo 를 폴백 (단, '각층'/공백 제외)", () => {
    const rows = groupAreaInfoItems([
      { dongNm: "X", flrNoNm: "각층", hoNm: "999", exposPubuseGbCd: "2", area: "1.5", etcPurps: "계단실" },
      { dongNm: "X", flrNoNm: "3", hoNm: "999", exposPubuseGbCd: "2", area: "2.5", etcPurps: "주차장" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].floorNo, "3", "'각층' 은 호실 층으로 부적절하므로 다음 유효한 값을 채택");
    assert.equal(rows[0].exposArea, 0);
    assert.equal(rows[0].pubUseArea, 4.0);
  });

  it("같은 호실 행이 응답 페이지 내에 중복으로 등장해도 합산되어 한 행이 된다", () => {
    // 전유 행이 여러 번 등장하는 경우 — 비정상이지만 호출자의 1:1 매핑 시 중복으로 나타나던 케이스.
    const rows = groupAreaInfoItems([
      { dongNm: "본관", flrNoNm: "22", hoNm: "2203", exposPubuseGbCd: "1", area: "35.0", mainPurpsCdNm: "공동주택" },
      { dongNm: "본관", flrNoNm: "22", hoNm: "2203", exposPubuseGbCd: "2", area: "5.0", etcPurps: "계단실" },
      { dongNm: "본관", flrNoNm: "22", hoNm: "2203", exposPubuseGbCd: "2", area: "6.0", etcPurps: "엘리베이터" },
      { dongNm: "본관", flrNoNm: "22", hoNm: "2203", exposPubuseGbCd: "2", area: "7.0", etcPurps: "복도" },
      { dongNm: "본관", flrNoNm: "22", hoNm: "2203", exposPubuseGbCd: "2", area: "8.0", etcPurps: "기계실" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].pubUseArea, 26.0);
  });

  it("hoNm 이 비어 있는 행(층 합계·건물 전체 공용)은 결과에 포함되지 않는다", () => {
    const rows = groupAreaInfoItems([
      { dongNm: "A", flrNoNm: "각층", hoNm: "", exposPubuseGbCd: "2", area: "100.0", etcPurps: "건물 전체 공용" },
      { dongNm: "A", flrNoNm: "1", hoNm: "101", exposPubuseGbCd: "1", area: "50.0", mainPurpsCdNm: "오피스텔" },
    ]);
    assert.equal(rows.length, 1, "hoNm='' 행은 호실 단위 자료가 아니므로 제외");
    assert.equal(rows[0].hoNm, "101");
    assert.equal(rows[0].exposArea, 50.0);
    assert.equal(rows[0].pubUseArea, 0);
  });

  it("다른 동(棟) 의 같은 호실 번호는 별도 호실로 보존된다", () => {
    const rows = groupAreaInfoItems([
      { dongNm: "A", flrNoNm: "1", hoNm: "101", exposPubuseGbCd: "1", area: "50", mainPurpsCdNm: "공동주택" },
      { dongNm: "B", flrNoNm: "1", hoNm: "101", exposPubuseGbCd: "1", area: "60", mainPurpsCdNm: "공동주택" },
      { dongNm: "A", flrNoNm: "각층", hoNm: "101", exposPubuseGbCd: "2", area: "5" },
    ]);
    assert.equal(rows.length, 2);
    const a = rows.find((r) => r.dong === "A");
    const b = rows.find((r) => r.dong === "B");
    assert.ok(a && b);
    assert.equal(a!.exposArea, 50);
    assert.equal(a!.pubUseArea, 5);
    assert.equal(b!.exposArea, 60);
    assert.equal(b!.pubUseArea, 0);
  });

  it("exposPubuseGbCd 가 비어 있는 합성/레거시 픽스처는 보수적으로 전유로 처리 (호환)", () => {
    // 신규 그룹핑이 도입되기 전 단위 테스트 픽스처에는 exposPubuseGbCd 가 없는 경우가 있다.
    // 면적이 누락되거나 화면이 비어 보이지 않도록, 코드 미상 행은 전유로 취급해 area 를 더한다.
    const rows = groupAreaInfoItems([
      { dongNm: "X", flrNoNm: "1", hoNm: "101", area: "60.12", mainPurpsCdNm: "오피스텔" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].exposArea, 60.12);
    assert.equal(rows[0].pubUseArea, 0);
    assert.equal(rows[0].purposeName, "오피스텔");
  });

  it("입력이 비어 있으면 빈 배열을 돌려준다", () => {
    assert.deepEqual(groupAreaInfoItems([]), []);
  });

  it("같은 (dong, hoNm) 이 다른 floor 에 존재하는 충돌 — 두 호실로 분리 보존", () => {
    // 비현실적 케이스이지만 매칭 키 정책(dong + 정규화 층 + 호실번호)과 일관되게
    // 두 호실은 서로 다른 unit identity 로 보존되어야 한다. 공용 행은 floor 가
    // 명시적으로 일치할 때만 그 호실에 합산하고, "각층" 처럼 모호한 floor 의
    // 공용은 어느 호실에도 합산하지 않는다(방어적).
    const rows = groupAreaInfoItems([
      { dongNm: "A", flrNoNm: "1", hoNm: "101", exposPubuseGbCd: "1", area: "50", mainPurpsCdNm: "근린생활시설" },
      { dongNm: "A", flrNoNm: "2", hoNm: "101", exposPubuseGbCd: "1", area: "60", mainPurpsCdNm: "공동주택" },
      { dongNm: "A", flrNoNm: "1", hoNm: "101", exposPubuseGbCd: "2", area: "5", etcPurps: "계단실" },
      { dongNm: "A", flrNoNm: "각층", hoNm: "101", exposPubuseGbCd: "2", area: "10", etcPurps: "엘리베이터" },
    ]);
    assert.equal(rows.length, 2, "다른 floor 의 같은 hoNm 은 별도 호실로 보존되어야 한다");
    const u1 = rows.find((r) => r.dong === "A" && r.floorNo === "1" && r.hoNm === "101");
    const u2 = rows.find((r) => r.dong === "A" && r.floorNo === "2" && r.hoNm === "101");
    assert.ok(u1 && u2, "두 호실 모두 존재");
    assert.equal(u1!.exposArea, 50);
    assert.equal(u1!.pubUseArea, 5, "floor=1 명시된 공용은 1층 호실에만 합산");
    assert.equal(u1!.purposeName, "근린생활시설");
    assert.equal(u2!.exposArea, 60);
    assert.equal(u2!.pubUseArea, 0, "'각층' 공용은 모호하므로 어느 쪽에도 합산되지 않음");
    assert.equal(u2!.purposeName, "공동주택");
  });
});
