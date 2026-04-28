import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, maintenanceLogsTable, usersTable } from "@workspace/db";
import {
  ListMaintenanceLogsQueryParams,
  ListMaintenanceLogsResponse,
  CreateMaintenanceLogBody,
  GetMaintenanceLogParams,
  GetMaintenanceLogResponse,
  UpdateMaintenanceLogParams,
  UpdateMaintenanceLogBody,
  UpdateMaintenanceLogResponse,
  DeleteMaintenanceLogParams,
  SendMaintenanceReportParams,
  SendMaintenanceReportResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { isBuildingScopedRole } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/maintenance-logs", requireRole("manager", "platform_admin", "facility_staff"));
async function getUserBuildingId(userId: number): Promise<number | null> {
  const user = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

// [Task #558] rfqs.ts 의 serializeRfqRow 와 동일한 의도. drizzle 의 timestamp/
//   date 컬럼은 Date 객체로 돌아오는 반면 응답 zod 스키마는 ISO string 을
//   기대하므로, .parse() 직전에 Date → ISO string / 'YYYY-MM-DD' 로 정규화한다.
//   (라우터 보안 게이트와 별개로, 정규화가 빠지면 정상 경로 응답이 ZodError 로
//   500 이 되어 회귀 테스트가 통과할 수 없다.)
type MaintenanceLogDateFields = {
  workDate?: Date | string | null;
  reportSentAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
function toIsoDay(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  return d;
}
function toIsoDateTime(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}
function serializeMaintenanceLogRow<T extends MaintenanceLogDateFields>(row: T): T {
  return {
    ...row,
    workDate: toIsoDay(row.workDate),
    reportSentAt: toIsoDateTime(row.reportSentAt),
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  };
}

router.get("/maintenance-logs", async (req, res): Promise<void> => {
  const params = ListMaintenanceLogsQueryParams.safeParse(req.query);
  const conditions = [];

  // [Task #558] 건물 단위 직원 역할(manager/accountant/facility_staff)은 본인
  //   소속 건물(users.buildingId) 의 보수내역만 조회 가능. buildingId 미지정
  //   계정은 빈 배열 반환(에러 아님). platform_admin / hq_executive 는 전체 가시.
  if (isBuildingScopedRole(req.user?.role)) {
    const userBuildingId = req.user?.userId ? await getUserBuildingId(req.user.userId) : null;
    if (userBuildingId == null) {
      res.json(ListMaintenanceLogsResponse.parse([]));
      return;
    }
    conditions.push(eq(maintenanceLogsTable.buildingId, userBuildingId));
  }

  if (params.success) {
    if (params.data.category) {
      conditions.push(eq(maintenanceLogsTable.category, params.data.category));
    }
    if (params.data.startDate) {
      conditions.push(gte(maintenanceLogsTable.workDate, params.data.startDate));
    }
    if (params.data.endDate) {
      conditions.push(lte(maintenanceLogsTable.workDate, params.data.endDate));
    }
  }

  const logs = await db
    .select()
    .from(maintenanceLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(maintenanceLogsTable.workDate));

  res.json(ListMaintenanceLogsResponse.parse(logs.map(serializeMaintenanceLogRow)));
});

// [Task #558] 단건 핸들러 공통 게이트: 건물 단위 역할은 본인 건물의 보수내역만
//   조회/수정/삭제할 수 있다. 다른 건물 ID 직접 호출 시 존재 자체를 노출하지
//   않기 위해 403 대신 404 로 응답한다(목록과 동일한 스코프 규칙).
async function assertOwnLogOr404(
  req: import("express").Request,
  logId: number,
): Promise<{ ok: true } | { ok: false }> {
  if (!isBuildingScopedRole(req.user?.role)) return { ok: true };
  if (!req.user?.userId) return { ok: false };
  const [log] = await db
    .select({ buildingId: maintenanceLogsTable.buildingId })
    .from(maintenanceLogsTable)
    .where(eq(maintenanceLogsTable.id, logId));
  if (!log) return { ok: false };
  const userBuildingId = await getUserBuildingId(req.user.userId);
  if (userBuildingId == null || log.buildingId == null || log.buildingId !== userBuildingId) {
    return { ok: false };
  }
  return { ok: true };
}

router.post("/maintenance-logs", async (req, res): Promise<void> => {
  const parsed = CreateMaintenanceLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req.user!.userId);
  // OpenAPI 의 date 컬럼은 문자열로 codegen 되어 drizzle 타입과 형식만 다르고 런타임 호환.
  const [log] = await db
    .insert(maintenanceLogsTable)
    .values({ ...parsed.data, buildingId } as never)
    .returning();
  res.status(201).json(GetMaintenanceLogResponse.parse(serializeMaintenanceLogRow(log)));
});

router.get("/maintenance-logs/:id", async (req, res): Promise<void> => {
  const params = GetMaintenanceLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnLogOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  const [log] = await db
    .select()
    .from(maintenanceLogsTable)
    .where(eq(maintenanceLogsTable.id, params.data.id));

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.json(GetMaintenanceLogResponse.parse(serializeMaintenanceLogRow(log)));
});

router.patch("/maintenance-logs/:id", async (req, res): Promise<void> => {
  const params = UpdateMaintenanceLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMaintenanceLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const gate = await assertOwnLogOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  const [log] = await db
    .update(maintenanceLogsTable)
    .set(parsed.data)
    .where(eq(maintenanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.json(UpdateMaintenanceLogResponse.parse(serializeMaintenanceLogRow(log)));
});

router.delete("/maintenance-logs/:id", async (req, res): Promise<void> => {
  const params = DeleteMaintenanceLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnLogOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  const [log] = await db
    .delete(maintenanceLogsTable)
    .where(eq(maintenanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/maintenance-logs/:id/send-report", async (req, res): Promise<void> => {
  const params = SendMaintenanceReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnLogOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  const [log] = await db
    .update(maintenanceLogsTable)
    .set({ reportSent: true, reportSentAt: new Date() })
    .where(eq(maintenanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.json(SendMaintenanceReportResponse.parse(serializeMaintenanceLogRow(log)));
});

export default router;
