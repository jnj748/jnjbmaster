// [Task #496] buildings 라우터 분리 — 법정 점검 자동 일정 / 임박 현황 / 선임자 조회 핸들러.
//   원본 routes/buildings.ts 의 POST /buildings/auto-schedule-inspections,
//   GET /buildings/legal-inspections-summary, GET /buildings/legal-appointees 와
//   getCyclemonthsForCategory / calculateNextDue 헬퍼를 그대로 옮긴다.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  buildingsTable,
  usersTable,
  inspectionsTable,
  legalAppointeesTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
// [역할 라벨 SoT] 한국어 역할 라벨은 단일 소스에서 가져온다.
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { walkForwardNextDue } from "../../lib/taskTemplateCycle";
import { LEGAL_PRESETS } from "../../domain/statutory";
import { canAccessBuilding, getAccessibleBuildingIds } from "../../middlewares/buildingScope";

const router: IRouter = Router();

router.post("/buildings/auto-schedule-inspections", async (req: Request, res: Response) => {
  const { buildingId, inspectionDates, useFallbackCompletionDate } = req.body;

  if (!buildingId || !inspectionDates || typeof inspectionDates !== "object") {
    res.status(400).json({ error: "buildingId와 inspectionDates가 필요합니다" });
    return;
  }

  // [Task #174] 권한 검증: 본인 건물이거나 본사/플랫폼만 호출 가능.
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "로그인이 필요합니다" });
    return;
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  // [Task #596] hq_executive 는 매핑된 건물에 한해 허용. platform_admin 은 전 건물.
  if (!user || !(await canAccessBuilding(req, buildingId))) {
    res.status(403).json({ error: "해당 건물에 대한 권한이 없습니다" });
    return;
  }

  // [Task #132/#174/#297] 사용자가 최종 점검일을 모르는 경우 표제부 사용승인일
  //   (approvalDate) 을 baseline 으로 다음 실행일을 자동 산정한다.
  //   approvalDate 가 비어 있을 때만 기존 completionDate 폴백을 사용한다.
  //   #174: 항목별 폴백 여부를 기록해 임시 일정에 [임시] 워터마크 표시.
  let fallbackBaseline: Date | null = null;
  let totalAreaNum = 0;
  if (useFallbackCompletionDate) {
    const [bld] = await db.select({
      approvalDate: buildingsTable.approvalDate,
      completionDate: buildingsTable.completionDate,
      totalArea: buildingsTable.totalArea,
    })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));
    const raw = bld?.approvalDate ?? bld?.completionDate;
    if (raw) {
      fallbackBaseline = typeof raw === "string"
        ? new Date(raw)
        : new Date(raw as unknown as string | number | Date);
    }
    totalAreaNum = Number(bld?.totalArea ?? 0);
  }
  const fallbackLastDate: string | null = fallbackBaseline
    ? fallbackBaseline.toISOString().slice(0, 10)
    : null;

  try {
    const created: Array<Record<string, unknown>> = [];

    for (const [category, dates] of Object.entries(inspectionDates)) {
      if (!dates || typeof dates !== "object") continue;
      const dateEntries = dates as Record<string, string>;

      for (const [presetName, lastDateInput] of Object.entries(dateEntries)) {
        const isProvisional = !lastDateInput && !!fallbackBaseline;
        const lastDate = lastDateInput || fallbackLastDate;
        if (!lastDate) continue;

        const cycleMonths = getCyclemonthsForCategory(category, presetName);
        // [Task #174/#411] 건축물 정기점검 폴백: 준공 + 5년/10년이 첫 회차이며,
        // 그 이후로는 정상 주기(36개월)로 굴려서 현재 시점 이후의 다음 회차를 산정한다.
        let nextDueDate: string;
        const now = new Date();
        if (isProvisional && category === "building_safety") {
          const firstMonths = totalAreaNum >= 10000 ? 120 : 60;
          const firstDue = calculateNextDue(lastDate, firstMonths);
          // 1차 회차가 아직 미래면 그 일자, 이미 과거면 cycleMonths(36개월) 단위로 walk-forward.
          nextDueDate = new Date(firstDue) >= now
            ? firstDue
            : walkForwardNextDue(firstDue, cycleMonths, now);
        } else if (isProvisional && fallbackBaseline) {
          // [Task #297/#411] 폴백 분기: 표제부 사용승인일을 baseline 으로
          //   walk-forward 해 다음 실행일을 계산한다(매 주기 정상 이행 가정).
          nextDueDate = walkForwardNextDue(fallbackBaseline, cycleMonths, now);
        } else {
          // [Task #411] 일반 분기: 사용자가 입력한 lastDate 가 너무 오래되어
          //   lastDate + cycleMonths 가 이미 과거라면 walk-forward 해 다음 회차를
          //   미래로 보정한다. 마지막 점검일 자체는 walk-forward 하지 않으므로
          //   사용자가 별도로 점검을 입력하면 그 시점부터 정상 주기로 진행된다.
          nextDueDate = walkForwardNextDue(lastDate, cycleMonths, now);
        }

        const [inspection] = await db.insert(inspectionsTable).values({
          buildingId,
          name: presetName,
          category,
          inspectionType: "legal",
          frequencyPerYear: Math.ceil(12 / cycleMonths),
          legalCycleMonths: cycleMonths,
          lastInspectionDate: lastDate,
          nextDueDate,
          status: new Date(nextDueDate) < new Date() ? "overdue" : "upcoming",
          advanceAlertDays: 30,
          // [Task #502] 폴백 baseline 은 사용승인일(approvalDate) 우선이고
          //   approvalDate 가 비었을 때만 completionDate 가 사용되므로, 화면 카피와
          //   일치하도록 워터마크 문구를 "사용승인일 기준" 으로 통일한다.
          notes: isProvisional ? "[임시] 사용승인일 기준 자동 산정 — 실제 점검일이 확인되면 수정해 주세요." : null,
        }).returning();

        created.push(inspection);
      }
    }

    res.json({ created, count: created.length });
  } catch (error) {
    req.log.error({ err: error }, "Error auto-scheduling inspections");
    res.status(500).json({ error: "점검 일정 자동 생성 실패" });
  }
});

function getCyclemonthsForCategory(category: string, presetName: string): number {
  const preset = LEGAL_PRESETS.find(p => p.name === presetName);
  if (preset) return preset.legalCycleMonths;

  const categoryDefaults: Record<string, number> = {
    fire_safety: 12,
    electrical: 36,
    elevator: 12,
    water_tank: 6,
    septic: 12,
    hygiene: 12,
    building_safety: 6,
    gas: 12,
    playground: 24,
    mechanical: 12,
    telecom: 12,
    disinfection: 2,
  };

  return categoryDefaults[category] || 12;
}

function calculateNextDue(lastDate: string, cycleMonths: number): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + cycleMonths);
  return d.toISOString().split("T")[0];
}

// HQ 총괄: 건물별 법정점검 임박/초과 현황.
// 버킷: overdue (마감일 < 오늘, 미완료) / due7 (오늘~+7일) / due30 (+8~+30일)
router.get("/buildings/legal-inspections-summary", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user || (user.role !== "hq_executive" && user.role !== "platform_admin")) {
    res.status(403).json({ error: `${ROLE_LABELS.hq_executive} 전용입니다` });
    return;
  }

  try {
    // KST(Asia/Seoul) 기준 오늘 날짜로 버킷을 계산해야 자정 경계 오차가 없다.
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().split("T")[0];
    const d7 = new Date(kstNow); d7.setUTCDate(d7.getUTCDate() + 7);
    const d30 = new Date(kstNow); d30.setUTCDate(d30.getUTCDate() + 30);
    const d7Str = d7.toISOString().split("T")[0];
    const d30Str = d30.toISOString().split("T")[0];

    // [Task #596] hq_executive 는 매핑된 건물만, platform_admin 은 전 건물.
    //   매핑이 비어 있는 hq_executive 는 빈 summary 를 반환한다.
    const scope = await getAccessibleBuildingIds(req);
    if (!scope.unrestricted && scope.ids.length === 0) {
      res.json({ summaries: [] });
      return;
    }
    const buildings = scope.unrestricted
      ? await db.select({ id: buildingsTable.id, name: buildingsTable.name }).from(buildingsTable)
      : await db
          .select({ id: buildingsTable.id, name: buildingsTable.name })
          .from(buildingsTable)
          .where(inArray(buildingsTable.id, scope.ids));

    // 법정점검만 집계 (inspectionType='legal'). 완료된 건은 제외.
    const allLegal = await db
      .select()
      .from(inspectionsTable)
      .where(and(eq(inspectionsTable.inspectionType, "legal"), sql`${inspectionsTable.status} <> 'completed'`));

    type Bucket = { id: number; name: string; category: string; nextDueDate: string };
    const summaries = buildings.map((b) => {
      const items = allLegal.filter((i) => i.buildingId === b.id);
      const overdue: Bucket[] = [];
      const due7: Bucket[] = [];
      const due30: Bucket[] = [];
      for (const i of items) {
        if (!i.nextDueDate) continue;
        const due = i.nextDueDate;
        const bucket: Bucket = { id: i.id, name: i.name, category: i.category, nextDueDate: due };
        if (due < todayStr) overdue.push(bucket);
        else if (due <= d7Str) due7.push(bucket);
        else if (due <= d30Str) due30.push(bucket);
      }
      const sortByDue = (a: Bucket, b: Bucket) => a.nextDueDate.localeCompare(b.nextDueDate);
      overdue.sort(sortByDue);
      due7.sort(sortByDue);
      due30.sort(sortByDue);
      return {
        buildingId: b.id,
        buildingName: b.name,
        overdueCount: overdue.length,
        due7Count: due7.length,
        due30Count: due30.length,
        overdueItems: overdue,
        due7Items: due7,
        due30Items: due30,
      };
    });

    res.json({ summaries });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching HQ legal inspections summary");
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

router.get("/buildings/legal-appointees", async (req: Request, res: Response) => {
  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const queryBuildingId = req.query.buildingId ? Number(req.query.buildingId) : null;
    const buildingId = queryBuildingId ?? user.buildingId ?? null;

    if (!buildingId) {
      res.status(400).json({ error: "buildingId가 필요합니다" });
      return;
    }
    // [Task #596] hq_executive 는 매핑된 건물에 한해 허용. platform_admin 은 전 건물.
    if (!(await canAccessBuilding(req, buildingId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(legalAppointeesTable)
      .where(eq(legalAppointeesTable.buildingId, buildingId));

    const appointees: Record<string, { name: string; certificateNo: string | null; certificateExpiry: string | null } | null> = {
      electrical: null,
      fire_safety: null,
      mechanical: null,
      telecom: null,
    };
    for (const r of rows) {
      if (r.field in appointees) {
        appointees[r.field] = {
          name: r.name,
          certificateNo: r.certificateNo,
          certificateExpiry: r.certificateExpiry,
        };
      }
    }

    res.json({ buildingId, appointees });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching legal appointees");
    res.status(500).json({ error: "Failed to fetch appointees" });
  }
});

export default router;
