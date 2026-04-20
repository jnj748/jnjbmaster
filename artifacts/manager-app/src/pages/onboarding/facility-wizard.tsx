// [Task #132] 시설기사 위저드. 본인 정보(주소·자격) 등록 후 승인 대기 화면으로 이동.
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { WizardShell } from "@/components/wizard/wizard-shell";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function FacilityWizardPage() {
  const { token, user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [requestedAddress, setRequestedAddress] = useState("");
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  return (
    <WizardShell
      title="시설기사 정보 등록"
      subtitle="등록 후 관리소장 또는 플랫폼 관리자의 승인을 받습니다."
      currentStep={1}
      totalSteps={2}
      loading={loading}
      nextLabel="제출하고 승인 요청"
      nextDisabled={!requestedAddress.trim()}
      onNext={async () => {
        setLoading(true);
        setErr("");
        try {
          // Update phone (best-effort)
          if (phone && phone !== user?.phone) {
            await fetch(`${API_BASE}/auth/me`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ name: user?.name, phone }),
            });
          }
          // 회원가입 시 만들어진 본인 시설기사 신청건에 주소/지역을 갱신.
          const patchRes = await fetch(`${API_BASE}/facility-signup-requests/me`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              requestedAddress: requestedAddress.trim(),
              sido: sido.trim() || null,
              sigungu: sigungu.trim() || null,
            }),
          });
          if (!patchRes.ok) {
            const d = await patchRes.json().catch(() => ({}));
            throw new Error(d?.error || "신청 정보 저장에 실패했습니다");
          }
          // 클라이언트 캐시 갱신
          if (user) setUser({ ...user, phone });
          setLocation("/onboarding/facility-pending");
        } catch (e) {
          setErr(e instanceof Error ? e.message : "오류");
        } finally {
          setLoading(false);
        }
      }}
    >
      {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">연락처</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">근무 희망 건물 주소</label>
          <input
            type="text"
            value={requestedAddress}
            onChange={(e) => setRequestedAddress(e.target.value)}
            placeholder="예) 서울시 강남구 테헤란로 123"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">시/도</label>
            <input value={sido} onChange={(e) => setSido(e.target.value)} placeholder="서울특별시" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">시/군/구</label>
            <input value={sigungu} onChange={(e) => setSigungu(e.target.value)} placeholder="강남구" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          제출하면 해당 지역 관리소장 또는 플랫폼 관리자가 승인 여부를 검토합니다. 승인 전까지는 일부 기능이 제한됩니다.
        </div>
      </div>
    </WizardShell>
  );
}
