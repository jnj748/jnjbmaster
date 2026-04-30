// [Task #132] 시설기사 위저드.
// [Task #651] 새 흐름: 주소검색 → 담당자 확인(맞습니다/다릅니다/없음 1800-0416) → 자격증 사진 → 완료.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, MapPin, ShieldCheck, UserCheck, AlertTriangle, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { formatPhoneNumberPartial } from "@/lib/format-korean";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface DaumResult {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  sido: string;
  sigungu: string;
  bname: string;
  buildingName: string;
  bcode: string;
  address: string;
}

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

interface ResponsibleStaff {
  building: { id: number; name: string | null; addressFull: string | null } | null;
  manager: { exists: boolean; name: string | null };
  hqExecutive: { exists: boolean; name: string | null };
}

export default function FacilityWizardPage() {
  const { token, user, setUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [phone, setPhone] = useState(user?.phone ?? "");

  // 단계 1: 주소
  const [postcodeReady, setPostcodeReady] = useState(false);
  const [addressFull, setAddressFull] = useState("");
  const [addressJibun, setAddressJibun] = useState("");
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");

  // 단계 2: 담당자 확인
  const [staff, setStaff] = useState<ResponsibleStaff | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);

  // 단계 3: 자격증 사진
  const [licensePhotoUrl, setLicensePhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  // 다음 우편번호 SDK 로딩 (manager-wizard 와 동일 패턴).
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;
    const ensureReady = () => {
      if (cancelled) return;
      const w = window as Window & { daum?: { Postcode?: unknown } };
      if (w.daum?.Postcode) { setPostcodeReady(true); return; }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        toast({ title: "주소검색 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.", variant: "destructive" });
        return;
      }
      window.setTimeout(ensureReady, 100);
    };
    if (!document.getElementById("daum-postcode-script")) {
      const s = document.createElement("script");
      s.id = "daum-postcode-script";
      s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      s.onload = ensureReady;
      s.onerror = () => {
        if (cancelled) return;
        toast({ title: "주소검색 모듈을 불러오지 못했습니다.", variant: "destructive" });
      };
      document.head.appendChild(s);
    } else {
      ensureReady();
    }
    return () => { cancelled = true; };
  }, [toast]);

  function openPostcode() {
    if (!window.daum?.Postcode) {
      toast({ title: "주소 검색 모듈을 로딩 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    new window.daum.Postcode({
      oncomplete: async (d: DaumResult) => {
        const full = d.roadAddress || d.address;
        setAddressFull(full);
        setAddressJibun(d.jibunAddress || "");
        setSido(d.sido || "");
        setSigungu(d.sigungu || "");
        // 자동으로 다음 단계로 이동하면서 담당자 조회.
        setStep(2);
        await loadResponsibleStaff(d.jibunAddress || "");
      },
    }).open();
  }

  async function loadResponsibleStaff(jibun: string) {
    if (!token || !jibun) return;
    setStaffLoading(true);
    setStaff(null);
    try {
      const r = await fetch(`${API_BASE}/buildings/responsible-staff?addressJibun=${encodeURIComponent(jibun)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setStaff(j);
      else toast({ title: j?.error ?? "담당자 조회 실패", variant: "destructive" });
    } finally {
      setStaffLoading(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setErr("");
    try {
      if (phone && phone !== user?.phone) {
        await fetch(`${API_BASE}/auth/me`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: user?.name, phone }),
        });
      }
      const patchRes = await fetch(`${API_BASE}/facility-signup-requests/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requestedAddress: addressFull.trim() || "(주소 미지정)",
          sido: sido.trim() || null,
          sigungu: sigungu.trim() || null,
          licensePhotoUrl: licensePhotoUrl ?? null,
          // [Task #651 round-4] step2 에서 확정된 buildingId 를 함께 전송하면
          //   서버가 주소 fallback 없이 동일 건물을 라우팅 대상으로 고정한다.
          buildingId: staff?.building?.id ?? null,
        }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        throw new Error(d?.error || "신청 정보 저장에 실패했습니다");
      }
      if (user) setUser({ ...user, phone });
      setLocation("/onboarding/facility-pending");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setSubmitting(false);
    }
  }

  // ── 1단계: 주소 검색 ──
  if (step === 1) {
    return (
      <WizardShell
        title="근무할 건물의 주소를 알려주세요"
        subtitle="주소를 검색하면 그 건물의 본부장·관리소장에게 가입 승인 요청이 자동 전달됩니다."
        currentStep={1}
        totalSteps={TOTAL_STEPS}
        nextLabel="주소 검색"
        nextDisabled={!postcodeReady}
        onNext={openPostcode}
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">연락처</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={14}
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumberPartial(e.target.value))}
              placeholder="010-0000-0000"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="button"
            onClick={openPostcode}
            disabled={!postcodeReady}
            className="w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 disabled:opacity-50 flex items-center justify-center gap-2 text-slate-700"
            data-testid="facility-address-trigger"
          >
            {postcodeReady ? <MapPin className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
            <span className="text-sm font-medium">{postcodeReady ? "주소 검색 시작" : "주소 검색 모듈 로딩 중…"}</span>
          </button>
          <p className="text-[11px] text-slate-500">
            건물의 정확한 주소를 검색하면 다음 단계에서 해당 건물의 본부장·관리소장 정보를 보여드립니다.
          </p>
        </div>
      </WizardShell>
    );
  }

  // ── 2단계: 담당자 확인 ──
  if (step === 2) {
    const buildingExists = !!staff?.building;
    const managerName = staff?.manager?.name ?? null;
    const hqName = staff?.hqExecutive?.name ?? null;
    // [Task #651] 본부장 또는 관리소장 중 한 명이라도 비어 있으면 신청 진행 자체를 차단.
    //   "그래도 진행" 우회를 제거하고, 1800-0416 안내만 노출한다.
    //   요구사항: "어느 한 쪽이라도 미배정이면 hard-stop".
    const noContacts = !managerName || !hqName;
    return (
      <WizardShell
        title="담당자 확인"
        subtitle="검색하신 건물의 본부장·관리소장이 맞는지 확인해 주세요."
        currentStep={2}
        totalSteps={TOTAL_STEPS}
        onPrev={() => setStep(1)}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">선택한 주소</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">{addressFull || "-"}</div>
          </div>

          {staffLoading && (
            <div className="rounded-lg border border-slate-200 p-3 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 담당자 정보를 조회하고 있어요…
            </div>
          )}

          {!staffLoading && (
            <div className="space-y-2">
              {buildingExists && !noContacts ? (
                <>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                      <UserCheck className="w-4 h-4" />
                      이 건물의 담당자
                    </div>
                    <div className="text-xs text-blue-900">
                      본부장: <span className="font-semibold">{hqName ?? "(미배정)"}</span>
                    </div>
                    <div className="text-xs text-blue-900">
                      관리소장: <span className="font-semibold">{managerName ?? "(미배정)"}</span>
                    </div>
                    <div className="pt-1 text-[11px] text-blue-800">
                      위 담당자가 회원님의 본부장·관리소장과 같은가요?
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                      data-testid="facility-confirm-yes"
                    >
                      맞습니다 — 다음 단계로
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
                      data-testid="facility-confirm-no"
                    >
                      다릅니다 — 주소 다시 검색
                    </button>
                    <a
                      href="tel:1800-0416"
                      className="w-full px-4 py-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700 text-center font-medium hover:bg-rose-100 inline-flex items-center justify-center gap-2"
                      data-testid="facility-confirm-call"
                    >
                      <PhoneCall className="w-4 h-4" />
                      담당자 정보가 다릅니다 · 1800-0416 상담
                    </a>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="w-4 h-4" />
                      {buildingExists ? "이 건물의 담당자 정보가 없습니다" : "해당 주소로 등록된 건물이 없습니다"}
                    </div>
                    <p className="text-xs text-amber-900">
                      플랫폼이 본부장·관리소장 배정을 도와드립니다. <span className="font-semibold">1800-0416</span> 으로 연락해 주세요.
                    </p>
                    <p className="text-[11px] text-amber-800">
                      담당자 정보가 확인되어야 가입 신청을 진행할 수 있습니다.
                    </p>
                  </div>
                  <a
                    href="tel:1800-0416"
                    className="w-full px-4 py-3 rounded-lg bg-amber-500 text-white text-sm font-medium text-center inline-flex items-center justify-center gap-2 hover:bg-amber-600"
                    data-testid="facility-no-building-call"
                  >
                    <PhoneCall className="w-4 h-4" />
                    1800-0416 상담 전화
                  </a>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
                    data-testid="facility-no-building-back"
                  >
                    주소 다시 검색
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </WizardShell>
    );
  }

  // ── 3단계: 자격증 사진 ──
  // [Task #651] 자격증 사진은 필수. 업로드 전에는 제출 버튼을 비활성화한다.
  const licenseReady = !!licensePhotoUrl && licensePhotoUrl.trim() !== "";
  return (
    <WizardShell
      title="자격증 사진을 첨부해 주세요"
      subtitle="시설관리 업무 수행에 필요한 자격증 사본을 제출합니다. 승인 시 검토 자료로만 사용됩니다."
      currentStep={3}
      totalSteps={TOTAL_STEPS}
      onPrev={() => setStep(2)}
      loading={submitting}
      nextLabel="제출하고 승인 요청"
      nextDisabled={submitting || !licenseReady}
      onNext={submit}
    >
      {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            자격증 사진 <span className="text-rose-600">*</span>
          </div>
          <div className="mt-2">
            <PhotoUploadField
              label="자격증 사진"
              value={licensePhotoUrl}
              onChange={setLicensePhotoUrl}
              testId="facility-license-photo"
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            가입 신청에는 자격증 사진 1장이 필요합니다. 사진을 첨부해야 제출할 수 있습니다.
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
          제출 후 본부장 또는 관리소장이 승인하면 모든 기능을 사용할 수 있습니다.
        </div>
      </div>
    </WizardShell>
  );
}
