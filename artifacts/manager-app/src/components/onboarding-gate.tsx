// [Task #106] Gate 1 (hard lock): 건물제원 + 준공일 + 법정업무 미완 시
//   /onboarding 경로로 강제 이동. 단, preference='browsing'이거나 manager가 아니면 통과.
//
// 보수 원칙:
//   - 기존 manager 계정 중 onboardingPreference 가 NULL 이고 Gate1 미완성인 경우는
//     모달이 우선 떠서 사용자가 'started' 또는 'browsing' 을 선택해야 함.
//     모달이 뜬 동안에는 Gate redirect 보류.
//   - browsing 모드에선 회색 배너만 표시(별도 BrowsingBanner 컴포넌트로 처리).
//
// 게이트가 허용하는 경로:
//   /onboarding, /building-setup, /settings, /tenant-card/* (외부 토큰), /__layout-check

import { useEffect } from "react";
import { useLocation } from "wouter";
import { useOnboarding } from "@/contexts/onboarding-context";

const ALLOWED_PREFIXES = ["/onboarding", "/building-setup", "/settings", "/tenant-card", "/__layout-check"];

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { status, isManager, isLoading } = useOnboarding();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isManager || isLoading || !status) return;
    // 모달이 뜨는 단계: preference 미선택 — 게이트 동작 보류.
    if (status.preference === null) return;
    // 둘러보기 모드 — 잠금하지 않음.
    if (status.preference === "browsing") return;
    // started 인데 Gate1 미완 → /onboarding 으로 이동.
    if (status.gate1.completed) return;

    const allowed = ALLOWED_PREFIXES.some((p) => location === p || location.startsWith(p + "/"));
    if (!allowed) {
      setLocation("/onboarding");
    }
  }, [isManager, isLoading, status, location, setLocation]);

  return <>{children}</>;
}
