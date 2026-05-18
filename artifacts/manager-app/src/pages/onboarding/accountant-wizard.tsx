// [Task #651] 경리·회계 위저드 (가입 신청 단계).
//   새 흐름: 주소검색 → 담당자 확인 → 완료(승인 대기).
//   기존 부과면적/OCR/회계자료 단계는 승인 후 /onboarding/accountant-setup 으로 이동.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, MapPin, UserCheck, AlertTriangle, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { WizardShell } from "@/components/wizard/wizard-shell";
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

type Step = 1 | 2;
const TOTAL_STEPS = 2;

interface ResponsibleStaff {
  building: { id: number; name: string | null; addressFull: string | null } | null;
  manager: { exists: boolean; name: string | null };
  hqExecutive: { exists: boolean; name: string | null };
}

export default function AccountantWizardPage() {
  const { token, user, setUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [postcodeReady, setPostcodeReady] = useState(false);
  const [addressFull, setAddressFull] = useState("");
  const [addressJibun, setAddressJibun] = useState("");
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [staff, setStaff] = useState<ResponsibleStaff | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  // [Task #651] 신청 단계에서 동일 건물 활성 경리 존재 여부를 미리 안내한다.
  //   서버는 승인 시점에도 partial unique index 로 동시성을 차단하지만, 사용자에게
  //   불필요한 신청 후 거절을 유도하지 않도록 위저드에서 즉시 막는다.
  const [duplicateCheck, setDuplicateCheck] = useState<{
    exists: boolean;
    conflictBuildingName: string | null;
    checkFailed: boolean;
  } | null>(null);
  const [duplicateChecking, setDuplicateChecking] = useState(false);

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
        setStep(2);
        await loadResponsibleStaff(d.jibunAddress || "", full || "");
      },
    }).open();
  }

  async function loadResponsibleStaff(jibun: string, full: string) {
    // [송정 케이스 fix #2] jibun 비어 있어도 도로명(full) 만으로 조회.
    if (!token || (!jibun && !full)) return;
    setStaffLoading(true);
    setStaff(null);
    setDuplicateCheck(null);
    setDuplicateChecking(true);
    try {
      const qs = new URLSearchParams();
      if (jibun) qs.set("addressJibun", jibun);
      if (full) qs.set("addressFull", full);
      const r = await fetch(`${API_BASE}/buildings/responsible-staff?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setStaff(j);
      else toast({ title: j?.error ?? "담당자 조회 실패", variant: "destructive" });
      // [Task #651] 동일 건물에 활성 경리가 이미 있으면 신청 단계에서 즉시 차단.
      //   사전 점검이 실패하면 fail-closed: 진행 자체를 막아 1800-0416 안내로 유도.
      //   (서버는 partial unique index 로도 최종 차단하지만, 사용자에게 신청 후
      //    거절 흐름을 보이지 않도록 위저드에서 미리 막는다.)
      try {
        const dup = await fetch(
          `${API_BASE}/buildings/check-manager?role=accountant&addressJibun=${encodeURIComponent(jibun)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const dj = await dup.json().catch(() => ({}));
        if (dup.ok) {
          setDuplicateCheck({
            exists: !!dj?.exists,
            conflictBuildingName: dj?.conflictBuildingName ?? null,
            checkFailed: false,
          });
        } else {
          setDuplicateCheck({
            exists: false,
            conflictBuildingName: null,
            checkFailed: true,
          });
        }
      } catch {
        setDuplicateCheck({
          exists: false,
          conflictBuildingName: null,
          checkFailed: true,
        });
      }
    } finally {
      setStaffLoading(false);
      setDuplicateChecking(false);
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
          // [Task #651 round-4] step2 에서 확정된 buildingId 를 함께 전송 → 서버가
          //   주소 fallback 없이 동일 건물을 라우팅 대상으로 고정한다.
          buildingId: staff?.building?.id ?? null,
        }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        throw new Error(d?.error || "신청 정보 저장에 실패했습니다");
      }
      if (user) setUser({ ...user, phone });
      // [Task #651] 가입 신청 완료 → 시설담당과 동일한 승인 대기 화면으로 이동.
      setLocation("/onboarding/facility-pending");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 1) {
    return (
      <WizardShell
        title="담당하실 건물 주소를 알려주세요"
        subtitle="주소를 검색하면 본부장·관리소장에게 가입 승인 요청이 자동 전달됩니다."
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
            data-testid="accountant-address-trigger"
          >
            {postcodeReady ? <MapPin className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
            <span className="text-sm font-medium">{postcodeReady ? "주소 검색 시작" : "주소 검색 모듈 로딩 중…"}</span>
          </button>
          <p className="text-[11px] text-slate-500">
            한 건물에는 한 명의 경리만 등록할 수 있습니다. 같은 건물에 이미 활성 경리가 있으면 가입 승인이 차단됩니다.
          </p>
        </div>
      </WizardShell>
    );
  }

  const buildingExists = !!staff?.building;
  const managerName = staff?.manager?.name ?? null;
  const hqName = staff?.hqExecutive?.name ?? null;
  // [Task #651] 본부장 또는 관리소장 중 한 명이라도 비어 있으면 신청 진행 자체를 차단.
  //   요구사항: "어느 한 쪽이라도 미배정이면 hard-stop · 1800-0416 안내".
  const noContacts = !managerName || !hqName;
  // [Task #651] 같은 건물에 이미 활성 경리가 있으면 신청 단계에서 차단.
  const duplicateBlocked = !!duplicateCheck?.exists;
  // [Task #651] 사전 점검(check-manager) 자체가 실패한 경우에도 fail-closed:
  //   상태가 불확실하면 진행시키지 않고 1800-0416 안내로 유도한다.
  const duplicateCheckFailed = !!duplicateCheck?.checkFailed;
  const proceedAllowed =
    buildingExists && !noContacts && !duplicateBlocked && !duplicateCheckFailed;

  return (
    <WizardShell
      title="담당자 확인"
      subtitle="검색하신 건물의 본부장·관리소장이 맞는지 확인해 주세요."
      currentStep={2}
      totalSteps={TOTAL_STEPS}
      onPrev={() => setStep(1)}
      loading={submitting}
    >
      {err && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3">{err}</div>}
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

        {!staffLoading && duplicateBlocked && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="w-4 h-4" />
              이미 해당 건물에 경리가 등록되어 있습니다
            </div>
            <p className="text-xs text-rose-900">
              {duplicateCheck?.conflictBuildingName
                ? <>건물명: <span className="font-semibold">{duplicateCheck.conflictBuildingName}</span></>
                : <>같은 건물의 활성 경리가 이미 등록되어 있어 신청을 진행할 수 없습니다.</>}
            </p>
            <p className="text-[11px] text-rose-800">
              한 건물에는 한 명의 경리만 등록할 수 있습니다. 자세한 문의는 <span className="font-semibold">1800-0416</span> 으로 연락해 주세요.
            </p>
            <a
              href="tel:1800-0416"
              className="mt-1 inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"
              data-testid="accountant-duplicate-call"
            >
              <PhoneCall className="w-4 h-4" />
              1800-0416 상담 전화
            </a>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
              data-testid="accountant-duplicate-back"
            >
              주소 다시 검색
            </button>
          </div>
        )}

        {!staffLoading && !duplicateBlocked && duplicateChecking && (
          <div className="rounded-lg border border-slate-200 p-3 flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> 동일 건물 경리 등록 여부를 확인하고 있어요…
          </div>
        )}

        {!staffLoading && !duplicateBlocked && (
          <div className="space-y-2">
            {proceedAllowed ? (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <UserCheck className="w-4 h-4" />
                    이 건물의 담당자
                  </div>
                  <div className="text-xs text-emerald-900">
                    본부장: <span className="font-semibold">{hqName ?? "(미배정)"}</span>
                  </div>
                  <div className="text-xs text-emerald-900">
                    관리소장: <span className="font-semibold">{managerName ?? "(미배정)"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                  data-testid="accountant-confirm-yes"
                >
                  {submitting ? "제출 중…" : "맞습니다 — 가입 신청 제출"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
                  data-testid="accountant-confirm-no"
                >
                  다릅니다 — 주소 다시 검색
                </button>
                <a
                  href="tel:1800-0416"
                  className="w-full px-4 py-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700 text-center font-medium hover:bg-rose-100 inline-flex items-center justify-center gap-2"
                  data-testid="accountant-confirm-call"
                >
                  <PhoneCall className="w-4 h-4" />
                  담당자 정보가 다릅니다 · 1800-0416 상담
                </a>
              </>
            ) : duplicateCheckFailed ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <AlertTriangle className="w-4 h-4" />
                    경리 등록 여부를 확인하지 못했습니다
                  </div>
                  <p className="text-xs text-amber-900">
                    한 건물에는 한 명의 경리만 등록할 수 있어 사전 점검 없이는 진행할 수 없습니다. <span className="font-semibold">1800-0416</span> 으로 연락해 주세요.
                  </p>
                </div>
                <a
                  href="tel:1800-0416"
                  className="w-full px-4 py-3 rounded-lg bg-amber-500 text-white text-sm font-medium text-center inline-flex items-center justify-center gap-2 hover:bg-amber-600"
                  data-testid="accountant-checkfailed-call"
                >
                  <PhoneCall className="w-4 h-4" />
                  1800-0416 상담 전화
                </a>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
                  data-testid="accountant-checkfailed-back"
                >
                  주소 다시 검색
                </button>
              </div>
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
                  data-testid="accountant-no-building-call"
                >
                  <PhoneCall className="w-4 h-4" />
                  1800-0416 상담 전화
                </a>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
                  data-testid="accountant-no-building-back"
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
