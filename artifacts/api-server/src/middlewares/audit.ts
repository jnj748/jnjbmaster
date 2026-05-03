// [Task #773] 감사로그 미들웨어 + 매트릭스 가드.
//
// 사용 패턴:
//   router.post(
//     "/things/:id/cancel",
//     requireAction("expense_voucher.cancel"),
//     audit("expense_voucher.cancel", { targetType: "expense_voucher", targetIdParam: "id" }),
//     async (req, res) => { ... },
//   );
//
//   - `requireAction(action)` 는 PERMISSION_MATRIX 한 곳을 보고 가드한다
//     (구 `requireRole(...roles)` 의 점진 대체).
//   - `audit(action, opts)` 는 라우트가 200~3xx 로 응답한 직후 비동기로 1행 기록.
//     실패는 로그만 남기고 응답은 절대 막지 않는다(감사로그 부재가 사용자 차단을
//     일으키면 안 된다).

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, auditLogsTable } from "@workspace/db";
import {
  can,
  isDestructive,
  type AuditAction,
} from "@workspace/shared/permissions-matrix";
import { getUserBuildingId } from "./buildingScope";

export interface AuditOptions {
  /** 감사로그의 target_type 컬럼. 도메인 엔티티 명(예: "expense_voucher"). */
  targetType?: string;
  /** req.params 에서 target_id 를 추출. 숫자 변환 실패 시 null. */
  targetIdParam?: string;
  /** 동적으로 target_id 를 산출. targetIdParam 보다 우선. */
  resolveTargetId?: (req: Request, res: Response) => number | null | undefined;
  /** 동적으로 building_id 를 산출. 미지정시 req.body.buildingId / req.user 의 빌딩에서 폴백. */
  resolveBuildingId?: (req: Request, res: Response) => number | null | undefined;
  /**
   * [Task #773] approve/reject 처럼 동일 라우트에서 분기되는 액션은 본 함수로
   *   응답 직전에 동적으로 결정한다. 반환값이 falsy 면 미들웨어 인자 `action` 을 그대로 사용.
   */
  resolveAction?: (req: Request, res: Response) => AuditAction | string | null | undefined;
  /**
   * "전/후 스냅샷" 의 before 부분. Express 5 응답 직전에 호출되므로
   * 핸들러가 이미 DB 에서 읽어 둔 값을 res.locals 에 박아두고 여기서 꺼낸다.
   */
  resolveBefore?: (req: Request, res: Response) => unknown;
  /** 변경 후 스냅샷. 핸들러가 res.json(...) 으로 보낸 body 가 자동 캡처되지만, 명시 가능. */
  resolveAfter?: (req: Request, res: Response) => unknown;
}

const SAFE_PAYLOAD_BYTE_LIMIT = 32 * 1024;

function sanitizePayload(value: unknown): unknown {
  if (value == null) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > SAFE_PAYLOAD_BYTE_LIMIT) {
      return { __truncated: true, preview: json.slice(0, 1024) };
    }
    return JSON.parse(json);
  } catch {
    return { __unserializable: true };
  }
}

function pickIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd[0]) return String(fwd[0]).split(",")[0].trim();
  return req.ip ?? null;
}

function pickReason(req: Request): string | null {
  const r = (req.body as { reason?: unknown } | undefined)?.reason;
  if (typeof r === "string" && r.trim().length > 0) return r.trim().slice(0, 500);
  const h = req.headers["x-audit-reason"];
  if (typeof h === "string" && h.trim().length > 0) return h.trim().slice(0, 500);
  return null;
}

/**
 * 감사로그 자동 기록 미들웨어. 모든 변경계 라우트는 이 한 줄을 단다.
 */
export function audit(action: AuditAction, opts: AuditOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 응답 직후 1행 기록. 응답 실패(>=400) 는 기록하지 않는다.
    let captured: unknown = undefined;
    const origJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      captured = body;
      return origJson(body);
    }) as typeof res.json;

    res.on("finish", async () => {
      if (res.statusCode >= 400) return;
      const user = req.user;
      try {
        const targetId = (() => {
          if (opts.resolveTargetId) {
            const v = opts.resolveTargetId(req, res);
            if (typeof v === "number" && Number.isFinite(v)) return v;
          }
          if (opts.targetIdParam) {
            const raw = req.params[opts.targetIdParam];
            const n = Number(raw);
            if (Number.isFinite(n)) return n;
          }
          return null;
        })();
        // [Task #773] 빌딩 ID 우선순위:
        //   1) opts.resolveBuildingId
        //   2) req.body.buildingId / req.query.buildingId / req.params.buildingId
        //   3) req.user 의 building_id (DB 한 번 조회, 라우트 단위 캐시)
        // null 로 새는 일을 줄여 감사로그 건물 필터 정합성을 확보한다.
        const buildingId = await (async (): Promise<number | null> => {
          if (opts.resolveBuildingId) {
            const v = opts.resolveBuildingId(req, res);
            if (typeof v === "number" && Number.isFinite(v)) return v;
          }
          const bodyB = (req.body as { buildingId?: unknown } | undefined)?.buildingId;
          if (typeof bodyB === "number" && Number.isFinite(bodyB)) return bodyB;
          if (typeof bodyB === "string" && bodyB.length > 0 && Number.isFinite(Number(bodyB))) return Number(bodyB);
          const queryB = (req.query as { buildingId?: unknown } | undefined)?.buildingId;
          if (typeof queryB === "string" && queryB.length > 0 && Number.isFinite(Number(queryB))) return Number(queryB);
          const paramB = req.params?.buildingId;
          if (typeof paramB === "string" && paramB.length > 0 && Number.isFinite(Number(paramB))) return Number(paramB);
          if (user?.userId) {
            try {
              return await getUserBuildingId(user.userId);
            } catch {
              return null;
            }
          }
          return null;
        })();
        const before = opts.resolveBefore ? sanitizePayload(opts.resolveBefore(req, res)) : null;
        const after = sanitizePayload(opts.resolveAfter ? opts.resolveAfter(req, res) : captured);
        const ua = req.headers["user-agent"];
        const resolved = opts.resolveAction?.(req, res);
        const finalAction = (typeof resolved === "string" && resolved.length > 0 ? resolved : action) as AuditAction;
        void db
          .insert(auditLogsTable)
          .values({
            actorId: user?.userId ?? null,
            role: user?.role ?? "anonymous",
            action: finalAction,
            targetType: opts.targetType ?? null,
            targetId,
            buildingId,
            beforeJson: (before ?? null) as Record<string, unknown> | null,
            afterJson: (after ?? null) as Record<string, unknown> | null,
            reason: pickReason(req),
            ip: pickIp(req),
            userAgent: typeof ua === "string" ? ua.slice(0, 500) : null,
          })
          .catch((err) => {
            (req as { log?: { error?: (...args: unknown[]) => void } }).log?.error?.(
              { err, action: finalAction },
              "audit log persist failed",
            );
          });
      } catch (err) {
        (req as { log?: { error?: (...args: unknown[]) => void } }).log?.error?.(
          { err, action },
          "audit log capture failed",
        );
      }
    });

    next();
  };
}

/**
 * 매트릭스 기반 가드. 흩어진 `requireRole(...)` 의 점진 대체.
 * 매트릭스에 등록된 (action, role) 만 통과시킨다.
 *
 * [Task #773] 위험 액션(DESTRUCTIVE_ACTIONS)은 사유(req.body.reason 또는
 *   X-Audit-Reason 헤더)가 비어있으면 422 로 막는다. 클라이언트는
 *   `<ConfirmWithReason>` 으로 사유 칩을 받아 보내야 한다.
 */
export function requireAction(action: AuditAction): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "인증이 필요합니다" });
      return;
    }
    if (!can(req.user.role, action)) {
      res.status(403).json({ error: "접근 권한이 없습니다", action });
      return;
    }
    if (isDestructive(action) && !pickReason(req)) {
      res.status(422).json({
        error: "위험 액션은 사유(reason) 필수입니다",
        action,
        hint: "ConfirmWithReason 컴포넌트로 사유를 받아 X-Audit-Reason 헤더 또는 body.reason 로 전달하세요",
      });
      return;
    }
    next();
  };
}

/**
 * 라우트 핸들러 안에서 직접 1행을 남기고 싶을 때(미들웨어 부착이 어려운 분기 등).
 * 응답 흐름을 끊지 않으므로 await 없이 호출해도 된다.
 */
export async function recordAudit(input: {
  req: Request;
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: number | null;
  buildingId?: number | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}): Promise<void> {
  const { req } = input;
  const ua = req.headers["user-agent"];
  try {
    await db.insert(auditLogsTable).values({
      actorId: req.user?.userId ?? null,
      role: req.user?.role ?? "anonymous",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      buildingId: input.buildingId ?? null,
      beforeJson: (sanitizePayload(input.before) ?? null) as Record<string, unknown> | null,
      afterJson: (sanitizePayload(input.after) ?? null) as Record<string, unknown> | null,
      reason: input.reason ?? pickReason(req),
      ip: pickIp(req),
      userAgent: typeof ua === "string" ? ua.slice(0, 500) : null,
    });
  } catch (err) {
    (req as { log?: { error?: (...args: unknown[]) => void } }).log?.error?.(
      { err, action: input.action },
      "audit log direct persist failed",
    );
  }
}
