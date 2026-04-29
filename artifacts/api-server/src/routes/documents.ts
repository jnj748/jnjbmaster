// [Task #610] 통합 문서 레지스트리 조회 API.

import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db, documentsTable, type DocumentKind, type DocumentState, documentKinds, documentStates } from "@workspace/db";
import { getAccessibleBuildingIds } from "../middlewares/buildingScope";

const router: IRouter = Router();

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.length) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

router.get("/documents", async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const kinds = asArray(req.query.kind).filter((k): k is DocumentKind =>
    (documentKinds as readonly string[]).includes(k),
  );
  const states = asArray(req.query.state).filter((s): s is DocumentState =>
    (documentStates as readonly string[]).includes(s),
  );
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const authorIdRaw = req.query.authorId;
  const authorId = typeof authorIdRaw === "string" && authorIdRaw ? Number(authorIdRaw) : undefined;
  const buildingIdRaw = req.query.buildingId;
  const buildingIdParam = typeof buildingIdRaw === "string" && buildingIdRaw ? Number(buildingIdRaw) : undefined;
  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const conds: SQL[] = [];

  // 건물 가시성 — platform_admin 외 역할은 본인 건물 묶음으로 제한.
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted) {
    if (scope.ids.length === 0) {
      // 가시 건물 0개여도 author_id == userId 의 외부 업로드 등은 보여준다.
      conds.push(eq(documentsTable.authorId, userId));
    } else {
      // 본인 건물 OR 본인 작성 문서.
      const buildingFilter = scope.ids.length === 1
        ? eq(documentsTable.buildingId, scope.ids[0])
        : inArray(documentsTable.buildingId, scope.ids);
      const authorFilter = eq(documentsTable.authorId, userId);
      const combined = or(buildingFilter, authorFilter);
      if (combined) conds.push(combined);
    }
  }

  if (kinds.length === 1) conds.push(eq(documentsTable.kind, kinds[0]));
  else if (kinds.length > 1) conds.push(inArray(documentsTable.kind, kinds));

  if (states.length === 1) conds.push(eq(documentsTable.state, states[0]));
  else if (states.length > 1) conds.push(inArray(documentsTable.state, states));

  if (authorId != null && !Number.isNaN(authorId)) conds.push(eq(documentsTable.authorId, authorId));
  if (buildingIdParam != null && !Number.isNaN(buildingIdParam)) {
    conds.push(eq(documentsTable.buildingId, buildingIdParam));
  }
  if (role) conds.push(eq(documentsTable.authorRole, role as never));

  if (typeof fromRaw === "string" && fromRaw) conds.push(gte(documentsTable.createdAt, new Date(fromRaw)));
  if (typeof toRaw === "string" && toRaw) conds.push(lte(documentsTable.createdAt, new Date(toRaw)));

  if (q) {
    const term = `%${q}%`;
    const qFilter = or(ilike(documentsTable.title, term), ilike(documentsTable.subtitle, term));
    if (qFilter) conds.push(qFilter);
  }

  const whereClause = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(documentsTable)
    .where(whereClause)
    .orderBy(desc(documentsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentsTable)
    .where(whereClause);

  res.json({ items: rows, total: count, limit, offset });
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [row] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }

  // 가시성 체크 — 본인 작성이거나 본인 건물 범위 안일 때만 허용.
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted) {
    const isAuthor = row.authorId != null && row.authorId === userId;
    const inBuilding = row.buildingId != null && scope.ids.includes(row.buildingId);
    if (!isAuthor && !inBuilding) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  }

  res.json(row);
});

export default router;
