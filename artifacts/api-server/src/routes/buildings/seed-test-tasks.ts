// [Task #496] buildings 라우터 분리 — (테스트업무) 카드 멱등 시드 헬퍼·트리거.
//   원본 routes/buildings.ts 의 ensureTestInspectionsForBuilding (export) 와
//   POST /buildings/seed-test-inspections 를 그대로 옮긴다. crud.ts 의
//   POST /buildings 핸들러도 첫 등록 시 같은 헬퍼를 호출한다.
//   [Task #567] 시드 카드는 정화조·교육·에어컨 3건이며, 이전 fire 카드(호실데이터
//   불러오기/소방점검) 잔존 행은 호출 시마다 정리한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, inspectionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// [Task #268] 신규 매니저 첫 화면 체험용 (테스트업무) 카드를 멱등하게 시드한다.
//  - POST /buildings 첫 등록 시점 외에도, 위저드를 강제 종료한 뒤 다시 진입하거나
//    대시보드에 처음 도달했을 때에도 동일 진입점을 호출해 누락분만 채워 넣는다.
//  - (buildingId, name) 집합으로 중복 검사하므로 여러 번 호출돼도 항상 동일 개수만 존재한다.
//  - [Task #567] 기존 fire 카드("(테스트업무) 호실데이터 불러오기", 더 이전엔
//    "(테스트업무) 소방점검") 는 호실 데이터 불러오기 기능 자체가 별도로 구현될
//    예정이라 시드 대상에서 제외한다. 잔존 행이 있으면 buildingId 기준으로 삭제하여
//    다음 시드 트리거만으로 자연스럽게 사라지게 한다. 정화조·교육·에어컨 3건만 남는다.
export async function ensureTestInspectionsForBuilding(buildingId: number): Promise<number> {
  const SEED_NAMES = {
    septic: "(테스트업무) 정화조 청소",
    edu: "(테스트업무) 미화·경비원 교육의 달",
    ac: "(테스트업무) 에어컨 가동 전 정비 진행 공지",
  } as const;
  // [Task #567] 제거된 fire 카드의 과거/현재 이름. 잔존 행이 있으면 정리한다.
  const REMOVED_FIRE_NAMES = [
    "(테스트업무) 호실데이터 불러오기",
    "(테스트업무) 소방점검",
  ];
  const seedNameList: string[] = Object.values(SEED_NAMES);

  // [Task #567] 동일 buildingId 안에서 제거된 fire 카드 이름으로 시드된 잔존
  //   inspections 행을 모두 삭제한다. 멱등 — 다음 시드 트리거 호출 시 빈 결과로 noop.
  await db
    .delete(inspectionsTable)
    .where(and(
      eq(inspectionsTable.buildingId, buildingId),
      inArray(inspectionsTable.name, REMOVED_FIRE_NAMES),
    ));

  const existingTest = await db
    .select({ name: inspectionsTable.name })
    .from(inspectionsTable)
    .where(and(
      eq(inspectionsTable.buildingId, buildingId),
      inArray(inspectionsTable.name, seedNameList),
    ));
  const existingNames = new Set(existingTest.map((r) => r.name));
  const today = new Date();
  const plusDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };
  const candidates: Array<typeof inspectionsTable.$inferInsert> = [
    {
      buildingId,
      name: SEED_NAMES.septic,
      category: "septic",
      inspectionType: "legal",
      frequencyPerYear: 1,
      legalCycleMonths: 12,
      nextDueDate: plusDays(20),
      status: "upcoming",
      advanceAlertDays: 30,
    },
    {
      buildingId,
      name: SEED_NAMES.edu,
      category: "self_regular",
      inspectionType: "self_regular",
      frequencyPerYear: 12,
      intervalDays: 30,
      nextDueDate: plusDays(5),
      status: "upcoming",
      advanceAlertDays: 7,
    },
    {
      buildingId,
      name: SEED_NAMES.ac,
      category: "seasonal",
      inspectionType: "seasonal",
      frequencyPerYear: 4,
      intervalDays: 90,
      nextDueDate: plusDays(10),
      status: "upcoming",
      advanceAlertDays: 14,
    },
  ];
  const toInsert = candidates.filter((c) => !existingNames.has(c.name));
  if (toInsert.length > 0) {
    await db.insert(inspectionsTable).values(toInsert);
  }
  return toInsert.length;
}

const router: IRouter = Router();

// [Task #268] 위저드를 X로 강제 종료한 뒤 또는 대시보드 첫 진입 시 호출되는 멱등 시드 트리거.
//   - 본인 건물이 있어야 동작하고, 없는 경우 noop (다음 위저드 진입 후 첫 건물 저장에서 시드).
router.post("/buildings/seed-test-inspections", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const me = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    if (!me || me.role !== "manager" || !me.buildingId) {
      res.json({ seeded: 0, skipped: true });
      return;
    }
    const seeded = await ensureTestInspectionsForBuilding(me.buildingId);
    res.json({ seeded, skipped: false });
  } catch (e) {
    req.log.error({ err: e }, "Failed to seed test inspections (idempotent)");
    res.status(500).json({ error: "테스트업무 시드에 실패했습니다." });
  }
});

export default router;
