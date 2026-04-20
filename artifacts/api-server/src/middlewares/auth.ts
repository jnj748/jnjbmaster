import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  console.warn("WARNING: JWT_SECRET not set — using insecure default for development only");
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || "dev-jwt-secret-change-in-production";

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
  portalType: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, EFFECTIVE_JWT_SECRET) as AuthPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "유효하지 않은 토큰입니다" });
  }
}

// [Task #132] 시설기사 가입 승인 전이라면 모든 보호된 엔드포인트를 차단한다.
// 인증된 사용자만 통과할 수 있는 좁은 화이트리스트(본인 정보·신청 상태·약관 동의)는
// 별도로 허용한다.
const FACILITY_PENDING_ALLOWLIST: Array<{ method: string; path: RegExp }> = [
  { method: "GET", path: /^\/auth\/me\/?$/ },
  { method: "PUT", path: /^\/auth\/me\/?$/ },
  { method: "POST", path: /^\/auth\/select-role\/?$/ },
  { method: "POST", path: /^\/auth\/logout\/?$/ },
  { method: "GET", path: /^\/facility-signup-requests\/me\/?$/ },
  { method: "PATCH", path: /^\/facility-signup-requests\/me\/?$/ },
  { method: "GET", path: /^\/platform\/consents(\/.*)?$/ },
  { method: "POST", path: /^\/platform\/consents(\/.*)?$/ },
];

export async function approvalGateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }
  try {
    const [u] = await db.select({
      approvalStatus: usersTable.approvalStatus,
      roleSelected: usersTable.roleSelected,
    })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId));
    if (!u) { next(); return; }
    // [Task #132] 차단 조건: roleSelected=false (역할 미선택) 또는 approvalStatus !== "active".
    const needsGate = u.roleSelected === false || u.approvalStatus !== "active";
    if (!needsGate) { next(); return; }
    const allowed = FACILITY_PENDING_ALLOWLIST.some(
      (rule) => rule.method === req.method && rule.path.test(req.path),
    );
    if (allowed) { next(); return; }
    res.status(403).json({
      error: u.roleSelected === false
        ? "역할 선택이 필요합니다. 역할 선택 후 이용할 수 있습니다."
        : "가입 승인 대기 중입니다. 승인 후 이용할 수 있습니다.",
      approvalStatus: u.approvalStatus,
      roleSelected: u.roleSelected,
    });
  } catch {
    res.status(500).json({ error: "승인 상태 확인 실패" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "인증이 필요합니다" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "접근 권한이 없습니다" });
      return;
    }
    next();
  };
}
