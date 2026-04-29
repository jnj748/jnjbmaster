// [Task #496] buildings 라우터 분리 — 위저드 완료 시 주소 잠금 / 면적 기준 확정 핸들러.
//   원본 routes/buildings.ts 의 POST /buildings/:id/lock-address 와
//   PUT /buildings/:id/area-basis 를 그대로 옮긴다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, accountingInitialFilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  BUILDING_DUPLICATE_MESSAGE,
  isDuplicateCheckRole,
  findExistingActiveUserForAddress,
} from "./duplicates";
import { canAccessBuilding } from "../../middlewares/buildingScope";

const router: IRouter = Router();

// [Task #132] 관리소장 위저드 완료 시 호출. 주소 잠금 + areaBasis 옵션.
router.post("/buildings/:id/lock-address", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // [Task #596] hq_executive 는 매핑된 건물에 한해 허용. platform_admin 은 전 건물.
  if (!(await canAccessBuilding(req, id))) {
    res.status(403).json({ error: "이 건물을 잠글 권한이 없습니다" }); return;
  }
  // [Task #227/#341] 주소 잠금 시점에서도 최종 안전장치로 동일 역할의 중복을 검사한다.
  if (isDuplicateCheckRole(user.role)) {
    const existing = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).then(r => r[0]);
    const dup = await findExistingActiveUserForAddress({
      role: user.role,
      addressJibun: existing?.addressJibun ?? null,
      buildingId: id,
      excludeUserId: userId,
    });
    if (dup) {
      res.status(409).json({ error: BUILDING_DUPLICATE_MESSAGE });
      return;
    }
  }
  try {
    const [b] = await db.update(buildingsTable).set({ addressLocked: true }).where(eq(buildingsTable.id, id)).returning();
    res.json({ building: b });
  } catch (e) {
    req.log.error({ err: e }, "Failed to lock building address");
    res.status(500).json({ error: "주소 잠금에 실패했습니다" });
  }
});

router.put("/buildings/:id/area-basis", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const { areaBasis } = req.body;
  if (!["standard", "exclusive", "common"].includes(areaBasis)) {
    res.status(400).json({ error: "유효하지 않은 면적 기준입니다" }); return;
  }
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // [Task #596] hq_executive 는 매핑된 건물에 한해 허용.
  if (!(await canAccessBuilding(req, id))) {
    res.status(403).json({ error: "권한이 없습니다" }); return;
  }
  const [b] = await db.update(buildingsTable).set({ areaBasis }).where(eq(buildingsTable.id, id)).returning();

  // [Task #132] 면적 기준 확정 시 회계 엔진 부트스트랩 파라미터를 함께 산정·기록한다.
  // 연면적과 기준에 따른 초기 단가(원/㎡)를 안내값으로 산출하고
  // accountingInitialFiles 테이블에 area_basis_init 카테고리로 보존한다(관리자가
  // 추후 조정 가능하도록 텍스트 메모로 기록).
  try {
    const totalArea = b.totalArea ? parseFloat(String(b.totalArea)) : 0;
    const baseRatePerSqm = areaBasis === "exclusive" ? 1800 : areaBasis === "common" ? 1200 : 1500;
    const initialMonthlyTotal = Math.round(totalArea * baseRatePerSqm);
    await db.insert(accountingInitialFilesTable).values({
      buildingId: id,
      category: "area_basis_init",
      fileUrl: "",
      originalName: "면적기준 초기 산정",
      periodNote: `basis=${areaBasis}; totalArea=${totalArea}㎡; ratePerSqm=${baseRatePerSqm}원; initialMonthlyTotal=${initialMonthlyTotal}원`,
      uploadedBy: userId,
    });
  } catch (e) {
    req.log?.warn?.({ err: e }, "Failed to seed area_basis_init");
  }

  res.json({ building: b });
});

export default router;
