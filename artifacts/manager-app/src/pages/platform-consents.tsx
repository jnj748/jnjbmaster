import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { FileText, Plus, Save, Upload, CheckCircle2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

type ConsentRole = "manager" | "accountant" | "facility_staff" | "partner";
type ConsentType = "terms" | "privacy" | "partner_terms" | "marketing" | "third_party_sharing";

const ROLE_LABEL: Record<ConsentRole, string> = {
  manager: "관리소장",
  accountant: "경리·행정",
  facility_staff: "시설기사",
  partner: "파트너사",
};

const TYPE_LABEL: Record<ConsentType, string> = {
  terms: "이용약관",
  privacy: "개인정보처리방침",
  partner_terms: "파트너 이용약관",
  marketing: "마케팅 정보 수신",
  third_party_sharing: "제3자 정보제공",
};

interface Doc {
  id: number;
  role: ConsentRole;
  consentType: ConsentType;
  title: string;
  body: string;
  version: string;
  required: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface DraftState {
  role: ConsentRole;
  consentType: ConsentType;
  title: string;
  body: string;
  version: string;
  required: boolean;
}

const ROLE_TYPES: Record<ConsentRole, ConsentType[]> = {
  manager: ["terms", "privacy", "marketing", "third_party_sharing"],
  accountant: ["terms", "privacy", "marketing", "third_party_sharing"],
  facility_staff: ["terms", "privacy", "marketing", "third_party_sharing"],
  partner: ["terms", "privacy", "partner_terms", "marketing", "third_party_sharing"],
};

const ROLES: ConsentRole[] = ["manager", "accountant", "facility_staff", "partner"];

export default function PlatformConsentsPage() {
  const { token } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeRole, setActiveRole] = useState<ConsentRole>("manager");
  const [activeType, setActiveType] = useState<ConsentType>("terms");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/platform/consent-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("불러오기 실패");
      const data = (await res.json()) as Doc[];
      setDocs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Whenever role/type tab changes, prefill the draft from the latest version of that pair.
  useEffect(() => {
    const candidates = docs.filter(
      (d) => d.role === activeRole && d.consentType === activeType,
    );
    candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const latest = candidates[0];
    if (latest) {
      setDraft({
        role: activeRole,
        consentType: activeType,
        title: latest.title,
        body: latest.body,
        version: latest.version,
        required: latest.required,
      });
    } else {
      setDraft({
        role: activeRole,
        consentType: activeType,
        title: `${ROLE_LABEL[activeRole]} ${TYPE_LABEL[activeType]}`,
        body: "",
        version: "1.0",
        required: ["terms", "privacy", "partner_terms"].includes(activeType),
      });
    }
    setInfo("");
  }, [activeRole, activeType, docs]);

  const versions = useMemo(
    () =>
      docs
        .filter((d) => d.role === activeRole && d.consentType === activeType)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [docs, activeRole, activeType],
  );

  async function save(publish: boolean) {
    if (!draft) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/platform/consent-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...draft, publish }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setInfo(publish ? "게시되었습니다" : "저장되었습니다");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  async function publishExisting(id: number) {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(
        `${API_BASE}/platform/consent-documents/${id}/publish`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "게시 실패");
      setInfo("게시되었습니다");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  function bumpVersion() {
    if (!draft) return;
    const m = draft.version.match(/^(\d+)\.(\d+)$/);
    if (m) {
      const next = `${m[1]}.${Number(m[2]) + 1}`;
      setDraft({ ...draft, version: next });
    } else {
      setDraft({ ...draft, version: `${draft.version}-new` });
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-slate-600" />
          <h1 className="text-xl font-semibold text-slate-900">약관 관리</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          역할별 동의 항목의 약관 문서를 작성하고 게시합니다. 가입 화면은 게시된 최신 버전을 사용합니다.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}
        {info && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {info}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200">
          {/* Role tabs */}
          <div className="flex border-b border-slate-200 overflow-x-auto">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setActiveRole(r);
                  if (!ROLE_TYPES[r].includes(activeType)) setActiveType(ROLE_TYPES[r][0]);
                }}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                  activeRole === r
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>

          {/* Type tabs */}
          <div className="flex gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50 overflow-x-auto">
            {ROLE_TYPES[activeRole].map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${
                  activeType === t
                    ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {loading || !draft ? (
            <div className="p-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">제목</label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">버전</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft.version}
                      onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={bumpVersion}
                      className="px-2 py-2 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                      title="버전 올리기"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">본문</label>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={14}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                />
                필수 동의 항목으로 표시
              </label>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  초안 저장
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(true)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  저장 후 게시
                </button>
              </div>

              {versions.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-600 mb-2">버전 이력</h3>
                  <div className="space-y-1.5">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-md text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-slate-700">v{v.version}</span>
                          {v.isPublished ? (
                            <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700">게시중</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">초안</span>
                          )}
                          {v.required && (
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">필수</span>
                          )}
                          <span className="text-slate-400">
                            {new Date(v.createdAt).toLocaleString("ko-KR")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                role: v.role,
                                consentType: v.consentType,
                                title: v.title,
                                body: v.body,
                                version: v.version,
                                required: v.required,
                              })
                            }
                            className="text-slate-600 hover:text-slate-900"
                          >
                            편집
                          </button>
                          {!v.isPublished && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => publishExisting(v.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              게시
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
}
