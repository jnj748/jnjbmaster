import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getMenuLabel } from "@/lib/menu-label";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

// [Task #296] 라우트 변경을 감지해 페이지 진입 이벤트를 백엔드에 비동기 전송.
//   - 비로그인 사용자는 전송하지 않는다.
//   - 플랫폼관리자(자기 자신) 트래픽은 분석 대상에서 제외한다 (서버에서도 가드).
//   - 동일 경로 연속 진입은 중복 전송을 막는다(라우터 재렌더 방지).
//   - 실패해도 사용자 동선에는 영향이 없도록 silent fire-and-forget.
export function useUsageTracker(): void {
  const [location] = useLocation();
  const { user, token } = useAuth();
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !token) return;
    if (user.role === "platform_admin") return;
    // 인증 게이트 통과 전(역할 미선택/승인 대기)에는 보내지 않는다.
    if (user.roleSelected === false) return;
    if (user.approvalStatus && user.approvalStatus !== "active") return;
    // 라우터 sentinel 경로(예: /__quick_entry, /__layout-check)는 제외.
    if (location.startsWith("/__")) return;
    if (lastSentRef.current === location) return;
    lastSentRef.current = location;

    const payload = {
      path: location,
      menuKey: getMenuLabel(location),
    };

    try {
      // sendBeacon 우선 — 페이지 이탈 중에도 전송 보장.
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      // sendBeacon 은 인증 헤더를 실을 수 없으므로 fetch keepalive 로 통일.
      void fetch(`${API_BASE}/usage-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: blob,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }, [location, user, token]);
}
