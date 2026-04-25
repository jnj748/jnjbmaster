import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { ROLE_LABELS, PORTAL_LABELS, type AppRole } from "@workspace/shared/role-labels";

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  portalType: string;
  createdAt: string;
  // [카테고리 메뉴 제어] 플랫폼이 끈 카테고리.
  disabledCategories?: string[];
}

// [카테고리 메뉴 제어] 플랫폼이 켜고 끌 수 있는 카테고리 목록.
//   "dashboard" 는 홈 진입 보장을 위해 제외.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "facility", label: "시설관리" },
  { value: "accounting", label: "회계·관리비" },
  { value: "reports", label: "보고·전자결재" },
  { value: "residents", label: "입주민·호실 관리" },
  { value: "marketplace", label: "파트너 마켓" },
  { value: "settings", label: "설정" },
];

// [역할 라벨 SoT] @workspace/shared/role-labels 에서 역할/포털 라벨을 가져온다.
const roleLabels: Record<string, string> = ROLE_LABELS;
const portalLabels: Record<string, string> = PORTAL_LABELS;

// [Task #267] /users?role=<role> 쿼리 파라미터를 읽어 초기 필터로 사용.
//   유효한 역할만 통과시키고, 그 외에는 무시한다.
const VALID_ROLE_FILTERS = new Set([
  "manager",
  "accountant",
  "facility_staff",
  "hq_executive",
  "platform_admin",
  "partner",
]);

function readRoleFilterFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const r = params.get("role") ?? "";
  return VALID_ROLE_FILTERS.has(r) ? r : "";
}

export default function Users() {
  const { token, user: currentUser } = useAuth();
  const isPlatformAdmin = currentUser?.role === "platform_admin";
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [error, setError] = useState("");
  // [Task #267] 역할 필터 — 초깃값은 ?role= 쿼리에서 읽고, 셀렉트로 변경 가능.
  //   wouter 의 useLocation 은 search 변경을 트리거하지 않으므로 location 변경마다 동기화.
  const [location] = useLocation();
  const [roleFilter, setRoleFilter] = useState<string>(() => readRoleFilterFromUrl());
  useEffect(() => {
    setRoleFilter(readRoleFilterFromUrl());
  }, [location]);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      setError("사용자 목록을 불러올 수 없습니다");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setUsers(users.filter((u) => u.id !== id));
    }
  };

  // [Task #267] 역할 필터 적용된 목록.
  //   훅은 early return 위에서 호출되어야 한다(React Rules of Hooks).
  const filteredUsers = useMemo(
    () => (roleFilter ? users.filter((u) => u.role === roleFilter) : users),
    [users, roleFilter],
  );
  const filterRoleLabel = roleFilter ? roleLabels[roleFilter] ?? roleFilter : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">사용자 관리</h1>
          <p className="text-sm text-slate-500 mt-1">사용자를 초대하고 역할을 관리합니다</p>
        </div>
        <button
          onClick={() => {
            setEditUser(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          사용자 추가
        </button>
      </div>

      {/* [Task #267] 역할별 필터 — ?role= 쿼리 또는 셀렉트로 변경. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="role-filter" className="text-sm text-slate-600">역할:</label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => {
            const v = e.target.value;
            setRoleFilter(v);
            const url = new URL(window.location.href);
            if (v) url.searchParams.set("role", v);
            else url.searchParams.delete("role");
            window.history.replaceState({}, "", url);
          }}
          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
          data-testid="role-filter-select"
        >
          <option value="">전체</option>
          {Object.entries(roleLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {roleFilter && (
          <span className="text-xs text-slate-500" data-testid="role-filter-summary">
            {filterRoleLabel} {filteredUsers.length}명
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      <div className="desktop:hidden space-y-2">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 truncate">{user.name}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {roleLabels[user.role] || user.role}
                  </span>
                </div>
                <p className="text-xs text-slate-600 truncate mt-1">{user.email}</p>
                <p className="text-xs text-slate-500 mt-0.5">{portalLabels[user.portalType] || user.portalType} · {user.phone || "전화 미등록"}</p>
                <p className="text-xs text-slate-400 mt-0.5">가입 {new Date(user.createdAt).toLocaleDateString("ko-KR")}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => { setEditUser(user); setShowModal(true); }}
                  className="h-11 w-11 inline-flex items-center justify-center text-slate-400 hover:text-blue-600 rounded transition-colors"
                  aria-label="수정"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(user.id)}
                  className="h-11 w-11 inline-flex items-center justify-center text-slate-400 hover:text-red-600 rounded transition-colors"
                  aria-label="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            {roleFilter ? `${filterRoleLabel} 역할 사용자가 없습니다` : "등록된 사용자가 없습니다"}
          </div>
        )}
      </div>

      <div className="hidden desktop:block bg-white rounded-xl border border-slate-200 overflow-hidden">
       <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">이메일</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">역할</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">포털</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">전화번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">가입일</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{user.name}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {roleLabels[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{portalLabels[user.portalType] || user.portalType}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.phone || "-"}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditUser(user);
                        setShowModal(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  {roleFilter ? `${filterRoleLabel} 역할 사용자가 없습니다` : "등록된 사용자가 없습니다"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
      </div>

      {showModal && (
        <UserModal
          user={editUser}
          token={token!}
          apiBase={API_BASE}
          isPlatformAdmin={isPlatformAdmin}
          onClose={() => {
            setShowModal(false);
            setEditUser(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  user,
  token,
  apiBase,
  isPlatformAdmin,
  onClose,
  onSaved,
}: {
  user: UserRecord | null;
  token: string;
  apiBase: string;
  isPlatformAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [role, setRole] = useState(user?.role || "manager");
  const [phone, setPhone] = useState(user?.phone || "");
  const [portalType, setPortalType] = useState(user?.portalType || "building");
  // [카테고리 메뉴 제어] 끈 카테고리 = disabled. 체크박스에서는 "활성" 으로 보여주기 위해 반전 사용.
  const [disabledCategories, setDisabledCategories] = useState<string[]>(user?.disabledCategories ?? []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleCategory = (value: string) => {
    setDisabledCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const [tempPasswordResult, setTempPasswordResult] = useState("");

  useEffect(() => {
    if (role === "partner") {
      setPortalType("partner");
    } else if (["hq_executive", "platform_admin"].includes(role)) {
      setPortalType("hq");
    } else if (portalType === "partner" && role !== "partner") {
      setPortalType("building");
    } else if (portalType === "hq" && !["hq_executive", "platform_admin"].includes(role)) {
      setPortalType("building");
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isEdit) {
        const res = await fetch(`${apiBase}/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            role,
            phone: phone || null,
            portalType,
            // [카테고리 메뉴 제어] 플랫폼만 보냄. 그 외 역할은 백엔드가 무시.
            ...(isPlatformAdmin ? { disabledCategories } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
      } else {
        const res = await fetch(`${apiBase}/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email,
            password: password || undefined,
            name,
            role,
            phone: phone || null,
            portalType,
            // [카테고리 메뉴 제어] 신규 생성 시에도 플랫폼이 끈 카테고리를 함께 저장.
            ...(isPlatformAdmin ? { disabledCategories } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
        const data = await res.json();
        if (data.tempPassword) {
          setTempPasswordResult(data.tempPassword);
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  // [역할 라벨 SoT] 화면 표시 라벨은 ROLE_LABELS 에서 가져온다.
  const allRoles: { value: AppRole; label: string }[] = [
    { value: "manager", label: ROLE_LABELS.manager },
    { value: "accountant", label: ROLE_LABELS.accountant },
    { value: "facility_staff", label: ROLE_LABELS.facility_staff },
    { value: "hq_executive", label: ROLE_LABELS.hq_executive },
    { value: "partner", label: ROLE_LABELS.partner },
    { value: "platform_admin", label: ROLE_LABELS.platform_admin },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? "사용자 수정" : "사용자 추가"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tempPasswordResult && (
          <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200 space-y-2">
            <p className="text-sm font-medium text-green-800">사용자가 생성되었습니다</p>
            <p className="text-sm text-green-700">
              임시 비밀번호: <span className="font-mono font-bold text-green-900 select-all">{tempPasswordResult}</span>
            </p>
            <p className="text-xs text-green-600">이 비밀번호를 사용자에게 전달해주세요.</p>
            <button
              onClick={() => { setTempPasswordResult(""); onSaved(); }}
              className="mt-2 w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              확인
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        {!tempPasswordResult && <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 (미입력시 자동생성)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  placeholder="비워두면 임시 비밀번호 자동 생성"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">역할</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {allRoles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">포털 유형</label>
            <select
              value={portalType}
              onChange={(e) => setPortalType(e.target.value)}
              disabled={role === "partner" || ["hq_executive", "platform_admin"].includes(role)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-slate-100"
            >
              <option value="building">건물관리</option>
              <option value="partner">파트너사</option>
              <option value="hq">본사</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">전화번호 (선택)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {isPlatformAdmin && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2">
                <p className="text-sm font-medium text-slate-700">사용 가능한 메뉴 카테고리</p>
                <p className="text-xs text-slate-500 mt-0.5">체크 해제하면 해당 카테고리 메뉴가 이 사용자에게 숨겨집니다.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORY_OPTIONS.map((opt) => {
                  const enabled = !disabledCategories.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-white border border-slate-200 cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleCategory(opt.value)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        data-testid={`category-toggle-${opt.value}`}
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "처리 중..." : isEdit ? "수정" : "추가"}
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
}
