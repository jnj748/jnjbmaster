// [Task #516] 소유자 자동 조회 (Best-Effort).
//
// 의도:
//   - 부동산종합공부조회(국토부) 등 외부 API 키(BUILDING_OWNER_API_KEY) 가 설정돼 있으면
//     동(棟)·호실 단위로 소유자 이름·소유자 주소를 가져와 채워준다.
//   - 키가 없거나 외부 API 가 실패해도 호실 가져오기 자체는 막지 않는다.
//     이 모듈은 "있으면 더해주는" 보조 기능이고, 실패 시 빈 결과를 돌려준다.
//
// 향후 확장:
//   - 개별 API 별 어댑터를 lookupOwnersBestEffort 안에서 갈아 끼우기만 하면 된다.
//   - lookupOwnersBestEffort 의 시그니처는 안정 — 호출 측(units-import) 은 그대로 둔다.

import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, type Building } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ROLE_LABELS } from "@workspace/shared/role-labels";

export interface OwnerLookupTarget {
  dong: string;
  unitNumber: string;
}

export interface OwnerLookupRow {
  dong: string;
  unitNumber: string;
  ownerName?: string;
  ownerAddress?: string;
}

export interface OwnerLookupResult {
  // 외부 API 키가 있어 호출을 시도했는지 여부. 키가 없으면 false 이고 rows 는 비어 있다.
  enabled: boolean;
  rows: OwnerLookupRow[];
}

/**
 * 호실 가져오기 단계 / 단독 라우트 양쪽에서 호출하는 best-effort 래퍼.
 *  - 키 없음 → 즉시 빈 결과(enabled=false).
 *  - 호출 실패/빈 응답 → 부분 결과만 반환(enabled=true, rows=가져온 만큼).
 *
 * 현재 구현은 외부 API 어댑터를 두지 않고 항상 빈 결과를 돌려준다.
 * (BUILDING_OWNER_API_KEY 가 설정되더라도, 실제 어댑터가 들어오기 전까지는
 *  안전하게 no-op 으로 동작 — 호실 가져오기 흐름을 절대 막지 않는다.)
 *
 * 어댑터 추가 시 이 함수만 교체하면 호출 측은 그대로 동작한다.
 */
export async function lookupOwnersBestEffort(args: {
  building: Building;
  targets: OwnerLookupTarget[];
  log?: (info: { dong: string; unitNumber: string; hit: boolean }) => void;
}): Promise<OwnerLookupResult> {
  const apiKey = process.env.BUILDING_OWNER_API_KEY;
  if (!apiKey) {
    return { enabled: false, rows: [] };
  }
  // [Task #516] 실제 부동산공부조회 어댑터는 후속 작업에서 연결.
  //   현재 단계에서는 안전한 빈 결과를 돌려주되 enabled=true 로 표시해
  //   클라이언트가 "조회 시도됨, 결과 없음" 을 구분할 수 있게 한다.
  void args;
  return { enabled: true, rows: [] };
}

const router: IRouter = Router();

// POST /buildings/owner-lookup
// body: { targets: [{ dong, unitNumber }] }
// resp: { enabled, rows: [{ dong, unitNumber, ownerName?, ownerAddress? }] }
router.post("/buildings/owner-lookup", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const me = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0]);
  if (!me || (me.role !== "manager" && me.role !== "platform_admin")) {
    res.status(403).json({ error: `${ROLE_LABELS.manager} 또는 ${ROLE_LABELS.platform_admin}만 사용할 수 있습니다.` });
    return;
  }
  if (!me.buildingId) {
    res.status(400).json({ error: "연결된 건물이 없습니다." });
    return;
  }
  const targets: OwnerLookupTarget[] = Array.isArray(req.body?.targets) ? req.body.targets : [];
  if (targets.length === 0) {
    res.json({ enabled: false, rows: [] });
    return;
  }
  // building 행을 가져오기 위해 buildingsTable 을 일시 import (중복 import 회피용 동적 임포트).
  const { buildingsTable } = await import("@workspace/db");
  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, me.buildingId));
  if (!building) { res.status(404).json({ error: "건물을 찾을 수 없습니다." }); return; }
  try {
    const result = await lookupOwnersBestEffort({
      building,
      targets,
      log: (info) => req.log.info({ buildingId: me.buildingId, ...info }, "Owner lookup row"),
    });
    res.json(result);
  } catch (e) {
    req.log.warn({ err: e, buildingId: me.buildingId }, "Owner lookup failed (best-effort)");
    res.json({ enabled: false, rows: [] });
  }
});

export default router;
