// [Task #859] manager 역할이 회계 결과 열람 그룹의 7개 화면에 진입했을 때 모든
//   쓰기 액션을 숨기기 위한 클라이언트 훅. 서버 측 가드(managerReadOnlyGuard)와
//   짝을 이루어 동작한다 — 직접 URL 진입으로 화면을 띄워도 쓰기 액션은 보이지
//   않으며, 우회 호출은 서버에서 403 으로 거절된다.
// [Task #860] hq_executive(본부장)도 동일한 7개 화면에 "회계 결과 열람" 그룹으로
//   진입한다. 본부장은 본사 라인 감독 역할이라 부과/검침/마감/세금 데이터를 직접
//   변경할 수 없어야 하므로 manager 와 동일한 read-only 정책을 적용한다.
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";

const READ_ONLY_PATHS = [
  "/billing/summary",
  "/billing/notices",
  "/erp/fees-summary",
  "/receivables/overdue",
  "/erp/metering",
  "/closing",
  "/tax",
] as const;

const READ_ONLY_ROLES = new Set<string>(["manager", "hq_executive"]);

function pathMatches(loc: string, p: string): boolean {
  if (loc === p) return true;
  if (loc.startsWith(p + "/")) return true;
  if (loc.startsWith(p + "?")) return true;
  return false;
}

export function useIsReadOnly(): boolean {
  const { user } = useAuth();
  const [location] = useLocation();
  if (!user?.role || !READ_ONLY_ROLES.has(user.role)) return false;
  return READ_ONLY_PATHS.some((p) => pathMatches(location, p));
}

export const MANAGER_READ_ONLY_PREFIXES = READ_ONLY_PATHS;
