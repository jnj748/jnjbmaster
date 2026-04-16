import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, dailyReportsTable, weeklySummaryReportsTable, monthlySummaryReportsTable, usersTable, notificationsTable, inspectionsTable, inspectionLogsTable, monthlyPaymentsTable, unitsTable, tenantsTable, vehiclesTable, buildingsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

async function linkDailyToWeekly(row: typeof dailyReportsTable.$inferSelect, userId: number, userEmail: string): Promise<void> {
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
    await db.insert(weeklySummaryReportsTable).values({
      title: `${weekStart} 주간 보고 (자동 생성)`,
      weekStart,
      weekEnd,
      summary: `■ 금주 업무 내용\n${entryLine}`,
      totalDailyReports: 1,
      dailyReportIds: String(row.id),
      authorId: managerUser?.id ?? userId,
      authorName: managerUser?.name ?? userEmail,
      status: "draft",
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
    .then((rows) => rows[0]?.name ?? user.email);

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

  await db.insert(notificationsTable).values({
    recipientType: "role:manager",
    notificationType: "daily_report_submitted",
    title: "일간 보고서 제출",
    message: `${userName}님이 일간 보고서를 제출했습니다: ${title}`,
    relatedEntityType: "daily_report",
    relatedEntityId: row.id,
  });

  await linkDailyToWeekly(row, user.userId, user.email);

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

  await db.insert(notificationsTable).values({
    recipientType: "role:manager",
    notificationType: "daily_report_submitted",
    title: "일간 보고서 제출",
    message: `${row.authorName}님이 일간 보고서를 제출했습니다: ${row.title}`,
    relatedEntityType: "daily_report",
    relatedEntityId: row.id,
  });

  await linkDailyToWeekly(row, user.userId, user.email);

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
    .then((rows) => rows[0]?.name ?? user.email);

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
    .then((rows) => rows[0]?.name ?? user.email);

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

  const summary = `주간 보고 요약 (${weekStart} ~ ${weekEnd})\n\n총 ${weekDailyReports.length}건의 일간 보고서\n${summaryParts.join("\n")}\n\n${weekDailyReports.map((dr) => `- [${dr.reportDate}] ${dr.title}`).join("\n")}${inspectionSection}`;

  const [row] = await db
    .insert(weeklySummaryReportsTable)
    .values({
      weekStart,
      weekEnd,
      title: `주간 보고서 (${weekStart} ~ ${weekEnd})`,
      summary,
      dailyReportIds: JSON.stringify(weekDailyReports.map((dr) => dr.id)),
      totalDailyReports: weekDailyReports.length,
      authorId: user.userId,
      authorName: userName,
      status: "draft",
    })
    .returning();

  res.status(201).json(serializeWeekly(row));
});

router.post("/weekly-summary-reports/:id/forward", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  const [row] = await db
    .update(weeklySummaryReportsTable)
    .set({ status: "forwarded" })
    .where(eq(weeklySummaryReportsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "주간 보고서를 찾을 수 없습니다" });
    return;
  }

  await db.insert(notificationsTable).values({
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
  const user = req.user!;
  const month = req.query.month as string | undefined;
  const buildingIdParam = req.query.buildingId as string | undefined;

  const userRow = await db.select().from(usersTable).where(eq(usersTable.id, user.userId)).then(r => r[0]);
  const isHqOrAdmin = userRow?.role === "hq_executive" || userRow?.role === "platform_admin";

  let rows = await db.select().from(monthlySummaryReportsTable).orderBy(desc(monthlySummaryReportsTable.createdAt));

  if (!isHqOrAdmin && userRow?.buildingId) {
    rows = rows.filter((r) => r.buildingId === userRow.buildingId);
  } else if (buildingIdParam) {
    const bid = parseInt(buildingIdParam);
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
  const userName = userRow?.name ?? user.email;
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

  const [row] = await db
    .insert(monthlySummaryReportsTable)
    .values({
      reportMonth,
      buildingId,
      title: `월간 보고서 (${reportMonth})`,
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
    .returning();

  res.status(201).json(serializeMonthly(row));
});

export default router;
