// [Task #773] 감사로그 조회 화면 — 플랫폼관리자/관리단장(=관리인)/본부장 권한.
//   필터: 건물·기간·액터·액션. CSV 내보내기 지원(직접 입력 없음 — 칩 필터만).

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { audit, requireAction } from "../middlewares/audit";
import { getAccessibleBuildingIds, buildingScopeFilter } from "../middlewares/buildingScope";

const router: IRouter = Router();

// [Task #773] 가시성 가드는 매트릭스 단일 출처로 — `audit_log.view` / `data.export`.
//   하드코딩 역할 셋을 두지 않아 정책 표류(code review #3) 를 막는다.
//   - platform_admin: 전체 감사 (unrestricted)
//   - hq_executive  : hq_building_assignments 매핑 건물만
//   - custodian     : 본인 소속 건물만 (관리단장 — 책임 추적용)
//   - 호출자가 ?buildingId= 로 다른 건물을 콕 지정해도 허용 집합과 교차하지 않으면 403.

function parseFilters(req: Request) {
  const q = req.query;
  const buildingId = q.buildingId ? Number(q.buildingId) : null;
  const actorId = q.actorId ? Number(q.actorId) : null;
  const actions = typeof q.action === "string" && q.action.length > 0 ? q.action.split(",") : null;
  const from = typeof q.from === "string" && q.from.length > 0 ? new Date(q.from) : null;
  const to = typeof q.to === "string" && q.to.length > 0 ? new Date(q.to) : null;
  const limit = Math.max(1, Math.min(500, Number(q.limit) || 100));
  const offset = Math.max(0, Number(q.offset) || 0);
  return { buildingId, actorId, actions, from, to, limit, offset };
}

// 건물 스코프 미적용으로 본인 권한 밖 건물을 조회하는 시도는 그대로 막아야 한다.
// 반환값:
//   - SQL 절 → 정상 처리 (절 추가)
//   - null   → 전 건물 가시(platform_admin)
//   - "empty" → 가시 건물 0건. 호출부는 빈 결과 반환.
//   - "deny" → 명시적으로 권한 밖 건물을 조회 시도. 403.
async function resolveScopeClause(
  req: Request,
  requestedBuildingId: number | null,
): Promise<SQL | null | "empty" | "deny"> {
  const scope = await getAccessibleBuildingIds(req);
  if (requestedBuildingId != null) {
    if (!scope.unrestricted && !scope.ids.includes(requestedBuildingId)) {
      return "deny";
    }
    return eq(auditLogsTable.buildingId, requestedBuildingId);
  }
  return buildingScopeFilter(scope, auditLogsTable.buildingId);
}

function buildWhere(
  f: ReturnType<typeof parseFilters>,
  scopeClause: SQL | null,
): SQL | undefined {
  const clauses: SQL[] = [];
  if (scopeClause) clauses.push(scopeClause);
  if (f.actorId) clauses.push(eq(auditLogsTable.actorId, f.actorId));
  if (f.actions && f.actions.length > 0) clauses.push(inArray(auditLogsTable.action, f.actions));
  if (f.from && !Number.isNaN(f.from.getTime())) clauses.push(gte(auditLogsTable.createdAt, f.from));
  if (f.to && !Number.isNaN(f.to.getTime())) clauses.push(lte(auditLogsTable.createdAt, f.to));
  return clauses.length === 0 ? undefined : and(...clauses);
}

router.get("/audit-logs", requireAction("audit_log.view"), async (req: Request, res: Response): Promise<void> => {
  const f = parseFilters(req);
  const scope = await resolveScopeClause(req, f.buildingId);
  if (scope === "deny") {
    res.status(403).json({ error: "해당 건물의 감사로그를 조회할 권한이 없습니다" });
    return;
  }
  if (scope === "empty") {
    res.json({ items: [], total: 0, limit: f.limit, offset: f.offset });
    return;
  }
  const where = buildWhere(f, scope);
  const rows = await db
    .select({
      id: auditLogsTable.id,
      actorId: auditLogsTable.actorId,
      actorName: usersTable.name,
      role: auditLogsTable.role,
      action: auditLogsTable.action,
      targetType: auditLogsTable.targetType,
      targetId: auditLogsTable.targetId,
      buildingId: auditLogsTable.buildingId,
      reason: auditLogsTable.reason,
      ip: auditLogsTable.ip,
      userAgent: auditLogsTable.userAgent,
      beforeJson: auditLogsTable.beforeJson,
      afterJson: auditLogsTable.afterJson,
      createdAt: auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.actorId))
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(f.limit)
    .offset(f.offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLogsTable)
    .where(where);

  res.json({
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    limit: f.limit,
    offset: f.offset,
  });
});

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get(
  "/audit-logs.csv",
  // 매트릭스 일원화: 조회 권한 + 내보내기 권한 두 가드 모두 통과해야 한다.
  requireAction("audit_log.view"),
  requireAction("data.export"),
  audit("data.export", { targetType: "audit_logs" }),
  async (req: Request, res: Response): Promise<void> => {
    const f = parseFilters(req);
    const scope = await resolveScopeClause(req, f.buildingId);
    if (scope === "deny") {
      res.status(403).json({ error: "해당 건물의 감사로그를 조회할 권한이 없습니다" });
      return;
    }
    if (scope === "empty") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.csv"`);
      res.send("\uFEFF" + ["id,createdAt,actorId,actorName,role,action,targetType,targetId,buildingId,reason,ip"].join("\n"));
      return;
    }
    const where = buildWhere(f, scope);
    const rows = await db
      .select({
        id: auditLogsTable.id,
        createdAt: auditLogsTable.createdAt,
        actorId: auditLogsTable.actorId,
        actorName: usersTable.name,
        role: auditLogsTable.role,
        action: auditLogsTable.action,
        targetType: auditLogsTable.targetType,
        targetId: auditLogsTable.targetId,
        buildingId: auditLogsTable.buildingId,
        reason: auditLogsTable.reason,
        ip: auditLogsTable.ip,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.actorId))
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(10000);

    const header = ["id","createdAt","actorId","actorName","role","action","targetType","targetId","buildingId","reason","ip"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.id,
        r.createdAt.toISOString(),
        r.actorId ?? "",
        r.actorName ?? "",
        r.role,
        r.action,
        r.targetType ?? "",
        r.targetId ?? "",
        r.buildingId ?? "",
        r.reason ?? "",
        r.ip ?? "",
      ].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.csv"`);
    // BOM 으로 엑셀 한글 깨짐 방지.
    res.send("\uFEFF" + lines.join("\n"));
  },
);

export default router;
