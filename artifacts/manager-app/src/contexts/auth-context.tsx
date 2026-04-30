import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
// [Task #657] DEV 격자 단일 진실 — 모듈 스코프 핀.
//   prod 빌드에서는 항상 "auth_token" literal 만 반환하고, 본 import 의 다른
//   분기는 dead-code 제거된다. (scripts/check-no-dev-leak.mjs 가 grep 으로 재검증.)
import { getAuthStorageKey } from "@/lib/dev-auth";

export interface AuthUser {
  id: number;
  // [Username 가입] 신규 가입자는 email 이 NULL, 기존(이메일) 가입자는 username
  // 이 NULL. 표시용으로는 username ?? email ?? `사용자#${id}` 순으로 폴백한다.
  email: string | null;
  username?: string | null;
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
  // [Task #609] 본인이 끌 수 있는 "일보 작성 독려 알림" 토글. undefined 이면 ON 으로 본다.
  dailyJournalReminderEnabled?: boolean;
  // [Task #651 round-5] 활성 경리가 부과면적/회계초기자료 셋업을 마치지
  //   않은 상태이면 true. App.tsx 의 AccountantSetupGate 가 이 값을 보고
  //   /onboarding/accountant-setup 으로 강제 라우팅한다.
  accountantSetupRequired?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  // [Username 가입] identifier 는 신규 가입자의 아이디 또는 기존 가입자의 이메일.
  // 서버는 두 컬럼을 OR 조회로 매칭한다.
  login: (identifier: string, password: string, portalType?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setUser: (user: AuthUser | null) => void;
  applyToken: (token: string) => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  // [Username 가입] 신규 가입은 username 으로 받는다.
  username: string;
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

// [Task #657] DEV 격자 토큰 키 분기는 `lib/dev-auth.ts` 의 모듈 스코프 핀 으로
//   완전히 위임한다. (과거에는 본 파일에서 매 호출 URL/sessionStorage 를 다시
//   읽어 키를 만들었고, 같은 origin iframe 들의 sessionStorage 공유/덮어쓰기로
//   manager 셀이 facility 토큰을 들고 RFQ 를 치는 회귀가 발생했다.)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(getAuthStorageKey()));
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(getAuthStorageKey());
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
        localStorage.removeItem(getAuthStorageKey());
        setToken(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token, logout]);

  const login = async (identifier: string, password: string, portalType?: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // [Username 가입] 서버는 identifier / username / email 어느 키든 받는다.
      // 신규 가입은 아이디, 기존 사용자는 이메일을 그대로 입력해 같은 칸에서 모두 동작.
      body: JSON.stringify({ identifier, password, portalType }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "로그인에 실패했습니다");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(getAuthStorageKey(), data.token);
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
    localStorage.setItem(getAuthStorageKey(), data.token);
  };

  const applyToken = useCallback((newToken: string) => {
    localStorage.setItem(getAuthStorageKey(), newToken);
    setToken(newToken);
    setIsLoading(true);
  }, []);

  // [Task #132] /auth/select-role 후 user 새로고침용.
  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem(getAuthStorageKey());
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
