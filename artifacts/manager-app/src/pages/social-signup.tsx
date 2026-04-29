import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Shield } from "lucide-react";
import { formatPhoneNumberPartial } from "@/lib/format-korean";
import {
  ConsentSection,
  OptionalConsentRePromptDialog,
  buildDecisions,
  getMissingOptional,
  getMissingRequired,
  type ConsentDocument,
  type ConsentRole,
} from "@/components/consent-section";

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
  // [Task #582] 추천인 휴대폰 (선택). 11자리 휴대폰 형식으로만 검증한다.
  const [referrerPhone, setReferrerPhone] = useState("");
  const [referrerError, setReferrerError] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // [Task #133]
  const [consentDocs, setConsentDocs] = useState<ConsentDocument[]>([]);
  const [consentValue, setConsentValue] = useState<Record<string, boolean>>({});
  const [rePromptOpen, setRePromptOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<((finalValue: Record<string, boolean>) => void) | null>(null);

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
      <div
        className="flex items-center justify-center bg-slate-50 overflow-hidden md:overflow-visible h-[100dvh] md:h-auto md:min-h-screen"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full mx-4">
          <h1 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">가입 진행 불가</h1>
          <p className="text-sm text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => setLocation("/login")}
            className="w-full py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm md:text-base hover:bg-slate-800"
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (!pending) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 overflow-hidden md:overflow-visible h-[100dvh] md:h-auto md:min-h-screen"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPartner = pending.portalType === "partner";
  const consentRole: ConsentRole = isPartner ? "partner" : "manager";
  const missingRequired = getMissingRequired(consentDocs, consentValue);
  const consentsOk = missingRequired.length === 0;

  // [Task #582] 추천인 입력의 즉시 유효성. 비어있으면 유효(선택 입력) 으로 간주.
  //   본인 번호와 동일한 경우도 즉시 무효 처리해 가입 버튼을 비활성화하고
  //   사용자에게 즉시 안내 메시지를 보여준다.
  const referrerDigitsLive = referrerPhone.replace(/\D+/g, "");
  const ownDigitsLive = phone.replace(/\D+/g, "");
  let referrerLiveMessage: string | null = null;
  let referrerValid = true;
  if (referrerDigitsLive !== "") {
    if (!/^010\d{8}$/.test(referrerDigitsLive)) {
      // 길이가 충분히 길면 "입력 완료 후 형식 오류" 로 간주하고 메시지를 표시.
      if (referrerDigitsLive.length >= 11) {
        referrerLiveMessage = "010으로 시작하는 11자리 휴대폰 번호를 입력해 주세요";
      }
      referrerValid = false;
    } else if (referrerDigitsLive === ownDigitsLive) {
      referrerLiveMessage = "본인 연락처는 추천인으로 등록할 수 없습니다";
      referrerValid = false;
    }
  }
  // 라이브 메시지가 있으면 submit-time 메시지를 우선 시한다.
  const referrerMessage = referrerError ?? referrerLiveMessage;

  async function performSubmit(finalValue: Record<string, boolean>) {
    setLoading(true);
    try {
      const decisions = buildDecisions(consentDocs, finalValue);
      const referrerDigits = referrerPhone.replace(/\D+/g, "");
      const res = await fetch(`${API_BASE}/auth/oauth/complete-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim() || undefined,
          // [Task #582] 추천인 휴대폰 (선택). 정규화는 서버가 다시 한 번 수행.
          referrerPhone: referrerDigits || undefined,
          consents: { decisions, version: "1.0" },
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("이메일을 입력해 주세요");
      return;
    }
    if (!name.trim()) {
      setError("이름을 입력해 주세요");
      return;
    }
    // [Task #582] 추천인 휴대폰: 입력 시에만 검증.
    const referrerDigits = referrerPhone.replace(/\D+/g, "");
    if (referrerDigits) {
      if (!/^010\d{8}$/.test(referrerDigits)) {
        setReferrerError("올바른 휴대폰 번호를 입력해 주세요");
        return;
      }
      if (referrerDigits === phone.replace(/\D+/g, "")) {
        setReferrerError("본인 연락처는 추천인으로 등록할 수 없습니다");
        return;
      }
    }
    setReferrerError(null);
    if (!consentsOk) {
      setError("필수 약관에 모두 동의해 주세요");
      return;
    }

    const missingOptional = getMissingOptional(consentDocs, consentValue);
    if (missingOptional.length > 0) {
      setPendingSubmit(() => (finalValue: Record<string, boolean>) => {
        void performSubmit(finalValue);
      });
      setRePromptOpen(true);
      return;
    }
    void performSubmit(consentValue);
  }

  function handleRePromptConfirm() {
    const next = { ...consentValue };
    for (const d of consentDocs) next[d.consentType] = true;
    setConsentValue(next);
    setRePromptOpen(false);
    const submit = pendingSubmit;
    setPendingSubmit(null);
    if (submit) submit(next);
  }

  function handleRePromptReject() {
    setRePromptOpen(false);
    const submit = pendingSubmit;
    setPendingSubmit(null);
    if (submit) submit(consentValue);
  }

  // [Task #368/#377] 인증 셸:
  // - 모바일: dvh + overflow-hidden 으로 페이지 스크롤바를 제거하고 카드 내부만 스크롤(앱 느낌).
  // - 데스크톱(md+): 셸을 해제(min-h-screen + 자동 높이 + 화면 중앙 정렬)하고 카드는 콘텐츠 높이로
  //   자연스럽게 줄어들도록 한다. 시니어 가시성을 위해 폰트·여백을 한 단계 확대한다.
  return (
    <div
      className="flex flex-col overflow-hidden md:overflow-visible md:justify-center h-[100dvh] md:h-auto md:min-h-screen bg-gradient-to-br from-slate-50 to-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex-1 min-h-0 md:flex-none w-full max-w-md mx-auto px-4 py-3 md:py-6 flex flex-col">
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 md:flex-none h-full md:h-auto flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="shrink-0 px-5 pt-5 pb-3 md:px-6 md:pt-6">
            <h1 className="text-lg md:text-xl font-semibold text-slate-900 mb-1">소셜 회원가입</h1>
            <p className="text-sm text-slate-500">
              {PROVIDER_LABEL[pending.provider]} 계정으로 {isPartner ? "파트너사" : "현장 관리"} 포털에 가입합니다.
            </p>
            {error && (
              <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm leading-snug">{error}</div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto md:flex-none md:overflow-visible px-5 pb-3 md:px-6 space-y-3">
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
                inputMode="tel"
                autoComplete="tel"
                maxLength={14}
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumberPartial(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="010-0000-0000"
              />
            </div>

            {/* [Task #582] 추천인 휴대폰. 검증·자기참조 차단·정규화 동시. */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                추천인 연락처 (선택)
              </label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={14}
                value={referrerPhone}
                onChange={(e) => {
                  setReferrerPhone(formatPhoneNumberPartial(e.target.value));
                  setReferrerError(null);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="010-0000-0000"
                aria-invalid={referrerMessage ? "true" : "false"}
              />
              {referrerMessage ? (
                <p className="mt-1 text-xs text-rose-600">{referrerMessage}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  추천해 주신 분의 휴대폰 번호를 입력하면 본사가 별도 보상에 활용합니다.
                </p>
              )}
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 leading-relaxed">
              <Shield className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              (주)관리의달인은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른
              <strong> 통신판매중개자</strong>이며, 통신판매의 당사자가 아닙니다.
            </div>

            <ConsentSection
              role={consentRole}
              value={consentValue}
              onChange={setConsentValue}
              onDocsLoaded={setConsentDocs}
            />
          </div>

          <div className="shrink-0 px-5 pt-3 pb-4 md:px-6 md:pb-5 border-t border-slate-100">
            <button
              type="submit"
              disabled={loading || !consentsOk || !referrerValid}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm md:text-base hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "처리 중..." : "가입 완료"}
            </button>
          </div>
        </form>
      </div>
      <OptionalConsentRePromptDialog
        open={rePromptOpen}
        onConfirm={handleRePromptConfirm}
        onReject={handleRePromptReject}
      />
    </div>
  );
}
