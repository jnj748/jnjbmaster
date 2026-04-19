import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Shield, ChevronDown, ChevronUp } from "lucide-react";

const CONSENT_VERSION = "1.0";
const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface PendingPayload {
  provider: "naver" | "kakao" | "google";
  providerUserId: string;
  email: string | null;
  name: string | null;
  portalType: "building" | "partner";
  exp: number;
}

const PROVIDER_LABEL: Record<string, string> = {
  naver: "네이버",
  kakao: "카카오",
  google: "구글",
};

function decodePending(token: string): PendingPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload;
  } catch {
    return null;
  }
}

export default function SocialSignup() {
  const { applyToken } = useAuth();
  const [, setLocation] = useLocation();
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPayload | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreePartner, setAgreePartner] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const t = params.get("pending");
    if (!t) {
      setError("가입 세션이 없습니다.");
      return;
    }
    const decoded = decodePending(t);
    if (!decoded) {
      setError("가입 세션이 올바르지 않습니다.");
      return;
    }
    setPendingToken(t);
    setPending(decoded);
    setEmail(decoded.email || "");
    setName(decoded.name || "");
  }, []);

  if (error && !pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full mx-4">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">가입 진행 불가</h1>
          <p className="text-sm text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => setLocation("/portal")}
            className="w-full py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm hover:bg-slate-800"
          >
            포털 선택으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (!pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPartner = pending.portalType === "partner";
  const consentsOk = agreeTerms && agreePrivacy && (!isPartner || agreePartner);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!consentsOk) {
      setError("필수 약관에 모두 동의해 주세요");
      return;
    }
    if (!email.trim()) {
      setError("이메일을 입력해 주세요");
      return;
    }
    if (!name.trim()) {
      setError("이름을 입력해 주세요");
      return;
    }

    setLoading(true);
    try {
      const consentTypes = ["intermediary_terms", "privacy_policy"];
      if (isPartner) consentTypes.push("partner_terms");

      const res = await fetch(`${API_BASE}/auth/oauth/complete-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim() || undefined,
          consents: { types: consentTypes, version: CONSENT_VERSION },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "가입에 실패했습니다");
        return;
      }
      applyToken(data.token);
      setLocation("/");
    } catch {
      setError("가입 처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="w-full max-w-md px-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">소셜 회원가입</h1>
          <p className="text-sm text-slate-500 mb-6">
            {PROVIDER_LABEL[pending.provider]} 계정으로 {isPartner ? "파트너사" : "현장 관리"} 포털에 가입합니다.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이름 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="이름"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                이메일 * {pending.email && <span className="text-xs text-slate-400">({PROVIDER_LABEL[pending.provider]} 계정에서 가져옴)</span>}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!pending.email}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="이메일을 입력하세요"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">전화번호 (선택)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="010-0000-0000"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-600" />
                  플랫폼 이용 안내 및 약관 동의
                </span>
                <button
                  type="button"
                  onClick={() => setShowTerms(!showTerms)}
                  className="text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-0.5"
                >
                  약관 전문
                  {showTerms ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 leading-relaxed">
                (주)관리의달인은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른
                <strong> 통신판매중개자</strong>이며, 통신판매의 당사자가 아닙니다.
              </div>

              {showTerms && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px] text-slate-600 leading-4">
                  자세한 약관은 로그인 화면 또는 설정에서 확인할 수 있습니다.
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
                <span><strong className="text-red-600">[필수]</strong> 이용약관에 동의합니다.</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
                <span><strong className="text-red-600">[필수]</strong> 개인정보처리방침에 동의합니다.</span>
              </label>
              {isPartner && (
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={agreePartner} onChange={(e) => setAgreePartner(e.target.checked)} />
                  <span><strong className="text-red-600">[필수]</strong> 파트너 이용약관에 동의합니다.</span>
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !consentsOk}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "처리 중..." : "가입 완료"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
