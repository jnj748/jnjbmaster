import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, dailyReportsTable, weeklySummaryReportsTable, monthlySummaryReportsTable, usersTable, notificationsTable, inspectionsTable, inspectionLogsTable, monthlyPaymentsTable, unitsTable, tenantsTable, vehiclesTable, buildingsTable, alertActionsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds } from "../middlewares/buildingScope";
// [Task #610] 2층 단일 통로 — 주보/월보 commit 후 documents 레지스트리에 등록.
import { saveProducingDocument, MissingSourceRowError } from "../repo/producingDocuments";
import { buildDocumentName } from "@workspace/document-naming";

const router: IRouter = Router();

// [Username 가입] userIdentifier 는 username ?? email 폴백 결과(없으면 빈 문자열).
// 신규(아이디) 가입자는 email 이 NULL 이므로 호출부에서 username 우선 폴백.
async function linkDailyToWeekly(row: typeof dailyReportsTable.$inferSelect, userId: number, userIdentifier: string): Promise<void> {
  const reportDate = new Date(row.reportDate);
  const dayOfWeek = reportDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekMonday = new Date(reportDate);
  weekMonday.setDate(reportDate.getDate() + mondayOffset);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  const weekStart = weekMonday.toISOString().split("T")[0];
  const weekEnd = weekSunday.toISOString().split("T")[0];

  const existingWeekly = await db.select().from(weeklySummaryReportsTable)
    .where(eq(weeklySummaryReportsTable.weekStart, weekStart));

  const typeLabels: Record<string, string> = {
    expense: "경비", cleaning: "미화", maintenance: "유지보수",
    security: "보안", other: "기타",
  };
  const label = typeLabels[row.reportType] || row.reportType;
  const entryLine = `- [${row.reportDate}] (${label}) ${row.title}: ${(row.content || "").substring(0, 100)}`;

  if (existingWeekly.length > 0) {
    const weekly = existingWeekly[0];
    const currentIds = weekly.dailyReportIds ? weekly.dailyReportIds.split(",").map(Number) : [];
    if (!currentIds.includes(row.id)) {
      currentIds.push(row.id);
      const updatedSummary = weekly.summary
        ? weekly.summary + "\n" + entryLine
        : entryLine;
      // [allow-direct-write: 일일보고 자동 누적 — summary 본문 부속 갱신만(라이프사이클 상태 변화 없음).
      //   트리거 trg_documents_weekly_summary_reports 가 documents.title/updated_at 만 새로고침한다.]
      await db.update(weeklySummaryReportsTable)
        .set({
          summary: updatedSummary,
          dailyReportIds: currentIds.join(","),
          totalDailyReports: currentIds.length,
        })
        .where(eq(weeklySummaryReportsTable.id, weekly.id));
    }
  } else {
    const managerUser = await db.select().from(usersTable)
      .where(eq(usersTable.role, "manager")).then(r => r[0]);
    // [Task #610 Layer 5] 자동 주간보고 생성도 단일 통로(saveProducingDocument) 로 라우팅.
    // [Task #610] 명명 SoT — buildDocumentName('weekly_report') 적용.
    const autoNaming = buildDocumentName({ kind: "weekly_report", date: weekStart });
    await saveProducingDocument({
      write: async (tx) => {
        const [w] = await tx.insert(weeklySummaryReportsTable).values({
          title: autoNaming.title,
          weekStart,
          weekEnd,
          summary: `■ 금주 업무 내용\n${entryLine}`,
          totalDailyReports: 1,
          dailyReportIds: String(row.id),
          authorId: managerUser?.id ?? userId,
          authorName: managerUser?.name ?? userIdentifier,
          status: "draft",
        }).returning();
        return w;
      },
      document: {
        kind: "weekly_report",
        sourceTable: "weekly_summary_reports",
        title: autoNaming.title,
        authorId: managerUser?.id ?? userId,
        authorRole: "manager",
        state: "draft",
        href: (w) => `/reports/weekly/${w.id}`,
      },
    });
  }
}

function serializeDaily(r: typeof dailyReportsTable.$inferSelect) {
  return {
    ...r,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeWeekly(r: typeof weeklySummaryReportsTable.$inferSelect) {
  return {
    ...r,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeMonthly(r: typeof monthlySummaryReportsTable.$inferSelect) {
  return {
    ...r,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/daily-reports", async (req, res): Promise<void> => {
  const user = req.user!;
  const dateFilter = req.query.date as string | undefined;
  const typeFilter = req.query.type as string | undefined;

  let rows = await db.select().from(dailyReportsTable).orderBy(desc(dailyReportsTable.createdAt));

  if (user.role !== "manager" && user.role !== "platform_admin") {
    rows = rows.filter((r) => r.authorId === user.userId);
  }

  if (dateFilter) {
    rows = rows.filter((r) => r.reportDate === dateFilter);
  }
  if (typeFilter) {
    rows = rows.filter((r) => r.reportType === typeFilter);
  }

  res.json(rows.map(serializeDaily));
});

router.post("/daily-reports", async (req, res): Promise<void> => {
  const user = req.user!;
  const { reportDate, reportType, title, content, photos } = req.body;

  if (!reportDate || !reportType || !title || !content) {
    res.status(400).json({ error: "필수 항목을 입력해주세요" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.username ?? user.email ?? `사용자#${user.userId}`);

  const [row] = await db
    .insert(dailyReportsTable)
    .values({
      reportDate,
      reportType,
      title,
      content,
      photos: photos ?? null,
      authorId: user.userId,
      authorName: userName,
      status: "submitted",
    })
    .returning();

  await insertNotification({
    recipientType: "role:manager",
    notificationType: "daily_report_submitted",
    title: "일간 보고서 제출",
    message: `${userName}님이 일간 보고서를 제출했습니다: ${title}`,
    relatedEntityType: "daily_report",
    relatedEntityId: row.id,
  });

  await linkDailyToWeekly(row, user.userId, user.username ?? user.email ?? `사용자#${user.userId}`);

  res.status(201).json(serializeDaily(row));
});

router.get("/daily-reports/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const [row] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "일간 보고서를 찾을 수 없습니다" });
    return;
  }

  if (user.role !== "manager" && user.role !== "platform_admin" && row.authorId !== user.userId) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }

  res.json(serializeDaily(row));
});

router.post("/daily-reports/:id/submit", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;

  const [existing] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "일간 보고서를 찾을 수 없습니다" });
    return;
  }

  if (existing.authorId !== user.userId) {
    res.status(403).json({ error: "본인이 작성한 보고서만 제출할 수 있습니다" });
    return;
  }

  if (existing.status !== "draft") {
    res.status(400).json({ error: "작성중 상태의 보고서만 제출할 수 있습니다" });
    return;
  }

  const [row] = await db
    .update(dailyReportsTable)
    .set({ status: "submitted" })
    .where(eq(dailyReportsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "일간 보고서를 찾을 수 없습니다" });
    return;
  }

  await insertNotification({
    recipientType: "role:manager",
    notificationType: "daily_report_submitted",
    title: "일간 보고서 제출",
    message: `${row.authorName}님이 일간 보고서를 제출했습니다: ${row.title}`,
    relatedEntityType: "daily_report",
    relatedEntityId: row.id,
  });

  await linkDailyToWeekly(row, user.userId, user.username ?? user.email ?? `사용자#${user.userId}`);

  res.json(serializeDaily(row));
});

router.post("/daily-reports/:id/review", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const { comment } = req.body || {};

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.username ?? user.email ?? `사용자#${user.userId}`);

  const [row] = await db
    .update(dailyReportsTable)
    .set({
      status: "reviewed",
      reviewerId: user.userId,
      reviewerName: userName,
      reviewComment: comment ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(dailyReportsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "일간 보고서를 찾을 수 없습니다" });
    return;
  }

  res.json(serializeDaily(row));
});

router.get("/weekly-summary-reports", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const weekStart = req.query.weekStart as string | undefined;

  let rows = await db.select().from(weeklySummaryReportsTable).orderBy(desc(weeklySummaryReportsTable.createdAt));

  if (weekStart) {
    rows = rows.filter((r) => r.weekStart === weekStart);
  }

  res.json(rows.map(serializeWeekly));
});

router.post("/weekly-summary-reports", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const user = req.user!;
  const { weekStart, weekEnd } = req.body;

  if (!weekStart || !weekEnd) {
    res.status(400).json({ error: "주간 시작일과 종료일을 입력해주세요" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.username ?? user.email ?? `사용자#${user.userId}`);

  const dailyReports = await db.select().from(dailyReportsTable);
  const weekDailyReports = dailyReports.filter(
    (r) => r.reportDate >= weekStart && r.reportDate <= weekEnd
  );

  const summaryParts: string[] = [];
  const typeCount: Record<string, number> = {};

  for (const dr of weekDailyReports) {
    const typeLabel: Record<string, string> = {
      expense: "경비",
      cleaning: "미화",
      maintenance: "유지보수",
      security: "보안",
      other: "기타",
    };
    const label = typeLabel[dr.reportType] || dr.reportType;
    typeCount[label] = (typeCount[label] || 0) + 1;
  }

  for (const [type, count] of Object.entries(typeCount)) {
    summaryParts.push(`${type}: ${count}건`);
  }

  const weekInspections = await db.select().from(inspectionsTable);
  const weekInspectionsDue = weekInspections.filter(
    (i) => i.nextDueDate >= weekStart && i.nextDueDate <= weekEnd
  );
  const weekLogs = await db.select().from(inspectionLogsTable);
  const weekInspLogs = weekLogs.filter(
    (l) => l.inspectionDate >= weekStart && l.inspectionDate <= weekEnd
  );

  let inspectionSection = "";
  if (weekInspectionsDue.length > 0 || weekInspLogs.length > 0) {
    inspectionSection = "\n\n■ 금주 점검 현황";
    if (weekInspLogs.length > 0) {
      inspectionSection += `\n  완료된 점검: ${weekInspLogs.length}건`;
      for (const log of weekInspLogs) {
        const insp = weekInspections.find((i) => i.id === log.inspectionId);
        inspectionSection += `\n  - [${log.inspectionDate}] ${insp?.name ?? "점검"}: ${log.result}${log.memo ? ` (${log.memo})` : ""}`;
      }
    }
    if (weekInspectionsDue.length > 0) {
      const pending = weekInspectionsDue.filter(
        (i) => !weekInspLogs.some((l) => l.inspectionId === i.id)
      );
      if (pending.length > 0) {
        inspectionSection += `\n  예정 점검: ${pending.length}건`;
        for (const i of pending) {
          inspectionSection += `\n  - ${i.name} (예정일: ${i.nextDueDate})`;
        }
      }
    }
  }

  let overdueSection = "";
  try {
    const overdueActions = await db.select().from(alertActionsTable)
      .where(and(
        eq(alertActionsTable.actionType, "completed"),
      ));
    const weekOverdueActions = overdueActions.filter(
      (a) => a.delayReason && a.completedDate && a.completedDate >= weekStart && a.completedDate <= weekEnd
    );
    if (weekOverdueActions.length > 0) {
      overdueSection = "\n\n■ 전주미결 처리 현황";
      overdueSection += `\n  기한 초과 후 완료: ${weekOverdueActions.length}건`;
      for (const action of weekOverdueActions) {
        const detail = action.delayReasonDetail ? ` (${action.delayReasonDetail})` : "";
        overdueSection += `\n  - [${action.completedDate}] ${action.alertType}#${action.relatedEntityId}: 지연사유 - ${action.delayReason}${detail}`;
      }
    }
  } catch {}

  const summary = `주간 보고 요약 (${weekStart} ~ ${weekEnd})\n\n총 ${weekDailyReports.length}건의 일간 보고서\n${summaryParts.join("\n")}\n\n${weekDailyReports.map((dr) => `- [${dr.reportDate}] ${dr.title}`).join("\n")}${inspectionSection}${overdueSection}`;

  // [Task #610] 2층 단일 통로 — 산출 INSERT + documents upsert 를 헬퍼에 위임.
  // [Task #610] 명명 SoT — buildDocumentName('weekly_report') 적용.
  const weeklyNaming = buildDocumentName({ kind: "weekly_report", date: weekStart });
  let row: typeof weeklySummaryReportsTable.$inferSelect;
  try {
    row = await saveProducingDocument({
      write: (exec) =>
        exec
          .insert(weeklySummaryReportsTable)
          .values({
            weekStart,
            weekEnd,
            title: weeklyNaming.title,
            summary,
            dailyReportIds: JSON.stringify(weekDailyReports.map((dr) => dr.id)),
            totalDailyReports: weekDailyReports.length,
            authorId: user.userId,
            authorName: userName,
            status: "draft",
          })
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "weekly_report",
        sourceTable: "weekly_summary_reports",
        state: "draft",
        title: (r) => r.title,
        authorId: user.userId,
        authorRole: "manager",
        periodStart: weekStart,
        periodEnd: weekEnd,
        href: (r) => `/report-system?weekly=${r.id}`,
        metadata: (r) => ({ totalDailyReports: r.totalDailyReports }),
      },
    });
  } catch (err) {
    req.log.error({ err }, "[Task #610] weekly saveProducingDocument failed");
    res.status(500).json({ error: "주간 보고서 저장 실패" });
    return;
  }

  res.status(201).json(serializeWeekly(row));
});

router.post("/weekly-summary-reports/:id/forward", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  // [Task #610] 단일 통로 — 주간보고 전달(forwarded) 도 saveProducingDocument 로.
  let row!: typeof weeklySummaryReportsTable.$inferSelect;
  try {
    row = await saveProducingDocument({
      write: (exec) =>
        exec
          .update(weeklySummaryReportsTable)
          .set({ status: "forwarded" })
          .where(eq(weeklySummaryReportsTable.id, id))
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "weekly_report",
        sourceTable: "weekly_summary_reports",
        title: (r) => r.title,
        href: (r) => `/weekly-reports/${r.id}`,
      },
    });
  } catch (e) {
    if (e instanceof MissingSourceRowError) {
      res.status(404).json({ error: "주간 보고서를 찾을 수 없습니다" });
      return;
    }
    throw e;
  }

  if (!row) {
    res.status(404).json({ error: "주간 보고서를 찾을 수 없습니다" });
    return;
  }

  await insertNotification({
    recipientType: "role:manager",
    notificationType: "weekly_report_forwarded",
    title: "주간 보고서 전달",
    message: `${row.authorName}님이 주간 보고서를 전달했습니다: ${row.title}`,
    relatedEntityType: "weekly_report",
    relatedEntityId: row.id,
  });

  res.json(serializeWeekly(row));
});

router.get("/monthly-summary-reports", requireRole("manager", "platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  const month = req.query.month as string | undefined;
  const buildingIdParam = req.query.buildingId as string | undefined;

  // [Task #596] hq_executive 는 매핑된 건물의 월간 보고서만 가시.
  //   platform_admin 만 무제한, 매니저는 본인 건물.
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) {
    res.json([]);
    return;
  }

  let rows = await db.select().from(monthlySummaryReportsTable).orderBy(desc(monthlySummaryReportsTable.createdAt));

  if (!scope.unrestricted) {
    const allowed = new Set(scope.ids);
    rows = rows.filter((r) => r.buildingId != null && allowed.has(r.buildingId));
  }

  if (buildingIdParam) {
    const bid = parseInt(buildingIdParam);
    if (!Number.isInteger(bid) || bid <= 0) {
      res.status(400).json({ error: "잘못된 건물 ID입니다" });
      return;
    }
    if (!scope.unrestricted && !scope.ids.includes(bid)) {
      res.json([]);
      return;
    }
    rows = rows.filter((r) => r.buildingId === bid);
  }

  if (month) {
    rows = rows.filter((r) => r.reportMonth === month);
  }

  res.json(rows.map(serializeMonthly));
});

router.post("/monthly-summary-reports", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const user = req.user!;
  const { reportMonth } = req.body;

  if (!reportMonth) {
    res.status(400).json({ error: "보고 월을 입력해주세요" });
    return;
  }

  const userRow = await db.select().from(usersTable).where(eq(usersTable.id, user.userId)).then(r => r[0]);
  const userName = userRow?.name ?? user.username ?? user.email ?? `사용자#${user.userId}`;
  const buildingId = userRow?.buildingId ?? null;

  if (!buildingId) {
    res.status(400).json({ error: "건물이 등록되지 않은 사용자는 월간보고서를 생성할 수 없습니다" });
    return;
  }

  const weeklyReports = await db.select().from(weeklySummaryReportsTable);
  const monthWeeklyReports = weeklyReports.filter(
    (r) => r.weekStart.startsWith(reportMonth)
  );

  const totalDailyCount = monthWeeklyReports.reduce((s, r) => s + r.totalDailyReports, 0);

  const monthStart = `${reportMonth}-01`;
  const monthEndDate = new Date(parseInt(reportMonth.split("-")[0]), parseInt(reportMonth.split("-")[1]), 0);
  const monthEnd = monthEndDate.toISOString().split("T")[0];

  const monthInspections = await db.select().from(inspectionsTable);
  const monthInspDue = monthInspections.filter(
    (i) => i.nextDueDate >= monthStart && i.nextDueDate <= monthEnd
  );
  const monthLogs = await db.select().from(inspectionLogsTable);
  const monthInspLogs = monthLogs.filter(
    (l) => l.inspectionDate >= monthStart && l.inspectionDate <= monthEnd
  );

  let inspSummary = "";
  if (monthInspDue.length > 0 || monthInspLogs.length > 0) {
    inspSummary = `\n\n■ 월간 점검 현황\n  완료: ${monthInspLogs.length}건, 예정: ${monthInspDue.length}건`;
    if (monthInspLogs.length > 0) {
      const resultCounts: Record<string, number> = {};
      for (const l of monthInspLogs) {
        resultCounts[l.result] = (resultCounts[l.result] || 0) + 1;
      }
      inspSummary += `\n  결과: ${Object.entries(resultCounts).map(([r, c]) => `${r} ${c}건`).join(", ")}`;
    }
  }

  let acctData: { totalBilled: number; totalCollected: number; collectionRate: number; unpaidAmount: number; unpaidCount: number; momChangePct: number | null; occupantCardCount: number; vehicleCardCount: number; unitCount: number } | null = null;

  if (buildingId) {
    const buildingUnits = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
    const unitIds = new Set(buildingUnits.map(u => u.id));
    const unitCount = buildingUnits.length;

    const allBilling = await db.select().from(monthlyPaymentsTable).where(eq(monthlyPaymentsTable.billingMonth, reportMonth));
    const billingRecords = allBilling.filter(r => unitIds.has(r.unitId));

    let totalBilled = 0, totalCollected = 0, unpaidCount = 0, unpaidAmount = 0;
    if (billingRecords.length > 0) {
      totalBilled = billingRecords.reduce((s, r) => s + r.totalAmount, 0);
      totalCollected = billingRecords.reduce((s, r) => s + r.paidAmount, 0);
      unpaidCount = billingRecords.filter(r => !r.isPaid).length;
      unpaidAmount = Math.round(totalBilled - totalCollected);
    }
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : 0;

    const prevMonthDate = new Date(parseInt(reportMonth.split("-")[0]), parseInt(reportMonth.split("-")[1]) - 2, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const allPrevBilling = await db.select().from(monthlyPaymentsTable).where(eq(monthlyPaymentsTable.billingMonth, prevMonth));
    const prevBillingRecords = allPrevBilling.filter(r => unitIds.has(r.unitId));

    let momChangePct: number | null = null;
    if (prevBillingRecords.length > 0) {
      const prevTotal = prevBillingRecords.reduce((s, r) => s + r.totalAmount, 0);
      if (prevTotal > 0) {
        momChangePct = Math.round(((totalBilled - prevTotal) / prevTotal) * 1000) / 10;
      }
    }

    const allTenants = await db.select().from(tenantsTable);
    const occupantCardCount = allTenants.filter(t => t.unitId && unitIds.has(t.unitId) && t.status === "active").length;
    const allVehicles = await db.select().from(vehiclesTable);
    const vehicleCardCount = allVehicles.filter(v => v.buildingId === buildingId && v.status === "registered").length;

    acctData = { totalBilled, totalCollected, collectionRate, unpaidAmount, unpaidCount, momChangePct, occupantCardCount, vehicleCardCount, unitCount };
  }

  let accountingSummary = "";
  if (acctData && acctData.totalBilled > 0) {
    const paidCount = acctData.unitCount - acctData.unpaidCount;
    let momChange = "";
    if (acctData.momChangePct !== null) {
      const arrow = acctData.momChangePct > 0 ? "▲" : acctData.momChangePct < 0 ? "▼" : "→";
      momChange = `\n  전월 대비: ${arrow} ${acctData.momChangePct > 0 ? "+" : ""}${acctData.momChangePct}%`;
    }
    accountingSummary = `\n\n■ 회계 현황\n  부과 총액: ₩${Math.round(acctData.totalBilled).toLocaleString()}\n  수납 총액: ₩${Math.round(acctData.totalCollected).toLocaleString()}\n  수납률: ${acctData.collectionRate}% (${paidCount}/${acctData.unitCount}세대)\n  미납 세대: ${acctData.unpaidCount}세대 (₩${acctData.unpaidAmount.toLocaleString()})${momChange}`;
  }

  let kpiSummary = "";
  if (acctData) {
    kpiSummary = `\n\n■ 현황 지표\n  입주자카드 작성: ${acctData.occupantCardCount}/${acctData.unitCount}세대\n  차량 등록: ${acctData.vehicleCardCount}대`;
  }

  const summary = `월간 보고 요약 (${reportMonth})\n\n총 ${monthWeeklyReports.length}건의 주간 보고서\n총 ${totalDailyCount}건의 일간 보고서 집계\n\n${monthWeeklyReports.map((wr) => `- ${wr.title} (일간 보고 ${wr.totalDailyReports}건)`).join("\n")}${inspSummary}${accountingSummary}${kpiSummary}`;

  // [Task #610] 2층 단일 통로 — 월보 commit + documents upsert 헬퍼 위임.
  // [Task #610] 명명 SoT — buildDocumentName('monthly_report') 적용.
  const monthlyNaming = buildDocumentName({ kind: "monthly_report", date: monthStart });
  let row: typeof monthlySummaryReportsTable.$inferSelect;
  try {
    row = await saveProducingDocument({
      write: (exec) =>
        exec
          .insert(monthlySummaryReportsTable)
          .values({
            reportMonth,
            buildingId,
            title: monthlyNaming.title,
            summary,
            weeklyReportIds: JSON.stringify(monthWeeklyReports.map((wr) => wr.id)),
            totalWeeklyReports: monthWeeklyReports.length,
            totalBilled: acctData?.totalBilled ?? null,
            totalCollected: acctData?.totalCollected ?? null,
            collectionRate: acctData?.collectionRate ?? null,
            unpaidAmount: acctData?.unpaidAmount ?? null,
            unpaidUnits: acctData?.unpaidCount ?? null,
            occupantCardCount: acctData?.occupantCardCount ?? null,
            totalUnits: acctData?.unitCount ?? null,
            vehicleCardCount: acctData?.vehicleCardCount ?? null,
            momChangePct: acctData?.momChangePct ?? null,
            authorId: user.userId,
            authorName: userName,
            status: "draft",
          })
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "monthly_report",
        sourceTable: "monthly_summary_reports",
        state: "draft",
        title: `월간 보고서 (${reportMonth})`,
        authorId: user.userId,
        authorRole: "manager",
        buildingId,
        periodStart: monthStart,
        periodEnd: monthEnd,
        href: (r) => `/report-system?monthly=${r.id}`,
        metadata: { reportMonth, totalDailyCount },
      },
    });
  } catch (err) {
    req.log.error({ err }, "[Task #610] monthly saveProducingDocument failed");
    res.status(500).json({ error: "월간 보고서 저장 실패" });
    return;
  }

  res.status(201).json(serializeMonthly(row));
});

export default router;
