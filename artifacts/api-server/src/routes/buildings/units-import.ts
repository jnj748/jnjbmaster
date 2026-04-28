// [Task #496] buildings 라우터 분리 — 건축물대장 → units 일괄 upsert 핸들러.
//   원본 routes/buildings.ts 의 normalizeFloor / deriveUnitNumber / nearlyEqual 헬퍼와
//   POST /buildings/units/import-from-register 핸들러를 그대로 옮긴다.
//   AreaInfoRow / fetchAreaInfoFromRegister 는 register-lookup.ts 에서 가져온다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, unitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
// [역할 라벨 SoT] 한국어 역할 라벨은 단일 소스에서 가져온다.
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import {
  type AreaInfoRow,
  fetchAreaInfoFromRegister,
  fetchAreaInfoForAllDongs,
} from "./register-lookup";
import { lookupOwnersBestEffort, type OwnerLookupRow } from "./owner-lookup";

// [Task #348] 건축물대장 면적 정보 → units 일괄 upsert.
// 매칭 키: (정규화된 동 + 정규화된 층 + 호실번호). 동일 행이 있으면 면적/용도/source/sync 시각만 갱신.
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
  // [Task #516] 클라이언트가 소유자 자동 조회 비활성화를 명시적으로 요청한 경우 건너뛴다.
  //   기본값은 활성(true) 이며, 외부 키 미설정/실패 시에도 호실 가져오기 자체는 항상 진행한다.
  const includeOwners: boolean = req.body?.includeOwners !== false;
  const buildingId = me.buildingId;

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId));
  if (!building) {
    res.status(404).json({ error: "건물을 찾을 수 없습니다." });
    return;
  }

  // [Task #516] 동(棟)별 PK 캐시(register_dong_pks) 가 있으면 모든 동을 순회한다.
  //   캐시가 없는 기존 건물은 단일 buildingRegisterPk 로 폴백.
  const dongPks = (building.registerDongPks ?? []).map((d) => d.mgmBldrgstPk).filter(Boolean);
  const fallbackPk = building.buildingRegisterPk ?? "";
  const pksToFetch = dongPks.length > 0 ? dongPks : (fallbackPk ? [fallbackPk] : []);

  if (pksToFetch.length === 0) {
    res.status(400).json({
      error: "건물에 등록된 관리건축물대장PK가 없습니다. 먼저 주소로 건축물대장을 조회해 주세요.",
    });
    return;
  }

  let areas: AreaInfoRow[];
  try {
    if (pksToFetch.length === 1) {
      // 단일 동 폴백: 기존 동작 그대로.
      const single = await fetchAreaInfoFromRegister(pksToFetch[0]);
      areas = single ?? [];
    } else {
      // [Task #516] 다동 페이징: 동별 응답이 빈 body 라도 다음 동을 계속 진행. 결과/실패 로그 누적.
      areas = await fetchAreaInfoForAllDongs(pksToFetch, (info) => {
        req.log.info({ buildingId, ...info }, "Register area info fetched per dong");
      });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "API_KEY_MISSING") {
      res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다." });
      return;
    }
    req.log.error({ err: e, buildingId }, "Failed to fetch area info from register");
    res.status(502).json({ error: "건축물대장 면적 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }

  if (areas.length === 0) {
    res.status(404).json({ error: "건축물대장에서 면적 정보를 찾을 수 없습니다." });
    return;
  }

  // hoNm(호실번호)가 비어 있는 행은 층 합계 행이므로 호실 단위 데이터로는 사용하지 않는다.
  const rows = areas.filter((a) => deriveUnitNumber(a) !== "");
  if (rows.length === 0) {
    res.status(404).json({ error: "건축물대장에서 호실 단위 면적 정보를 찾을 수 없습니다." });
    return;
  }

  // 기존 호실 로딩((동+층+호실번호) 매칭).
  const existing = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
  const existingByKey = new Map<string, typeof existing[number]>();
  for (const u of existing) {
    const key = `${(u.dong ?? "").trim()}|${normalizeFloor(u.floor)}|${u.unitNumber.trim()}`;
    existingByKey.set(key, u);
  }

  // 같은 (동+층+호실번호)가 대장 응답 내에 중복 등장할 수 있으므로 후행 행이 우선되도록 dedupe.
  const previewMap = new Map<string, { row: AreaInfoRow; dong: string; floor: string; unitNumber: string }>();
  for (const r of rows) {
    const dong = (r.dong ?? "").trim();
    const floor = normalizeFloor(r.floorNo);
    const unitNumber = deriveUnitNumber(r);
    previewMap.set(`${dong}|${floor}|${unitNumber}`, { row: r, dong, floor, unitNumber });
  }

  // [Task #516] Best-Effort 소유자 자동 조회. 키 미설정/타임아웃은 호실 가져오기를 막지 않는다.
  let ownerMap = new Map<string, OwnerLookupRow>();
  let ownerLookupAttempted = 0;
  let ownerLookupHit = 0;
  let ownerLookupEnabled = false;
  if (includeOwners) {
    try {
      const targets = Array.from(previewMap.values()).map((p) => ({
        dong: p.dong,
        unitNumber: p.unitNumber,
      }));
      const ownerResult = await lookupOwnersBestEffort({
        building,
        targets,
        log: (info) => req.log.info({ buildingId, ...info }, "Owner lookup result (per dong)"),
      });
      ownerLookupEnabled = ownerResult.enabled;
      ownerLookupAttempted = targets.length;
      for (const r of ownerResult.rows) {
        ownerLookupHit++;
        ownerMap.set(`${(r.dong ?? "").trim()}|${r.unitNumber.trim()}`, r);
      }
    } catch (e) {
      req.log.warn({ err: e, buildingId }, "Owner auto-lookup failed (best-effort, ignoring)");
      ownerMap = new Map();
    }
  }

  // [Task #516] 미리보기 행 + 가져오기/유지 분류 결과.
  const items: Array<{
    dong: string;
    floor: string;
    unitNumber: string;
    exclusiveArea: number;
    commonArea: number;
    usage: string | null;
    ownerName: string | null;
    ownerAddress: string | null;
    action: "create" | "update" | "skip";
  }> = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const now = new Date();
  const upserts: Array<{ id?: number; values: Record<string, unknown> }> = [];

  for (const { row, dong, floor, unitNumber } of previewMap.values()) {
    const exclusiveArea = row.exposArea;
    const commonArea = row.pubUseArea;
    const usage = row.purposeName || null;
    const key = `${dong}|${floor}|${unitNumber}`;
    const prev = existingByKey.get(key);
    const owner = ownerMap.get(`${dong}|${unitNumber}`) ?? null;

    if (!prev) {
      const ownerName = owner?.ownerName ?? null;
      const ownerAddress = owner?.ownerAddress ?? null;
      items.push({
        dong, floor, unitNumber, exclusiveArea, commonArea, usage,
        ownerName, ownerAddress, action: "create",
      });
      created++;
      upserts.push({
        values: {
          buildingId,
          dong,
          unitNumber,
          floor,
          exclusiveArea: String(exclusiveArea),
          commonArea: String(commonArea),
          usage,
          source: "register",
          apiGenerated: true,
          mgmBldrgstPk: building.buildingRegisterPk,
          lastRegisterSyncedAt: now,
          // [Task #516] 신규 생성 시에만 자동 소유자 결과를 곧바로 채운다.
          //   기존 행은 사용자가 수기로 채웠을 수 있으므로 update 분기에서 보호적으로만 채움.
          ownerName,
          ownerAddress,
          ownerSource: ownerName || ownerAddress ? "auto" : null,
        },
      });
    } else {
      const sameArea = nearlyEqual(prev.exclusiveArea, exclusiveArea) && nearlyEqual(prev.commonArea, commonArea);
      const sameUsage = (prev.usage ?? null) === usage;
      // [Task #516] 사용자가 비어 있는 ownerName / ownerAddress 칸에 대해서만 자동 채움.
      //   ownerSource 가 manual/csv 인 경우는 절대 덮어쓰지 않는다.
      const canFillOwnerName = owner?.ownerName && !prev.ownerName && prev.ownerSource !== "manual" && prev.ownerSource !== "csv";
      const canFillOwnerAddress = owner?.ownerAddress && !prev.ownerAddress && prev.ownerSource !== "manual" && prev.ownerSource !== "csv";
      const ownerFillNeeded = Boolean(canFillOwnerName || canFillOwnerAddress);

      const previewOwnerName = canFillOwnerName ? owner?.ownerName ?? null : (prev.ownerName ?? null);
      const previewOwnerAddress = canFillOwnerAddress ? owner?.ownerAddress ?? null : (prev.ownerAddress ?? null);

      if (sameArea && sameUsage && prev.source === "register" && !ownerFillNeeded) {
        items.push({
          dong, floor, unitNumber, exclusiveArea, commonArea, usage,
          ownerName: previewOwnerName, ownerAddress: previewOwnerAddress, action: "skip",
        });
        skipped++;
        upserts.push({
          id: prev.id,
          values: { lastRegisterSyncedAt: now, mgmBldrgstPk: building.buildingRegisterPk },
        });
      } else {
        items.push({
          dong, floor, unitNumber, exclusiveArea, commonArea, usage,
          ownerName: previewOwnerName, ownerAddress: previewOwnerAddress, action: "update",
        });
        updated++;
        const updateValues: Record<string, unknown> = {
          exclusiveArea: String(exclusiveArea),
          commonArea: String(commonArea),
          usage,
          source: "register",
          apiGenerated: true,
          mgmBldrgstPk: building.buildingRegisterPk,
          lastRegisterSyncedAt: now,
        };
        if (canFillOwnerName) {
          updateValues.ownerName = owner?.ownerName ?? null;
          updateValues.ownerSource = "auto";
        }
        if (canFillOwnerAddress) {
          updateValues.ownerAddress = owner?.ownerAddress ?? null;
          if (!updateValues.ownerSource) updateValues.ownerSource = "auto";
        }
        upserts.push({ id: prev.id, values: updateValues });
      }
    }
  }

  if (dryRun) {
    res.json({
      dryRun: true,
      created, updated, skipped,
      items, lastSyncedAt: null,
      ownerLookupEnabled,
      ownerLookupAttempted,
      ownerLookupHit,
    });
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

  res.json({
    dryRun: false,
    created, updated, skipped,
    items, lastSyncedAt: now.toISOString(),
    ownerLookupEnabled,
    ownerLookupAttempted,
    ownerLookupHit,
  });
});

export default router;
