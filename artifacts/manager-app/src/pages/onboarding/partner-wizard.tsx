// [Task #132] 파트너사 위저드. 회사정보 → 사업자등록증 업로드 → 취급분야 선택.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WizardShell } from "@/components/wizard/wizard-shell";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface Category { id: number; code: string; label: string; sortOrder: number }

export default function PartnerWizardPage() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [companyName, setCompanyName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [contactPhone, setContactPhone] = useState(user?.phone ?? "");
  const [agreePartnerTerms, setAgreePartnerTerms] = useState(false);
  const [bizCertUrl, setBizCertUrl] = useState<string | null>(null);
  const [bizCertName, setBizCertName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/vendor-categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => null);
  }, [token]);

  async function uploadBizCert(file: File) {
    setUploading(true);
    setErr("");
    try {
      const signRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!signRes.ok) throw new Error("업로드 URL 발급 실패");
      const { uploadURL, objectPath } = await signRes.json();
      const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!putRes.ok) throw new Error("파일 업로드 실패");
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      setBizCertUrl(objectPath);
      setBizCertName(file.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setUploading(false);
    }
  }

  function toggleCategory(code: string) {
    setSelectedCategories((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }

  if (step === 1) {
    return (
      <WizardShell
        title="파트너사 회사 정보"
        subtitle="견적·계약에 사용될 회사 기본 정보를 입력합니다."
        currentStep={1}
        totalSteps={3}
        nextDisabled={!companyName.trim() || !businessNumber.trim() || !representativeName.trim() || !agreePartnerTerms}
        onNext={() => setStep(2)}
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">회사명</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">사업자등록번호</label>
            <input value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="000-00-00000" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">대표자명</label>
            <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="홍길동" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">대표 연락처</label>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="02-0000-0000" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <label className="flex items-start gap-2 mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={agreePartnerTerms}
              onChange={(e) => setAgreePartnerTerms(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-slate-700">
              <strong>(필수)</strong> 파트너사 이용약관·중개수수료·정산 정책에 동의합니다. 동의하지 않으면 파트너사 등록을 진행할 수 없습니다.
            </span>
          </label>
        </div>
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        title="사업자등록증 업로드"
        subtitle="견적 매칭 시 발주처에 자동 노출됩니다."
        currentStep={2}
        totalSteps={3}
        onPrev={() => setStep(1)}
        onNext={() => setStep(3)}
        nextDisabled={!bizCertUrl}
      >
        {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
        <label className="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30">
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
          ) : bizCertUrl ? (
            <div className="text-sm text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {bizCertName} 업로드 완료
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              <Upload className="w-6 h-6 mx-auto mb-1 text-slate-400" />
              클릭해서 사업자등록증 파일 선택 (PDF/이미지)
            </div>
          )}
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadBizCert(f);
            }}
          />
        </label>
        <p className="mt-2 text-[11px] text-slate-500">건너뛸 경우 첫 견적 응답 전까지 등록을 마쳐야 합니다.</p>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      title="취급 분야 선택"
      subtitle="복수 선택 가능. 견적 매칭에 활용됩니다."
      currentStep={3}
      totalSteps={3}
      onPrev={() => setStep(2)}
      loading={loading}
      nextLabel="등록 완료"
      nextDisabled={selectedCategories.size === 0}
      onNext={async () => {
        setLoading(true);
        setErr("");
        try {
          // 회사 정보를 vendor 레코드에 저장. 기존 vendors POST endpoint 사용 시도.
          const body = {
            name: companyName,
            businessNumber,
            representativeName,
            phone: contactPhone,
            businessRegUrl: bizCertUrl,
            categories: Array.from(selectedCategories),
          };
          // 파트너사 약관 동의 기록 먼저 저장 (멱등 — 백엔드는 가장 최근 기록 사용).
          const consentRes = await fetch(`${API_BASE}/platform/consents`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ consentType: "partner_terms", version: "1.0", contextRef: "partner-wizard" }),
          });
          if (!consentRes.ok) {
            const d = await consentRes.json().catch(() => ({}));
            throw new Error(d?.error || "약관 동의 기록에 실패했습니다");
          }
          const res = await fetch(`${API_BASE}/vendors/onboarding`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d?.error || "파트너사 등록에 실패했습니다");
          }
          setLocation("/");
        } catch (e) {
          setErr(e instanceof Error ? e.message : "오류");
        } finally {
          setLoading(false);
        }
      }}
    >
      {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {categories.map((c) => {
          const active = selectedCategories.has(c.code);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.code)}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                active ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {categories.length === 0 && (
        <div className="text-xs text-slate-500">분야 목록을 불러오는 중...</div>
      )}
    </WizardShell>
  );
}
