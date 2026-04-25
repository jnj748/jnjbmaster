import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  vendorReviewsTable,
  workReportsTable,
  vendorsTable,
  buildingsTable,
  usersTable,
} from "@workspace/db";
import {
  GetWorkReportReviewParams,
  GetWorkReportReviewResponse,
  ListVendorReviewsParams,
  ListVendorReviewsQueryParams,
  ListVendorReviewsResponse,
  CreateVendorReviewBody,
  UpdateVendorReviewParams,
  UpdateVendorReviewBody,
  UpdateVendorReviewResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Editing window for an existing review (Task #339: 7일 이내 수정 가능).
const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function withinEditWindow(createdAt: Date | string): boolean {
  const t = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  return Date.now() - t <= EDIT_WINDOW_MS;
}

// Refresh `vendors.rating` cache to the average of all reviews for the vendor.
async function refreshVendorAverage(vendorId: number): Promise<void> {
  const [agg] = await db
    .select({
      avg: sql<number | null>`avg(${vendorReviewsTable.rating})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(vendorReviewsTable)
    .where(eq(vendorReviewsTable.vendorId, vendorId));
  const avg = agg?.count > 0 ? agg.avg : null;
  await db.update(vendorsTable).set({ rating: avg }).where(eq(vendorsTable.id, vendorId));
}

// ── GET /work-reports/{id}/review ──────────────────────────
// Used by the approval modal to switch into edit mode if a review already exists.
router.get(
  "/work-reports/:id/review",
  requireRole("manager", "platform_admin", "hq_executive", "accountant"),
  async (req, res): Promise<void> => {
    const params = GetWorkReportReviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // [Task #339 보안] 매니저는 본인 건물 보고만 조회 가능.
    // platform_admin / hq_executive / accountant 는 전사 범위를 갖는다.
    const [report] = await db
      .select({ id: workReportsTable.id, buildingId: workReportsTable.buildingId })
      .from(workReportsTable)
      .where(eq(workReportsTable.id, params.data.id));
    if (!report) {
      res.status(404).json({ error: "작업완료보고를 찾을 수 없습니다" });
      return;
    }
    if (req.user?.role === "manager") {
      const [u] = await db
        .select({ buildingId: usersTable.buildingId })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.userId));
      if (!u?.buildingId || u.buildingId !== report.buildingId) {
        res.status(403).json({ error: "본인 건물의 평가만 조회할 수 있습니다" });
        return;
      }
    }

    const [existing] = await db
      .select()
      .from(vendorReviewsTable)
      .where(eq(vendorReviewsTable.workReportId, params.data.id));
    if (!existing) {
      res.json(GetWorkReportReviewResponse.parse({ review: null, canEdit: true }));
      return;
    }
    res.json(
      GetWorkReportReviewResponse.parse({
        review: existing,
        canEdit: withinEditWindow(existing.createdAt),
      }),
    );
  },
);

// ── GET /vendors/{id}/reviews ──────────────────────────────
router.get(
  "/vendors/:id/reviews",
  requireRole("manager", "platform_admin", "hq_executive", "accountant", "partner"),
  async (req, res): Promise<void> => {
    const path = ListVendorReviewsParams.safeParse(req.params);
    const query = ListVendorReviewsQueryParams.safeParse(req.query);
    if (!path.success) {
      res.status(400).json({ error: path.error.message });
      return;
    }
    const limit = query.success ? query.data.limit : 20;
    const offset = query.success ? query.data.offset : 0;

    // [Task #339 보안] partner 는 본인 vendor 평가만 조회 가능 (IDOR 차단).
    if (req.user?.role === "partner") {
      const [u] = await db
        .select({ vendorId: usersTable.vendorId })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.userId));
      if (!u?.vendorId || u.vendorId !== path.data.id) {
        res.status(403).json({ error: "본인 업체의 평가만 조회할 수 있습니다" });
        return;
      }
    }

    const rows = await db
      .select({
        id: vendorReviewsTable.id,
        vendorId: vendorReviewsTable.vendorId,
        workReportId: vendorReviewsTable.workReportId,
        rfqId: vendorReviewsTable.rfqId,
        quoteId: vendorReviewsTable.quoteId,
        buildingId: vendorReviewsTable.buildingId,
        reviewerUserId: vendorReviewsTable.reviewerUserId,
        rating: vendorReviewsTable.rating,
        comment: vendorReviewsTable.comment,
        createdAt: vendorReviewsTable.createdAt,
        updatedAt: vendorReviewsTable.updatedAt,
        buildingName: buildingsTable.name,
        workReportTitle: workReportsTable.title,
        reviewerName: usersTable.name,
      })
      .from(vendorReviewsTable)
      .leftJoin(buildingsTable, eq(buildingsTable.id, vendorReviewsTable.buildingId))
      .leftJoin(workReportsTable, eq(workReportsTable.id, vendorReviewsTable.workReportId))
      .leftJoin(usersTable, eq(usersTable.id, vendorReviewsTable.reviewerUserId))
      .where(eq(vendorReviewsTable.vendorId, path.data.id))
      .orderBy(desc(vendorReviewsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(ListVendorReviewsResponse.parse(rows));
  },
);

// ── POST /vendor-reviews ───────────────────────────────────
router.post(
  "/vendor-reviews",
  requireRole("manager", "platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateVendorReviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // 0.5 단위 강제.
    if (Math.round(parsed.data.rating * 2) !== parsed.data.rating * 2) {
      res.status(400).json({ error: "별점은 0.5 단위로만 입력할 수 있습니다" });
      return;
    }

    // 작업완료보고가 존재하고, 승인 상태인지 확인.
    const [report] = await db
      .select()
      .from(workReportsTable)
      .where(eq(workReportsTable.id, parsed.data.workReportId));
    if (!report) {
      res.status(404).json({ error: "작업완료보고를 찾을 수 없습니다" });
      return;
    }
    if (report.status !== "approved") {
      res.status(400).json({ error: "승인된 작업완료보고에 대해서만 평가를 등록할 수 있습니다" });
      return;
    }

    // [Task #339] 검수자(승인자) 본인만 별점·한줄평을 등록할 수 있다.
    // - reviewer_user_id 가 기록되어 있으면 호출자와 일치해야 한다.
    // - reviewer_user_id 가 없는 과거 데이터(마이그레이션 이전 승인된 보고)는
    //   매니저의 건물 범위 검증으로 fallback 한다.
    // platform_admin 은 운영 권한으로 우회 가능하다.
    if (req.user?.role !== "platform_admin") {
      if (report.reviewerUserId != null) {
        if (report.reviewerUserId !== req.user?.userId) {
          res.status(403).json({ error: "검수를 승인한 담당자만 평가를 남길 수 있습니다" });
          return;
        }
      } else {
        // Legacy fallback: 매니저의 본인 건물 범위로 권한 확인.
        const [user] = await db
          .select({ buildingId: usersTable.buildingId })
          .from(usersTable)
          .where(eq(usersTable.id, req.user!.userId));
        if (!user?.buildingId || user.buildingId !== report.buildingId) {
          res.status(403).json({ error: "본인 건물의 작업에 대해서만 평가를 남길 수 있습니다" });
          return;
        }
      }
    }

    // 중복 평가 방지(uniq index 가 있지만 친절한 메시지를 위해 사전 체크).
    const [existing] = await db
      .select()
      .from(vendorReviewsTable)
      .where(eq(vendorReviewsTable.workReportId, parsed.data.workReportId));
    if (existing) {
      res.status(409).json({ error: "이미 평가가 등록된 보고입니다", reviewId: existing.id });
      return;
    }

    const [created] = await db
      .insert(vendorReviewsTable)
      .values({
        vendorId: report.vendorId,
        workReportId: report.id,
        rfqId: report.rfqId,
        quoteId: report.quoteId,
        buildingId: report.buildingId,
        reviewerUserId: req.user?.userId ?? null,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
      })
      .returning();

    await refreshVendorAverage(report.vendorId);

    res.status(201).json(UpdateVendorReviewResponse.parse(created));
  },
);

// ── PATCH /vendor-reviews/{id} ─────────────────────────────
router.patch(
  "/vendor-reviews/:id",
  requireRole("manager", "platform_admin"),
  async (req, res): Promise<void> => {
    const path = UpdateVendorReviewParams.safeParse(req.params);
    if (!path.success) {
      res.status(400).json({ error: path.error.message });
      return;
    }
    const parsed = UpdateVendorReviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (
      parsed.data.rating !== undefined &&
      Math.round(parsed.data.rating * 2) !== parsed.data.rating * 2
    ) {
      res.status(400).json({ error: "별점은 0.5 단위로만 입력할 수 있습니다" });
      return;
    }

    const [existing] = await db
      .select()
      .from(vendorReviewsTable)
      .where(eq(vendorReviewsTable.id, path.data.id));
    if (!existing) {
      res.status(404).json({ error: "평가를 찾을 수 없습니다" });
      return;
    }

    // 작성자 본인만 수정 가능(platform_admin 은 패스).
    if (
      req.user?.role !== "platform_admin" &&
      existing.reviewerUserId !== req.user?.userId
    ) {
      res.status(403).json({ error: "본인이 작성한 평가만 수정할 수 있습니다" });
      return;
    }

    if (!withinEditWindow(existing.createdAt)) {
      res.status(403).json({ error: "작성 7일이 지난 평가는 수정할 수 없습니다" });
      return;
    }

    const update: { rating?: number; comment?: string | null } = {};
    if (parsed.data.rating !== undefined) update.rating = parsed.data.rating;
    if (parsed.data.comment !== undefined) update.comment = parsed.data.comment ?? null;

    const [updated] = await db
      .update(vendorReviewsTable)
      .set(update)
      .where(eq(vendorReviewsTable.id, path.data.id))
      .returning();

    if (update.rating !== undefined) {
      await refreshVendorAverage(existing.vendorId);
    }

    res.json(UpdateVendorReviewResponse.parse(updated));
  },
);

export default router;
