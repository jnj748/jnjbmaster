// [Task #859] manager 역할이 회계 결과 열람 그룹의 7개 화면에 진입했을 때 모든
//   쓰기 액션을 숨기기 위한 클라이언트 훅. 서버 측 가드(managerReadOnlyGuard)와
//   짝을 이루어 동작한다 — 직접 URL 진입으로 화면을 띄워도 쓰기 액션은 보이지
//   않으며, 우회 호출은 서버에서 403 으로 거절된다.
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";

const MANAGER_READ_ONLY_PATHS = [
  "/billing/summary",
  "/billing/notices",
  "/erp/fees-summary",
  "/receivables/overdue",
  "/erp/metering",
  "/closing",
  "/tax",
] as const;

function pathMatches(loc: string, p: string): boolean {
  if (loc === p) return true;
  if (loc.startsWith(p + "/")) return true;
  if (loc.startsWith(p + "?")) return true;
  return false;
}

export function useIsReadOnly(): boolean {
  const { user } = useAuth();
  const [location] = useLocation();
  if (user?.role !== "manager") return false;
  return MANAGER_READ_ONLY_PATHS.some((p) => pathMatches(location, p));
}

export const MANAGER_READ_ONLY_PREFIXES = MANAGER_READ_ONLY_PATHS;
