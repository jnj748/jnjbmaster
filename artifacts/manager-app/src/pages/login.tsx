import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Building2, Store, Shield, ArrowLeft, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";

const CONSENT_VERSION = "1.0";

const TERMS_PREVIEW = `[이용약관 요지]

제1조 (목적)
본 약관은 (주)관리의달인이 제공하는 집합건물 관리행정 및 견적·계약 중개 서비스의 이용 조건을 정합니다.

제2조 (회사의 지위)
회사는 「전자상거래 등에서의 소비자보호에 관한 법률」 상의 통신판매중개자이며, 통신판매의 당사자가 아닙니다. 회사는 관리단(건물)과 파트너사(용역사) 간의 견적·계약·이행을 위한 도구·정보·중개 환경을 제공합니다. 개별 용역계약의 이행·의무·하자·분쟁에 대한 당사자로서의 책임을 지지 않으며, 책임은 관리단과 파트너사에게 귀속됩니다.

[개인정보처리방침 요지]
1. 수집 항목: 이메일, 이름, 전화번호, 소속 건물·업체 정보 및 서비스 이용 기록
2. 수집 목적: 서비스 제공, 본인 확인, 결재·계약 이력 관리, 알림 발송
3. 보유 기간: 회원 탈퇴 시까지 (관계 법령에 따라 일정 기간 보관 가능)

[파트너 이용약관 요지]
1. 파트너사는 회사가 제공하는 견적 요청에 응할 수 있으며, 계약 체결 및 이행의 당사자는 파트너사와 관리단입니다.
2. 회사는 견적 매칭·정산 도구만 제공하며, 계약 이행 결과에 대한 보증을 하지 않습니다.
3. 파트너사는 정확한 사업자 정보·자격을 등록할 의무가 있습니다.`;

export default function Login() {
  const { portalType } = useParams<{ portalType: string }>();
  const { login, register } = useAuth();
  const [, setLocation] = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(portalType === "partner" ? "partner" : portalType === "hq" ? "hq_executive" : "manager");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreePartner, setAgreePartner] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const isBuilding = portalType === "building";
  const isHq = portalType === "hq";
  const isPartnerSignup = isRegister && (portalType === "partner" || role === "partner");
  const consentsOk = !isRegister || (agreeTerms && agreePrivacy && (!isPartnerSignup || agreePartner));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isRegister && !consentsOk) {
      setError("필수 약관에 모두 동의해 주세요");
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const consentTypes = ["intermediary_terms", "privacy_policy"];
        if (isPartnerSignup) consentTypes.push("partner_terms");
        await register({
          email,
          password,
          name,
          role,
          phone: phone || undefined,
          portalType: portalType!,
          consents: { types: consentTypes, version: CONSENT_VERSION },
        });
      } else {
        await login(email, password, portalType!);
      }
      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md px-6">
        <button
          onClick={() => setLocation("/portal")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          포털 선택으로 돌아가기
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
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
              <h1 className="text-xl font-semibold text-slate-900">
                {isRegister ? "회원가입" : "로그인"}
              </h1>
              <p className="text-sm text-slate-500">
                {isBuilding ? "현장 관리" : isHq ? "본사 총괄" : "파트너사"} 포털
              </p>
            </div>
          </div>

          {isBuilding && (
            <div className="mb-4 p-2.5 rounded-lg bg-blue-50 text-blue-700 text-xs">
              집합건물 관리 (공동주택관리법 비적용, 150세대 미만)
            </div>
          )}

          {isHq && (
            <div className="mb-4 p-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs">
              총괄책임자 · 플랫폼 관리자 전용 포털
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                <label className="block text-sm font-medium text-slate-700 mb-1">전화번호 (선택)</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="전화번호를 입력하세요"
                />
              </div>
            )}

            {isRegister && (
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
                  <strong> 통신판매중개자</strong>이며, 통신판매의 당사자가 아닙니다. 개별 용역계약의
                  이행·의무·하자에 관한 책임은 관리단(건물)과 파트너사(용역사)에게 있습니다.
                </div>

                {showTerms && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white px-2.5 py-2">
                    <pre className="text-[10px] whitespace-pre-wrap font-sans leading-4 text-slate-600">
                      {TERMS_PREVIEW}
                    </pre>
                  </div>
                )}

                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span>
                    <strong className="text-red-600">[필수]</strong> 이용약관에 동의합니다.
                    (회사는 통신판매중개자이며, 통신판매의 당사자가 아닙니다)
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agreePrivacy}
                    onChange={(e) => setAgreePrivacy(e.target.checked)}
                  />
                  <span>
                    <strong className="text-red-600">[필수]</strong> 개인정보처리방침에 동의합니다.
                  </span>
                </label>
                {isPartnerSignup && (
                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={agreePartner}
                      onChange={(e) => setAgreePartner(e.target.checked)}
                    />
                    <span>
                      <strong className="text-red-600">[필수]</strong> 파트너 이용약관에 동의합니다.
                      (계약 당사자는 파트너사와 관리단이며, 플랫폼은 이행을 보증하지 않습니다)
                    </span>
                  </label>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (isRegister && !consentsOk)}
              className={`w-full py-2.5 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isBuilding
                  ? "bg-blue-600 hover:bg-blue-700"
                  : isHq
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {loading ? "처리 중..." : isRegister ? "회원가입" : "로그인"}
            </button>
          </form>

          {!isHq && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                {isRegister ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
              </button>
            </div>
          )}

          {!isRegister && (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
              (주)관리의달인은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른
              <strong> 통신판매중개자</strong>이며, 통신판매의 당사자가 아닙니다.
              회원가입 시 이용약관·개인정보처리방침{role === "partner" || portalType === "partner" ? "·파트너 이용약관" : ""}에
              대한 동의 절차가 진행되며, 동의 이력은 별도로 기록·보관됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
