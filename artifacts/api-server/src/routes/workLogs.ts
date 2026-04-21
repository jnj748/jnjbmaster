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
  const occurredDate = occurredAt.toISOString().split("T")[0];

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
  cleaningStatus: StatusEnum.optional(),
  cleaningMemo: z.string().nullish(),
  facilityStatus: StatusEnum.optional(),
  facilityMemo: z.string().nullish(),
  complaintStatus: StatusEnum.optional(),
  complaintMemo: z.string().nullish(),
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
    cleaningStatus: parsed.data.cleaningStatus ?? existing?.cleaningStatus ?? "ok",
    cleaningMemo: parsed.data.cleaningMemo ?? existing?.cleaningMemo ?? null,
    facilityStatus: parsed.data.facilityStatus ?? existing?.facilityStatus ?? "ok",
    facilityMemo: parsed.data.facilityMemo ?? existing?.facilityMemo ?? null,
    complaintStatus: parsed.data.complaintStatus ?? existing?.complaintStatus ?? "ok",
    complaintMemo: parsed.data.complaintMemo ?? existing?.complaintMemo ?? null,
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
    db.select().from(draftsTable).where(sql`to_char(${draftsTable.createdAt}, 'YYYY-MM-DD') = ${date}`),
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
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "bad date" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }
  res.json(await composeDaily(ctx.buildingId, date, ctx.name ?? "관리자"));
});

router.get("/work-log-reports/weekly", async (req, res): Promise<void> => {
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : null;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) { res.status(400).json({ error: "bad weekStart" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }

  const start = new Date(weekStart);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  const weekEnd = dates[6];

  const [journals, entries, building] = await Promise.all([
    db.select().from(dailyJournalsTable)
      .where(and(eq(dailyJournalsTable.buildingId, ctx.buildingId),
        gte(dailyJournalsTable.journalDate, weekStart), lte(dailyJournalsTable.journalDate, weekEnd))),
    db.select().from(workLogEntriesTable)
      .where(and(eq(workLogEntriesTable.buildingId, ctx.buildingId),
        gte(workLogEntriesTable.occurredDate, weekStart), lte(workLogEntriesTable.occurredDate, weekEnd))),
    db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then((r) => r[0] ?? null),
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

  const sectionTotals = {
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

  res.json({
    weekStart, weekEnd,
    buildingName: building?.name ?? null,
    days, sectionTotals, byCategory,
    totalEntries: entries.length,
    totalJournals: journals.length,
  });
});

router.get("/work-log-reports/monthly", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "bad month (YYYY-MM)" }); return; }
  const ctx = await getCtx(req.user!.userId);
  if (!ctx?.buildingId) { res.status(400).json({ error: "no building scope" }); return; }

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const monthStart = first.toISOString().split("T")[0];
  const monthEnd = last.toISOString().split("T")[0];

  const [journals, entries, building] = await Promise.all([
    db.select().from(dailyJournalsTable)
      .where(and(eq(dailyJournalsTable.buildingId, ctx.buildingId),
        gte(dailyJournalsTable.journalDate, monthStart), lte(dailyJournalsTable.journalDate, monthEnd))),
    db.select().from(workLogEntriesTable)
      .where(and(eq(workLogEntriesTable.buildingId, ctx.buildingId),
        gte(workLogEntriesTable.occurredDate, monthStart), lte(workLogEntriesTable.occurredDate, monthEnd))),
    db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then((r) => r[0] ?? null),
  ]);

  // Group by ISO week (Monday start) within the month.
  const weeks: Record<string, { weekStart: string; entries: number; journals: number; issues: number; memos: string[] }> = {};
  function mondayOf(date: Date): string {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().split("T")[0];
  }
  for (const e of entries) {
    const w = mondayOf(new Date(e.occurredDate));
    weeks[w] ??= { weekStart: w, entries: 0, journals: 0, issues: 0, memos: [] };
    weeks[w].entries++;
  }
  for (const j of journals) {
    const w = mondayOf(new Date(j.journalDate));
    weeks[w] ??= { weekStart: w, entries: 0, journals: 0, issues: 0, memos: [] };
    weeks[w].journals++;
    const issues = (j.securityStatus === "issue" ? 1 : 0) + (j.cleaningStatus === "issue" ? 1 : 0) +
      (j.facilityStatus === "issue" ? 1 : 0) + (j.complaintStatus === "issue" ? 1 : 0);
    weeks[w].issues += issues;
    [j.securityMemo, j.cleaningMemo, j.facilityMemo, j.complaintMemo].forEach((mm) => {
      if (mm && weeks[w].memos.length < 3) weeks[w].memos.push(mm);
    });
  }
  const weekList = Object.values(weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  res.json({
    month, monthStart, monthEnd,
    buildingName: building?.name ?? null,
    weeks: weekList,
    totalEntries: entries.length,
    totalJournals: journals.length,
    byCategory: {
      facility: entries.filter((e) => e.category === "facility").length,
      bill: entries.filter((e) => e.category === "bill").length,
      complaint: entries.filter((e) => e.category === "complaint").length,
    },
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
    cleaningStatus: r.cleaningStatus,
    cleaningMemo: r.cleaningMemo,
    facilityStatus: r.facilityStatus,
    facilityMemo: r.facilityMemo,
    complaintStatus: r.complaintStatus,
    complaintMemo: r.complaintMemo,
  };
}

export default router;
