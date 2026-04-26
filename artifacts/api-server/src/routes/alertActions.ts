import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, alertActionsTable, inspectionsTable, inspectionLogsTable, tasksTable, taxSchedulesTable, buildingNoticeTemplatesTable, usersTable } from "@workspace/db";
import {
  ListAlertActionsQueryParams,
  ListAlertActionsResponse,
  CreateAlertActionBody,
  ListAlertActionsResponseItem,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
// [Task #304] GET 과 POST 는 권한이 다르므로 router.use 로 일괄 적용하지 않고
//   각 라우트에 개별 가드를 둔다. router.use 미들웨어가 먼저 실행되면 POST 의
//   확장된 권한이 무력화되기 때문이다.
// GET 은 기존과 동일하게 관리자급(manager / platform_admin)만 조회 가능.
// 비관리자 역할이 추가될 경우 row-level scoping(userId / buildingId)이 필요하므로
// 현재 단계에서는 GET 권한을 확장하지 않는다.
router.get("/alert-actions", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const params = ListAlertActionsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.alertType) {
    conditions.push(eq(alertActionsTable.alertType, params.data.alertType));
  }
  if (params.success && params.data.relatedEntityId) {
    conditions.push(eq(alertActionsTable.relatedEntityId, params.data.relatedEntityId));
  }

  const actions = await db
    .select()
    .from(alertActionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alertActionsTable.createdAt));

  res.json(ListAlertActionsResponse.parse(actions));
});

// [Task #304] POST 만 hq_executive / facility_staff / accountant 에게 추가 허용.
//   본부장은 anchored 하자담보 만료 등 템플릿 알림을 직접 처리완료/연기 가능해야
//   하고(spec), 시설/회계 담당도 자신의 알림을 처리하지 못하면 후속 노출이
//   계속 반복되기 때문이다. GET 은 위에서 막혀 있으므로 cross-tenant 노출이 없다.
router.post("/alert-actions", requireRole(
  "manager",
  "platform_admin",
  "hq_executive",
  "facility_staff",
  "accountant",
), async (req, res): Promise<void> => {
  const parsed = CreateAlertActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  // [Task #304] 권한 스코프 가드.
  //   manager / platform_admin 은 기존과 동일하게 모든 alertType 에 대해 처리 가능.
  //   확장된 역할(hq_executive / facility_staff / accountant)은 anchored 하자담보
  //   만료 등 "템플릿 알림"만 처리하도록 제한한다. 즉 alertType 이
  //   task_template_mandatory / task_template_suggested 이고 relatedEntityType 이
  //   task_template 일 때만 통과시키며, 기존 inspection / task / tax 엔티티의
  //   상태/일정을 임의로 변경할 수 없다(IDOR 방지).
  const role = req.user?.role;
  const isPrivileged = role === "manager" || role === "platform_admin";
  if (!isPrivileged) {
    const isTemplateAlert =
      (data.alertType === "task_template_mandatory" || data.alertType === "task_template_suggested") &&
      data.relatedEntityType === "task_template";
    // [Task #389] notice_posting 은 매니저뿐 아니라 같은 건물의 회계/시설/본부장도
    //   대시보드에서 보게 되므로 처리완료 권한도 동일 building 역할군에 허용한다.
    //   relatedEntityType=building_notice_template 으로 한정해 IDOR 방지.
    const isNoticePostingAlert =
      data.alertType === "notice_posting" && data.relatedEntityType === "building_notice_template";
    if (!isTemplateAlert && !isNoticePostingAlert) {
      res.status(403).json({ error: "해당 알림을 처리할 권한이 없습니다." });
      return;
    }
  }

  let computedNextCycleDate: string | null = null;
  let actedOnDueDate: string | null = null;

  if (data.actionType === "completed" && data.relatedEntityType === "inspection") {
    const [inspection] = await db
      .select()
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, data.relatedEntityId));

    if (inspection) {
      actedOnDueDate = inspection.nextDueDate;
    }

    if (data.completedDate) {
      await db.insert(inspectionLogsTable).values({
        inspectionId: data.relatedEntityId,
        inspectionDate: data.completedDate,
        result: "pass",
        memo: data.notes || "대시보드 알림에서 처리완료",
      });
    }

    computedNextCycleDate = data.nextCycleDate || null;
    if (!computedNextCycleDate && inspection && data.completedDate) {
      const completedDt = new Date(data.completedDate);
      if (inspection.legalCycleMonths) {
        completedDt.setMonth(completedDt.getMonth() + inspection.legalCycleMonths);
      } else if (inspection.intervalDays) {
        completedDt.setDate(completedDt.getDate() + inspection.intervalDays);
      } else {
        completedDt.setMonth(completedDt.getMonth() + 6);
      }
      computedNextCycleDate = completedDt.toISOString().split("T")[0];
    }

    if (computedNextCycleDate) {
      await db
        .update(inspectionsTable)
        .set({
          lastInspectionDate: data.completedDate,
          nextDueDate: computedNextCycleDate!,
          status: "upcoming",
        })
        .where(eq(inspectionsTable.id, data.relatedEntityId));
    }
  }

  if (data.actionType === "completed" && data.relatedEntityType === "task") {
    await db
      .update(tasksTable)
      .set({ status: "completed" })
      .where(eq(tasksTable.id, data.relatedEntityId));
  }

  if (data.actionType === "completed" && data.relatedEntityType === "tax") {
    await db
      .update(taxSchedulesTable)
      .set({ status: "completed" })
      .where(eq(taxSchedulesTable.id, data.relatedEntityId));
  }

  // [Task #389] 공고문 게시 자동알림 처리완료 — 동일 occurrence 가 다시 노출되지
  //   않도록 actedOnDueDate 를 occurrence(템플릿 스케줄로 계산한 다음 게시일) 로
  //   강제한다. dashboard.ts/scheduler 의 멱등 키가 actedOnDueDate >= occurrence
  //   비교로 동작하므로 클라이언트가 보낸 completedDate(=오늘)에만 의존하면 D-N
  //   처리시 같은 회차가 반복 노출된다.
  if (data.relatedEntityType === "building_notice_template") {
    const [tpl] = await db
      .select()
      .from(buildingNoticeTemplatesTable)
      .where(eq(buildingNoticeTemplatesTable.id, data.relatedEntityId));
    let buildingId: number | null = null;
    if (req.user?.userId) {
      const [u] = await db
        .select({ buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.userId));
      buildingId = u?.buildingId ?? null;
    }
    if (tpl && tpl.scheduleType && tpl.scheduleType !== "none") {
      const cfg = (tpl.scheduleConfig as Record<string, unknown> | null) ?? null;
      const todayStr = new Date().toISOString().split("T")[0];
      const today = new Date(todayStr);
      const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
      const ymd = (d: Date): string =>
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      let occ: string | null = null;
      if (tpl.scheduleType === "yearly") {
        const m = Number(cfg?.month);
        const d = Number(cfg?.day);
        if (Number.isFinite(m) && Number.isFinite(d)) {
          let candidate = new Date(today.getFullYear(), m - 1, d);
          if (ymd(candidate) < todayStr) {
            candidate = new Date(today.getFullYear() + 1, m - 1, d);
          }
          occ = ymd(candidate);
        }
      } else if (tpl.scheduleType === "monthly") {
        const d = Number(cfg?.day);
        if (Number.isFinite(d)) {
          let candidate = new Date(today.getFullYear(), today.getMonth(), d);
          if (ymd(candidate) < todayStr) {
            candidate = new Date(today.getFullYear(), today.getMonth() + 1, d);
          }
          occ = ymd(candidate);
        }
      } else if (tpl.scheduleType === "before_inspection" && buildingId !== null) {
        const inspectionName = typeof cfg?.inspectionName === "string" ? cfg.inspectionName : null;
        if (inspectionName) {
          const matched = await db
            .select()
            .from(inspectionsTable)
            .where(
              and(
                eq(inspectionsTable.buildingId, buildingId),
                eq(inspectionsTable.name, inspectionName),
              ),
            );
          const upcoming = matched
            .filter((i) => i.nextDueDate >= todayStr)
            .sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1));
          if (upcoming.length > 0) occ = upcoming[0].nextDueDate;
        }
      }
      if (occ) {
        actedOnDueDate = occ;
      }
    }
  }

  if (data.actionType === "postponed" && data.postponeDays) {
    if (data.relatedEntityType === "inspection") {
      const [inspection] = await db
        .select()
        .from(inspectionsTable)
        .where(eq(inspectionsTable.id, data.relatedEntityId));

      if (inspection) {
        actedOnDueDate = inspection.nextDueDate;
        const currentDue = new Date(inspection.nextDueDate);
        currentDue.setDate(currentDue.getDate() + data.postponeDays);
        await db
          .update(inspectionsTable)
          .set({ nextDueDate: currentDue.toISOString().split("T")[0] })
          .where(eq(inspectionsTable.id, data.relatedEntityId));
      }
    }

    if (data.relatedEntityType === "task") {
      const [task] = await db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, data.relatedEntityId));

      if (task && task.dueDate) {
        actedOnDueDate = task.dueDate;
        const currentDue = new Date(task.dueDate);
        currentDue.setDate(currentDue.getDate() + data.postponeDays);
        await db
          .update(tasksTable)
          .set({ dueDate: currentDue.toISOString().split("T")[0] })
          .where(eq(tasksTable.id, data.relatedEntityId));
      }
    }

    if (data.relatedEntityType === "tax") {
      const [tax] = await db
        .select()
        .from(taxSchedulesTable)
        .where(eq(taxSchedulesTable.id, data.relatedEntityId));

      if (tax) {
        actedOnDueDate = tax.dueDate;
        const currentDue = new Date(tax.dueDate);
        currentDue.setDate(currentDue.getDate() + data.postponeDays);
        await db
          .update(taxSchedulesTable)
          .set({ dueDate: currentDue.toISOString().split("T")[0] })
          .where(eq(taxSchedulesTable.id, data.relatedEntityId));
      }
    }
  }

  const [action] = await db
    .insert(alertActionsTable)
    .values({
      // [Task #304] auth payload 키는 `userId` 임 (`id` 아님). 잘못된 키로
      //   null 이 저장되면 resolveActiveTemplateAlerts 의 사용자별 액션 매칭이
      //   실패해 처리완료/연기 후에도 알림이 다시 노출된다.
      userId: req.user?.userId ?? null,
      alertType: data.alertType,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      actionType: data.actionType,
      completedDate: data.completedDate || null,
      nextCycleDate: computedNextCycleDate || data.nextCycleDate || null,
      actedOnDueDate,
      postponeDays: data.postponeDays || null,
      postponeReason: data.postponeReason || null,
      rfqId: data.rfqId || null,
      notes: data.notes || null,
      closeUpPhotoUrl: data.closeUpPhotoUrl || null,
      widePhotoUrl: data.widePhotoUrl || null,
      delayReason: data.delayReason || null,
      delayReasonDetail: data.delayReasonDetail || null,
    })
    .returning();

  // [Task #389] drizzle 의 .returning() 은 createdAt 을 Date 로 돌려주는데 응답
  //   스키마(zod.string().datetime)는 ISO 문자열을 요구한다. 직렬화하지 않으면
  //   처리완료/연기 시 클라이언트에 500 이 돌아와 매니저 처리완료 흐름이 끊긴다.
  res.status(201).json(
    ListAlertActionsResponseItem.parse({
      ...action,
      createdAt:
        action.createdAt instanceof Date ? action.createdAt.toISOString() : action.createdAt,
    }),
  );
});

export default router;
