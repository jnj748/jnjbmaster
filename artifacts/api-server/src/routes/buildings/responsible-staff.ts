// [Task #651] 시설·경리 위저드의 "담당자 확인" 단계용 조회 엔드포인트.
//   - 입력: addressJibun 또는 buildingId 중 하나 이상.
//   - 출력: 해당 건물의 본부장(hq_executive)·관리소장(manager) 이름·존재 여부.
//   - 위저드는 응답을 받아 "이 건물의 관리소장은 ○○○님 입니다. 맞습니까?" 질문을
//     사용자에게 보여주고 [맞습니다] / [다릅니다] / [없음(1800-0416 안내)] 분기 버튼을 노출한다.
//   - 매칭 우선순위는 facilitySignupRequests.ts:resolveTargetsAndNotify 와 동일하게 두어
//     위저드 안내와 실제 신청 라우팅 결과가 어긋나지 않도록 한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, hqBuildingAssignmentsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

function normalizeJibun(s: string | null | undefined): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

// [송정 케이스 fix #2] Kakao 우편번호 API 의 jibunAddress 는 종종 "...74"
//   처럼 "번지" 접미사 없이 반환되는 반면, DB 에는 "...74번지" 로 저장되어
//   eq 매칭이 빗나간다. 사용자가 본 적 있는 입력 모양을 모두 후보로 만든다.
function jibunVariants(raw: string): string[] {
  const s = normalizeJibun(raw);
  if (!s) return [];
  const stripped = s.replace(/번지$/u, "").trim();
  const variants = new Set<string>([s, stripped, `${stripped}번지`]);
  return Array.from(variants).filter(Boolean);
}

router.get("/buildings/responsible-staff", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const addressJibun = normalizeJibun(typeof req.query.addressJibun === "string" ? req.query.addressJibun : "");
  const addressFull = normalizeJibun(typeof req.query.addressFull === "string" ? req.query.addressFull : "");
  const buildingIdRaw = typeof req.query.buildingId === "string" ? req.query.buildingId : "";
  const buildingIdInput = buildingIdRaw ? parseInt(buildingIdRaw) : null;
  if (!addressJibun && !addressFull && !buildingIdInput) {
    res.status(400).json({ error: "addressJibun, addressFull 또는 buildingId가 필요합니다." });
    return;
  }

  try {
    // 1) 매칭되는 건물 후보를 모은다 (id 우선, 다음으로 동일 지번 주소, 그 후 도로명 주소).
    let candidates: { id: number; name: string | null; addressFull: string | null }[] = [];
    if (buildingIdInput && Number.isFinite(buildingIdInput)) {
      const rows = await db.select({ id: buildingsTable.id, name: buildingsTable.name, addressFull: buildingsTable.addressFull })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, buildingIdInput));
      candidates = rows;
    } else {
      // 1-a) jibun 변형 (번지 유무) 매칭.
      const variants = jibunVariants(addressJibun);
      if (variants.length > 0) {
        candidates = await db.select({ id: buildingsTable.id, name: buildingsTable.name, addressFull: buildingsTable.addressFull })
          .from(buildingsTable)
          .where(inArray(buildingsTable.addressJibun, variants));
      }
      // 1-b) jibun 매칭 실패 시 도로명 주소(addressFull) 로 정확 일치 fallback.
      //   카카오가 jibunAddress 를 비워 보내거나 DB 와 표기가 다른 케이스를 흡수한다.
      if (candidates.length === 0 && addressFull) {
        candidates = await db.select({ id: buildingsTable.id, name: buildingsTable.name, addressFull: buildingsTable.addressFull })
          .from(buildingsTable)
          .where(eq(buildingsTable.addressFull, addressFull));
      }
    }

    if (candidates.length === 0) {
      res.json({
        building: null,
        manager: { exists: false, name: null },
        hqExecutive: { exists: false, name: null },
      });
      return;
    }

    // 첫 후보를 대표로 본다 (위저드 1단계에서 사용자가 방금 선택한 주소 = 보통 1건).
    // [Task #651 round-4] 후보가 여럿이어도 매니저/본부장 조회는 primary 한 건물로
    //   엄격히 제한한다. inArray(buildingIds) 로 묶으면 사용자가 본 안내(=primary)
    //   와 다른 건물의 담당자 이름이 노출될 수 있어 신청 전 단계에서 혼란을 준다.
    // [송정 케이스 fix] 같은 address_jibun 으로 건물이 중복 등록되어 있을 때
    //   (예: 프로덕션의 송정태왕아너스타워가 id=8 고스트 + id=34 정상으로 2건 존재),
    //   단순 첫 후보 채택은 매니저 미배정 고스트가 먼저 잡혀 정상 건물을 가린다.
    //   → 후보가 2건 이상이면 active manager 가 묶인 건물을 우선 채택, 없으면
    //     기존 동작(첫 후보) 유지. 1건이면 추가 쿼리 없이 그대로 사용.
    let primary = candidates[0];
    if (candidates.length > 1) {
      const candidateIds = candidates.map(c => c.id);
      const managed = await db
        .select({ buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(and(
          eq(usersTable.role, "manager"),
          eq(usersTable.approvalStatus, "active"),
          inArray(usersTable.buildingId, candidateIds),
        ));
      const managedSet = new Set(
        managed.map(m => m.buildingId).filter((v): v is number => v != null),
      );
      const preferred = candidates.find(c => managedSet.has(c.id));
      if (preferred) primary = preferred;
    }

    // 2) 매니저: primary 건물에 묶인 active manager 1명.
    const managers = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, "manager"),
        eq(usersTable.approvalStatus, "active"),
        eq(usersTable.buildingId, primary.id),
      ))
      .limit(1);

    // 3) 본부장: hq_building_assignments 매핑을 통해 primary 건물에 할당된 hq_executive.
    const hqAssignments = await db.select({ hqUserId: hqBuildingAssignmentsTable.hqUserId })
      .from(hqBuildingAssignmentsTable)
      .where(eq(hqBuildingAssignmentsTable.buildingId, primary.id))
      .limit(1);
    let hqName: string | null = null;
    if (hqAssignments.length > 0 && hqAssignments[0].hqUserId != null) {
      const [hq] = await db.select({ name: usersTable.name })
        .from(usersTable)
        .where(and(
          eq(usersTable.id, hqAssignments[0].hqUserId),
          eq(usersTable.role, "hq_executive"),
        ))
        .limit(1);
      hqName = hq?.name ?? null;
    }

    res.json({
      building: { id: primary.id, name: primary.name, addressFull: primary.addressFull },
      manager: { exists: managers.length > 0, name: managers[0]?.name ?? null },
      hqExecutive: { exists: !!hqName, name: hqName },
    });
  } catch (e) {
    req.log.error({ err: e }, "Failed to fetch responsible staff");
    res.status(500).json({ error: "담당자 조회에 실패했습니다." });
  }
});

export default router;
