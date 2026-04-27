// [Task #496] buildings 라우터 분리 — (테스트업무) 4건 멱등 시드 헬퍼·트리거.
//   원본 routes/buildings.ts 의 ensureTestInspectionsForBuilding (export) 와
//   POST /buildings/seed-test-inspections 를 그대로 옮긴다. crud.ts 의
//   POST /buildings 핸들러도 첫 등록 시 같은 헬퍼를 호출한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, inspectionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// [Task #268] 신규 매니저 첫 화면 체험용 (테스트업무) 4건을 멱등하게 시드한다.
//  - POST /buildings 첫 등록 시점 외에도, 위저드를 강제 종료한 뒤 다시 진입하거나
//    대시보드에 처음 도달했을 때에도 동일 진입점을 호출해 누락분만 채워 넣는다.
//  - (buildingId, name) 4종 집합으로 중복 검사하므로 여러 번 호출돼도 항상 4건만 존재한다.
//  - [Task #491] fire 카드는 "(테스트업무) 소방점검" → "(테스트업무) 호실데이터 불러오기"
//    로 리네이밍됐다. 동일 건물 내 이전 이름 행이 남아 있으면 신규 이름으로 자연
//    마이그레이션하여 중복 노출과 누락이 동시에 발생하지 않도록 한다.
export async function ensureTestInspectionsForBuilding(buildingId: number): Promise<number> {
  const SEED_NAMES = {
    fire: "(테스트업무) 호실데이터 불러오기",
    septic: "(테스트업무) 정화조 청소",
    edu: "(테스트업무) 미화·경비원 교육의 달",
    ac: "(테스트업무) 에어컨 가동 전 정비 진행 공지",
  } as const;
  const LEGACY_FIRE_NAME = "(테스트업무) 소방점검";
  const seedNameList: string[] = Object.values(SEED_NAMES);

  // [Task #491] 이전 이름("(테스트업무) 소방점검")으로 시드된 잔존 행을 신규
  //   이름으로 흡수한다. 동일 건물에 신규 이름 행이 이미 있으면 이전 이름 행을
  //   모두 삭제하고, 없으면 한 건만 신규 이름으로 갱신(나머지는 삭제) 한다.
  const legacyFireRows = await db
    .select({ id: inspectionsTable.id })
    .from(inspectionsTable)
    .where(and(
      eq(inspectionsTable.buildingId, buildingId),
      eq(inspectionsTable.name, LEGACY_FIRE_NAME),
    ));
  if (legacyFireRows.length > 0) {
    const newFireRows = await db
      .select({ id: inspectionsTable.id })
      .from(inspectionsTable)
      .where(and(
        eq(inspectionsTable.buildingId, buildingId),
        eq(inspectionsTable.name, SEED_NAMES.fire),
      ));
    if (newFireRows.length > 0) {
      // 신규 이름 행이 이미 있으면 이전 이름 행 전체 제거.
      await db
        .delete(inspectionsTable)
        .where(and(
          eq(inspectionsTable.buildingId, buildingId),
          eq(inspectionsTable.name, LEGACY_FIRE_NAME),
        ));
    } else {
      // 한 건만 살려서 새 이름으로 갱신, 나머지는 정리.
      const [keep, ...extras] = legacyFireRows;
      await db
        .update(inspectionsTable)
        .set({ name: SEED_NAMES.fire })
        .where(eq(inspectionsTable.id, keep.id));
      if (extras.length > 0) {
        await db
          .delete(inspectionsTable)
          .where(inArray(inspectionsTable.id, extras.map((r) => r.id)));
      }
    }
  }

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
      name: SEED_NAMES.fire,
      category: "fire_safety",
      inspectionType: "legal",
      frequencyPerYear: 2,
      legalCycleMonths: 6,
      nextDueDate: plusDays(-3),
      status: "overdue",
      advanceAlertDays: 30,
    },
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
