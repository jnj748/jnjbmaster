import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isHqPortalRole } from "@workspace/shared/role-labels";

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
  // [Username 가입] 신규 가입자는 email 이 NULL 이고 username 만 있다.
  // 기존(이메일) 가입자는 email 이 채워지고 username 이 NULL.
  // 둘 중 어느 쪽으로 가입했든 토큰에는 둘 다 실어 두고 호출부에서 표시용으로
  // username ?? email ?? `사용자#${userId}` 순으로 폴백한다.
  email: string | null;
  username?: string | null;
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
  // [Task #651] 위저드 step2(담당자 확인)에서 호출. 가입 대기 중인 시설담당/경리도
  // 본부장·관리소장 정보를 조회할 수 있어야 한다.
  { method: "GET", path: /^\/buildings\/responsible-staff\/?$/ },
  // [Task #651] accountant 위저드 step2 에서 "1건물 1경리" 사전 점검을 위해 호출.
  // 가입 대기 중에도 사전 점검이 가능해야 신청 단계에서 즉시 차단할 수 있다.
  { method: "GET", path: /^\/buildings\/check-manager\/?$/ },
  { method: "GET", path: /^\/platform\/consents(\/.*)?$/ },
  { method: "POST", path: /^\/platform\/consents(\/.*)?$/ },
];

export async function approvalGateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }
  try {
    const [u] = await db.select({
      role: usersTable.role,
      approvalStatus: usersTable.approvalStatus,
      roleSelected: usersTable.roleSelected,
    })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId));
    if (!u) { next(); return; }
    // [Task #590] 본사(HQ) 포털 역할(관리자/본부장)은 시설기사 승인 흐름의 대상이
    // 아니다. 이들은 기본적으로 approvalStatus=null 인 경우가 많아 게이트의 차단
    // 조건(approvalStatus !== "active")에 잘못 걸려 /platform/* 화면이 403 으로
    // 막히고 있었다. HQ 역할은 게이트에서 즉시 통과시킨다.
    // (단, roleSelected=false 인 사용자는 회원가입 직후 placeholder 로 facility_staff
    //  역할이 들어가므로 이 분기에 도달하지 않는다.)
    if (isHqPortalRole(u.role)) { next(); return; }
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
