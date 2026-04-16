import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Building2, Store, Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";

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

  const isBuilding = portalType === "building";
  const isHq = portalType === "hq";
  const themeColor = isBuilding ? "blue" : isHq ? "indigo" : "emerald";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        await register({
          email,
          password,
          name,
          role,
          phone: phone || undefined,
          portalType: portalType!,
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

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-50 ${
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

          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
            (주)관리의달인은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른
            <strong> 통신판매중개자</strong>이며, 통신판매의 당사자가 아닙니다. 최초 로그인 시
            이용약관·개인정보처리방침{role === "partner" || portalType === "partner" ? "·파트너 이용약관" : ""}에
            대한 동의 절차가 진행되며, 동의 이력은 별도로 기록·보관됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
