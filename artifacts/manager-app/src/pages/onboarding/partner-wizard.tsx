// [Task #284 / #740 가입흐름재설정] 파트너 온보딩 위저드 — 숨고식 5단계.
// 단계:
//   1) 약관 동의 (필수 약관 모두)
//   2) 휴대폰 본인확인 (Task #740 단계: 휴대폰 입력만 받고 진행. T7 에서 카카오 OAuth 통합)
//   3) 사업자정보 + 취급 분야(대분류·자식 2단)
//   4) 사업장 도로명 주소 + 좌표(카카오 지오코딩 자동) + 서비스 반경(km)
//   5) 인증서류(사업자등록증·신분증) + 최종 검토 → 등록 완료
//
// 흐름 메모:
//   - 약관 기록 자체는 step5 의 등록 완료 시점에 한꺼번에 기록(기존 정책 유지). step1
//     에서는 체크박스 상태만 사장님께 받아두고 다음 단계 진행 가드로 사용.
//   - 카카오 본인확인은 T7 에서 실제 OAuth 로 채워질 자리. 본 단계에서는 휴대폰 형식만
//     검증해서 통과시킨다(kakaoVerifiedAt 은 비워두고 kakaoPhone 만 저장).
//   - 카테고리 2단 UI: 대분류 카드를 펼치면 자식 리스트가 나오고, 자식·대분류 모두 다중
//     선택 가능. 자식이 없는 대분류는 그 자체로 1개 분야로 동작.
//   - 좌표는 카카오 지오코딩 프록시(/api/kakao/geocode) 로 자동 받아온다. 실패해도 도로명
//     주소만 있으면 다음 단계 진행 가능(매칭 모듈이 좌표 없는 vendor 는 거리 검사를 스킵).
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, Upload, FileText, Camera, X, MapPin, IdCard, ChevronDown, ChevronRight } from "lucide-react";
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
// [Task #740 가입흐름재설정] 5단계로 흐름이 바뀌면서 임시저장 키를 v3 로 올린다.
//   v2 의 4단계 draft 는 자동 무시되어 새 가입자만 영향을 받는다.
const STORAGE_KEY = "partnerWizard:draft:v3";
const INTRO_MAX = 30;
const RADIUS_MIN = 5;
const RADIUS_MAX = 200;
const RADIUS_DEFAULT = 50;

interface Category {
  id: number;
  code: string;
  label: string;
  sortOrder: number;
  parentCode?: string | null;
  active?: boolean;
}

interface DraftState {
  // 약관 동의 체크 상태(기록은 submit 시점). 키 = consent type, 값 = 동의 여부.
  consentValue: Record<string, boolean>;
  // 본인확인 단계 — 휴대폰 입력값.
  kakaoPhone: string;
  // 사업자정보 + 분야.
  companyName: string;
  businessNumber: string;
  representativeName: string;
  contactEmail: string;
  intro: string;
  profileImageUrl: string | null;
  selectedCategories: string[];
  expandedTops: string[];
  // 사업장 주소 + 좌표 + 반경.
  serviceAddressRoad: string;
  serviceLat: number | null;
  serviceLng: number | null;
  serviceRadiusKm: number;
  // 인증서류.
  bizCertUrl: string | null;
  bizCertName: string | null;
  bizCertSize: number | null;
  idCardUrl: string | null;
  idCardName: string | null;
  idCardSize: number | null;
}

const TOTAL_STEPS = 5;

// 형식 검증 ────────────────────────────────────────────
function isValidBusinessNumber(value: string): boolean {
  return /^\d{3}-\d{2}-\d{5}$/.test(value);
}
function isValidPhone(value: string): boolean {
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

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step1 약관 ──
  const [consentDocs, setConsentDocs] = useState<ConsentDocument[]>([]);
  const [consentValue, setConsentValue] = useState<Record<string, boolean>>(initial.consentValue ?? {});

  // Step2 본인확인 ──
  const [kakaoPhone, setKakaoPhone] = useState(initial.kakaoPhone ?? user?.phone ?? "");

  // Step3 사업자정보 + 분야 ──
  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [businessNumber, setBusinessNumber] = useState(initial.businessNumber ?? "");
  const [representativeName, setRepresentativeName] = useState(initial.representativeName ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? user?.email ?? "");
  const [intro, setIntro] = useState((initial.intro ?? "").slice(0, INTRO_MAX));
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(initial.profileImageUrl ?? null);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(initial.selectedCategories ?? []),
  );
  const [expandedTops, setExpandedTops] = useState<Set<string>>(new Set(initial.expandedTops ?? []));

  // Step4 사업장 주소 + 반경 ──
  const [serviceAddressRoad, setServiceAddressRoad] = useState(initial.serviceAddressRoad ?? "");
  const [serviceLat, setServiceLat] = useState<number | null>(initial.serviceLat ?? null);
  const [serviceLng, setServiceLng] = useState<number | null>(initial.serviceLng ?? null);
  const [serviceRadiusKm, setServiceRadiusKm] = useState<number>(initial.serviceRadiusKm ?? RADIUS_DEFAULT);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  // Step5 인증서류 ──
  const [bizCertPickerOpen, setBizCertPickerOpen] = useState(false);
  const [bizCertUrl, setBizCertUrl] = useState<string | null>(initial.bizCertUrl ?? null);
  const [bizCertName, setBizCertName] = useState<string | null>(initial.bizCertName ?? null);
  const [bizCertSize, setBizCertSize] = useState<number | null>(initial.bizCertSize ?? null);
  const [bizUploading, setBizUploading] = useState(false);
  const [bizUploadError, setBizUploadError] = useState("");

  const [idCardPickerOpen, setIdCardPickerOpen] = useState(false);
  const [idCardUrl, setIdCardUrl] = useState<string | null>(initial.idCardUrl ?? null);
  const [idCardName, setIdCardName] = useState<string | null>(initial.idCardName ?? null);
  const [idCardSize, setIdCardSize] = useState<number | null>(initial.idCardSize ?? null);
  const [idCardUploading, setIdCardUploading] = useState(false);
  const [idCardUploadError, setIdCardUploadError] = useState("");

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
        // [Task #740 가입흐름재설정] 활성(active!=false) 항목만 노출. 자식도 같이 보여주고
        //   2단 UI 에서 펼쳐 선택 가능하게 한다.
        const list = raw.filter((c) => c.active !== false);
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
      consentValue,
      kakaoPhone,
      companyName,
      businessNumber,
      representativeName,
      contactEmail,
      intro,
      profileImageUrl,
      selectedCategories: Array.from(selectedCategories),
      expandedTops: Array.from(expandedTops),
      serviceAddressRoad,
      serviceLat,
      serviceLng,
      serviceRadiusKm,
      bizCertUrl,
      bizCertName,
      bizCertSize,
      idCardUrl,
      idCardName,
      idCardSize,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [
    consentValue, kakaoPhone, companyName, businessNumber, representativeName, contactEmail,
    intro, profileImageUrl, selectedCategories, expandedTops, serviceAddressRoad, serviceLat,
    serviceLng, serviceRadiusKm, bizCertUrl, bizCertName, bizCertSize, idCardUrl, idCardName, idCardSize,
  ]);

  // 카테고리 그룹화 ──
  const grouped = useMemo(() => {
    const tops = categories.filter((c) => !c.parentCode);
    return tops.map((top) => ({
      top,
      children: categories.filter((c) => c.parentCode === top.code),
    }));
  }, [categories]);

  // ─── 단계 검증 ───
  const missingRequiredConsents = getMissingRequired(consentDocs, consentValue);
  const step1Valid = consentDocs.length > 0 && missingRequiredConsents.length === 0;

  const step2Valid = isValidPhone(kakaoPhone);

  const errStep3 = {
    companyName: !companyName.trim() ? "사업자명(법인명)을 입력해 주세요" : "",
    businessNumber: !businessNumber.trim()
      ? "사업자등록번호를 입력해 주세요"
      : !isValidBusinessNumber(businessNumber)
        ? "형식: 000-00-00000"
        : "",
    representativeName: !representativeName.trim() ? "대표자명을 입력해 주세요" : "",
    contactEmail: !contactEmail.trim()
      ? "담당자 이메일을 입력해 주세요"
      : !isValidEmail(contactEmail)
        ? "올바른 이메일 형식이 아닙니다"
        : "",
  };
  const step3InfoValid = Object.values(errStep3).every((v) => !v);
  const step3Valid = step3InfoValid && selectedCategories.size > 0;

  const step4Valid = !!serviceAddressRoad.trim() && serviceRadiusKm >= RADIUS_MIN && serviceRadiusKm <= RADIUS_MAX;

  const step5Valid = !!bizCertUrl && !!idCardUrl;

  function fieldErr(name: keyof typeof errStep3) {
    return touched[name] && errStep3[name] ? errStep3[name] : "";
  }

  // ─── 카테고리 토글 ───
  function toggleCategory(code: string) {
    setSelectedCategories((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }
  function toggleTopExpand(code: string) {
    setExpandedTops((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }

  // ─── 업로드 헬퍼 ───
  async function uploadFile(
    file: File,
    setUrl: (u: string | null) => void,
    setName: (n: string | null) => void,
    setSize: (s: number | null) => void,
    setLoading: (b: boolean) => void,
    setError: (s: string) => void,
    accept: { image: boolean; pdf: boolean },
  ) {
    setError("");
    const isImage = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp|heic)$/i.test(file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const okType = (accept.image && isImage) || (accept.pdf && isPdf);
    if (!okType) {
      setError(accept.pdf ? "이미지 또는 PDF 파일만 업로드 가능합니다" : "이미지 파일만 업로드 가능합니다");
      return;
    }
    const limit = accept.pdf ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > limit) {
      setError(`파일 크기는 ${limit / 1024 / 1024}MB 이하여야 합니다`);
      return;
    }
    setLoading(true);
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
      setUrl(objectPath);
      setName(file.name);
      setSize(file.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

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
          name: file.name, size: file.size, contentType: file.type || "application/octet-stream",
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

  // ─── 카카오 지오코딩 ───
  async function handleGeocode() {
    const q = serviceAddressRoad.trim();
    if (!q) {
      setGeocodeError("주소를 입력한 후 변환해 주세요");
      return;
    }
    setGeocoding(true);
    setGeocodeError("");
    try {
      const res = await fetch(`${API_BASE}/kakao/geocode?query=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "주소 변환에 실패했습니다");
      }
      const data = await res.json();
      if (!data.found) {
        setGeocodeError("해당 주소를 찾지 못했습니다. 도로명 주소를 다시 확인해 주세요.");
        setServiceLat(null);
        setServiceLng(null);
        return;
      }
      setServiceLat(data.lat);
      setServiceLng(data.lng);
      // 정규화된 도로명 주소가 오면 입력값을 그것으로 갱신.
      if (typeof data.addressRoad === "string" && data.addressRoad) {
        setServiceAddressRoad(data.addressRoad);
      }
    } catch (e) {
      setGeocodeError(e instanceof Error ? e.message : "주소 변환 중 오류가 발생했습니다");
    } finally {
      setGeocoding(false);
    }
  }

  // ─── 등록 완료 ───
  async function handleSubmit() {
    if (!step1Valid || !step2Valid || !step3Valid || !step4Valid || !step5Valid) return;
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

      // 2) 파트너 온보딩 저장 — 5단계의 모든 입력값 포함.
      const body = {
        name: companyName.trim(),
        businessNumber: businessNumber.trim(),
        representativeName: representativeName.trim(),
        // 휴대폰: 본인확인 단계의 입력값을 그대로 phone + kakaoPhone 으로 저장.
        phone: kakaoPhone.trim(),
        kakaoPhone: kakaoPhone.trim(),
        email: contactEmail.trim(),
        businessRegUrl: bizCertUrl,
        idCardUrl,
        categories: Array.from(selectedCategories),
        intro: intro.trim().slice(0, INTRO_MAX) || null,
        profileImageUrl,
        serviceAddressRoad: serviceAddressRoad.trim(),
        serviceLat,
        serviceLng,
        serviceRadiusKm,
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

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ Step 1: 약관 동의                                               ║
  // ╚════════════════════════════════════════════════════════════════╝
  if (step === 1) {
    return (
      <WizardShell
        title="약관 동의"
        subtitle="가입을 시작하기 전에 파트너 약관에 동의해 주세요."
        currentStep={1}
        totalSteps={TOTAL_STEPS}
        nextDisabled={!step1Valid}
        onNext={() => {
          if (step1Valid) setStep(2);
        }}
      >
        <ConsentSection
          role="partner"
          value={consentValue}
          onChange={setConsentValue}
          onDocsLoaded={setConsentDocs}
        />
        {consentDocs.length > 0 && missingRequiredConsents.length > 0 && (
          <div className="mt-2 text-[11px] text-red-600">
            필수 약관에 모두 동의해야 다음 단계로 진행할 수 있습니다.
          </div>
        )}
      </WizardShell>
    );
  }

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ Step 2: 휴대폰 본인확인                                         ║
  // ╚════════════════════════════════════════════════════════════════╝
  if (step === 2) {
    return (
      <WizardShell
        title="휴대폰 본인확인"
        subtitle="견적 알림과 본사 연락에 사용되는 휴대폰 번호를 확인해 주세요."
        currentStep={2}
        totalSteps={TOTAL_STEPS}
        onPrev={() => setStep(1)}
        onNext={() => {
          setTouched((t) => ({ ...t, kakaoPhone: true }));
          if (step2Valid) setStep(3);
        }}
        nextDisabled={!step2Valid}
      >
        <div className="space-y-3 text-sm">
          <Field
            label="휴대폰 번호"
            required
            value={kakaoPhone}
            onChange={(v) => setKakaoPhone(formatPhoneNumberPartial(v))}
            onBlur={() => setTouched((t) => ({ ...t, kakaoPhone: true }))}
            placeholder="010-0000-0000"
            inputMode="tel"
            error={touched.kakaoPhone && !step2Valid ? "올바른 휴대폰 번호를 입력해 주세요" : ""}
            testid="partner-kakao-phone"
          />
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 leading-relaxed">
            <p className="font-medium text-slate-700 mb-1">곧 카카오톡 본인확인이 추가됩니다</p>
            <p>
              지금은 입력하신 번호를 본사 검토에 사용합니다. 추후 카카오 본인확인이 활성화되면
              자동으로 동일한 번호가 인증된 번호로 전환됩니다.
            </p>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ Step 3: 사업자정보 + 취급 분야(2단)                              ║
  // ╚════════════════════════════════════════════════════════════════╝
  if (step === 3) {
    return (
      <WizardShell
        title="사업자정보 · 취급 분야"
        subtitle="견적·계약·정산에 사용되는 정보와 매칭에 쓰일 분야를 선택해 주세요."
        currentStep={3}
        totalSteps={TOTAL_STEPS}
        onPrev={() => setStep(2)}
        onNext={() => {
          setTouched({
            companyName: true,
            businessNumber: true,
            representativeName: true,
            contactEmail: true,
          });
          if (step3Valid) setStep(4);
        }}
        nextDisabled={!step3Valid}
      >
        {/* 프로필 — 선택 입력 */}
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
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
              {profileError && <p className="mt-1 text-[11px] text-red-600">{profileError}</p>}
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

        {/* 사업자 정보 */}
        <section className="space-y-3 text-sm">
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
        </section>

        {/* 취급 분야 — 2단 */}
        <section className="mt-5">
          <p className="text-sm font-medium text-slate-700 mb-1">
            취급 분야 <span className="text-red-500">*</span>
          </p>
          <p className="text-[11px] text-slate-500 mb-2">
            대분류를 펼쳐 세부 항목을 선택하거나 대분류 자체를 선택할 수 있습니다.
          </p>
          {categoriesLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 분야 목록을 불러오는 중...
            </div>
          ) : grouped.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              등록된 분야가 없습니다. 잠시 후 다시 시도해 주세요.
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map(({ top, children }) => {
                const expanded = expandedTops.has(top.code);
                const topActive = selectedCategories.has(top.code);
                const childActiveCount = children.filter((c) => selectedCategories.has(c.code)).length;
                return (
                  <div key={top.id} className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => toggleTopExpand(top.code)}
                        className="flex items-center gap-1 px-2 py-2 text-slate-500 hover:text-slate-700"
                        aria-label={expanded ? "접기" : "펼치기"}
                        disabled={children.length === 0}
                      >
                        {children.length === 0 ? (
                          <span className="w-4" />
                        ) : expanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCategory(top.code)}
                        data-testid={`partner-category-${top.code}`}
                        className={`flex-1 flex items-center justify-between px-2 py-2 text-sm transition-colors ${
                          topActive ? "text-blue-700 font-medium" : "text-slate-700"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-flex w-4 h-4 rounded border ${
                              topActive ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"
                            }`}
                          >
                            {topActive && <CheckCircle2 className="w-3.5 h-3.5 text-white -m-px" />}
                          </span>
                          {top.label}
                        </span>
                        {children.length > 0 && childActiveCount > 0 && (
                          <span className="text-[11px] text-blue-600">
                            세부 {childActiveCount}/{children.length}
                          </span>
                        )}
                      </button>
                    </div>
                    {expanded && children.length > 0 && (
                      <div className="border-t border-slate-100 px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {children.map((c) => {
                          const active = selectedCategories.has(c.code);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleCategory(c.code)}
                              data-testid={`partner-category-${c.code}`}
                              className={`px-2 py-1.5 rounded-md border text-xs text-left transition-colors ${
                                active
                                  ? "border-blue-400 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-2 text-[11px] text-slate-500">
            선택됨: {selectedCategories.size}개
          </div>
          {!step3Valid && step3InfoValid && (
            <div className="mt-1 text-[11px] text-red-600">최소 1개 이상의 분야를 선택해 주세요.</div>
          )}
        </section>
      </WizardShell>
    );
  }

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ Step 4: 사업장 주소 + 좌표 + 반경                                ║
  // ╚════════════════════════════════════════════════════════════════╝
  if (step === 4) {
    return (
      <WizardShell
        title="사업장 주소 · 서비스 반경"
        subtitle="입력하신 위치를 기준으로 가까운 발주처와 자동 매칭됩니다."
        currentStep={4}
        totalSteps={TOTAL_STEPS}
        onPrev={() => setStep(3)}
        onNext={() => {
          if (step4Valid) setStep(5);
        }}
        nextDisabled={!step4Valid}
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              사업장 도로명 주소 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serviceAddressRoad}
                onChange={(e) => {
                  setServiceAddressRoad(e.target.value);
                  // 주소가 바뀌면 좌표 무효화 — 다시 변환을 강제.
                  if (serviceLat != null || serviceLng != null) {
                    setServiceLat(null);
                    setServiceLng(null);
                  }
                  setGeocodeError("");
                }}
                placeholder="서울특별시 강남구 테헤란로 123"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="partner-service-address"
              />
              <button
                type="button"
                onClick={handleGeocode}
                disabled={geocoding || !serviceAddressRoad.trim()}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1"
                data-testid="partner-geocode-button"
              >
                {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                좌표 변환
              </button>
            </div>
            {geocodeError && <p className="mt-1 text-[11px] text-red-600">{geocodeError}</p>}
            {serviceLat != null && serviceLng != null && (
              <p className="mt-1 text-[11px] text-emerald-700">
                좌표 확인됨: 위도 {serviceLat.toFixed(5)}, 경도 {serviceLng.toFixed(5)}
              </p>
            )}
            {serviceAddressRoad.trim() && serviceLat == null && (
              <p className="mt-1 text-[11px] text-amber-700">
                좌표 변환 전에는 거리 기반 매칭이 적용되지 않습니다. (시도/시군구 매칭은 정상 동작)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              서비스 반경 (km) <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={5}
                value={serviceRadiusKm}
                onChange={(e) => setServiceRadiusKm(Number(e.target.value))}
                className="flex-1"
                data-testid="partner-radius-slider"
              />
              <input
                type="number"
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                value={serviceRadiusKm}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setServiceRadiusKm(Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, n)));
                }}
                className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-right"
                data-testid="partner-radius-input"
              />
              <span className="text-xs text-slate-600">km</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              사업장 위치에서 이 반경 안의 발주처와 자동 매칭됩니다. 기본 50km, 최대 {RADIUS_MAX}km.
            </p>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ Step 5: 인증서류 + 최종 검토                                      ║
  // ╚════════════════════════════════════════════════════════════════╝
  return (
    <WizardShell
      title="인증서류 · 최종 검토"
      subtitle="사업자등록증과 신분증은 본사 검토용 필수 자료입니다."
      currentStep={5}
      totalSteps={TOTAL_STEPS}
      onPrev={() => setStep(4)}
      loading={submitting}
      nextLabel="등록 완료"
      nextDisabled={!step5Valid || submitting}
      onNext={handleSubmit}
    >
      {submitError && (
        <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-3" role="alert">
          {submitError}
        </div>
      )}

      {/* 사업자등록증 */}
      <UploadBlock
        label="사업자등록증"
        accept={{ image: true, pdf: true }}
        url={bizCertUrl}
        name={bizCertName}
        size={bizCertSize}
        uploading={bizUploading}
        error={bizUploadError}
        onOpen={() => setBizCertPickerOpen(true)}
        testId="partner-bizcert"
      />
      <AttachmentPickerSheet
        open={bizCertPickerOpen}
        onOpenChange={setBizCertPickerOpen}
        title="사업자등록증 첨부"
        description="JPG · PNG · WebP · PDF, 최대 20MB"
        onPick={(file) =>
          uploadFile(file, setBizCertUrl, setBizCertName, setBizCertSize, setBizUploading, setBizUploadError, { image: true, pdf: true })
        }
        fileOption={{
          accept: "application/pdf",
          label: "파일에서 선택",
          description: "PDF 사업자등록증",
        }}
        testId="partner-bizcert-picker"
      />

      {/* 신분증 */}
      <div className="mt-4">
        <UploadBlock
          label="신분증 (대표자)"
          accept={{ image: true, pdf: false }}
          url={idCardUrl}
          name={idCardName}
          size={idCardSize}
          uploading={idCardUploading}
          error={idCardUploadError}
          onOpen={() => setIdCardPickerOpen(true)}
          testId="partner-idcard"
          icon="idcard"
        />
        <AttachmentPickerSheet
          open={idCardPickerOpen}
          onOpenChange={setIdCardPickerOpen}
          title="신분증 첨부"
          description="JPG · PNG · WebP, 최대 10MB"
          onPick={(file) =>
            uploadFile(file, setIdCardUrl, setIdCardName, setIdCardSize, setIdCardUploading, setIdCardUploadError, { image: true, pdf: false })
          }
          testId="partner-idcard-picker"
        />
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        업로드한 파일은 본사 검토 외 용도로 사용되지 않으며, 검토 통과 후 매칭이 활성화됩니다.
      </p>

      {/* 최종 검토 요약 */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
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
        <SummaryRow label="사업자등록번호" value={businessNumber} />
        <SummaryRow label="대표자명" value={representativeName} />
        <SummaryRow label="휴대폰" value={kakaoPhone} />
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
        <SummaryRow label="사업장 주소" value={serviceAddressRoad} />
        <SummaryRow
          label="좌표·반경"
          value={
            serviceLat != null && serviceLng != null
              ? `${serviceLat.toFixed(4)}, ${serviceLng.toFixed(4)} · 반경 ${serviceRadiusKm}km`
              : `좌표 미변환 · 반경 ${serviceRadiusKm}km`
          }
        />
        <button
          type="button"
          onClick={() => setStep(1)}
          className="mt-1 text-[11px] text-blue-600 hover:underline"
        >
          내용 수정하기
        </button>
      </div>
    </WizardShell>
  );
}

// ─── 보조 컴포넌트 ─────────────────────────────────────────
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

interface UploadBlockProps {
  label: string;
  accept: { image: boolean; pdf: boolean };
  url: string | null;
  name: string | null;
  size: number | null;
  uploading: boolean;
  error: string;
  onOpen: () => void;
  testId: string;
  icon?: "idcard";
}

function UploadBlock({ label, accept, url, name, size, uploading, error, onOpen, testId, icon }: UploadBlockProps) {
  const Icon = icon === "idcard" ? IdCard : FileText;
  return (
    <div>
      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 p-3 text-xs mb-2" role="alert">
          {error}
        </div>
      )}
      <p className="mb-2 text-sm font-medium text-slate-700">
        {label} <span className="text-red-500">*</span>
      </p>
      <button
        type="button"
        onClick={onOpen}
        disabled={uploading}
        className="w-full block border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors disabled:cursor-default"
        data-testid={`${testId}-dropzone`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            업로드 중...
          </div>
        ) : url ? (
          <div className="flex flex-col items-center gap-1 text-sm text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium inline-flex items-center gap-1">
              <Icon className="w-3.5 h-3.5" />
              {name}
            </span>
            {size != null && (
              <span className="text-[11px] text-slate-500">
                {(size / 1024).toFixed(1)} KB · 다른 파일로 교체하려면 클릭하세요.
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
            클릭해서 {label} 첨부
            <div className="mt-1 text-[11px] text-slate-400">
              {accept.pdf ? "PDF · JPG · PNG · WebP · 최대 20MB" : "JPG · PNG · WebP · 최대 10MB"}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}
