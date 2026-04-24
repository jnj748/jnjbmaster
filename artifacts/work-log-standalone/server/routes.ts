import { Router } from "express";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, dailyJournals, workLogEntries } from "./db.js";

const router = Router();

const CATEGORIES = ["facility", "complaint", "general"] as const;
type Category = (typeof CATEGORIES)[number];

const SPECIAL_STATUS = "특이사항";

const SECTIONS = [
  { key: "security", label: "보안" },
  { key: "cleaning", label: "미화" },
  { key: "facility", label: "시설" },
  { key: "complaint", label: "민원" },
] as const;

type DailyJournalInsert = typeof dailyJournals.$inferInsert;
type WorkLogEntryUpdate = Partial<typeof workLogEntries.$inferInsert>;

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function todayKst(): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function startOfWeekMon(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

function startOfMonth(ymd: string): string {
  return ymd.slice(0, 7) + "-01";
}

function endOfMonth(ymd: string): string {
  const [y, m] = ymd.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function requireString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

router.get("/today", (_req, res) => {
  res.json({ date: todayKst() });
});

router.get("/daily-journals/:date", async (req, res) => {
  const { date } = req.params;
  if (!isYmd(date)) {
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
  }
  const rows = await db
    .select()
    .from(dailyJournals)
    .where(eq(dailyJournals.date, date))
    .limit(1);
  if (rows.length === 0) {
    return res.json(null);
  }
  res.json(rows[0]);
});

router.put("/daily-journals/:date", async (req, res) => {
  const { date } = req.params;
  if (!isYmd(date)) {
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;

  const sections = SECTIONS.map((s) => ({
    ...s,
    status: requireString(body[`${s.key}Status`]),
    memo: trimOrNull(body[`${s.key}Memo`]),
    photoUrl: trimOrNull(body[`${s.key}PhotoUrl`]),
  }));

  const missingStatus = sections.filter((s) => s.status === "");
  if (missingStatus.length > 0) {
    return res.status(422).json({
      error: "필수 항목을 입력해주세요.",
      missingFields: missingStatus.map((s) => `${s.key}Status`),
      missingLabels: missingStatus.map((s) => `${s.label} 상태`),
    });
  }

  const missingSpecialMemo = sections.filter(
    (s) => s.status === SPECIAL_STATUS && !s.memo,
  );
  if (missingSpecialMemo.length > 0) {
    return res.status(422).json({
      error: "특이사항으로 표시한 항목은 메모를 반드시 입력해주세요.",
      missingFields: missingSpecialMemo.map((s) => `${s.key}Memo`),
      missingLabels: missingSpecialMemo.map(
        (s) => `${s.label} 특이사항 메모`,
      ),
    });
  }

  const now = new Date();
  const payload: DailyJournalInsert = {
    date,
    securityStatus: sections[0].status,
    securityMemo: sections[0].memo,
    securityPhotoUrl: sections[0].photoUrl,
    cleaningStatus: sections[1].status,
    cleaningMemo: sections[1].memo,
    cleaningPhotoUrl: sections[1].photoUrl,
    facilityStatus: sections[2].status,
    facilityMemo: sections[2].memo,
    facilityPhotoUrl: sections[2].photoUrl,
    complaintStatus: sections[3].status,
    complaintMemo: sections[3].memo,
    complaintPhotoUrl: sections[3].photoUrl,
    updatedAt: now,
  };
  await db
    .insert(dailyJournals)
    .values(payload)
    .onConflictDoUpdate({
      target: dailyJournals.date,
      set: {
        securityStatus: payload.securityStatus,
        securityMemo: payload.securityMemo,
        securityPhotoUrl: payload.securityPhotoUrl,
        cleaningStatus: payload.cleaningStatus,
        cleaningMemo: payload.cleaningMemo,
        cleaningPhotoUrl: payload.cleaningPhotoUrl,
        facilityStatus: payload.facilityStatus,
        facilityMemo: payload.facilityMemo,
        facilityPhotoUrl: payload.facilityPhotoUrl,
        complaintStatus: payload.complaintStatus,
        complaintMemo: payload.complaintMemo,
        complaintPhotoUrl: payload.complaintPhotoUrl,
        updatedAt: payload.updatedAt,
      },
    });
  res.json(payload);
});

router.get("/work-logs", async (req, res) => {
  const { from, to, category } = req.query as Record<string, string | undefined>;
  const conditions: SQL<unknown>[] = [];
  if (from) {
    if (!isYmd(from)) return res.status(400).json({ error: "Invalid 'from'." });
    conditions.push(gte(workLogEntries.occurredDate, from));
  }
  if (to) {
    if (!isYmd(to)) return res.status(400).json({ error: "Invalid 'to'." });
    conditions.push(lte(workLogEntries.occurredDate, to));
  }
  if (category) {
    if (!isCategory(category))
      return res.status(400).json({ error: "Invalid category." });
    conditions.push(eq(workLogEntries.category, category));
  }
  const baseQuery = db.select().from(workLogEntries);
  const filtered =
    conditions.length === 0
      ? baseQuery
      : baseQuery.where(and(...conditions));
  const rows = await filtered.orderBy(desc(workLogEntries.occurredAt));
  res.json(rows);
});

router.post("/work-logs", async (req, res) => {
  const body = req.body ?? {};
  if (!isCategory(body.category)) {
    return res.status(400).json({
      error: "Invalid category (must be facility | complaint | general).",
    });
  }
  if (!body.memo || typeof body.memo !== "string" || body.memo.trim() === "") {
    return res.status(422).json({
      error: "메모는 필수입니다.",
      missingFields: ["memo"],
    });
  }
  const occurredDate = isYmd(body.occurredDate) ? body.occurredDate : todayKst();
  const occurredAt = body.occurredAt
    ? new Date(body.occurredAt)
    : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return res.status(400).json({ error: "Invalid occurredAt timestamp." });
  }
  const now = new Date();
  const insert = await db
    .insert(workLogEntries)
    .values({
      occurredDate,
      occurredAt,
      category: body.category,
      memo: body.memo.trim(),
      photoUrl: trimOrNull(body.photoUrl),
      createdAt: now,
    })
    .returning();
  res.status(201).json(insert[0]);
});

router.patch("/work-logs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id." });
  }
  const body = req.body ?? {};
  const set: WorkLogEntryUpdate = {};
  if (body.category !== undefined) {
    if (!isCategory(body.category))
      return res.status(400).json({ error: "Invalid category." });
    set.category = body.category;
  }
  if (body.memo !== undefined) {
    if (typeof body.memo !== "string" || body.memo.trim() === "")
      return res.status(422).json({ error: "메모는 비울 수 없습니다." });
    set.memo = body.memo.trim();
  }
  if (body.photoUrl !== undefined) {
    set.photoUrl = trimOrNull(body.photoUrl);
  }
  if (body.occurredDate !== undefined) {
    if (!isYmd(body.occurredDate))
      return res.status(400).json({ error: "Invalid occurredDate." });
    set.occurredDate = body.occurredDate;
  }
  if (Object.keys(set).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }
  const updated = await db
    .update(workLogEntries)
    .set(set)
    .where(eq(workLogEntries.id, id))
    .returning();
  if (updated.length === 0) {
    return res.status(404).json({ error: "Entry not found." });
  }
  res.json(updated[0]);
});

router.delete("/work-logs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id." });
  }
  const deleted = await db
    .delete(workLogEntries)
    .where(eq(workLogEntries.id, id))
    .returning();
  if (deleted.length === 0) {
    return res.status(404).json({ error: "Entry not found." });
  }
  res.json({ success: true });
});

type ReportJournal = typeof dailyJournals.$inferSelect;

function specialCountForJournal(j: ReportJournal): number {
  let n = 0;
  if (j.securityStatus === SPECIAL_STATUS) n++;
  if (j.cleaningStatus === SPECIAL_STATUS) n++;
  if (j.facilityStatus === SPECIAL_STATUS) n++;
  if (j.complaintStatus === SPECIAL_STATUS) n++;
  return n;
}

function buildSummary(
  journals: ReportJournal[],
  entries: (typeof workLogEntries.$inferSelect)[],
) {
  const specialCount = journals.reduce(
    (sum, j) => sum + specialCountForJournal(j),
    0,
  );
  return {
    days: journals.length,
    facility: entries.filter((e) => e.category === "facility").length,
    complaint: entries.filter((e) => e.category === "complaint").length,
    general: entries.filter((e) => e.category === "general").length,
    special: specialCount,
  };
}

router.get("/reports/daily", async (req, res) => {
  const date = (req.query.date as string | undefined) ?? todayKst();
  if (!isYmd(date)) {
    return res.status(400).json({ error: "Invalid date." });
  }
  const journalRows = await db
    .select()
    .from(dailyJournals)
    .where(eq(dailyJournals.date, date))
    .limit(1);
  const journals = journalRows;
  const entries = await db
    .select()
    .from(workLogEntries)
    .where(eq(workLogEntries.occurredDate, date))
    .orderBy(desc(workLogEntries.occurredAt));
  res.json({
    start: date,
    end: date,
    journals,
    entries,
    summary: buildSummary(journals, entries),
  });
});

router.get("/reports/weekly", async (req, res) => {
  const date = (req.query.date as string | undefined) ?? todayKst();
  if (!isYmd(date)) {
    return res.status(400).json({ error: "Invalid date." });
  }
  const start = startOfWeekMon(date);
  const end = addDays(start, 6);
  const journals = await db
    .select()
    .from(dailyJournals)
    .where(and(gte(dailyJournals.date, start), lte(dailyJournals.date, end)));
  const entries = await db
    .select()
    .from(workLogEntries)
    .where(
      and(
        gte(workLogEntries.occurredDate, start),
        lte(workLogEntries.occurredDate, end),
      ),
    )
    .orderBy(desc(workLogEntries.occurredAt));
  res.json({
    start,
    end,
    journals,
    entries,
    summary: buildSummary(journals, entries),
  });
});

router.get("/reports/monthly", async (req, res) => {
  const date = (req.query.date as string | undefined) ?? todayKst();
  if (!isYmd(date)) {
    return res.status(400).json({ error: "Invalid date." });
  }
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const journals = await db
    .select()
    .from(dailyJournals)
    .where(and(gte(dailyJournals.date, start), lte(dailyJournals.date, end)));
  const entries = await db
    .select()
    .from(workLogEntries)
    .where(
      and(
        gte(workLogEntries.occurredDate, start),
        lte(workLogEntries.occurredDate, end),
      ),
    )
    .orderBy(desc(workLogEntries.occurredAt));
  res.json({
    start,
    end,
    journals,
    entries,
    summary: buildSummary(journals, entries),
  });
});

export default router;
