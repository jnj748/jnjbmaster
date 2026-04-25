import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Building2, Store, Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";
import {
  ConsentSection,
  OptionalConsentRePromptDialog,
  buildDecisions,
  getMissingOptional,
  getMissingRequired,
  resolveConsentRole,
  type ConsentDocument,
} from "@/components/consent-section";

const DevQuickLogin = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-quick-login"))
  : null;

const CONSENT_VERSION = "1.0";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

type SocialProvider = "naver" | "kakao" | "google";

interface ProviderInfo {
  provider: SocialProvider;
  enabled: boolean;
}

const PROVIDER_LABEL: Record<SocialProvider, string> = {
  naver: "네이버로 시작하기",
  kakao: "카카오로 시작하기",
  google: "구글로 시작하기",
};

const PROVIDER_STYLE: Record<SocialProvider, string> = {
  naver: "bg-[#03C75A] hover:bg-[#02b350] text-white border-transparent",
  kakao: "bg-[#FEE500] hover:bg-[#f5dc00] text-[#3C1E1E] border-transparent",
  google: "bg-white hover:bg-slate-50 text-slate-800 border-slate-300",
};

function ProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === "google") {
    return (
      <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.5 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29 35.7 26.7 36.5 24 36.5c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.5l6.2 5.2C40.9 35.6 44 30.3 44 24c0-1.2-.1-2.4-.4-3.5z"/>
      </svg>
    );
  }
  if (provider === "naver") {
    return (
      <span className="w-4 h-4 inline-flex items-center justify-center font-extrabold text-[11px]">N</span>
    );
  }
  return (
    <span className="w-4 h-4 inline-flex items-center justify-center font-extrabold text-[11px]">K</span>
  );
}

export default function Login() {
  // [Task #132] portalType URL 파라미터가 없으면 통합 로그인 모드(building 기본).
  const { portalType: portalTypeParam } = useParams<{ portalType: string }>();
  const portalType = portalTypeParam ?? "building";
  const { login, register } = useAuth();
  const [, setLocation] = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  // [Task #178] 회원가입을 2단계로 분리: account(이름/이메일/비번/전화) → consent(약관 동의)
  const [signupStep, setSignupStep] = useState<"account" | "consent">("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(portalType === "partner" ? "partner" : portalType === "hq" ? "hq_executive" : "manager");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // [Task #137] 비밀번호 확인 필드.
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  // [Task #133] Consent state: dynamic per-role docs, decisions stored as a map.
  const [consentDocs, setConsentDocs] = useState<ConsentDocument[]>([]);
  const [consentValue, setConsentValue] = useState<Record<string, boolean>>({});
  const [rePromptOpen, setRePromptOpen] = useState(false);
  // Pending submit handler stored when re-prompt opens, so user choice can resume.
  const [pendingSubmit, setPendingSubmit] = useState<((finalValue: Record<string, boolean>) => void) | null>(null);

  useEffect(() => {
    if (portalType === "hq") return;
    fetch(`${API_BASE}/auth/oauth/providers`)
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(d.providers || []))
      .catch(() => setProviders([]));
  }, [portalType]);

  const isBuilding = portalType === "building";
  const isHq = portalType === "hq";
  const isPartnerSignup = isRegister && (portalType === "partner" || role === "partner");

  // [Task #133] Consent role for the documents API. For unified signup we still
  // need to show some matrix; default to manager which has the same required set.
  const consentRole = resolveConsentRole({
    selectedRole: portalTypeParam ? role : undefined,
    portalType: portalTypeParam ? portalType : "building",
  });

  const missingRequired = isRegister ? getMissingRequired(consentDocs, consentValue) : [];
  const consentsOk = !isRegister || missingRequired.length === 0;
  // [Task #137] 비밀번호 확인 일치 여부.
  const passwordsMatch = !isRegister || (password.length > 0 && password === passwordConfirm);
  // [Task #137] 전화번호 필수.
  const phoneOk = !isRegister || phone.trim().length > 0;

  async function performSubmit(finalValue: Record<string, boolean>) {
    setLoading(true);
    try {
      if (isRegister) {
        const decisions = buildDecisions(consentDocs, finalValue);
        const unified = !portalTypeParam;
        await register({
          email,
          password,
          name,
          role: unified ? undefined : role,
          phone: phone.trim() || undefined,
          portalType: unified ? undefined : (portalType as "building" | "partner" | "hq"),
          consents: { decisions, version: CONSENT_VERSION },
        });
      } else {
        await login(email, password, portalTypeParam ? (portalType as "building" | "partner" | "hq") : undefined);
      }
      setLocation(isRegister ? "/onboarding/role-select" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // [Task #178] 회원가입 1단계(account): 계정 정보 검증 후 약관 단계로 이동.
    if (isRegister && signupStep === "account") {
      if (!name.trim()) { setError("이름을 입력해 주세요"); return; }
      if (!email.trim()) { setError("이메일을 입력해 주세요"); return; }
      if (password.length < 6) { setError("비밀번호는 6자 이상이어야 합니다"); return; }
      if (!passwordsMatch) { setError("비밀번호와 비밀번호 확인이 일치하지 않습니다"); return; }
      if (!phoneOk) { setError("전화번호를 입력해 주세요"); return; }
      setSignupStep("consent");
      return;
    }

    if (isRegister && !consentsOk) {
      setError("필수 약관에 모두 동의해 주세요");
      return;
    }

    if (isRegister) {
      const missingOptional = getMissingOptional(consentDocs, consentValue);
      if (missingOptional.length > 0) {
        setPendingSubmit(() => (finalValue: Record<string, boolean>) => {
          void performSubmit(finalValue);
        });
        setRePromptOpen(true);
        return;
      }
    }

    void performSubmit(consentValue);
  };

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
    // Keep current decisions (declines preserved) and proceed.
    setRePromptOpen(false);
    const submit = pendingSubmit;
    setPendingSubmit(null);
    if (submit) submit(consentValue);
  }

  // [Task #368/#377] 인증 셸:
  // - 모바일: dvh + overflow-hidden 으로 페이지 스크롤바를 제거하고 카드 내부만 스크롤(앱 느낌).
  // - 데스크톱(md+): 셸을 해제(min-h-screen + 자동 높이 + 화면 중앙 정렬)하고 카드는 콘텐츠 높이로
  //   자연스럽게 줄어들도록 한다. 시니어 이용자 가시성을 위해 폰트와 여백을 한 단계 확대한다.
  return (
    <div
      className="flex flex-col overflow-hidden md:overflow-visible md:justify-center h-[100dvh] md:h-auto md:min-h-screen bg-gradient-to-br from-slate-50 to-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* 헤더: 뒤로가기 (포털별 페이지에서 통합 /login 으로 돌아가는 단축 경로) */}
      <div className="shrink-0 w-full max-w-md mx-auto px-5 pt-3 pb-1 md:pt-6">
        <button
          onClick={() => setLocation("/login")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          로그인으로 돌아가기
        </button>
      </div>

      {/* 본문: 카드 (모바일 flex-1 + 내부 스크롤, 데스크톱은 콘텐츠 높이) */}
      <div className="flex-1 min-h-0 md:flex-none w-full max-w-md mx-auto px-4 pt-3 pb-2 md:py-4 flex flex-col">
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 md:flex-none h-full md:h-auto flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          {/* 카드 상단: 제목·뱃지·에러·단계표시 (고정) */}
          <div className="shrink-0 px-5 pt-5 pb-3 md:px-6 md:pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isBuilding ? "bg-blue-50" : isHq ? "bg-indigo-50" : "bg-emerald-50"}`}>
                {isBuilding ? (
                  <Building2 className="w-5 h-5 text-blue-600" />
                ) : isHq ? (
                  <Shield className="w-5 h-5 text-indigo-600" />
                ) : (
                  <Store className="w-5 h-5 text-emerald-600" />
                )}
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold text-slate-900 leading-tight">
                  {isRegister ? "회원가입" : "관리의달인"}
                </h1>
                <p className="text-sm text-slate-500 leading-tight">
                  건물관리 AI자동화 솔루션
                </p>
              </div>
            </div>

            {isHq && (
              <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs leading-snug">
                본사 · 플랫폼 전용 포털
              </div>
            )}

            {error && (
              <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm leading-snug">
                {error}
              </div>
            )}

            {isRegister && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={signupStep === "account" ? "font-semibold text-slate-700" : ""}>1. 계정</span>
                <span>›</span>
                <span className={signupStep === "consent" ? "font-semibold text-slate-700" : ""}>2. 약관 동의</span>
              </div>
            )}
          </div>

          {/* 카드 본문: 입력 필드 (모바일 스크롤, 데스크톱 자연스러운 높이) */}
          <div className="flex-1 min-h-0 overflow-y-auto md:flex-none md:overflow-visible px-5 pb-3 md:px-6 space-y-3">
            {/* 소셜 로그인은 당분간 숨김 (네이버/카카오/구글) */}
            {false && !isHq && providers.length > 0 && (
              <div className="space-y-2">
                {providers.map((p) => {
                  const startUrl = `${API_BASE}/auth/oauth/${p.provider}/init?portalType=${portalType}`;
                  return (
                    <a
                      key={p.provider}
                      href={p.enabled ? startUrl : undefined}
                      aria-disabled={!p.enabled}
                      className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border text-sm font-medium transition-colors ${PROVIDER_STYLE[p.provider]} ${!p.enabled ? "opacity-40 pointer-events-none" : ""}`}
                      title={!p.enabled ? "관리자가 해당 공급자를 아직 구성하지 않았습니다" : undefined}
                    >
                      <ProviderIcon provider={p.provider} />
                      {PROVIDER_LABEL[p.provider]}
                    </a>
                  );
                })}
                <div className="flex items-center gap-3 pt-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] text-slate-400">또는 이메일로</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              </div>
            )}

            {/* 1단계: 계정 정보 (또는 로그인 모드) */}
            {(!isRegister || signupStep === "account") && (
              <>
                {isRegister && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="이름을 입력하세요"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="이메일을 입력하세요"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm pr-10"
                      placeholder="비밀번호를 입력하세요"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 확인</label>
                    <div className="relative">
                      <input
                        type={showPasswordConfirm ? "text" : "password"}
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        required
                        minLength={6}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm pr-10"
                        placeholder="비밀번호를 한번 더 입력하세요"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {passwordConfirm.length > 0 && password !== passwordConfirm && (
                      <p className="mt-1 text-xs text-red-600">비밀번호가 일치하지 않습니다</p>
                    )}
                  </div>
                )}

                {isRegister && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">전화번호</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="전화번호를 입력하세요"
                    />
                  </div>
                )}
              </>
            )}

            {/* 2단계: 약관 동의 */}
            {isRegister && signupStep === "consent" && (
              <>
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
              </>
            )}

            {/* 로그인 모드의 통신판매중개자 안내 (스크롤 영역에 함께 배치) */}
            {!isRegister && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 leading-snug">
                (주)관리의달인은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른
                <strong> 통신판매중개자</strong>이며, 통신판매의 당사자가 아닙니다.
                회원가입 시 이용약관·개인정보처리방침{role === "partner" || portalType === "partner" ? "·파트너 이용약관" : ""}에
                대한 동의 절차가 진행되며, 동의 이력은 별도로 기록·보관됩니다.
              </div>
            )}
          </div>

          {/* 카드 하단: 액션 버튼 + 회원가입/로그인 토글 (고정) */}
          <div className="shrink-0 px-5 pt-3 pb-4 md:px-6 md:pb-5 border-t border-slate-100 space-y-2">
            <div className="flex gap-2">
              {isRegister && signupStep === "consent" && (
                <button
                  type="button"
                  onClick={() => { setError(""); setSignupStep("account"); }}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  이전
                </button>
              )}
              <button
                type="submit"
                disabled={loading || (isRegister && signupStep === "consent" && !consentsOk)}
                className={`flex-1 py-2.5 rounded-lg text-white font-medium text-sm md:text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isBuilding
                    ? "bg-blue-600 hover:bg-blue-700"
                    : isHq
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {loading
                  ? "처리 중..."
                  : !isRegister
                    ? "로그인"
                    : signupStep === "account"
                      ? "다음"
                      : "회원가입 완료"}
              </button>
            </div>

            {!isHq && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setSignupStep("account");
                    setError("");
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {isRegister ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* 푸터: 개발 환경 빠른 로그인 */}
      {DevQuickLogin && (
        <div className="shrink-0 w-full max-w-md mx-auto px-4 pb-3">
          <Suspense fallback={null}>
            <DevQuickLogin />
          </Suspense>
        </div>
      )}

      <OptionalConsentRePromptDialog
        open={rePromptOpen}
        onConfirm={handleRePromptConfirm}
        onReject={handleRePromptReject}
      />
    </div>
  );
}
