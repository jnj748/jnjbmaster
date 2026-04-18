// [Task #106] 관리소장 첫 시작 — 진행률·선호 컨텍스트.
// 보수: manager 외 역할에선 enabled=false 로 빈 상태 유지(기존 동작 무변).

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";

export interface OnboardingStatus {
  preference: "started" | "browsing" | null;
  gate1: {
    hasBuilding: boolean;
    hasCompletionDate: boolean;
    hasLegalInspections: boolean;
    completed: boolean;
  };
  gate2: {
    hasVendors: boolean;
    hasStaff: boolean;
    completed: boolean;
  };
  progressPercent: number;
}

interface OnboardingContextType {
  status: OnboardingStatus | null;
  isLoading: boolean;
  isManager: boolean;
  setPreference: (pref: "started" | "browsing") => Promise<void>;
  refetch: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { token, user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === "manager";

  const { data, isLoading } = useQuery<OnboardingStatus>({
    queryKey: ["onboarding", "status", user?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("진행률을 불러올 수 없습니다");
      return res.json();
    },
    enabled: !!token && isManager,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (preference: "started" | "browsing") => {
      const res = await fetch(`${API_BASE}/onboarding/preference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preference }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장 실패");
      }
      return preference;
    },
    onSuccess: (preference) => {
      // 즉시 user/state 갱신 — 모달이 다시 뜨지 않도록.
      if (user) setUser({ ...user, onboardingPreference: preference });
      queryClient.invalidateQueries({ queryKey: ["onboarding", "status", user?.id] });
    },
  });

  const setPreference = useCallback(
    async (pref: "started" | "browsing") => {
      await mutation.mutateAsync(pref);
    },
    [mutation],
  );

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["onboarding", "status", user?.id] });
  }, [queryClient, user?.id]);

  return (
    <OnboardingContext.Provider value={{ status: data ?? null, isLoading, isManager, setPreference, refetch }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within an OnboardingProvider");
  return ctx;
}
