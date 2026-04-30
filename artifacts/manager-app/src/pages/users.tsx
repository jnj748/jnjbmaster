import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { Plus, Pencil, Trash2, X, Search } from "lucide-react";
import { ROLE_LABELS, PORTAL_LABELS, type AppRole } from "@workspace/shared/role-labels";
import { formatPhoneNumber, formatPhoneNumberPartial } from "@/lib/format-korean";
import { VendorChangeRequestsAdminSection } from "@/components/vendor-change-requests-admin";

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
  // [Task #428] 사용자 관리 화면에 표시할 매핑된 건물 정보 + 사용자 본인 시/군 정보.
  buildingId?: number | null;
  buildingName?: string | null;
  buildingAddress?: string | null;
  buildingSido?: string | null;
  buildingSigungu?: string | null;
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

// [Task #428] 포털 유형 필터(?portal=) — 백엔드 portal_type 과 동일한 키 집합.
const VALID_PORTAL_FILTERS = new Set(["building", "partner", "hq"]);
function readPortalFilterFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const v = params.get("portal") ?? "";
  return VALID_PORTAL_FILTERS.has(v) ? v : "";
}

// [Task #428] 검색어(?q=) — 디바운스 후 URL 동기화. 초기값은 URL 에서 읽는다.
function readQueryFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("q") ?? "";
}

// [Task #428] 중복 가입 의심 임시 필터(?duplicateKey=) — 같은 건물·주소를
//   공유하는 사용자만 노출하기 위한 토글성 필터.
function readDuplicateKeyFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("duplicateKey") ?? "";
}

// [Task #428] 중복 감지 키 — buildingId 가 있으면 그것을, 없으면 정규화한
//   주소 문자열(건물 주소 우선, 없으면 본인 시/도 + 시/군/구)을 사용.
//   두 값 모두 없는 사용자는 중복 카운트에서 제외(키가 빈 문자열).
function buildDuplicateKey(u: UserRecord): string {
  if (u.buildingId != null) return `b:${u.buildingId}`;
  const addr = (u.buildingAddress ?? "").trim();
  if (addr) return `a:${addr.toLowerCase().replace(/\s+/g, " ")}`;
  const sido = (u.buildingSido ?? "").trim();
  const sigungu = (u.buildingSigungu ?? "").trim();
  const composed = [sido, sigungu].filter(Boolean).join(" ").toLowerCase();
  return composed ? `r:${composed.replace(/\s+/g, " ")}` : "";
}

// [Task #428] 사용자 1명의 검색 대상 문자열 — 이름·이메일·전화·건물명·주소.
function buildSearchHaystack(u: UserRecord): string {
  return [
    u.name,
    u.email,
    u.phone ?? "",
    u.buildingName ?? "",
    u.buildingAddress ?? "",
    u.buildingSido ?? "",
    u.buildingSigungu ?? "",
  ]
    .join(" ")
    .toLowerCase();
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
  // [Task #428] 포털 유형 필터 / 검색어 / 중복 임시 필터 — URL 과 양방향 동기화.
  const [portalFilter, setPortalFilter] = useState<string>(() => readPortalFilterFromUrl());
  const [searchInput, setSearchInput] = useState<string>(() => readQueryFromUrl());
  const [searchQuery, setSearchQuery] = useState<string>(() => readQueryFromUrl());
  const [duplicateKey, setDuplicateKey] = useState<string>(() => readDuplicateKeyFromUrl());
  // [Task #428] location 변경(라우트 이동) + popstate(브라우저 뒤로/앞으로) 양쪽에서
  //   URL → 필터 상태로 재동기화. wouter 의 useLocation 은 search 변경만으로는
  //   재발화하지 않으므로 popstate 도 함께 구독해 ?q=, ?portal= 등 변경을 따라간다.
  const syncFromUrl = () => {
    setRoleFilter(readRoleFilterFromUrl());
    setPortalFilter(readPortalFilterFromUrl());
    const q = readQueryFromUrl();
    setSearchInput(q);
    setSearchQuery(q);
    setDuplicateKey(readDuplicateKeyFromUrl());
  };
  useEffect(() => {
    syncFromUrl();
  }, [location]);
  useEffect(() => {
    const handler = () => syncFromUrl();
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // [Task #428] 검색 입력 디바운스(250ms) 후 ?q= 쿼리에 동기화.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput);
      const url = new URL(window.location.href);
      const trimmed = searchInput.trim();
      if (trimmed) url.searchParams.set("q", trimmed);
      else url.searchParams.delete("q");
      window.history.replaceState({}, "", url);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

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

  // [Task #428] 중복 키 → 카운트 맵. 한 번 만들고 행마다 배지 표시 여부에 사용.
  //   훅은 early return 위에서 호출되어야 한다(React Rules of Hooks).
  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      const key = buildDuplicateKey(u);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [users]);

  // [Task #267 + Task #428] 역할 + 포털 + 검색어 + 중복키 필터 (모두 AND 결합).
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (portalFilter && u.portalType !== portalFilter) return false;
      if (duplicateKey && buildDuplicateKey(u) !== duplicateKey) return false;
      if (q && !buildSearchHaystack(u).includes(q)) return false;
      return true;
    });
  }, [users, roleFilter, portalFilter, duplicateKey, searchQuery]);
  const filterRoleLabel = roleFilter ? roleLabels[roleFilter] ?? roleFilter : "";
  const filterPortalLabel = portalFilter ? portalLabels[portalFilter] ?? portalFilter : "";

  // [Task #428] 결과 건수 요약 라벨 — 적용된 조건들을 모두 반영해 한 줄로 표시.
  const summaryParts: string[] = [];
  if (filterPortalLabel) summaryParts.push(filterPortalLabel);
  if (filterRoleLabel) summaryParts.push(filterRoleLabel);
  if (searchQuery.trim()) summaryParts.push(`'${searchQuery.trim()}'`);
  if (duplicateKey) summaryParts.push("중복 가입 의심");
  const summaryText = summaryParts.length
    ? `${summaryParts.join(" · ")} ${filteredUsers.length}명`
    : `전체 ${filteredUsers.length}명`;
  const hasAnyFilter = !!(roleFilter || portalFilter || searchQuery.trim() || duplicateKey);

  // [Task #428] 포털 필터 셀렉트 변경 시 URL 동기화 헬퍼.
  const updatePortalFilter = (v: string) => {
    setPortalFilter(v);
    const url = new URL(window.location.href);
    if (v) url.searchParams.set("portal", v);
    else url.searchParams.delete("portal");
    window.history.replaceState({}, "", url);
  };

  // [Task #428] 중복 의심 뱃지 토글 — 같은 키를 두 번 클릭하면 해제.
  const toggleDuplicateKey = (key: string) => {
    const next = duplicateKey === key ? "" : key;
    setDuplicateKey(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("duplicateKey", next);
    else url.searchParams.delete("duplicateKey");
    window.history.replaceState({}, "", url);
  };

  const clearDuplicateKey = () => toggleDuplicateKey(duplicateKey);

  // [Task #428] 행에 보여줄 주소 문자열 — 건물 주소 우선, 없으면 본인 시/군 보조.
  const formatAddress = (u: UserRecord): string => {
    const addr = (u.buildingAddress ?? "").trim();
    if (addr) return addr;
    const parts = [u.buildingSido, u.buildingSigungu].filter(Boolean) as string[];
    return parts.length ? parts.join(" ") : "-";
  };

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

      {/* [Task #267 + Task #428] 상단 도구막 — 검색·포털 유형·역할 필터 + 결과 건수 요약. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* [Task #428] 검색 입력창 — 이름·이메일·전화·건물명·주소 부분 일치. */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름·이메일·전화·건물·주소 검색"
            className="pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white w-64 max-w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="users-search-input"
          />
        </div>

        {/* [Task #428] 포털 유형 필터 — 전체 / 건물관리 / 파트너사 / 본사. */}
        <label htmlFor="portal-filter" className="text-sm text-slate-600">유형:</label>
        <select
          id="portal-filter"
          value={portalFilter}
          onChange={(e) => updatePortalFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
          data-testid="portal-filter-select"
        >
          <option value="">전체</option>
          <option value="building">{portalLabels.building}</option>
          <option value="partner">{portalLabels.partner}</option>
          <option value="hq">{portalLabels.hq}</option>
        </select>

        {/* [Task #267] 역할별 필터. */}
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

        {/* [Task #428] 결과 건수 요약 — 적용된 필터·검색을 모두 반영. */}
        <span className="text-xs text-slate-500 ml-auto" data-testid="users-filter-summary">
          {summaryText}
        </span>

        {/* [Task #428] 중복 임시 필터가 적용 중이면 해제 버튼을 노출. */}
        {duplicateKey && (
          <button
            type="button"
            onClick={clearDuplicateKey}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
            data-testid="duplicate-filter-clear"
          >
            중복 의심 필터 해제
            <X className="w-3 h-3" />
          </button>
        )}
        {hasAnyFilter && !duplicateKey && (
          <button
            type="button"
            onClick={() => {
              setRoleFilter("");
              updatePortalFilter("");
              // [Task #428] 검색은 디바운스 없이 즉시 비워 화면이 바로 갱신되도록 한다.
              setSearchInput("");
              setSearchQuery("");
              const url = new URL(window.location.href);
              url.searchParams.delete("role");
              url.searchParams.delete("q");
              window.history.replaceState({}, "", url);
            }}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
            data-testid="users-filter-clear"
          >
            필터 초기화
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      <div className="desktop:hidden space-y-2">
        {filteredUsers.map((user) => {
          // [Task #428] 모바일 카드에 건물명·주소 + 중복 가입 의심 뱃지 노출.
          const dupKey = buildDuplicateKey(user);
          const isDup = !!dupKey && (duplicateCounts.get(dupKey) ?? 0) > 1;
          const buildingName = (user.buildingName ?? "").trim() || "-";
          const address = formatAddress(user);
          return (
          <div key={user.id} className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 truncate">{user.name}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {roleLabels[user.role] || user.role}
                  </span>
                  {isDup && (
                    <button
                      type="button"
                      onClick={() => toggleDuplicateKey(dupKey)}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                      data-testid={`duplicate-badge-${user.id}`}
                    >
                      중복 가입 의심
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-600 truncate mt-1">{user.email}</p>
                <p className="text-xs text-slate-500 mt-0.5">{portalLabels[user.portalType] || user.portalType} · {user.phone ? formatPhoneNumber(user.phone) : "전화 미등록"}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">건물 {buildingName} · 주소 {address}</p>
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
          );
        })}
        {filteredUsers.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            {hasAnyFilter ? "조건에 맞는 사용자가 없습니다" : "등록된 사용자가 없습니다"}
          </div>
        )}
      </div>

      <div className="hidden desktop:block bg-white rounded-xl border border-slate-200 overflow-hidden">
       <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">이메일</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">역할</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">포털</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">건물명</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">주소</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">전화번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">가입일</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              // [Task #428] 데스크톱 표 — 건물명·주소 컬럼 + 중복 가입 뱃지.
              const dupKey = buildDuplicateKey(user);
              const isDup = !!dupKey && (duplicateCounts.get(dupKey) ?? 0) > 1;
              const buildingName = (user.buildingName ?? "").trim() || "-";
              const address = formatAddress(user);
              const dupBadge = isDup ? (
                <button
                  type="button"
                  onClick={() => toggleDuplicateKey(dupKey)}
                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                  data-testid={`duplicate-badge-${user.id}`}
                >
                  중복 가입 의심
                </button>
              ) : null;
              return (
              <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{user.name}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {roleLabels[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{portalLabels[user.portalType] || user.portalType}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <span>{buildingName}</span>
                  {buildingName !== "-" && dupBadge}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <span>{address}</span>
                  {buildingName === "-" && dupBadge}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.phone ? formatPhoneNumber(user.phone) : "-"}</td>
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
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                  {hasAnyFilter ? "조건에 맞는 사용자가 없습니다" : "등록된 사용자가 없습니다"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
      </div>

      {/* [Task #661] 본사 관리자 전용 — 파트너 사업자정보 변경 신청 검토 큐. */}
      {currentUser && ["platform_admin", "hq_executive"].includes(currentUser.role) && token && (
        <VendorChangeRequestsAdminSection token={token} apiBase={API_BASE} />
      )}

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
              inputMode="tel"
              autoComplete="tel"
              maxLength={14}
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumberPartial(e.target.value))}
              placeholder="010-0000-0000"
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
