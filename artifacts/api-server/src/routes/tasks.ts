import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  ListTasksResponse,
  CreateTaskBody,
  GetTaskParams,
  GetTaskResponse,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { categoryToTargetRoles } from "@workspace/shared/role-routing";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use("/tasks", requireRole("manager", "platform_admin"));
router.get("/tasks", async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(tasksTable.status, params.data.status));
    }
    if (params.data.priority) {
      conditions.push(eq(tasksTable.priority, params.data.priority));
    }
    if (params.data.date) {
      conditions.push(eq(tasksTable.dueDate, params.data.date));
    }
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(tasksTable.createdAt);

  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // [Task #220] 후속조치 출처 마커가 description 에 들어 있을 때, 동일 출처로
  // 미완료 상태의 1회성 업무가 이미 있으면 그 업무를 그대로 반환한다(중복 방지).
  const desc = parsed.data.description ?? null;
  const markerMatch = desc?.match(/__followup_source:type=([^&\s]+)&id=([^&\s]+)&date=([0-9-]+)/);
  if (markerMatch) {
    const marker = markerMatch[0];
    const existing = await db
      .select()
      .from(tasksTable)
      .where(sql`${tasksTable.description} LIKE ${"%" + marker + "%"}`);
    const pending = existing.find((t) => t.status !== "completed");
    if (pending) {
      res.status(200).json(GetTaskResponse.parse(pending));
      return;
    }
  }

  // [Task #697] targetRoles 가 비었거나 누락이면 카테고리 기반 기본값으로 채워서 저장.
  //   "관리소장 카드에는 보이는데 시설/경리 카드에서는 사라진" 회귀를 막기 위함.
  const submittedRoles = parsed.data.targetRoles;
  const targetRoles =
    Array.isArray(submittedRoles) && submittedRoles.length > 0
      ? submittedRoles
      : categoryToTargetRoles(parsed.data.category);

  const [task] = await db
    .insert(tasksTable)
    .values({ ...parsed.data, targetRoles })
    .returning();
  res.status(201).json(GetTaskResponse.parse(task));
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, params.data.id));

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(GetTaskResponse.parse(task));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "completed") {
    updateData.completedAt = new Date();
  }
  // [Task #697] targetRoles 정규화.
  //   OpenAPI 스키마는 ["array", "null"] 이라 클라이언트가 명시적으로 null
  //   또는 [] 을 보낼 수 있다. 컬럼은 NOT NULL DEFAULT '{}' 이므로 그대로
  //   넘기면 NOT NULL 위반 500 이 난다. 두 케이스 모두 "기본값으로 되돌리기"
  //   의도로 해석해 카테고리 기반 기본값으로 재계산한다.
  const submittedRoles = parsed.data.targetRoles;
  const wantsReset =
    submittedRoles === null ||
    (Array.isArray(submittedRoles) && submittedRoles.length === 0);
  if (wantsReset) {
    if (parsed.data.category) {
      updateData.targetRoles = categoryToTargetRoles(parsed.data.category);
    } else {
      // category 가 함께 안 왔으면 기존 row 의 카테고리에서 다시 계산.
      const [existing] = await db
        .select({ category: tasksTable.category })
        .from(tasksTable)
        .where(eq(tasksTable.id, params.data.id));
      // 기존 row 도 못 찾으면 빈 배열(=DB 디폴트) 로 안전하게 떨어뜨린다.
      updateData.targetRoles = existing
        ? categoryToTargetRoles(existing.category)
        : [];
    }
  }

  const [task] = await db
    .update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .delete(tasksTable)
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
