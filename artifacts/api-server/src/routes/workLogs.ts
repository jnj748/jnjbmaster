import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
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
router.use(["/work-logs", "/daily-journals", "/work-log-reports"], requireRole("manager", "platform_admin"));

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

async function getCtx(userId: number) {
  const u = await db
    .select({ id: usersTable.id, name: usersTable.name, buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0]);
  return u ?? null;
}

const CategoryEnum = z.enum(["facility", "bill", "complaint"]);
const StatusEnum = z.enum(["ok", "issue"]);

const CreateWorkLogBody = z.object({
  category: CategoryEnum,
  memo: z.string().min(1).max(2000),
  photoUrl: z.string().nullish(),
  occurredAt: z.string().datetime().optional(),
});

const UpdateWorkLogBody = z.object({
  category: CategoryEnum.optional(),
  memo: z.string().min(1).max(2000).optional(),
  photoUrl: z.string().nullish(),
});

router.get("/work-logs", async (req, res): Promise<void> => {
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }

  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : null;
  const category = typeof req.query.category === "string" ? req.query.category : null;

  const conds = [eq(workLogEntriesTable.buildingId, ctx.buildingId ?? -1)];
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

  // Compatibility adapter: facility category 기록은 maintenance_logs 에도 노출.
  if (parsed.data.category === "facility") {
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

  const [row] = await db
    .update(workLogEntriesTable)
    .set({
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.memo !== undefined ? { memo: parsed.data.memo } : {}),
      ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl } : {}),
    })
    .where(and(eq(workLogEntriesTable.id, id), eq(workLogEntriesTable.buildingId, ctx.buildingId ?? -1)))
    .returning();

  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(serializeEntry(row));
});

router.delete("/work-logs/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx) { res.status(404).json({ error: "user not found" }); return; }

  const [row] = await db
    .delete(workLogEntriesTable)
    .where(and(eq(workLogEntriesTable.id, id), eq(workLogEntriesTable.buildingId, ctx.buildingId ?? -1)))
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

router.get("/daily-journals/:date", async (req, res): Promise<void> => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }

  const j = await db.select().from(dailyJournalsTable)
    .where(and(eq(dailyJournalsTable.buildingId, ctx.buildingId), eq(dailyJournalsTable.journalDate, date)))
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

  const existing = await db.select().from(dailyJournalsTable)
    .where(and(eq(dailyJournalsTable.buildingId, ctx.buildingId), eq(dailyJournalsTable.journalDate, date)))
    .then((r) => r[0]);

  const values = {
    buildingId: ctx.buildingId,
    journalDate: date,
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

async function composeDaily(buildingId: number, date: string, ctxName: string) {
  const [building, journal, entries, inspections, drafts] = await Promise.all([
    db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId)).then((r) => r[0] ?? null),
    db.select().from(dailyJournalsTable)
      .where(and(eq(dailyJournalsTable.buildingId, buildingId), eq(dailyJournalsTable.journalDate, date)))
      .then((r) => r[0] ?? null),
    db.select().from(workLogEntriesTable)
      .where(and(eq(workLogEntriesTable.buildingId, buildingId), eq(workLogEntriesTable.occurredDate, date)))
      .orderBy(workLogEntriesTable.occurredAt),
    db.select().from(inspectionsTable).where(eq(inspectionsTable.buildingId, buildingId)),
    // KST 기준 일자로 비교 (DB 세션 TZ 영향 제거).
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

  const report = {
    date,
    buildingName: building?.name ?? null,
    authorName: journal?.authorName ?? ctxName,
    journal: journal ? serializeJournal(journal) : null,
    entries: entries.map(serializeEntry),
    statutory: { completed, postponed, drafted },
  };

  // 보고서 스냅샷 영속화 — 동일 입력 → 동일 출력 (멱등).
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
  res.json(await composeDaily(ctx.buildingId, date, ctx.name ?? "관리자"));
});

router.get("/work-log-reports/daily", async (req, res): Promise<void> => {
  const date = typeof req.query.date === "string" ? req.query.date : toKstDateKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  res.json(await composeDaily(ctx.buildingId, date, ctx.name ?? "관리자"));
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
  byCategory: { facility: number; bill: number; complaint: number },
  topEntryMemos: string[],
): string {
  const sectionParts = (Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => {
    const tot = sectionTotals[k];
    if (tot.memos.length === 0) return `${SECTION_LABELS[k]}: 특이 없음`;
    const memo = tot.memos.slice(0, 2).map((s) => s.replace(/\s+/g, " ").trim()).join("; ");
    return `${SECTION_LABELS[k]}: ${memo}`;
  });
  const totalCat = byCategory.facility + byCategory.bill + byCategory.complaint;
  const catLine = `분류별 ${totalCat}건(시설 ${byCategory.facility}·관리비 ${byCategory.bill}·민원 ${byCategory.complaint})`;
  let text = sectionParts.join(" / ") + " · " + catLine;
  if (topEntryMemos.length > 0) {
    const memos = topEntryMemos.slice(0, 2).map((s) => s.replace(/\s+/g, " ").trim()).join("; ");
    text += ` · 주요 메모: ${memos}`;
  }
  return text;
}

async function aggregateWeek(buildingId: number, weekStart: string) {
  const dates: string[] = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const weekEnd = dates[6];

  const [journals, entries] = await Promise.all([
    db.select().from(dailyJournalsTable)
      .where(and(eq(dailyJournalsTable.buildingId, buildingId),
        gte(dailyJournalsTable.journalDate, weekStart), lte(dailyJournalsTable.journalDate, weekEnd))),
    db.select().from(workLogEntriesTable)
      .where(and(eq(workLogEntriesTable.buildingId, buildingId),
        gte(workLogEntriesTable.occurredDate, weekStart), lte(workLogEntriesTable.occurredDate, weekEnd)))
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
  const byCategory = {
    facility: entries.filter((e) => e.category === "facility").length,
    bill: entries.filter((e) => e.category === "bill").length,
    complaint: entries.filter((e) => e.category === "complaint").length,
  };
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

  const [agg, building] = await Promise.all([
    aggregateWeek(ctx.buildingId, weekStart),
    db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then((r) => r[0] ?? null),
  ]);

  res.json({ ...agg, buildingName: building?.name ?? null });
});

router.get("/work-log-reports/monthly", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "bad month (YYYY-MM)" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }

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
    Promise.all(weekStarts.map((ws) => aggregateWeek(ctx.buildingId!, ws))),
    db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then((r) => r[0] ?? null),
  ]);

  const totals = weeks.reduce(
    (acc, w) => {
      acc.totalEntries += w.totalEntries;
      acc.totalJournals += w.totalJournals;
      acc.issues += w.issues;
      acc.byCategory.facility += w.byCategory.facility;
      acc.byCategory.bill += w.byCategory.bill;
      acc.byCategory.complaint += w.byCategory.complaint;
      (Object.keys(SECTION_LABELS) as SectionKey[]).forEach((k) => {
        acc.sectionTotals[k].issues += w.sectionTotals[k].issues;
        acc.sectionTotals[k].memos.push(...w.sectionTotals[k].memos);
      });
      return acc;
    },
    {
      totalEntries: 0, totalJournals: 0, issues: 0,
      byCategory: { facility: 0, bill: 0, complaint: 0 },
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
