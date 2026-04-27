// [Task #496] buildings 라우터 분리 — 건축물대장 → units 일괄 upsert 핸들러.
//   원본 routes/buildings.ts 의 normalizeFloor / deriveUnitNumber / nearlyEqual 헬퍼와
//   POST /buildings/units/import-from-register 핸들러를 그대로 옮긴다.
//   AreaInfoRow / fetchAreaInfoFromRegister 는 register-lookup.ts 에서 가져온다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, unitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
// [역할 라벨 SoT] 한국어 역할 라벨은 단일 소스에서 가져온다.
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { type AreaInfoRow, fetchAreaInfoFromRegister } from "./register-lookup";

// [Task #348] 건축물대장 면적 정보 → units 일괄 upsert.
// 매칭 키: (정규화된 층 + 호실번호). 동일 행이 있으면 면적/용도/source/sync 시각만 갱신.
// 사용자 수기 입력 컬럼(소유자/입주민/연락처/메모 등)은 건드리지 않는다.
// dryRun=true 면 DB 변경 없이 미리보기만 반환한다.
function normalizeFloor(raw: string): string {
  // "1층", "1F", "지1층" 등을 단순화. 빈 값은 빈 문자열 그대로.
  if (!raw) return "";
  const trimmed = raw.replace(/\s+/g, "").trim();
  // 숫자만 추출(부호 포함). "지1" → "-1", "1층" → "1".
  const negative = /^지하|^지/.test(trimmed) || /^B/i.test(trimmed);
  const m = trimmed.match(/-?\d+/);
  if (!m) return trimmed;
  const n = parseInt(m[0], 10);
  return String(negative ? -Math.abs(n) : n);
}

function deriveUnitNumber(row: AreaInfoRow): string {
  // 호실번호(hoNm)가 있으면 그대로 사용, 없으면 층 단위 행이라 호실 등록 불가.
  return row.hoNm.trim();
}

function nearlyEqual(a: number | string | null, b: number): boolean {
  const av = a == null ? 0 : Number(a);
  return Math.abs(av - b) < 0.01;
}

const router: IRouter = Router();

router.post("/buildings/units/import-from-register", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const me = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!me || (me.role !== "manager" && me.role !== "platform_admin")) {
    res.status(403).json({ error: `${ROLE_LABELS.manager} 또는 ${ROLE_LABELS.platform_admin}만 사용할 수 있습니다.` });
    return;
  }
  if (!me.buildingId) {
    res.status(400).json({ error: "연결된 건물이 없습니다." });
    return;
  }

  const dryRun = req.body?.dryRun === true;
  const buildingId = me.buildingId;

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId));
  if (!building) {
    res.status(404).json({ error: "건물을 찾을 수 없습니다." });
    return;
  }
  if (!building.buildingRegisterPk) {
    res.status(400).json({ error: "건물에 등록된 관리건축물대장PK가 없습니다. 먼저 주소로 건축물대장을 조회해 주세요." });
    return;
  }

  let areas: AreaInfoRow[] | null;
  try {
    areas = await fetchAreaInfoFromRegister(building.buildingRegisterPk);
  } catch (e) {
    if (e instanceof Error && e.message === "API_KEY_MISSING") {
      res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다." });
      return;
    }
    req.log.error({ err: e, buildingId }, "Failed to fetch area info from register");
    res.status(502).json({ error: "건축물대장 면적 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }

  if (!areas || areas.length === 0) {
    res.status(404).json({ error: "건축물대장에서 면적 정보를 찾을 수 없습니다." });
    return;
  }

  // hoNm(호실번호)가 비어 있는 행은 층 합계 행이므로 호실 단위 데이터로는 사용하지 않는다.
  const rows = areas.filter((a) => deriveUnitNumber(a) !== "");
  if (rows.length === 0) {
    res.status(404).json({ error: "건축물대장에서 호실 단위 면적 정보를 찾을 수 없습니다." });
    return;
  }

  // 기존 호실 로딩(층+호실번호 매칭).
  const existing = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
  const existingByKey = new Map<string, typeof existing[number]>();
  for (const u of existing) {
    existingByKey.set(`${normalizeFloor(u.floor)}|${u.unitNumber.trim()}`, u);
  }

  // 같은 (층+호실번호)가 대장 응답 내에 중복 등장할 수 있으므로 후행 행이 우선되도록 dedupe.
  const previewMap = new Map<string, { row: AreaInfoRow; floor: string; unitNumber: string }>();
  for (const r of rows) {
    const floor = normalizeFloor(r.floorNo);
    const unitNumber = deriveUnitNumber(r);
    previewMap.set(`${floor}|${unitNumber}`, { row: r, floor, unitNumber });
  }

  const items: Array<{
    floor: string;
    unitNumber: string;
    exclusiveArea: number;
    commonArea: number;
    usage: string | null;
    action: "create" | "update" | "skip";
  }> = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const now = new Date();
  const upserts: Array<{ id?: number; values: Record<string, unknown> }> = [];

  for (const { row, floor, unitNumber } of previewMap.values()) {
    const exclusiveArea = row.exposArea;
    const commonArea = row.pubUseArea;
    const usage = row.purposeName || null;
    const key = `${floor}|${unitNumber}`;
    const prev = existingByKey.get(key);

    if (!prev) {
      items.push({ floor, unitNumber, exclusiveArea, commonArea, usage, action: "create" });
      created++;
      upserts.push({
        values: {
          buildingId,
          unitNumber,
          floor,
          exclusiveArea: String(exclusiveArea),
          commonArea: String(commonArea),
          usage,
          source: "register",
          apiGenerated: true,
          mgmBldrgstPk: building.buildingRegisterPk,
          lastRegisterSyncedAt: now,
        },
      });
    } else {
      const sameArea = nearlyEqual(prev.exclusiveArea, exclusiveArea) && nearlyEqual(prev.commonArea, commonArea);
      const sameUsage = (prev.usage ?? null) === usage;
      if (sameArea && sameUsage && prev.source === "register") {
        items.push({ floor, unitNumber, exclusiveArea, commonArea, usage, action: "skip" });
        skipped++;
        // 마지막 동기화 시각만 갱신.
        upserts.push({
          id: prev.id,
          values: { lastRegisterSyncedAt: now, mgmBldrgstPk: building.buildingRegisterPk },
        });
      } else {
        items.push({ floor, unitNumber, exclusiveArea, commonArea, usage, action: "update" });
        updated++;
        upserts.push({
          id: prev.id,
          values: {
            exclusiveArea: String(exclusiveArea),
            commonArea: String(commonArea),
            usage,
            source: "register",
            apiGenerated: true,
            mgmBldrgstPk: building.buildingRegisterPk,
            lastRegisterSyncedAt: now,
          },
        });
      }
    }
  }

  if (dryRun) {
    res.json({ dryRun: true, created, updated, skipped, items, lastSyncedAt: null });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      for (const op of upserts) {
        if (op.id) {
          await tx.update(unitsTable).set(op.values).where(eq(unitsTable.id, op.id));
        } else {
          await tx.insert(unitsTable).values(op.values as typeof unitsTable.$inferInsert);
        }
      }
    });
  } catch (e) {
    req.log.error({ err: e, buildingId }, "Failed to upsert units from register");
    res.status(500).json({ error: "호실 일괄 가져오기에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }

  res.json({ dryRun: false, created, updated, skipped, items, lastSyncedAt: now.toISOString() });
});

export default router;
