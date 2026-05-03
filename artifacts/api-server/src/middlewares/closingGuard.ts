// [Task #780] T9 마감잠금 가드 — 잠긴 월의 변경계 라우트를 409 로 차단.
//
// 사용:
//   router.post("/x", requireMonthOpen((req) => ({ buildingId, month })), audit(...), handler);
//
// resolveBuildingMonth 가 null/undefined 를 돌려주면 가드는 통과한다(라우트 핸들러가
//   자체적으로 검증하도록 — 빠른 경로). 잠금 상태 조회는 1쿼리.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { isMonthLocked } from "../lib/closingEngine";
import { logger } from "../lib/logger";

export type ResolveBM = (req: Request) => { buildingId: number; month: string } | null | undefined | Promise<{ buildingId: number; month: string } | null | undefined>;

export function requireMonthOpen(resolve: ResolveBM): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const bm = await Promise.resolve(resolve(req));
      if (!bm || !bm.buildingId || !bm.month) { next(); return; }
      const locked = await isMonthLocked(bm.buildingId, bm.month);
      if (locked) {
        res.status(409).json({
          error: "closing_locked",
          message: `${bm.month} 월이 마감되어 변경할 수 없습니다. 마감 해제 후 다시 시도하세요.`,
          buildingId: bm.buildingId,
          month: bm.month,
        });
        return;
      }
      next();
    } catch (err) {
      logger.error({ err }, "[T9] closing guard failed");
      next();
    }
  };
}

// 일자(date) → YYYY-MM 추출 헬퍼.
export function ymFromDate(d: string | Date | undefined | null): string | null {
  if (!d) return null;
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2})/.exec(s);
  return m ? m[1] : null;
}
