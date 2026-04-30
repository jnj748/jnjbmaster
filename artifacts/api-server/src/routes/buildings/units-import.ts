// [Task #496] buildings 라우터 분리 — 건축물대장 → units 일괄 upsert 핸들러.
//   원본 routes/buildings.ts 의 normalizeFloor / deriveUnitNumber / nearlyEqual 헬퍼와
//   POST /buildings/units/import-from-register 핸들러를 그대로 옮긴다.
//   AreaInfoRow / fetchAreaInfoFromRegister 는 register-lookup.ts 에서 가져온다.
//
// [Task #698] 미리보기/확정 분리 — 외부 건축물대장 API 호출은 미리보기 단계로 한정하고,
//   확정 적용은 미리보기에서 받은 previewToken 만으로 캐시된 결과를 그대로 DB 에 반영한다.
//   이렇게 분리해야 동(棟) 수가 많은 단지에서 확정 단계가 외부 API 라운드트립에 묶여 프록시
//   타임아웃(502) 으로 흐르는 사례가 사라진다. 외부 API 자체가 일시 장애일 때는 502 가 아니라
//   503 + 머신 판별 가능한 코드(REGISTER_FETCH_FAILED) 로 응답해 프록시 단의 502 와 구분한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, unitsTable, type Building } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
// [역할 라벨 SoT] 한국어 역할 라벨은 단일 소스에서 가져온다.
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import {
  type AreaInfoRow,
  type RegisterBuildingKind,
  loadAreaInfoForBuilding,
} from "./register-lookup";
import { lookupOwnersBestEffort, type OwnerLookupRow } from "./owner-lookup";
import {
  consumePreview,
  savePreview,
  type CachedPreview,
  type CachedUpsert,
} from "./units-import-cache";

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

// [Task #698] 확정 단계에서 외부 호출 없이 캐시된 upsert 만 적용하는 짧고 결정적인 트랜잭션.
//   - SET LOCAL statement_timeout — 실수로 장기 락이 잡히지 않도록 30초 상한.
//   - 청크 단위 처리 — 한 트랜잭션 안에서 200건씩 끊어 진행 상태를 로그로 남길 수 있고,
//     단일 거대 쿼리로 인해 발생할 수 있는 메모리 사용을 평탄화한다(원자성은 그대로 유지).
const APPLY_CHUNK_SIZE = 200;
const APPLY_STATEMENT_TIMEOUT_MS = 30_000;

async function applyCachedUpserts(
  upserts: CachedUpsert[],
  log: (info: { chunkIndex: number; chunkSize: number }) => void,
): Promise<void> {
  await db.transaction(async (tx) => {
    // [Task #698] 트랜잭션 단위 statement_timeout — 외부 API 호출이 빠진 순수 DB I/O 만
    //   남았으므로 30초로 충분하고, 그 안에 끝나지 못하면 명시적으로 실패시켜 락을 풀어준다.
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${APPLY_STATEMENT_TIMEOUT_MS}`));
    for (let i = 0; i < upserts.length; i += APPLY_CHUNK_SIZE) {
      const chunk = upserts.slice(i, i + APPLY_CHUNK_SIZE);
      for (const op of chunk) {
        if (op.id) {
          await tx.update(unitsTable).set(op.values).where(eq(unitsTable.id, op.id));
        } else {
          await tx.insert(unitsTable).values(op.values as typeof unitsTable.$inferInsert);
        }
      }
      log({ chunkIndex: Math.floor(i / APPLY_CHUNK_SIZE), chunkSize: chunk.length });
    }
  });
}

// [Task #698] 외부 건축물대장 응답을 받아 미리보기 분류 + upsert 작업 리스트로 변환.
//   기존 핸들러에 흩어져 있던 "응답 → items/upserts" 변환을 한 곳으로 모아 두면, 미리보기와
//   확정 단계가 같은 결과를 일관되게 사용한다는 사실이 코드 구조에서 드러난다.
interface PreviewBuildArgs {
  building: Building;
  areas: AreaInfoRow[];
  existing: typeof unitsTable.$inferSelect[];
  ownerMap: Map<string, OwnerLookupRow>;
  now: Date;
}

interface PreviewBuildResult {
  created: number;
  updated: number;
  skipped: number;
  items: CachedPreview["items"];
  upserts: CachedUpsert[];
}

function buildPreviewFromAreas(args: PreviewBuildArgs): PreviewBuildResult {
  const { building, areas, existing, ownerMap, now } = args;

  // [Task #689] hoNm(호실번호)가 비어 있는 행은 층 합계 행이므로 호실 단위 데이터로는 사용하지 않는다.
  const rows = areas.filter((a) => deriveUnitNumber(a) !== "");

  // 기존 호실 로딩((동+층+호실번호) 매칭).
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

  const items: CachedPreview["items"] = [];
  const upserts: CachedUpsert[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

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
          buildingId: building.id,
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

  return { created, updated, skipped, items, upserts };
}

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
  // [Task #698] 클라이언트가 미리보기에서 받은 토큰. 확정 단계에서만 의미가 있다.
  const previewToken: string | null = typeof req.body?.previewToken === "string" && req.body.previewToken
    ? req.body.previewToken
    : null;
  const buildingId = me.buildingId;

  // ──────────────────────────────────────────────────────────────────────
  // [Task #698] 확정 단계 — previewToken 으로 캐시된 결과만 적용 (외부 API 호출 없음).
  // ──────────────────────────────────────────────────────────────────────
  if (!dryRun && previewToken) {
    const cached = consumePreview({ userId, buildingId, token: previewToken });
    if (!cached) {
      // 캐시 만료/없음 — 클라이언트가 자동으로 한 번 다시 미리보기를 받게 한다.
      req.log.info({ buildingId, userId }, "Apply: previewToken expired or not found");
      res.status(410).json({
        code: "PREVIEW_EXPIRED",
        error: "미리보기 결과가 만료되었습니다. 다시 미리보기를 받아 주세요.",
      });
      return;
    }

    const now = new Date();
    const applyStartedAt = Date.now();
    try {
      await applyCachedUpserts(cached.upserts, (info) => {
        req.log.info({ buildingId, ...info }, "Units import apply: chunk done");
      });
    } catch (e) {
      req.log.error({ err: e, buildingId, upsertCount: cached.upserts.length }, "Failed to apply cached units upserts");
      res.status(500).json({
        code: "APPLY_FAILED",
        error: "호실 일괄 가져오기에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }
    req.log.info(
      {
        buildingId,
        upsertCount: cached.upserts.length,
        created: cached.created,
        updated: cached.updated,
        skipped: cached.skipped,
        applyMs: Date.now() - applyStartedAt,
      },
      "Units import apply: done",
    );

    res.json({
      dryRun: false,
      created: cached.created,
      updated: cached.updated,
      skipped: cached.skipped,
      items: cached.items,
      lastSyncedAt: now.toISOString(),
      ownerLookupEnabled: cached.ownerLookupEnabled,
      ownerLookupAttempted: cached.ownerLookupAttempted,
      ownerLookupHit: cached.ownerLookupHit,
    });
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  // [Task #698] 미리보기 단계 (그리고 토큰 없는 레거시 확정 호환 단계).
  //   - 외부 건축물대장/소유자 조회는 항상 이 분기에서만 수행된다.
  //   - dryRun=true: 캐시에 저장 + previewToken 발급해 응답.
  //   - dryRun=false (토큰 없음, 레거시 호환): 미리보기 + 즉시 적용을 한 호출로 처리.
  // ──────────────────────────────────────────────────────────────────────

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId));
  if (!building) {
    res.status(404).json({ error: "건물을 찾을 수 없습니다." });
    return;
  }

  // [Task #689] 단일 진입점 — loadAreaInfoForBuilding 이 토지 식별자(시군구·법정동·본번·부번)
  //   기반 1회 호출을 우선하고, 그 결과가 비어 있거나 식별자가 없을 때만 PK 폴백을 시도한다.
  //   호출 결과의 kind 로 일반건축물('일반')과 진짜 오류를 구분해 안내한다.
  let areas: AreaInfoRow[];
  let kind: RegisterBuildingKind = "unknown";
  let source: "land-code" | "pk-fallback" | "none" = "none";
  const previewStartedAt = Date.now();
  try {
    const loaded = await loadAreaInfoForBuilding(building, (info) => {
      req.log.info({ buildingId, ...info }, "Register area info fetched per dong (fallback)");
    });
    areas = loaded.areas;
    kind = loaded.kind;
    source = loaded.source;
    req.log.info(
      { buildingId, kind, source, totalRows: areas.length, fetchMs: Date.now() - previewStartedAt },
      "Loaded area info from register",
    );
  } catch (e) {
    if (e instanceof Error && e.message === "API_KEY_MISSING") {
      res.status(500).json({
        code: "REGISTER_API_KEY_MISSING",
        error: "건축물대장 API 키가 설정되지 않았습니다.",
      });
      return;
    }
    req.log.error({ err: e, buildingId }, "Failed to fetch area info from register");
    // [Task #698] 502 가 아닌 503 + 머신 판별 가능한 코드로 응답 — 프록시 단의 502 와
    //   분명히 구분되고, 클라이언트는 일관된 한국어 안내 토스트를 띄울 수 있다.
    res.status(503).json({
      code: "REGISTER_FETCH_FAILED",
      error: "건축물대장 조회가 일시적으로 지연되고 있어요. 잠시 후 다시 시도해 주세요.",
    });
    return;
  }

  // [Task #689] 일반건축물(다가구·단독 등)은 전유부 단위 자료가 공공 API 에 사실상 없다.
  //   API 오류가 아니라 "해당 없음" 으로 분류해 안내 메시지를 함께 200 응답으로 돌려준다.
  //   - kind = "general": 즉시 안내 (PK 응답 비어 있어도 정상 케이스).
  //   - kind = "collective"/"unknown" + 실제 0건: 데이터 자체가 없는 케이스로 동일 안내,
  //     단 reason 만 다르게 두어 운영자가 로그로 구분할 수 있게 한다.
  const filteredRows = areas.filter((a) => deriveUnitNumber(a) !== "");
  if (filteredRows.length === 0) {
    const isGeneral = kind === "general";
    res.json({
      dryRun,
      created: 0,
      updated: 0,
      skipped: 0,
      items: [],
      lastSyncedAt: dryRun ? null : new Date().toISOString(),
      ownerLookupEnabled: false,
      ownerLookupAttempted: 0,
      ownerLookupHit: 0,
      noUnitData: {
        kind: isGeneral ? "general" : "empty",
        message: isGeneral
          ? "건축물대장에 호실 단위 자료가 없는 건물입니다. 호실은 직접 등록하거나 엑셀 업로드를 사용해 주세요."
          : "건축물대장에서 호실 단위 면적 정보를 찾지 못했습니다. 호실은 직접 등록하거나 엑셀 업로드를 사용해 주세요.",
        source,
      },
    });
    return;
  }

  // 같은 (동+층+호실번호) 후처리는 buildPreviewFromAreas 로 위임한다.
  const existing = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));

  // [Task #516] Best-Effort 소유자 자동 조회. 키 미설정/타임아웃은 호실 가져오기를 막지 않는다.
  let ownerMap = new Map<string, OwnerLookupRow>();
  let ownerLookupAttempted = 0;
  let ownerLookupHit = 0;
  let ownerLookupEnabled = false;
  if (includeOwners) {
    try {
      // 후처리 단계와 동일한 dedupe 키 (동+호실번호) 만 사용 — 소유자 조회는 동·호 단위.
      const dedup = new Map<string, { dong: string; unitNumber: string }>();
      for (const r of filteredRows) {
        const dong = (r.dong ?? "").trim();
        const unitNumber = deriveUnitNumber(r);
        dedup.set(`${dong}|${unitNumber}`, { dong, unitNumber });
      }
      const targets = Array.from(dedup.values());
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

  const now = new Date();
  const built = buildPreviewFromAreas({ building, areas, existing, ownerMap, now });

  if (dryRun) {
    // [Task #698] 미리보기 캐시 저장 + previewToken 발급. 같은 사용자·건물의 이전 토큰은 폐기.
    const entry = savePreview({
      userId,
      buildingId,
      created: built.created,
      updated: built.updated,
      skipped: built.skipped,
      items: built.items,
      ownerLookupEnabled,
      ownerLookupAttempted,
      ownerLookupHit,
      upserts: built.upserts,
    });
    req.log.info(
      {
        buildingId,
        kind,
        source,
        previewToken: entry.token,
        created: built.created,
        updated: built.updated,
        skipped: built.skipped,
        upsertCount: built.upserts.length,
        previewMs: Date.now() - previewStartedAt,
      },
      "Units import preview: cached",
    );
    res.json({
      dryRun: true,
      previewToken: entry.token,
      created: built.created,
      updated: built.updated,
      skipped: built.skipped,
      items: built.items,
      lastSyncedAt: null,
      ownerLookupEnabled,
      ownerLookupAttempted,
      ownerLookupHit,
    });
    return;
  }

  // [Task #698] 토큰 없는 dryRun=false 호출 — 레거시 호환. 위에서 미리보기까지 마쳤으므로
  //   여기서는 곧바로 적용한다. 이 경로는 외부 API 호출 비용을 그대로 떠안으므로, 클라이언트는
  //   가능하면 분리된 미리보기 → 토큰 확정 흐름을 사용하도록 권장한다.
  try {
    await applyCachedUpserts(built.upserts, (info) => {
      req.log.info({ buildingId, ...info }, "Units import apply (legacy path): chunk done");
    });
  } catch (e) {
    req.log.error({ err: e, buildingId }, "Failed to upsert units from register (legacy path)");
    res.status(500).json({
      code: "APPLY_FAILED",
      error: "호실 일괄 가져오기에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
    return;
  }

  res.json({
    dryRun: false,
    created: built.created,
    updated: built.updated,
    skipped: built.skipped,
    items: built.items,
    lastSyncedAt: now.toISOString(),
    ownerLookupEnabled,
    ownerLookupAttempted,
    ownerLookupHit,
  });
});

export default router;
