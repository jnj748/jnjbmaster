// [Task #773] 권한 매트릭스 React 훅 — 서버의 `can(role,action)` 과 동일 매트릭스를 사용한다.
//   사용 예:
//     const canCancel = useCan("expense_voucher.cancel");
//     <Button disabled={!canCancel}>...</Button>
//
//   서버 가드(`requireAction`)가 진리원이며, 본 훅은 UI 분기용 보조 도구다. 클라이언트
//   에서 가렸어도 서버가 한 번 더 검증하므로 우회 시 403 으로 막힌다.

import { useAuth } from "@/contexts/auth-context";
import {
  can,
  type AuditAction,
} from "@workspace/shared/permissions-matrix";

export function useCan(action: AuditAction): boolean {
  const { user } = useAuth();
  return can(user?.role ?? null, action);
}

export type { AuditAction };
