// [Task #797] 입주자관리 부가 기능 — 4개 신규 도메인 + 차량 대량 등록.
//
// OpenAPI 코드젠 비용 대비 단순 CRUD/조회만 필요하므로 이 라우트들은 zod
// 직접 검증 + 수동 라우팅으로 처리한다(프론트는 fetch 헬퍼로 호출).

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, lte, ilike, or, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  keyIssuancesTable,
  interimSettlementsTable,
  privacyAccessLogsTable,
  longTermRepairAllocationsTable,
  vehiclesTable,
  tenantsTable,
  unitsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId, getAccessibleBuildingIds } from "../middlewares/buildingScope";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const buildingScopedRoles = requireRole(
  "manager",
  "platform_admin",
  "hq_executive",
  "accountant",
);

// ────────────────────────────────────────────────────────────────────
// 1) 키 발급/회수
// ────────────────────────────────────────────────────────────────────
const KeyIssuanceBody = z.object({
  unit: z.string().min(1),
  tenantName: z.string().nullish(),
  keyNumber: z.string().min(1),
  issueReason: z.string().nullish(),
  issuedAt: z.string().nullish(),
  returnedAt: z.string().nullish(),
  status: z.enum(["issued", "returned", "lost", "discarded"]).default("issued"),
  handlerName: z.string().nullish(),
  notes: z.string().nullish(),
});

router.get("/key-issuances", buildingScopedRoles, async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const conditions = [eq(keyIssuancesTable.buildingId, buildingId)];
  if (status) conditions.push(eq(keyIssuancesTable.status, status));
  if (search) {
    const c = or(
      ilike(keyIssuancesTable.unit, `%${search}%`),
      ilike(keyIssuancesTable.tenantName, `%${search}%`),
      ilike(keyIssuancesTable.keyNumber, `%${search}%`),
    );
    if (c) conditions.push(c);
  }
  const rows = await db
    .select()
    .from(keyIssuancesTable)
    .where(and(...conditions))
    .orderBy(desc(keyIssuancesTable.createdAt));
  res.json(rows);
});

router.post("/key-issuances", buildingScopedRoles, async (req: Request, res: Response) => {
  const parsed = KeyIssuanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }
  const [row] = await db
    .insert(keyIssuancesTable)
    .values({
      ...parsed.data,
      buildingId,
      handlerId: req.user?.userId ?? null,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/key-issuances/:id", buildingScopedRoles, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  const parsed = KeyIssuanceBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(keyIssuancesTable)
    .set(parsed.data)
    .where(
      and(
        eq(keyIssuancesTable.id, id),
        buildingId ? eq(keyIssuancesTable.buildingId, buildingId) : sql`TRUE`,
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});

router.delete("/key-issuances/:id", buildingScopedRoles, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  const result = await db
    .delete(keyIssuancesTable)
    .where(
      and(
        eq(keyIssuancesTable.id, id),
        buildingId ? eq(keyIssuancesTable.buildingId, buildingId) : sql`TRUE`,
      ),
    );
  res.json({ ok: true, deleted: result.rowCount ?? 0 });
});

// ────────────────────────────────────────────────────────────────────
// 2) 중간 정산서
// ────────────────────────────────────────────────────────────────────
const InterimSettlementBody = z.object({
  unit: z.string().min(1),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/),
  periodStart: z.string().nullish(),
  periodEnd: z.string().nullish(),
  closingAmount: z.number().int().default(0),
  monthAmount: z.number().int().default(0),
  supplyAmount: z.number().int().default(0),
  vatAmount: z.number().int().default(0),
  nonTaxAmount: z.number().int().default(0),
  exemptAmount: z.number().int().default(0),
  occurredAmount: z.number().int().default(0),
  applyLateFee: z.boolean().default(false),
  notes: z.string().nullish(),
  status: z.enum(["draft", "confirmed"]).default("draft"),
});

router.get("/interim-settlements", buildingScopedRoles, async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }
  const month = typeof req.query.month === "string" ? req.query.month : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const conditions = [eq(interimSettlementsTable.buildingId, buildingId)];
  if (month) conditions.push(eq(interimSettlementsTable.billingMonth, month));
  if (search) {
    const c = or(
      ilike(interimSettlementsTable.unit, `%${search}%`),
      ilike(interimSettlementsTable.billingMonth, `%${search}%`),
    );
    if (c) conditions.push(c);
  }
  const rows = await db
    .select()
    .from(interimSettlementsTable)
    .where(and(...conditions))
    .orderBy(desc(interimSettlementsTable.billingMonth), interimSettlementsTable.unit);
  res.json(rows);
});

router.post("/interim-settlements", buildingScopedRoles, async (req: Request, res: Response) => {
  const parsed = InterimSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }
  const [row] = await db
    .insert(interimSettlementsTable)
    .values({
      ...parsed.data,
      buildingId,
      createdBy: req.user?.userId ?? null,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/interim-settlements/:id", buildingScopedRoles, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const buildingId = await getUserBuildingId(req);
  const parsed = InterimSettlementBody.partial().safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  const [row] = await db
    .update(interimSettlementsTable)
    .set(parsed.data)
    .where(
      and(
        eq(interimSettlementsTable.id, id),
        buildingId ? eq(interimSettlementsTable.buildingId, buildingId) : sql`TRUE`,
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});

router.delete("/interim-settlements/:id", buildingScopedRoles, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  await db
    .delete(interimSettlementsTable)
    .where(
      and(
        eq(interimSettlementsTable.id, id),
        buildingId ? eq(interimSettlementsTable.buildingId, buildingId) : sql`TRUE`,
      ),
    );
  res.json({ ok: true });
});

// ────────────────────────────────────────────────────────────────────
// 3) 개인정보 접근 이력
//    조회만 노출(기록은 다른 라우트들이 필요할 때 직접 INSERT). MVP 에서는
//    클라이언트가 PII 노출 액션 시 명시적으로 POST 하는 방식도 허용한다.
// ────────────────────────────────────────────────────────────────────
const PrivacyAccessLogBody = z.object({
  page: z.string().min(1),
  purpose: z.string().nullish(),
  reason: z.string().nullish(),
  unmasked: z.boolean().default(false),
  printed: z.boolean().default(false),
  downloaded: z.boolean().default(false),
  targetType: z.string().nullish(),
  targetId: z.number().int().nullish(),
});

router.get("/privacy-access-logs", buildingScopedRoles, async (req: Request, res: Response) => {
  const scope = await getAccessibleBuildingIds(req);
  const conditions = [] as any[];
  if (!scope.unrestricted) {
    if (scope.ids.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(privacyAccessLogsTable.buildingId, scope.ids));
  }
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if (search) {
    const c = or(
      ilike(privacyAccessLogsTable.userName, `%${search}%`),
      ilike(privacyAccessLogsTable.page, `%${search}%`),
      ilike(privacyAccessLogsTable.purpose, `%${search}%`),
    );
    if (c) conditions.push(c);
  }
  if (from && !Number.isNaN(from.getTime())) conditions.push(gte(privacyAccessLogsTable.createdAt, from));
  if (to && !Number.isNaN(to.getTime())) conditions.push(lte(privacyAccessLogsTable.createdAt, to));

  const rows = await db
    .select()
    .from(privacyAccessLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(privacyAccessLogsTable.createdAt))
    .limit(500);
  res.json(rows);
});

router.post("/privacy-access-logs", buildingScopedRoles, async (req: Request, res: Response) => {
  const parsed = PrivacyAccessLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  const [row] = await db
    .insert(privacyAccessLogsTable)
    .values({
      ...parsed.data,
      buildingId,
      userId: req.user?.userId ?? null,
      userName: req.user?.username ?? req.user?.email ?? null,
      ip: req.ip ?? null,
    })
    .returning();
  res.status(201).json(row);
});

// ────────────────────────────────────────────────────────────────────
// 4) 전입/전출 현황 — tenants 테이블 view
//    moveInDate / moveOutDate 컬럼을 활용해 월별·기간별로 집계.
// ────────────────────────────────────────────────────────────────────
router.get("/move-in-out", buildingScopedRoles, async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json({ moveIns: [], moveOuts: [] });
    return;
  }
  const from = typeof req.query.from === "string" ? req.query.from : null;
  const to = typeof req.query.to === "string" ? req.query.to : null;

  const tenantsInBuilding = db
    .select({
      id: tenantsTable.id,
      unit: tenantsTable.unit,
      name: tenantsTable.tenantName,
      contact: tenantsTable.phone,
      moveInDate: tenantsTable.moveInDate,
      moveOutDate: tenantsTable.moveOutDate,
      status: tenantsTable.status,
    })
    .from(tenantsTable)
    .innerJoin(unitsTable, eq(tenantsTable.unitId, unitsTable.id))
    .where(eq(unitsTable.buildingId, buildingId));

  const all = await tenantsInBuilding;
  const inRange = (d: string | null | undefined): boolean => {
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };
  const moveIns = all.filter((t) => inRange(t.moveInDate as unknown as string));
  const moveOuts = all.filter((t) => inRange(t.moveOutDate as unknown as string));
  res.json({ moveIns, moveOuts });
});

// ────────────────────────────────────────────────────────────────────
// 5) 차량 대량 등록 — CSV/붙여넣기 후 매핑된 행 배열을 받아 일괄 INSERT.
// ────────────────────────────────────────────────────────────────────
const BulkVehicleRow = z.object({
  unit: z.string().min(1),
  vehicleNumber: z.string().min(1),
  vehicleType: z.string().nullish(),
  vehicleColor: z.string().nullish(),
  ownerName: z.string().nullish(),
  ownerContact: z.string().nullish(),
  manufacturer: z.string().nullish(),
  modelYear: z.coerce.number().int().nullish(),
  engineDisplacement: z.coerce.number().int().nullish(),
  isElectric: z.coerce.boolean().default(false),
  stickerNumber: z.string().nullish(),
  notes: z.string().nullish(),
});
const BulkVehicleBody = z.object({ rows: z.array(BulkVehicleRow).min(1).max(2000) });

router.post(
  "/vehicles/bulk-import",
  requireRole("manager", "platform_admin"),
  async (req: Request, res: Response) => {
    const parsed = BulkVehicleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) {
      res.status(403).json({ error: "건물이 등록되지 않았습니다" });
      return;
    }
    const values = parsed.data.rows.map((r) => ({
      buildingId,
      unit: r.unit,
      vehicleNumber: r.vehicleNumber,
      vehicleType: r.vehicleType ?? null,
      vehicleColor: r.vehicleColor ?? null,
      ownerName: r.ownerName ?? null,
      ownerContact: r.ownerContact ?? null,
      manufacturer: r.manufacturer ?? null,
      modelYear: r.modelYear ?? null,
      engineDisplacement: r.engineDisplacement ?? null,
      isElectric: r.isElectric,
      stickerNumber: r.stickerNumber ?? null,
      notes: r.notes ?? null,
    }));
    const inserted = await db.insert(vehiclesTable).values(values).returning({ id: vehiclesTable.id });
    res.status(201).json({ inserted: inserted.length });
  },
);

// CSV 헤더를 표준 필드명으로 매핑하기 위한 단순 키워드 사전.
//   AI 호출 없이 한국어/영문 흔한 표기만 처리한다(컨셉 단순화).
router.post(
  "/vehicles/suggest-mapping",
  requireRole("manager", "platform_admin"),
  (req: Request, res: Response) => {
    const headers: unknown = req.body?.headers;
    if (!Array.isArray(headers)) {
      res.status(400).json({ error: "headers must be array" });
      return;
    }
    const dict: Array<[string[], string]> = [
      [["호실", "동호수", "unit", "단위세대"], "unit"],
      [["차량번호", "차번호", "번호판", "plate", "vehicle_number"], "vehicleNumber"],
      [["차종", "모델", "type"], "vehicleType"],
      [["색상", "color"], "vehicleColor"],
      [["소유자", "차주", "성명", "owner"], "ownerName"],
      [["연락처", "전화", "phone", "contact"], "ownerContact"],
      [["제조사", "브랜드", "manufacturer", "make"], "manufacturer"],
      [["연식", "year"], "modelYear"],
      [["배기량", "displacement", "cc"], "engineDisplacement"],
      [["전기차", "ev", "전기"], "isElectric"],
      [["스티커", "sticker"], "stickerNumber"],
      [["메모", "비고", "notes", "remarks"], "notes"],
    ];
    const mapping: Record<string, string | null> = {};
    for (const h of headers as string[]) {
      const lower = String(h).toLowerCase().replace(/\s+/g, "");
      const hit = dict.find(([keys]) => keys.some((k) => lower.includes(k.toLowerCase())));
      mapping[String(h)] = hit ? hit[1] : null;
    }
    res.json({ mapping });
  },
);

// ────────────────────────────────────────────────────────────────────
// 6) 장기수선충당금 산출
// ────────────────────────────────────────────────────────────────────
const LongTermAllocBody = z.object({
  itemCategory: z.string().nullish(),
  calcMethod: z.enum(["supply_area", "exclusive_area", "equal"]).default("supply_area"),
  calcDate: z.string().nullish(),
  periodStart: z.string().nullish(),
  periodEnd: z.string().nullish(),
  unitResults: z.array(z.record(z.string(), z.unknown())).default([]),
  unitPrices: z.array(z.record(z.string(), z.unknown())).default([]),
  disclosures: z.array(z.record(z.string(), z.unknown())).default([]),
  totalAmount: z.number().int().default(0),
  notes: z.string().nullish(),
  status: z.enum(["draft", "confirmed"]).default("draft"),
});

router.get("/long-term-repair-allocations", buildingScopedRoles, async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(longTermRepairAllocationsTable)
    .where(eq(longTermRepairAllocationsTable.buildingId, buildingId))
    .orderBy(desc(longTermRepairAllocationsTable.calcDate), desc(longTermRepairAllocationsTable.id));
  res.json(rows);
});

router.post("/long-term-repair-allocations", buildingScopedRoles, async (req: Request, res: Response) => {
  const parsed = LongTermAllocBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }
  const [row] = await db
    .insert(longTermRepairAllocationsTable)
    .values({ ...parsed.data, buildingId, createdBy: req.user?.userId ?? null })
    .returning();
  res.status(201).json(row);
});

router.patch("/long-term-repair-allocations/:id", buildingScopedRoles, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const buildingId = await getUserBuildingId(req);
  const parsed = LongTermAllocBody.partial().safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  const [row] = await db
    .update(longTermRepairAllocationsTable)
    .set(parsed.data)
    .where(
      and(
        eq(longTermRepairAllocationsTable.id, id),
        buildingId ? eq(longTermRepairAllocationsTable.buildingId, buildingId) : sql`TRUE`,
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});

router.delete("/long-term-repair-allocations/:id", buildingScopedRoles, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  await db
    .delete(longTermRepairAllocationsTable)
    .where(
      and(
        eq(longTermRepairAllocationsTable.id, id),
        buildingId ? eq(longTermRepairAllocationsTable.buildingId, buildingId) : sql`TRUE`,
      ),
    );
  res.json({ ok: true });
});

// ────────────────────────────────────────────────────────────────────
// 7) AI 자유 텍스트 → 구조화 (키발급/장기수선 등 한 줄 입력의 단일 진입점)
//    수기 폼 대신 자연어 한 문장에서 필드를 추출해 미리보기 후 저장한다.
// ────────────────────────────────────────────────────────────────────
const AiExtractBody = z.object({
  domain: z.enum(["key_issuance", "long_term_repair", "interim_settlement"]),
  text: z.string().min(1).max(2000),
});

router.post("/residents-extras/ai-extract", buildingScopedRoles, async (req: Request, res: Response) => {
  const parsed = AiExtractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { domain, text } = parsed.data;
  const schemaDoc: Record<string, string> = {
    key_issuance:
      '{"unit": "호실(예: 302)", "tenantName": "성명?", "keyNumber": "키 번호", "issueReason": "발급 사유?", "status": "issued|returned|lost|discarded", "issuedAt": "YYYY-MM-DD?", "returnedAt": "YYYY-MM-DD?", "notes": "메모?"}',
    long_term_repair:
      '{"itemCategory": "항목명?", "calcMethod": "supply_area|exclusive_area|equal", "periodStart": "YYYY-MM-DD?", "periodEnd": "YYYY-MM-DD?", "notes": "메모?"}',
    interim_settlement:
      '{"unit": "호실", "billingMonth": "YYYY-MM", "occurredAmount": "정산금액(숫자)", "applyLateFee": "boolean", "notes": "메모?"}',
  };
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `오늘 날짜: ${today}. 다음 한국어 메모에서 JSON 객체를 추출하라. 알 수 없는 필드는 null. 다른 텍스트나 코드블록 없이 JSON만 출력.\n스키마: ${schemaDoc[domain]}\n메모: """${text}"""`;
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0 },
    });
    const raw = result.text ?? "{}";
    let data: unknown = {};
    try {
      data = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : {};
    }
    res.json({ data });
  } catch (err) {
    req.log.error({ err }, "[Task #797] AI extract failed");
    res.status(502).json({ error: err instanceof Error ? err.message : "AI 추출 실패" });
  }
});

// 호실 목록 + 면적 — 산출용 베이스. 기존 unitsRouter 와 별도로 가벼운 셀렉트만 노출.
router.get("/long-term-repair-allocations/units-base", buildingScopedRoles, async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }
  const rows = await db
    .select({
      id: unitsTable.id,
      unitNumber: unitsTable.unitNumber,
      dong: unitsTable.dong,
      supplyArea: unitsTable.supplyArea,
      exclusiveArea: unitsTable.exclusiveArea,
    })
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId))
    .orderBy(unitsTable.unitNumber);
  res.json(rows);
});

export default router;
