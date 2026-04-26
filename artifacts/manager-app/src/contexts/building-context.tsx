import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";

interface BuildingInfo {
  id: number;
  name: string;
  addressFull: string | null;
  addressJibun: string | null;
  sido: string | null;
  sigungu: string | null;
  dong: string | null;
  zipCode: string | null;
  totalUnits: number | null;
  parkingSpaces: number | null;
  totalFloors: number | null;
  totalArea: number | null;
  elevatorCount: number | null;
  managementOfficePhone: string | null;
  // [Task #399] 입주민 안내·공지 토큰용 추가 연락처.
  feeInquiryPhone: string | null;
  facilitySafetyPhone: string | null;
  logoUrl: string | null;
  // Optional extended fields surfaced by /buildings/overview and shown in
  // BuildingInfoCard. These may be undefined when the context loader returns
  // only the base subset, so consumers must guard with optional chaining.
  buildingUsage?: string | null;
  basementFloors?: number | null;
  completionDate?: string | null;
  // [Task #469] 호실관리 빈 상태에서 바로 호실정보 불러오기 다이얼로그를 열기
  // 위해 건축물대장 식별자 유무를 컨텍스트에서 알 수 있어야 한다.
  // /buildings/my 응답은 이미 buildings 행 전체를 그대로 돌려주므로 별도 호출 없이
  // 그대로 노출만 하면 된다.
  buildingRegisterPk?: string | null;
}

interface BuildingContextType {
  building: BuildingInfo | null;
  isLoading: boolean;
  refetch: () => void;
}

const BuildingContext = createContext<BuildingContextType | null>(null);

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export function BuildingProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role !== "partner";

  const { data, isLoading } = useQuery({
    queryKey: ["building", "my", user?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/buildings/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.building as BuildingInfo | null;
    },
    enabled: !!token && isManager,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["building", "my", user?.id] });
  };

  return (
    <BuildingContext.Provider value={{ building: data ?? null, isLoading, refetch }}>
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding() {
  const context = useContext(BuildingContext);
  if (!context) {
    throw new Error("useBuilding must be used within a BuildingProvider");
  }
  return context;
}
