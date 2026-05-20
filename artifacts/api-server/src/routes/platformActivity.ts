// [Task 사장님요청] 본사(platform_admin) 의 "관리소장 현황 / 파트너사 현황"
//   화면에서 각 사용자의 최근 활동(일지/주보/월보/견적/공고문사용 또는 견적제출)
//   과 30일 이용도를 조회하기 위한 집계 엔드포인트.
//
//   가시성 정책 (사장님 결정):
//   - GET /api/platform/role-activity?role=manager|partner
//   - platform_admin 전용 (본사 익명 요약 모니터링). 다른 역할은 403.
//   - 새 producing 테이블 없음 — 기존 작업기록 테이블에서 읽기 전용 집계.
//
//   집계 대상:
//   - manager: daily_journals(author_id) + weekly_summary_reports(author_id)
//     + monthly_summary_reports(author_id) + notice_outputs(author_id)
//     + rfqs(building_id ↔ user.buildingId, rfqs 는 author 컬럼이 없어 건물로 귀속)
//   - partner: quotes(vendor_id ↔ user.vendorId) — rfq 제목 조인.
import { Router, type IRouter } from "express";
import { and, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  buildingsTable,
  dailyJournalsTable,
  weeklySummaryReportsTable,
  monthlySummaryReportsTable,
  noticeOutputsTable,
  rfqsTable,
  quotesTable,
  vendorsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const ACTION_TYPES_MANAGER = [
  "journal",
  "weekly",
  "monthly",
  "rfq",
  "noticeOutput",
] as const;
const ACTION_TYPES_PARTNER = ["quote"] as const;

type ManagerActionType = (typeof ACTION_TYPES_MANAGER)[number];
type PartnerActionType = (typeof ACTION_TYPES_PARTNER)[number];

interface ActionRecord {
  type: ManagerActionType | PartnerActionType;
  occurredAt: string;
  title: string;
}

interface UserActivityRow {
  userId: number;
  name: string;
  email: string | null;
  username: string | null;
  buildingId: number | null;
  buildingName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  totalCount30d: number;
  lastActionAt: string | null;
  breakdown: Record<string, number>;
  recentActions: ActionRecord[];
}

function isoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

router.get(
  "/platform/role-activity",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const role = String(req.query.role ?? "");
    if (role !== "manager" && role !== "partner") {
      res.status(400).json({ error: "role must be 'manager' or 'partner'" });
      return;
    }

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // 1) 대상 사용자 목록.
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        username: usersTable.username,
        buildingId: usersTable.buildingId,
        vendorId: usersTable.vendorId,
      })
      .from(usersTable)
      .where(eq(usersTable.role, role));

    if (users.length === 0) {
      res.json([]);
      return;
    }

    const userIds = users.map((u) => u.id);
    const buildingIds = Array.from(
      new Set(
        users
          .map((u) => u.buildingId)
          .filter((b): b is number => typeof b === "number"),
      ),
    );
    const vendorIds = Array.from(
      new Set(
        users
          .map((u) => u.vendorId)
          .filter((v): v is number => typeof v === "number"),
      ),
    );

    // 2) 건물명 / 벤더명 조회.
    const buildings = buildingIds.length
      ? await db
          .select({ id: buildingsTable.id, name: buildingsTable.name })
          .from(buildingsTable)
          .where(inArray(buildingsTable.id, buildingIds))
      : [];
    const buildingNameById = new Map(buildings.map((b) => [b.id, b.name]));

    const vendors = vendorIds.length
      ? await db
          .select({ id: vendorsTable.id, name: vendorsTable.name })
          .from(vendorsTable)
          .where(inArray(vendorsTable.id, vendorIds))
      : [];
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));

    // 행 초기화.
    const rowByUserId = new Map<number, UserActivityRow>();
    for (const u of users) {
      rowByUserId.set(u.id, {
        userId: u.id,
        name: u.name,
        email: u.email ?? null,
        username: u.username ?? null,
        buildingId: u.buildingId ?? null,
        buildingName:
          u.buildingId != null
            ? buildingNameById.get(u.buildingId) ?? null
            : null,
        vendorId: u.vendorId ?? null,
        vendorName:
          u.vendorId != null ? vendorNameById.get(u.vendorId) ?? null : null,
        totalCount30d: 0,
        lastActionAt: null,
        breakdown: {},
        recentActions: [],
      });
    }

    function push(
      userId: number,
      type: ManagerActionType | PartnerActionType,
      occurredAt: Date | string | null | undefined,
      title: string,
    ) {
      const row = rowByUserId.get(userId);
      if (!row) return;
      const iso = isoOrNull(occurredAt);
      if (!iso) return;
      const ts = new Date(iso).getTime();
      if (ts >= since30.getTime()) {
        row.totalCount30d += 1;
        row.breakdown[type] = (row.breakdown[type] ?? 0) + 1;
      }
      if (!row.lastActionAt || new Date(row.lastActionAt).getTime() < ts) {
        row.lastActionAt = iso;
      }
      row.recentActions.push({ type, occurredAt: iso, title });
    }

    if (role === "manager") {
      // 일지
      const journals = await db
        .select({
          authorId: dailyJournalsTable.authorId,
          createdAt: dailyJournalsTable.createdAt,
          journalDate: dailyJournalsTable.journalDate,
          roleCol: dailyJournalsTable.role,
        })
        .from(dailyJournalsTable)
        .where(
          and(
            inArray(dailyJournalsTable.authorId, userIds),
            gte(dailyJournalsTable.createdAt, since90),
          ),
        );
      for (const r of journals) {
        push(
          r.authorId,
          "journal",
          r.createdAt,
          `일지 (${r.journalDate})`,
        );
      }

      // 주보
      const weekly = await db
        .select({
          authorId: weeklySummaryReportsTable.authorId,
          createdAt: weeklySummaryReportsTable.createdAt,
          title: weeklySummaryReportsTable.title,
        })
        .from(weeklySummaryReportsTable)
        .where(
          and(
            inArray(weeklySummaryReportsTable.authorId, userIds),
            gte(weeklySummaryReportsTable.createdAt, since90),
          ),
        );
      for (const r of weekly) {
        push(r.authorId, "weekly", r.createdAt, `주보 — ${r.title}`);
      }

      // 월보
      const monthly = await db
        .select({
          authorId: monthlySummaryReportsTable.authorId,
          createdAt: monthlySummaryReportsTable.createdAt,
          title: monthlySummaryReportsTable.title,
        })
        .from(monthlySummaryReportsTable)
        .where(
          and(
            inArray(monthlySummaryReportsTable.authorId, userIds),
            gte(monthlySummaryReportsTable.createdAt, since90),
          ),
        );
      for (const r of monthly) {
        push(r.authorId, "monthly", r.createdAt, `월보 — ${r.title}`);
      }

      // 공고문 사용 (notice_outputs)
      const notices = await db
        .select({
          authorId: noticeOutputsTable.authorId,
          createdAt: noticeOutputsTable.createdAt,
          title: noticeOutputsTable.title,
        })
        .from(noticeOutputsTable)
        .where(
          and(
            inArray(noticeOutputsTable.authorId, userIds),
            gte(noticeOutputsTable.createdAt, since90),
          ),
        );
      for (const r of notices) {
        push(r.authorId, "noticeOutput", r.createdAt, `공고문 — ${r.title}`);
      }

      // 견적 (rfqs) — 작성자 컬럼이 없어 건물로 귀속한다.
      //   같은 건물에 manager 가 N명이면 동일 RFQ 가 N명에게 모두 카운트된다
      //   (가입 직후 활성도 체크가 목적이므로 보수적으로 모두 인정).
      if (buildingIds.length > 0) {
        const rfqs = await db
          .select({
            buildingId: rfqsTable.buildingId,
            createdAt: rfqsTable.createdAt,
            title: rfqsTable.title,
          })
          .from(rfqsTable)
          .where(
            and(
              inArray(rfqsTable.buildingId, buildingIds),
              gte(rfqsTable.createdAt, since90),
            ),
          );
        // building → managers map
        const managersByBuilding = new Map<number, number[]>();
        for (const u of users) {
          if (u.buildingId == null) continue;
          const arr = managersByBuilding.get(u.buildingId) ?? [];
          arr.push(u.id);
          managersByBuilding.set(u.buildingId, arr);
        }
        for (const r of rfqs) {
          if (r.buildingId == null) continue;
          const targets = managersByBuilding.get(r.buildingId) ?? [];
          for (const uid of targets) {
            push(uid, "rfq", r.createdAt, `견적 요청 — ${r.title}`);
          }
        }
      }
    } else {
      // partner: quotes (vendor_id 기준) + rfq 제목 조인.
      if (vendorIds.length > 0) {
        const quoteRows = await db
          .select({
            vendorId: quotesTable.vendorId,
            createdAt: quotesTable.createdAt,
            rfqId: quotesTable.rfqId,
            totalAmount: quotesTable.totalAmount,
          })
          .from(quotesTable)
          .where(
            and(
              inArray(quotesTable.vendorId, vendorIds),
              gte(quotesTable.createdAt, since90),
            ),
          );
        const neededRfqIds = Array.from(
          new Set(quoteRows.map((q) => q.rfqId)),
        );
        const rfqRows = neededRfqIds.length
          ? await db
              .select({ id: rfqsTable.id, title: rfqsTable.title })
              .from(rfqsTable)
              .where(inArray(rfqsTable.id, neededRfqIds))
          : [];
        const rfqTitleById = new Map(rfqRows.map((r) => [r.id, r.title]));

        // vendor → user 매핑 (한 vendor 에 여러 user 가 묶일 수 있음).
        const usersByVendor = new Map<number, number[]>();
        for (const u of users) {
          if (u.vendorId == null) continue;
          const arr = usersByVendor.get(u.vendorId) ?? [];
          arr.push(u.id);
          usersByVendor.set(u.vendorId, arr);
        }
        for (const q of quoteRows) {
          const title = rfqTitleById.get(q.rfqId) ?? `RFQ #${q.rfqId}`;
          const targets = usersByVendor.get(q.vendorId) ?? [];
          for (const uid of targets) {
            push(uid, "quote", q.createdAt, `견적 제출 — ${title}`);
          }
        }
      }
    }

    // 정렬 & 상위 5건 자르기.
    const out: UserActivityRow[] = [];
    for (const row of rowByUserId.values()) {
      row.recentActions.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
      row.recentActions = row.recentActions.slice(0, 5);
      out.push(row);
    }
    // 활성도 높은 순 + 최근 액션 최신순.
    out.sort((a, b) => {
      if (b.totalCount30d !== a.totalCount30d)
        return b.totalCount30d - a.totalCount30d;
      const ta = a.lastActionAt ? new Date(a.lastActionAt).getTime() : 0;
      const tb = b.lastActionAt ? new Date(b.lastActionAt).getTime() : 0;
      return tb - ta;
    });

    res.json(out);
  },
);

export default router;
