// [Task #859] managerReadOnlyGuard — manager 역할이 회계 결과 열람 그룹의 7개
//   화면(아래 PATH_PREFIXES) 뒤에서 호출하는 모든 쓰기성 API 를 거절한다.
//   클라이언트의 useIsReadOnly() 훅과 짝을 이루며, UI 우회 요청도 막는다.
//
//   대상 prefix 는 manager-app/src/lib/use-read-only.ts 의 7개 화면이 호출하는
//   엔드포인트 prefix 와 동기화되어 있다 (billing 발행/공지, 미수 스냅샷, 검침
//   입력/수정/삭제, 마감 잠금/해제, 세금계산서 발행/전송 등).
// [Task #860] hq_executive(본부장)도 동일한 7개 회계 결과 열람 화면에서 읽기
//   전용이다. 본부장은 본사 라인 감독 역할이라 부과/검침/마감/세금 데이터를 직접
//   변경할 수 없어야 하므로 manager 와 동일한 가드를 적용한다.
import type { Request, Response, NextFunction } from "express";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const READ_ONLY_ROLES = new Set<string>(["manager", "hq_executive"]);

// req.path 는 buildingRouter 마운트 prefix 가 제거된 상대 경로 ("/bills/generate" 등).
const READ_ONLY_PREFIXES: string[] = [
  // /billing/summary, /billing/notices, /erp/fees-summary 가 호출하는 부과/발행 도메인.
  "/bills",
  "/billing-months",
  "/billing-items",
  "/billing-late-fee-rates",
  "/billing-extra-charges",
  "/billing-runs",
  "/billing-adjustments",
  "/billing-notice-deliveries",
  "/billing-close",
  "/billing",
  "/fees",
  // /receivables/overdue 가 호출하는 미수/스냅샷 도메인.
  "/receivables",
  // /erp/metering 이 호출하는 검침/한전 전송 도메인.
  "/meters",
  "/kepco-transmissions",
  // /closing 이 호출하는 마감/보고 도메인.
  "/closings",
  "/closing-reports",
  // /tax 가 호출하는 세금계산서 도메인.
  "/tax",
];

function isReadOnlyTarget(path: string): boolean {
  for (const p of READ_ONLY_PREFIXES) {
    if (path === p) return true;
    if (path.startsWith(p + "/")) return true;
    if (path.startsWith(p + "?")) return true;
  }
  return false;
}

export function managerReadOnlyGuard(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) { next(); return; }
  const role = req.user?.role;
  if (!role || !READ_ONLY_ROLES.has(role)) { next(); return; }
  if (!isReadOnlyTarget(req.path)) { next(); return; }
  res.status(403).json({
    error: "관리소장·본부장은 해당 화면에서 읽기 전용입니다. 변경은 경리(accountant) 가 진행해 주세요.",
    code: "manager_read_only",
  });
}
