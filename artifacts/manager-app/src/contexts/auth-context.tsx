import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "manager" | "partner" | "platform_admin" | "hq_executive" | "accountant" | "facility_staff";
  phone: string | null;
  vendorId?: number | null;
  portalType: "building" | "partner" | "hq";
  buildingSido?: string | null;
  buildingSigungu?: string | null;
  onboardingPreference?: "started" | "browsing" | null;
  approvalStatus?: "active" | "pending" | "rejected";
  // [Task #132] 가입 직후 역할 선택 완료 여부.
  roleSelected?: boolean;
  hasPassword?: boolean;
  // [카테고리 메뉴 제어] 플랫폼이 끈 카테고리 목록. permissions.ts 의 Group 값.
  disabledCategories?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string, portalType?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setUser: (user: AuthUser | null) => void;
  applyToken: (token: string) => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  // [Task #132] 통합 가입에서는 role/portalType 미지정 가능. 이후 /onboarding/role-select 에서 확정.
  role?: string;
  phone?: string;
  portalType?: string;
  // [Task #133] Either decisions[] (records declines) or types[] (legacy, agreed-only).
  consents?:
    | { types: string[]; version: string }
    | { decisions: { type: string; agreed: boolean; version: string }[]; version?: string };
}

const AuthContext = createContext<AuthContextType | null>(null);

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
  }, []);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid token");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        setToken(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token, logout]);

  const login = async (email: string, password: string, portalType: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, portalType }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "로그인에 실패했습니다");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("auth_token", data.token);
  };

  const register = async (regData: RegisterData) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "회원가입에 실패했습니다");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("auth_token", data.token);
  };

  const applyToken = useCallback((newToken: string) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    setIsLoading(true);
  }, []);

  // [Task #132] /auth/select-role 후 user 새로고침용.
  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem("auth_token");
    if (!t) return;
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, setUser, applyToken, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
