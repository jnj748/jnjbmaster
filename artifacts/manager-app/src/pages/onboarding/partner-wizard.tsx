// [Task #284] 파트너 온보딩 위저드 (신규).
// 단계:
//   1) 회사 기본정보 (사업자명·등록번호·대표자명·연락처·이메일)
//   2) 업역 선택 (다중, 최소 1개)
//   3) 사업자등록증 업로드 (이미지/PDF, 필수)
//   4) 파트너 약관 동의 + 최종 검토 → 등록 완료
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, Upload, FileText, Camera, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";
import { VendorAvatar } from "@/components/vendor-avatar";
import {
  ConsentSection,
  buildDecisions,
  getMissingRequired,
  type ConsentDocument,
} from "@/components/consent-section";
import { formatBusinessNumber, formatPhoneNumberPartial } from "@/lib/format-korean";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");
// [Task #661] 위저드에 intro/profileImageUrl 필드를 추가하면서 임시저장 키를 v2 로 올린다.
//   v1 의 draft 는 자동 무시되어 새 가입자만 영향을 받는다.
const STORAGE_KEY = "partnerWizard:draft:v2";
const INTRO_MAX = 30;

interface Category {
  id: number;
  code: string;
  label: string;
  sortOrder: number;
  // [Task #734] 2단 카테고리. null = 대분류, 값 = 부모 code.
  //   본 화면(현행 평면 1단)은 T3 가입 흐름 재구성 전까지 자식 항목을 숨겨
  //   기존과 동일한 대분류 9~12개만 노출한다.
  parentCode?: string | null;
  active?: boolean;
}

interface DraftState {
  companyName: string;
  businessNumber: string;
  representativeName: string;
  contactPhone: string;
  contactEmail: string;
  selectedCategories: string[];
  bizCertUrl: string | null;
  bizCertName: string | null;
  bizCertSize: number | null;
  // [Task #661] 위저드에서 받는 추가(선택) 필드.
  intro: string;
  profileImageUrl: string | null;
}

const TOTAL_STEPS = 4;

// 형식 검증 유틸 ────────────────────────────────────────────
function isValidBusinessNumber(value: string): boolean {
  return /^\d{3}-\d{2}-\d{5}$/.test(value);
}
function isValidPhone(value: string): boolean {
  // 02-xxx(x)-xxxx 또는 010-xxxx-xxxx 등 7~11자리 숫자.
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 11;
}
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function loadDraft(): Partial<DraftState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<DraftState>;
  } catch {
    return {};
  }
}

export default function PartnerWizardPage() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();

  const initial = useMemo(loadDraft, []);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [businessNumber, setBusinessNumber] = useState(initial.businessNumber ?? "");
  const [representativeName, setRepresentativeName] = useState(initial.representativeName ?? "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? user?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? user?.email ?? "");

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(initial.selectedCategories ?? []),
  );

  // [Task #507] 라벨/숨김 input 직접 클릭 패턴을 단일 트리거 + 공용 시트로 통일.
  const [bizCertPickerOpen, setBizCertPickerOpen] = useState(false);
  const [bizCertUrl, setBizCertUrl] = useState<string | null>(initial.bizCertUrl ?? null);
  const [bizCertName, setBizCertName] = useState<string | null>(initial.bizCertName ?? null);
  const [bizCertSize, setBizCertSize] = useState<number | null>(initial.bizCertSize ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // [Task #661] 1줄 소개글(선택, 30자 클램프) + 프로필 사진(선택). Step 3 에 배치.
  const [intro, setIntro] = useState((initial.intro ?? "").slice(0, INTRO_MAX));
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(initial.profileImageUrl ?? null);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [consentDocs, setConsentDocs] = useState<ConsentDocument[]>([]);
  const [consentValue, setConsentValue] = useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // 카테고리 로드 ──
  useEffect(() => {
    let cancelled = false;
    setCategoriesLoading(true);
    fetch(`${API_BASE}/vendor-categories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (cancelled) return;
        const raw: Category[] = Array.isArray(d?.categories) ? d.categories : [];
        // [Task #734] 임시: 자식(소분류) 은 T3 가입 흐름 재구성 전까지 숨김.
        const list = raw.filter((c) => !c.parentCode);
        list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"));
        setCategories(list);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 입력값 자동 저장 (제출 실패 시 복구용) ──
  useEffect(() => {
    const draft: DraftState = {
      companyName,
      businessNumber,
      representativeName,
      contactPhone,
      contactEmail,
      selectedCategories: Array.from(selectedCategories),
      bizCertUrl,
      bizCertName,
      bizCertSize,
      intro,
      profileImageUrl,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [
    companyName,
    businessNumber,
    representativeName,
    contactPhone,
    contactEmail,
    selectedCategories,
    bizCertUrl,
    bizCertName,
    bizCertSize,
    intro,
    profileImageUrl,
  ]);

  // Step 1 검증 ──
  const errStep1 = {
    companyName: !companyName.trim() ? "사업자명(법인명)을 입력해 주세요" : "",
    businessNumber: !businessNumber.trim()
      ? "사업자등록번호를 입력해 주세요"
      : !isValidBusinessNumber(businessNumber)
        ? "형식: 000-00-00000"
        : "",
    representativeName: !representativeName.trim() ? "대표자명을 입력해 주세요" : "",
    contactPhone: !contactPhone.trim()
      ? "대표 연락처를 입력해 주세요"
      : !isValidPhone(contactPhone)
        ? "올바른 전화번호 형식이 아닙니다"
        : "",
    contactEmail: !contactEmail.trim()
      ? "담당자 이메일을 입력해 주세요"
      : !isValidEmail(contactEmail)
        ? "올바른 이메일 형식이 아닙니다"
        : "",
  };
  const step1Valid = Object.values(errStep1).every((v) => !v);

  // Step 2 검증 ──
  const step2Valid = selectedCategories.size > 0;

  // Step 3 검증 ──
  const step3Valid = !!bizCertUrl;

  // Step 4 검증 ──
  const missingRequiredConsents = getMissingRequired(consentDocs, consentValue);
  const step4Valid = consentDocs.length > 0 && missingRequiredConsents.length === 0;

  function toggleCategory(code: string) {
    setSelectedCategories((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }

  // [Task #661] 프로필 사진 업로드. 같은 storage 절차를 사용하지만
  //   이미지 전용·10MB 제한으로 빠르게 검증한다.
  async function handleProfileUpload(file: File) {
    setProfileError("");
    if (!/^image\//.test(file.type)) {
      setProfileError("이미지(JPG/PNG/WebP) 파일만 업로드할 수 있습니다");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setProfileError("이미지 크기는 10MB 이하여야 합니다");
      return;
    }
    setProfileUploading(true);
    try {
      const signRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!signRes.ok) throw new Error("업로드 URL 발급 실패");
      const { uploadURL, objectPath } = await signRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("이미지 업로드 실패");
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      setProfileImageUrl(objectPath);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다");
    } finally {
      setProfileUploading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadError("");
    if (!/^image\/|application\/pdf$/.test(file.type) && !/\.(pdf|jpg|jpeg|png|webp|heic)$/i.test(file.name)) {
      setUploadError("이미지(JPG/PNG/WebP) 또는 PDF 파일만 업로드 가능합니다");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("파일 크기는 20MB 이하여야 합니다");
      return;
    }
    setUploading(true);
    try {
      const signRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!signRes.ok) throw new Error("업로드 URL 발급에 실패했습니다");
      const { uploadURL, objectPath } = await signRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("파일 업로드에 실패했습니다");
      await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      setBizCertUrl(objectPath);
      setBizCertName(file.name);
      setBizCertSize(file.size);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!step1Valid || !step2Valid || !step3Valid || !step4Valid) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      // 1) 약관 동의 기록 (필수+선택). 멱등.
      const decisions = buildDecisions(consentDocs, consentValue);
      const consentResults = await Promise.allSettled(
        decisions
          .filter((d) => d.agreed)
          .map((d) =>
            fetch(`${API_BASE}/platform/consents`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                consentType: d.type,
                version: d.version,
                contextRef: "partner-wizard",
              }),
            }).then(async (r) => {
              if (!r.ok) {
                const d2 = await r.json().catch(() => ({}));
                throw new Error(d2?.error || "약관 동의 기록에 실패했습니다");
              }
            }),
          ),
      );
      const failedConsent = consentResults.find((r) => r.status === "rejected");
      if (failedConsent && failedConsent.status === "rejected") {
        throw new Error(
          failedConsent.reason instanceof Error
            ? failedConsent.reason.message
            : "약관 동의 기록에 실패했습니다",
        );
      }

      // 2) 파트너 온보딩 저장.
      const body = {
        name: companyName.trim(),
        businessNumber: businessNumber.trim(),
        representativeName: representativeName.trim(),
        phone: contactPhone.trim(),
        email: contactEmail.trim(),
        businessRegUrl: bizCertUrl,
        categories: Array.from(selectedCategories),
        // [Task #661] 선택값. 비어 있으면 서버에서 null 처리.
        intro: intro.trim().slice(0, INTRO_MAX) || null,
        profileImageUrl: profileImageUrl,
      };
      const res = await fetch(`${API_BASE}/vendors/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg =
          res.status === 404
            ? "파트너 등록 서비스를 찾을 수 없어 입력하신 내용을 임시 저장했습니다. 잠시 후 다시 시도해 주세요."
            : d?.error || "파트너 등록에 실패했습니다";
        throw new Error(msg);
      }

      // 성공 — 임시 저장 정리.
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setLocation("/");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "등록 중 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  // 공통 입력 라벨/에러 헬퍼 ─
  function fieldErr(name: keyof typeof errStep1) {
    return touched[name] && errStep1[name] ? errStep1[name] : "";
  }

  // ───────── Step 1: 회사 기본정보 ─────────
  if (step === 1) {
    return (
      <WizardShell
        title="회사 기본정보"
        subtitle="견적·계약·정산에 사용되는 정보입니다."
        currentStep={1}
        totalSteps={TOTAL_STEPS}
        nextDisabled={!step1Valid}
        onNext={() => {
          setTouched({
            companyName: true,
            businessNumber: true,
            representativeName: true,
            contactPhone: true,
            contactEmail: true,
          });
          if (step1Valid) setStep(2);
        }}
      >
        <div className="space-y-3 text-sm">
          <Field
            label="사업자명(법인명)"
            required
            value={companyName}
            onChange={setCompanyName}
            onBlur={() => setTouched((t) => ({ ...t, companyName: true }))}
            placeholder="(주)관리의달인"
            error={fieldErr("companyName")}
            testid="partner-company-name"
          />
          <Field
            label="사업자등록번호"
            required
            value={businessNumber}
            onChange={(v) => setBusinessNumber(formatBusinessNumber(v))}
            onBlur={() => setTouched((t) => ({ ...t, businessNumber: true }))}
            placeholder="000-00-00000"
            inputMode="numeric"
            error={fieldErr("businessNumber")}
            testid="partner-business-number"
          />
          <Field
            label="대표자명"
            required
            value={representativeName}
            onChange={setRepresentativeName}
            onBlur={() => setTouched((t) => ({ ...t, representativeName: true }))}
            placeholder="홍길동"
            error={fieldErr("representativeName")}
            testid="partner-representative"
          />
          <Field
            label="대표 연락처"
            required
            value={contactPhone}
            onChange={(v) => setContactPhone(formatPhoneNumberPartial(v))}
            onBlur={() => setTouched((t) => ({ ...t, contactPhone: true }))}
            placeholder="02-0000-0000"
            inputMode="tel"
            error={fieldErr("contactPhone")}
            testid="partner-phone"
          />
          <Field
            label="담당자 이메일"
            required
            value={contactEmail}
            onChange={setContactEmail}
            onBlur={() => setTouched((t) => ({ ...t, contactEmail: true }))}
            placeholder="contact@company.co.kr"
            inputMode="email"
            type="email"
            error={fieldErr("contactEmail")}
            testid="partner-email"
            hint="회원가입 이메일이 기본값입니다. 필요 시 수정하세요."
          />
          {!step1Valid && (
            <p className="mt-2 text-[11px] text-slate-500">
              모든 필수 항목(<span className="text-red-500">*</span>)을 올바른 형식으로 입력하면 다음 단계로 진행할 수 있습니다.
            </p>
          )}
        </div>
      </WizardShell>
    );
  }

  // ───────── Step 2: 업역 선택 ─────────
  if (step === 2) {
    return (
      <WizardShell
        title="취급 분야(업역) 선택"
        subtitle="복수 선택 가능. 최소 1개 이상 선택해 주세요."
        currentStep={2}
        totalSteps={TOTAL_STEPS}
        onPrev={() => setStep(1)}
        onNext={() => setStep(3)}
        nextDisabled={!step2Valid}
      >
        {categoriesLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> 분야 목록을 불러오는 중...
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            등록된 분야가 없습니다. 잠시 후 다시 시도해 주세요.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((c) => {
                const active = selectedCategories.has(c.code);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.code)}
                    data-testid={`partner-category-${c.code}`}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      active
                        ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 text-[11px] text-slate-500">
              선택됨: {selectedCategories.size}개
            </div>
            {!step2Valid && (
              <div className="mt-2 text-[11px] text-red-600">최소 1개 이상의 분야를 선택해 주세요.</div>
            )}
          </>
        )}
      </WizardShell>
    );
  }

  // ───────── Step 3: 프로필 + 사업자등록증 업로드 ─────────
  //   [Task #661] 프로필 사진/소개글(선택) 입력을 같은 단계에 배치.
  //   사업자등록증 업로드만 next 진행 조건(step3Valid).
  if (step === 3) {
    return (
      <WizardShell
        title="프로필 · 사업자등록증"
        subtitle="프로필은 발주처 매칭 화면에 노출됩니다. 사업자등록증은 본사 검토용 필수 항목입니다."
        currentStep={3}
        totalSteps={TOTAL_STEPS}
        onPrev={() => setStep(2)}
        onNext={() => setStep(4)}
        nextDisabled={!step3Valid}
      >
        {/* 프로필 영역 — 선택 입력. 우리 측 발주 매칭 화면에 미리 보여줄 정보. */}
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-3">
            <VendorAvatar
              profileImageUrl={profileImageUrl}
              alt={companyName || "프로필"}
              size="lg"
              testId="partner-wizard-avatar"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700">프로필 사진 (선택)</p>
              <p className="text-[11px] text-slate-500 mt-0.5">JPG · PNG · WebP, 10MB 이하</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProfilePickerOpen(true)}
                  disabled={profileUploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  data-testid="partner-wizard-photo-button"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {profileUploading ? "업로드 중..." : profileImageUrl ? "사진 변경" : "사진 첨부"}
                </button>
                {profileImageUrl && !profileUploading && (
                  <button
                    type="button"
                    onClick={() => setProfileImageUrl(null)}
                    className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700"
                    data-testid="partner-wizard-photo-remove"
                  >
                    <X className="w-3.5 h-3.5" />
                    삭제
                  </button>
                )}
              </div>
              {profileError && (
                <p className="mt-1 text-[11px] text-red-600">{profileError}</p>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="partner-wizard-intro" className="text-sm font-medium text-slate-700">
              한줄 소개 <span className="text-[11px] text-slate-400">(선택, 최대 {INTRO_MAX}자)</span>
            </label>
            <input
              id="partner-wizard-intro"
              type="text"
              maxLength={INTRO_MAX}
              value={intro}
              onChange={(e) => setIntro(e.target.value.slice(0, INTRO_MAX))}
              placeholder="예) 강남권 응급 출동 30분 내 대응"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="partner-wizard-intro"
            />
            <p className="mt-1 text-[11px] text-slate-400 text-right">
              {intro.length}/{INTRO_MAX}
            </p>
          </div>
          <AttachmentPickerSheet
            open={profilePickerOpen}
            onOpenChange={setProfilePickerOpen}
            title="프로필 사진"
            description="JPG · PNG · WebP · 10MB 이하"
            onPick={handleProfileUpload}
            testId="partner-wizard-photo-picker"
          />
        </section>

        {uploadError && (
          <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3" role="alert">
            {uploadError}
          </div>
        )}
        <p className="mb-2 text-sm font-medium text-slate-700">사업자등록증 <span className="text-red-500">*</span></p>
        <button
          type="button"
          onClick={() => setBizCertPickerOpen(true)}
          disabled={uploading}
          className="w-full block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors disabled:cursor-default"
          data-testid="partner-bizcert-dropzone"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              업로드 중...
            </div>
          ) : bizCertUrl ? (
            <div className="flex flex-col items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
              <span className="font-medium">{bizCertName}</span>
              {bizCertSize != null && (
                <span className="text-[11px] text-slate-500">
                  {(bizCertSize / 1024).toFixed(1)} KB · 다른 파일로 교체하려면 클릭하세요.
                </span>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              <Upload className="w-6 h-6 mx-auto mb-1 text-slate-400" />
              클릭해서 사업자등록증 첨부
              <div className="mt-1 text-[11px] text-slate-400">촬영 · 앨범에서 선택 · 파일에서 선택 (PDF · JPG · PNG · WebP · 최대 20MB)</div>
            </div>
          )}
        </button>
        <AttachmentPickerSheet
          open={bizCertPickerOpen}
          onOpenChange={setBizCertPickerOpen}
          title="사업자등록증 첨부"
          description="JPG · PNG · WebP · PDF, 최대 20MB"
          onPick={handleUpload}
          fileOption={{
            accept: "application/pdf",
            label: "파일에서 선택",
            description: "PDF 사업자등록증",
          }}
          testId="partner-bizcert-picker"
        />
        <p className="mt-2 text-[11px] text-slate-500">
          업로드한 파일은 본사 검토 및 견적 매칭 외 용도로 사용되지 않습니다.
        </p>
        {!step3Valid && !uploading && (
          <p className="mt-1 text-[11px] text-red-600">사업자등록증을 업로드해야 다음 단계로 진행할 수 있습니다.</p>
        )}
      </WizardShell>
    );
  }

  // ───────── Step 4: 약관 동의 + 최종 검토 ─────────
  return (
    <WizardShell
      title="약관 동의 및 최종 검토"
      subtitle="입력하신 내용을 확인하고 약관에 동의한 뒤 등록을 완료합니다."
      currentStep={4}
      totalSteps={TOTAL_STEPS}
      onPrev={() => setStep(3)}
      loading={submitting}
      nextLabel="등록 완료"
      nextDisabled={!step4Valid || submitting}
      onNext={handleSubmit}
    >
      {submitError && (
        <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3" role="alert">
          {submitError}
        </div>
      )}

      {/* 최종 검토 요약 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4 text-xs space-y-1.5">
        {/* [Task #661] 프로필 사진 + 한줄 소개 — 모두 선택값. */}
        <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
          <VendorAvatar
            profileImageUrl={profileImageUrl}
            alt={companyName || "프로필"}
            size="md"
            testId="partner-wizard-summary-avatar"
          />
          <div className="min-w-0">
            <p className="font-medium text-slate-700 truncate">{companyName || "—"}</p>
            <p className="text-slate-500 truncate">
              {intro.trim() || <span className="text-slate-400">한줄 소개 미입력</span>}
            </p>
          </div>
        </div>
        <SummaryRow label="사업자명" value={companyName} />
        <SummaryRow label="사업자등록번호" value={businessNumber} />
        <SummaryRow label="대표자명" value={representativeName} />
        <SummaryRow label="대표 연락처" value={contactPhone} />
        <SummaryRow label="담당자 이메일" value={contactEmail} />
        <SummaryRow
          label="취급 분야"
          value={
            categories
              .filter((c) => selectedCategories.has(c.code))
              .map((c) => c.label)
              .join(", ") || "—"
          }
        />
        <div className="flex items-start gap-2">
          <span className="w-20 shrink-0 text-slate-500">사업자등록증</span>
          {bizCertUrl ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <FileText className="w-3.5 h-3.5" />
              {bizCertName}
            </span>
          ) : (
            <span className="text-red-600">미업로드</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="mt-1 text-[11px] text-blue-600 hover:underline"
        >
          내용 수정하기
        </button>
      </div>

      <ConsentSection
        role="partner"
        value={consentValue}
        onChange={setConsentValue}
        onDocsLoaded={setConsentDocs}
      />

      {consentDocs.length > 0 && missingRequiredConsents.length > 0 && (
        <div className="mt-2 text-[11px] text-red-600">
          필수 약관에 모두 동의해야 등록을 완료할 수 있습니다.
        </div>
      )}
    </WizardShell>
  );
}

// ───────── 작은 보조 컴포넌트 ─────────
interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  error?: string;
  hint?: string;
  testid?: string;
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  type = "text",
  inputMode = "text",
  error,
  hint,
  testid,
}: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        data-testid={testid}
        aria-invalid={!!error}
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-300" : "border-slate-300"
        }`}
      />
      {error ? (
        <p className="mt-1 text-[11px] text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-slate-500">{label}</span>
      <span className="flex-1 text-slate-800 break-all">{value || "—"}</span>
    </div>
  );
}
