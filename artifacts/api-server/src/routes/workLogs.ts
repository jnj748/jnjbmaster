import { Router, type IRouter } from "express";
import { eq, and, gte, lte, lt, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  workLogEntriesTable,
  dailyJournalsTable,
  usersTable,
  inspectionsTable,
  inspectionLogsTable,
  draftsTable,
  buildingsTable,
  maintenanceLogsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
// [직책별 일보 분리] /work-logs 와 /daily-journals 는 소장/경리/시설과장 모두 접근 가능.
// 각 직책은 자기 카테고리·자기 일보만 작성한다. 본 라우트 내부 핸들러에서 role 별 스코프를 적용.
router.use(
  ["/work-logs", "/daily-journals", "/work-log-reports"],
  requireRole("manager", "accountant", "facility_staff", "platform_admin"),
);

/** KST(UTC+9) 기준 YYYY-MM-DD. */
function toKstDateKey(d: Date): string {
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}
/** YYYY-MM-DD 문자열 기준으로 일자 가감 (TZ 영향 없음). */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

type RoleKey = "manager" | "accountant" | "facility_staff" | "platform_admin";

async function getCtx(userId: number) {
  const u = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      buildingId: usersTable.buildingId,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0]);
  return u ?? null;
}

/** platform_admin 은 본인 작성 시 manager 와 동일하게 취급한다(기존 호환). */
function effectiveRole(role: string | null | undefined): "manager" | "accountant" | "facility_staff" {
  if (role === "accountant") return "accountant";
  if (role === "facility_staff") return "facility_staff";
  return "manager";
}

/** 직책별 허용 업무기록 카테고리. */
const CATEGORY_BY_ROLE: Record<"manager" | "accountant" | "facility_staff", readonly string[]> = {
  manager: ["facility", "bill", "complaint", "admin"],
  accountant: ["receivable", "expense", "draft", "complaint"],
  facility_staff: ["fire", "electric", "mechanical", "other"],
};
const ALL_CATEGORIES = new Set<string>([
  ...CATEGORY_BY_ROLE.manager,
  ...CATEGORY_BY_ROLE.accountant,
  ...CATEGORY_BY_ROLE.facility_staff,
]);

const StatusEnum = z.enum(["ok", "issue"]);

const CreateWorkLogBody = z.object({
  category: z.string().min(1).max(40),
  memo: z.string().min(1).max(2000),
  photoUrl: z.string().nullish(),
  occurredAt: z.string().datetime().optional(),
});

const UpdateWorkLogBody = z.object({
  category: z.string().min(1).max(40).optional(),
  memo: z.string().min(1).max(2000).optional(),
  photoUrl: z.string().nullish(),
});

router.get("/work-logs", async (req, res): Promise<void> => {
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }

  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : null;
  const category = typeof req.query.category === "string" ? req.query.category : null;

  // [직책별 일보 분리] 권한 스코프:
  //   manager(+platform_admin/hq_executive 매핑)는 같은 건물 모든 work_log 조회 (소장
  //   미리보기 자동 편입을 위해 필요).
  //   accountant/facility_staff 는 본인 author_id 만 조회 — 부하끼리 서로의 기록을
  //   직접 보지 못하도록 제한한다.
  const role = effectiveRole(ctx.role);
  const conds = [eq(workLogEntriesTable.buildingId, ctx.buildingId ?? -1)];
  if (role !== "manager") conds.push(eq(workLogEntriesTable.authorId, ctx.id));
  if (startDate) conds.push(gte(workLogEntriesTable.occurredDate, startDate));
  if (endDate) conds.push(lte(workLogEntriesTable.occurredDate, endDate));
  if (category) conds.push(eq(workLogEntriesTable.category, category));

  const rows = await db
    .select()
    .from(workLogEntriesTable)
    .where(and(...conds))
    .orderBy(desc(workLogEntriesTable.occurredAt))
    .limit(500);

  res.json(rows.map(serializeEntry));
});

router.post("/work-logs", async (req, res): Promise<void> => {
  const parsed = CreateWorkLogBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }
  if (!ctx.buildingId) { res.status(400).json({ error: "no building scope" }); return; }

  const role = effectiveRole(ctx.role);
  const allowed = CATEGORY_BY_ROLE[role];
  if (!allowed.includes(parsed.data.category)) {
    res.status(400).json({ error: `category '${parsed.data.category}' not allowed for role ${role}` });
    return;
  }

  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  const occurredDate = toKstDateKey(occurredAt);

  const [row] = await db.insert(workLogEntriesTable).values({
    buildingId: ctx.buildingId,
    authorId: ctx.id,
    authorName: ctx.name ?? "관리자",
    category: parsed.data.category,
    memo: parsed.data.memo,
    photoUrl: parsed.data.photoUrl ?? null,
    occurredAt,
    occurredDate,
  }).returning();

  // Compatibility adapter: facility/시설계열 카테고리는 maintenance_logs 에도 노출.
  // 직책별: manager=facility, facility_staff=fire/electric/mechanical/other
  const FACILITY_LIKE = new Set(["facility", "fire", "electric", "mechanical", "other"]);
  if (FACILITY_LIKE.has(parsed.data.category)) {
    try {
      await db.insert(maintenanceLogsTable).values({
        buildingId: ctx.buildingId,
        title: parsed.data.memo.slice(0, 60),
        description: parsed.data.memo,
        category: "other",
        workDate: occurredDate,
        worker: ctx.name ?? "관리자",
        status: "completed",
        sourceType: "work_log",
        closeUpPhotoUrl: parsed.data.photoUrl ?? null,
      });
    } catch (e) {
      // best-effort adapter; do not fail primary insert.
      console.warn("[work-logs] maintenance_logs adapter insert failed", e);
    }
  }

  res.status(201).json(serializeEntry(row));
});

router.patch("/work-logs/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const parsed = UpdateWorkLogBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }

  // 카테고리 변경 시 본인 직책의 허용 카테고리인지 확인.
  if (parsed.data.category) {
    const role = effectiveRole(ctx.role);
    if (!CATEGORY_BY_ROLE[role].includes(parsed.data.category)) {
      res.status(400).json({ error: `category '${parsed.data.category}' not allowed for role ${role}` });
      return;
    }
  }

  // [직책별 일보 분리] 수정 권한:
  //   manager 는 같은 건물 모든 work_log 수정 가능 (소장 책임 영역).
  //   부하(accountant/facility_staff)는 본인이 작성한 기록만 수정 가능.
  const editConds = [eq(workLogEntriesTable.id, id), eq(workLogEntriesTable.buildingId, ctx.buildingId ?? -1)];
  if (effectiveRole(ctx.role) !== "manager") editConds.push(eq(workLogEntriesTable.authorId, ctx.id));

  const [row] = await db
    .update(workLogEntriesTable)
    .set({
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.memo !== undefined ? { memo: parsed.data.memo } : {}),
      ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl } : {}),
    })
    .where(and(...editConds))
    .returning();

  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(serializeEntry(row));
});

router.delete("/work-logs/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }

  // [직책별 일보 분리] 삭제 권한도 수정과 동일 정책.
  const delConds = [eq(workLogEntriesTable.id, id), eq(workLogEntriesTable.buildingId, ctx.buildingId ?? -1)];
  if (effectiveRole(ctx.role) !== "manager") delConds.push(eq(workLogEntriesTable.authorId, ctx.id));

  const [row] = await db
    .delete(workLogEntriesTable)
    .where(and(...delConds))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.sendStatus(204);
});

const SaveJournalBody = z.object({
  securityStatus: StatusEnum.optional(),
  securityMemo: z.string().nullish(),
  securityPhotoUrl: z.string().nullish(),
  cleaningStatus: StatusEnum.optional(),
  cleaningMemo: z.string().nullish(),
  cleaningPhotoUrl: z.string().nullish(),
  facilityStatus: StatusEnum.optional(),
  facilityMemo: z.string().nullish(),
  facilityPhotoUrl: z.string().nullish(),
  complaintStatus: StatusEnum.optional(),
  complaintMemo: z.string().nullish(),
  complaintPhotoUrl: z.string().nullish(),
});

router.get("/daily-journals", async (req, res): Promise<void> => {
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }
  if (!ctx.buildingId) { res.json([]); return; }
  const role = effectiveRole(ctx.role);
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const rows = await db.select().from(dailyJournalsTable)
    .where(and(eq(dailyJournalsTable.buildingId, ctx.buildingId), eq(dailyJournalsTable.role, role)))
    .orderBy(desc(dailyJournalsTable.journalDate))
    .limit(limit);
  res.json(rows.map(serializeJournal));
});

router.get("/daily-journals/:date", async (req, res): Promise<void> => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  const role = effectiveRole(ctx.role);

  const j = await db.select().from(dailyJournalsTable)
    .where(and(
      eq(dailyJournalsTable.buildingId, ctx.buildingId),
      eq(dailyJournalsTable.journalDate, date),
      eq(dailyJournalsTable.role, role),
    ))
    .then((r) => r[0]);

  res.json(j ? serializeJournal(j) : null);
});

router.put("/daily-journals/:date", async (req, res): Promise<void> => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const parsed = SaveJournalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  const role = effectiveRole(ctx.role);

  const existing = await db.select().from(dailyJournalsTable)
    .where(and(
      eq(dailyJournalsTable.buildingId, ctx.buildingId),
      eq(dailyJournalsTable.journalDate, date),
      eq(dailyJournalsTable.role, role),
    ))
    .then((r) => r[0]);

  const values = {
    buildingId: ctx.buildingId,
    journalDate: date,
    role,
    authorId: ctx.id,
    authorName: ctx.name ?? "관리자",
    securityStatus: parsed.data.securityStatus ?? existing?.securityStatus ?? "ok",
    securityMemo: parsed.data.securityMemo ?? existing?.securityMemo ?? null,
    securityPhotoUrl:
      parsed.data.securityPhotoUrl !== undefined
        ? parsed.data.securityPhotoUrl
        : existing?.securityPhotoUrl ?? null,
    cleaningStatus: parsed.data.cleaningStatus ?? existing?.cleaningStatus ?? "ok",
    cleaningMemo: parsed.data.cleaningMemo ?? existing?.cleaningMemo ?? null,
    cleaningPhotoUrl:
      parsed.data.cleaningPhotoUrl !== undefined
        ? parsed.data.cleaningPhotoUrl
        : existing?.cleaningPhotoUrl ?? null,
    facilityStatus: parsed.data.facilityStatus ?? existing?.facilityStatus ?? "ok",
    facilityMemo: parsed.data.facilityMemo ?? existing?.facilityMemo ?? null,
    facilityPhotoUrl:
      parsed.data.facilityPhotoUrl !== undefined
        ? parsed.data.facilityPhotoUrl
        : existing?.facilityPhotoUrl ?? null,
    complaintStatus: parsed.data.complaintStatus ?? existing?.complaintStatus ?? "ok",
    complaintMemo: parsed.data.complaintMemo ?? existing?.complaintMemo ?? null,
    complaintPhotoUrl:
      parsed.data.complaintPhotoUrl !== undefined
        ? parsed.data.complaintPhotoUrl
        : existing?.complaintPhotoUrl ?? null,
  };

  let row;
  if (existing) {
    [row] = await db.update(dailyJournalsTable).set(values).where(eq(dailyJournalsTable.id, existing.id)).returning();
  } else {
    [row] = await db.insert(dailyJournalsTable).values(values).returning();
  }
  res.json(serializeJournal(row));
});

/**
 * 일일 보고서 합성. 직책별로 다른 데이터 묶음을 반환한다.
 *  - manager: 자기 일보 + 같은 건물의 모든 직책 work_log_entries(authorRole 라벨링) + lateArrivals.
 *  - accountant / facility_staff: 자기 일보 + 자기 작성 work_log_entries 만.
 *
 * lateArrivals: 부하 직책(accountant/facility_staff)의 일보 중 journal_date < today 이지만
 * created_at(KST) = today 인 것 — "오늘 새로 도착한 N월 N일자 OO 일보".
 */
async function composeDaily(buildingId: number, date: string, ctxName: string, ctxId: number, role: "manager" | "accountant" | "facility_staff") {
  // 1) 자기 일보(role 일치).
  const journal = await db.select().from(dailyJournalsTable)
    .where(and(
      eq(dailyJournalsTable.buildingId, buildingId),
      eq(dailyJournalsTable.journalDate, date),
      eq(dailyJournalsTable.role, role),
    ))
    .then((r) => r[0] ?? null);

  // 2) 업무기록.
  //    manager 는 같은 건물 모든 entries — 작성자 role 을 함께 결합.
  //    부하는 자기 작성분만.
  const entryConds = [
    eq(workLogEntriesTable.buildingId, buildingId),
    eq(workLogEntriesTable.occurredDate, date),
  ];
  if (role !== "manager") entryConds.push(eq(workLogEntriesTable.authorId, ctxId));
  const entriesRaw = await db.select().from(workLogEntriesTable)
    .where(and(...entryConds))
    .orderBy(workLogEntriesTable.occurredAt);

  // 작성자 role 매핑 (manager 일 때만 의미 있음).
  const authorIds = Array.from(new Set(entriesRaw.map((e) => e.authorId)));
  const authorRoleMap = new Map<number, string>();
  if (authorIds.length > 0) {
    const users = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable).where(inArray(usersTable.id, authorIds));
    for (const u of users) authorRoleMap.set(u.id, effectiveRole(u.role));
  }
  const entries = entriesRaw.map((e) => ({
    ...serializeEntry(e),
    authorRole: authorRoleMap.get(e.authorId) ?? "manager",
  }));

  // 3) 법정/정기.
  const [building, inspections, drafts] = await Promise.all([
    db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId)).then((r) => r[0] ?? null),
    db.select().from(inspectionsTable).where(eq(inspectionsTable.buildingId, buildingId)),
    db.select().from(draftsTable).where(sql`to_char(${draftsTable.createdAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') = ${date}`),
  ]);
  const inspIds = inspections.map((i) => i.id);
  const inspIdSet = new Set(inspIds);
  const draftsForBuilding = drafts.filter((d) => d.inspectionId != null && inspIdSet.has(d.inspectionId));
  const inspLogsForDay = inspIds.length === 0 ? [] : await db.select().from(inspectionLogsTable)
    .where(and(eq(inspectionLogsTable.inspectionDate, date), inArray(inspectionLogsTable.inspectionId, inspIds)));

  const inspMap = new Map(inspections.map((i) => [i.id, i]));
  const completed = inspLogsForDay.map((l) => ({
    name: inspMap.get(l.inspectionId)?.name ?? `점검#${l.inspectionId}`,
    result: l.result, memo: l.memo,
  }));
  const drafted = draftsForBuilding.map((d) => ({ id: d.id, title: d.title, draftType: d.draftType }));
  const postponed = inspections
    .filter((i) => i.nextDueDate === date && !inspLogsForDay.some((l) => l.inspectionId === i.id))
    .map((i) => ({ id: i.id, name: i.name, nextDueDate: i.nextDueDate }));

  // 4) lateArrivals — manager 한정.
  //    같은 건물, role IN (accountant, facility_staff), journal_date < date,
  //    created_at(KST) = date 인 일보들을 모은다. 표시 라벨은 'X월 X일자 OO 일보'.
  let lateArrivals: Array<{
    role: "accountant" | "facility_staff";
    journal: ReturnType<typeof serializeJournal>;
  }> = [];
  if (role === "manager") {
    const lateRows = await db.select().from(dailyJournalsTable)
      .where(and(
        eq(dailyJournalsTable.buildingId, buildingId),
        inArray(dailyJournalsTable.role, ["accountant", "facility_staff"]),
        lt(dailyJournalsTable.journalDate, date),
        sql`to_char(${dailyJournalsTable.createdAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') = ${date}`,
      ))
      .orderBy(desc(dailyJournalsTable.journalDate));
    lateArrivals = lateRows.map((r) => ({
      role: r.role as "accountant" | "facility_staff",
      journal: serializeJournal(r),
    }));
  }

  const report = {
    date,
    role,
    buildingName: building?.name ?? null,
    authorName: journal?.authorName ?? ctxName,
    journal: journal ? serializeJournal(journal) : null,
    entries,
    statutory: { completed, postponed, drafted },
    lateArrivals,
  };

  // 보고서 스냅샷 영속화 — 동일 (role) 입력 → 동일 출력 (멱등).
  // 직책 분리 후 snapshot 은 (building_id, journal_date, role) 단위가 된다.
  if (journal) {
    await db.update(dailyJournalsTable)
      .set({ snapshot: report })
      .where(eq(dailyJournalsTable.id, journal.id));
  }
  return report;
}

router.post("/daily-journals/:date/compose", async (req, res): Promise<void> => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  res.json(await composeDaily(ctx.buildingId, date, ctx.name ?? "관리자", ctx.id, effectiveRole(ctx.role)));
});

router.get("/work-log-reports/daily", async (req, res): Promise<void> => {
  const date = typeof req.query.date === "string" ? req.query.date : toKstDateKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  res.json(await composeDaily(ctx.buildingId, date, ctx.name ?? "관리자", ctx.id, effectiveRole(ctx.role)));
});

function mondayOfISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysISO(iso, diff);
}

type SectionKey = "security" | "cleaning" | "facility" | "complaint";
const SECTION_LABELS: Record<SectionKey, string> = {
  security: "보안", cleaning: "청소", facility: "시설", complaint: "민원",
};

function buildWeeklyTextSummary(
  sectionTotals: Record<SectionKey, { issues: number; memos: string[] }>,
  byCategory: Record<string, number>,
  topEntryMemos: string[],
): string {
  const sectionParts = (Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => {
    const tot = sectionTotals[k];
    if (tot.memos.length === 0) return `${SECTION_LABELS[k]}: 특이 없음`;
    const memo = tot.memos.slice(0, 2).map((s) => s.replace(/\s+/g, " ").trim()).join("; ");
    return `${SECTION_LABELS[k]}: ${memo}`;
  });
  const totalCat = Object.values(byCategory).reduce((a, b) => a + b, 0);
  const parts = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${v}`);
  const catLine = `분류별 ${totalCat}건${parts.length ? `(${parts.join("·")})` : ""}`;
  let text = sectionParts.join(" / ") + " · " + catLine;
  if (topEntryMemos.length > 0) {
    const memos = topEntryMemos.slice(0, 2).map((s) => s.replace(/\s+/g, " ").trim()).join("; ");
    text += ` · 주요 메모: ${memos}`;
  }
  return text;
}

/**
 * 주간 집계. 직책별 일보를 building 단위로 통합해 journal_date 기준으로 집계한다.
 * - 늦게 도착한 부하 일보도 정상 날짜(journal_date) 로 자동 합산된다.
 * - sectionTotals 의 의미는 직책에 따라 다르다(컬럼 라벨이 직책마다 다름).
 *   매니저 시각으로 호출할 경우 자기 직책 일보만 집계하도록 role 필터를 지원한다.
 */
async function aggregateWeek(
  buildingId: number,
  weekStart: string,
  role?: "manager" | "accountant" | "facility_staff",
  /** 부하(accountant/facility_staff) 사용자의 본인 집계용 author_id. */
  authorIdForSubordinate?: number,
) {
  const dates: string[] = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const weekEnd = dates[6];

  const journalConds = [
    eq(dailyJournalsTable.buildingId, buildingId),
    gte(dailyJournalsTable.journalDate, weekStart),
    lte(dailyJournalsTable.journalDate, weekEnd),
  ];
  if (role) journalConds.push(eq(dailyJournalsTable.role, role));

  // [직책별 일보 분리] entries 스코프도 role 정책과 일치시킨다.
  // manager 는 같은 건물 모든 entries (소장 책임 영역), 부하는 본인 author_id 만.
  const entryConds = [
    eq(workLogEntriesTable.buildingId, buildingId),
    gte(workLogEntriesTable.occurredDate, weekStart),
    lte(workLogEntriesTable.occurredDate, weekEnd),
  ];
  if (role && role !== "manager" && typeof authorIdForSubordinate === "number") {
    entryConds.push(eq(workLogEntriesTable.authorId, authorIdForSubordinate));
  }

  const [journals, entries] = await Promise.all([
    db.select().from(dailyJournalsTable).where(and(...journalConds)),
    db.select().from(workLogEntriesTable)
      .where(and(...entryConds))
      .orderBy(workLogEntriesTable.occurredAt),
  ]);

  const days = dates.map((d) => {
    const j = journals.find((x) => x.journalDate === d);
    const ents = entries.filter((e) => e.occurredDate === d);
    const issueCount =
      (j?.securityStatus === "issue" ? 1 : 0) +
      (j?.cleaningStatus === "issue" ? 1 : 0) +
      (j?.facilityStatus === "issue" ? 1 : 0) +
      (j?.complaintStatus === "issue" ? 1 : 0);
    return {
      date: d,
      hasJournal: !!j,
      issueCount,
      entryCount: ents.length,
      topMemos: ents.slice(0, 2).map((e) => e.memo),
    };
  });

  const sectionTotals: Record<SectionKey, { issues: number; memos: string[] }> = {
    security: { issues: journals.filter((j) => j.securityStatus === "issue").length, memos: journals.map((j) => j.securityMemo).filter(Boolean) as string[] },
    cleaning: { issues: journals.filter((j) => j.cleaningStatus === "issue").length, memos: journals.map((j) => j.cleaningMemo).filter(Boolean) as string[] },
    facility: { issues: journals.filter((j) => j.facilityStatus === "issue").length, memos: journals.map((j) => j.facilityMemo).filter(Boolean) as string[] },
    complaint: { issues: journals.filter((j) => j.complaintStatus === "issue").length, memos: journals.map((j) => j.complaintMemo).filter(Boolean) as string[] },
  };
  // byCategory: 카테고리 종류가 직책별로 다르므로 동적으로 집계한다.
  const byCategory: Record<string, number> = {};
  for (const e of entries) {
    if (!ALL_CATEGORIES.has(e.category)) continue;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  const issues = sectionTotals.security.issues + sectionTotals.cleaning.issues +
    sectionTotals.facility.issues + sectionTotals.complaint.issues;
  const topEntryMemos = entries.slice(0, 3).map((e) => e.memo);

  return {
    weekStart, weekEnd,
    days, sectionTotals, byCategory,
    totalEntries: entries.length,
    totalJournals: journals.length,
    issues,
    textSummary: buildWeeklyTextSummary(sectionTotals, byCategory, topEntryMemos),
  };
}

router.get("/work-log-reports/weekly", async (req, res): Promise<void> => {
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : null;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) { res.status(400).json({ error: "bad weekStart" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }

  const role = effectiveRole(ctx.role);
  const [agg, building] = await Promise.all([
    aggregateWeek(ctx.buildingId, weekStart, role, ctx.id),
    db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then((r) => r[0] ?? null),
  ]);

  res.json({ ...agg, role, buildingName: building?.name ?? null });
});

router.get("/work-log-reports/monthly", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "bad month (YYYY-MM)" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  const role = effectiveRole(ctx.role);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const monthStart = toKstDateKey(first);
  const monthEnd = toKstDateKey(last);

  // Enumerate ISO weeks (Monday-start) overlapping the month.
  const weekStarts: string[] = [];
  let cur = mondayOfISO(monthStart);
  while (cur <= monthEnd) {
    weekStarts.push(cur);
    cur = addDaysISO(cur, 7);
  }

  const [weeks, building] = await Promise.all([
    Promise.all(weekStarts.map((ws) => aggregateWeek(ctx.buildingId!, ws, role, ctx.id))),
    db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then((r) => r[0] ?? null),
  ]);

  const totals = weeks.reduce(
    (acc, w) => {
      acc.totalEntries += w.totalEntries;
      acc.totalJournals += w.totalJournals;
      acc.issues += w.issues;
      for (const [k, v] of Object.entries(w.byCategory)) {
        acc.byCategory[k] = (acc.byCategory[k] ?? 0) + v;
      }
      (Object.keys(SECTION_LABELS) as SectionKey[]).forEach((k) => {
        acc.sectionTotals[k].issues += w.sectionTotals[k].issues;
        acc.sectionTotals[k].memos.push(...w.sectionTotals[k].memos);
      });
      return acc;
    },
    {
      totalEntries: 0, totalJournals: 0, issues: 0,
      byCategory: {} as Record<string, number>,
      sectionTotals: {
        security: { issues: 0, memos: [] as string[] },
        cleaning: { issues: 0, memos: [] as string[] },
        facility: { issues: 0, memos: [] as string[] },
        complaint: { issues: 0, memos: [] as string[] },
      } as Record<SectionKey, { issues: number; memos: string[] }>,
    },
  );

  const monthTextSummary = buildWeeklyTextSummary(totals.sectionTotals, totals.byCategory, []);

  res.json({
    month, monthStart, monthEnd,
    role,
    buildingName: building?.name ?? null,
    weeks,
    totalEntries: totals.totalEntries,
    totalJournals: totals.totalJournals,
    issues: totals.issues,
    byCategory: totals.byCategory,
    sectionTotals: totals.sectionTotals,
    textSummary: monthTextSummary,
  });
});

function serializeEntry(r: typeof workLogEntriesTable.$inferSelect) {
  return {
    id: r.id,
    buildingId: r.buildingId,
    authorId: r.authorId,
    authorName: r.authorName,
    category: r.category,
    memo: r.memo,
    photoUrl: r.photoUrl,
    occurredAt: r.occurredAt instanceof Date ? r.occurredAt.toISOString() : r.occurredAt,
    occurredDate: r.occurredDate,
  };
}

function serializeJournal(r: typeof dailyJournalsTable.$inferSelect) {
  return {
    id: r.id,
    buildingId: r.buildingId,
    journalDate: r.journalDate,
    role: r.role,
    authorId: r.authorId,
    authorName: r.authorName,
    securityStatus: r.securityStatus,
    securityMemo: r.securityMemo,
    securityPhotoUrl: r.securityPhotoUrl,
    cleaningStatus: r.cleaningStatus,
    cleaningMemo: r.cleaningMemo,
    cleaningPhotoUrl: r.cleaningPhotoUrl,
    facilityStatus: r.facilityStatus,
    facilityMemo: r.facilityMemo,
    facilityPhotoUrl: r.facilityPhotoUrl,
    complaintStatus: r.complaintStatus,
    complaintMemo: r.complaintMemo,
    complaintPhotoUrl: r.complaintPhotoUrl,
  };
}

export default router;
