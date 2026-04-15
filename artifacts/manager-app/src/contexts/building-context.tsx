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
