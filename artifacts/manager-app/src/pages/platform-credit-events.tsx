import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCreditEvents,
  useCreateCreditEvent,
  usePreviewCreditEventRecipients,
  useGetCreditEventDetail,
  getListCreditEventsQueryKey,
  type CreditEventPreviewVendor,
  type CreditEventSummary,
} from "@workspace/api-client-react";
import { rfqCategoryLabel } from "@workspace/shared/rfq-service-types";

// [Task #734] 플랫폼 운영자가 다수 파트너에게 한 번에 크레딧/포인트를 지급하는 화면.
//   3-step 위저드(모드 선택 → 대상 결정 → 확인)와 이력 목록을 한 화면에서 다룬다.
//   대상 결정은 다음 3가지 중 하나로 미리보기 한 뒤 — 행별 체크박스로 일부만 골라 —
//   '선택 바스켓' 에 누적한다. 지급은 바스켓 전체 vendor 를 단일 트랜잭션으로 처리한다.
//     1) 필터 — 다중 카테고리/지역, 가입일, 활동성, 승인상태 (기본 '활성'만)
//     2) 직접 선택 — 회사명/사업자번호 부분 검색 (vendor id 직접 입력도 호환)
//     3) 엑셀 업로드 — 사업자등록번호 컬럼만 사용 (자동 정규화). 템플릿 다운로드 제공.
//   누적 패턴이라 "서울 청소업체 + 부산 청소업체 + 특정 vendor 5명" 같은 합성 대상도
//   하나의 이벤트로 만들 수 있다. 모든 모드에서 백엔드가 자동으로
//   "파트너 역할 + 승인 활성" 가드를 적용한다.

type Mode = "filter" | "direct" | "excel";
type ApprovalStatus = "active" | "pending" | "rejected";

export default function PlatformCreditEventsPage() {
  const { user } = useAuth();
  useEffect(() => {
    const prev = document.title;
    document.title = "이벤트 크레딧 지급 · 관리의달인";
    return () => { document.title = prev; };
  }, []);
  if (user?.role !== "platform_admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">플랫폼 관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6 pb-12" data-testid="page-platform-credit-events">
      <div>
        <h1 className="text-2xl font-bold">이벤트 크레딧 지급</h1>
        <p className="text-sm text-muted-foreground mt-1">
          여러 파트너에게 크레딧/포인트를 한 번에 지급합니다. 필터/직접/엑셀 중 한 가지로 미리보기 한 뒤,
          체크박스로 골라 ‘선택 바스켓’에 담습니다. 모드를 바꿔 추가 누적도 가능하며, 같은 파트너가 여러
          모드에 중복으로 들어와도 한 번만 지급됩니다. 모든 모드에서 ‘파트너 + 승인 활성’ 만 자동 대상이 됩니다.
        </p>
      </div>
      <NewEventWizard />
      <EventHistoryList />
    </div>
  );
}

// 카테고리 옵션 (RFQ 카테고리에서 자주 쓰이는 값을 한정 노출). 텍스트 자유입력 fallback 도 제공.
const COMMON_CATEGORIES = [
  "cleaning", "elevator", "fire", "electric", "waterproof", "paint",
  "boiler", "septic", "ventilation", "parking", "security", "landscaping", "etc",
];
const COMMON_SIDOS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
  "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원도",
  "충청북도", "충청남도", "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

// ============================================================
// 위저드
// ============================================================
function NewEventWizard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const preview = usePreviewCreditEventRecipients();
  const create = useCreateCreditEvent();

  const [mode, setMode] = useState<Mode>("filter");
  // filter
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [sidos, setSidos] = useState<Set<string>>(new Set());
  const [sigunguRaw, setSigunguRaw] = useState(""); // 콤마 구분 자유입력
  const [type, setType] = useState<string>("");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [activeWithinDays, setActiveWithinDays] = useState(""); // 빈문자 = 미적용
  const [approvalStatuses, setApprovalStatuses] = useState<Set<ApprovalStatus>>(new Set(["active"]));

  // direct — 회사명/사업자번호 부분 검색 + (호환) vendor id 직접 입력
  const [directQuery, setDirectQuery] = useState("");
  const [vendorIdsRaw, setVendorIdsRaw] = useState("");

  // excel
  const [excelBizNumbers, setExcelBizNumbers] = useState<string[]>([]);
  const [excelFileName, setExcelFileName] = useState("");

  // 미리보기 결과 + 행별 선택 상태
  const [previewRows, setPreviewRows] = useState<CreditEventPreviewVendor[]>([]);
  const [previewChecked, setPreviewChecked] = useState<Set<number>>(new Set());
  const [notFoundBiz, setNotFoundBiz] = useState<string[]>([]);
  const [notFoundIds, setNotFoundIds] = useState<number[]>([]);
  const [previewed, setPreviewed] = useState(false);

  // 누적 선택 바스켓 — 모드 전환에도 유지된다.
  const [basket, setBasket] = useState<Map<number, CreditEventPreviewVendor>>(new Map());

  // 미리보기/바스켓 표 검색어 (회사명/사업자번호/카테고리/지역 부분 매칭).
  const [previewSearch, setPreviewSearch] = useState("");
  const [basketSearch, setBasketSearch] = useState("");

  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [credits, setCredits] = useState("100");
  const [points, setPoints] = useState("0");

  // 최종 확인 게이트 다이얼로그.
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 실행 결과 — 지급 후 화면에 성공/실패 카운트와 이벤트 정보를 그대로 띄운다.
  const [lastResult, setLastResult] = useState<{
    eventName: string;
    requested: number;
    succeeded: number;
    failed: number;
    creditsPerVendor: number;
    pointsPerVendor: number;
  } | null>(null);

  function resetWizard() {
    setMode("filter");
    setCategories(new Set()); setSidos(new Set()); setSigunguRaw(""); setType("");
    setJoinedFrom(""); setJoinedTo(""); setActiveWithinDays("");
    setApprovalStatuses(new Set(["active"]));
    setDirectQuery(""); setVendorIdsRaw("");
    setExcelBizNumbers([]); setExcelFileName("");
    setPreviewRows([]); setPreviewChecked(new Set());
    setNotFoundBiz([]); setNotFoundIds([]); setPreviewed(false);
    setBasket(new Map());
    setPreviewSearch(""); setBasketSearch("");
    setName(""); setReason("");
    setCredits("100"); setPoints("0");
    setLastResult(null);
  }

  function toggleSet<T>(s: Set<T>, v: T): Set<T> {
    const next = new Set(s);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  }

  async function handlePreview() {
    let body: Parameters<typeof preview.mutateAsync>[0]["data"];
    if (mode === "filter") {
      const sigunguList = sigunguRaw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      body = {
        mode,
        categories: Array.from(categories),
        sidos: Array.from(sidos),
        sigungus: sigunguList,
        type: type.trim() || null,
        joinedFrom: joinedFrom || null,
        joinedTo: joinedTo || null,
        activeWithinDays: activeWithinDays ? Math.max(1, Math.trunc(Number(activeWithinDays))) : null,
        approvalStatuses: Array.from(approvalStatuses),
      };
    } else if (mode === "direct") {
      const ids = vendorIdsRaw
        .split(/[\s,]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const q = directQuery.trim();
      if (ids.length === 0 && q.length === 0) {
        toast({ title: "회사명/사업자번호로 검색하거나 vendor id 를 입력하세요", variant: "destructive" });
        return;
      }
      body = {
        mode,
        vendorIds: Array.from(new Set(ids)),
        query: q,
        approvalStatuses: Array.from(approvalStatuses),
      };
    } else {
      if (excelBizNumbers.length === 0) {
        toast({ title: "엑셀에서 사업자등록번호를 읽지 못했습니다", variant: "destructive" });
        return;
      }
      body = {
        mode,
        businessNumbers: excelBizNumbers,
        approvalStatuses: Array.from(approvalStatuses),
      };
    }
    const r = await preview.mutateAsync({ data: body });
    setPreviewRows(r.vendors);
    setPreviewChecked(new Set(r.vendors.map((v) => v.vendorId)));
    setNotFoundBiz(r.notFoundBusinessNumbers ?? []);
    setNotFoundIds(r.notFoundVendorIds ?? []);
    setPreviewed(true);
  }

  async function handleExcelUpload(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) {
      toast({ title: "엑셀에서 시트를 읽지 못했습니다", variant: "destructive" });
      return;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const candidates = ["사업자등록번호", "사업자번호", "biz_no", "business_number", "businessNumber", "br", "br_no"];
    let key: string | null = null;
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      key = headers.find((h) => candidates.includes(h.trim())) ?? headers[0] ?? null;
    }
    const numbers = rows
      .map((r) => (key ? String(r[key] ?? "") : ""))
      .map((s) => s.replace(/[^0-9]/g, ""))
      .filter((s) => s.length > 0);
    setExcelBizNumbers(Array.from(new Set(numbers)));
    setExcelFileName(file.name);
    toast({ title: `엑셀 ${numbers.length}건 인식` });
  }

  // CSV 템플릿 — '사업자등록번호' 컬럼 1열, 예시 3행.
  function downloadCsvTemplate() {
    const csv = ["사업자등록번호", "123-45-67890", "987-65-43210", "111-22-33333"].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "이벤트_지급_대상_템플릿.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleRow(vendorId: number) {
    setPreviewChecked((prev) => toggleSet(prev, vendorId));
  }
  // 전체선택은 검색 결과로 필터된 행에만 적용 — 검색 중에 의도치 않게 비표시 행이
  // 함께 선택/해제되는 일을 막는다.
  function toggleAllRows(checked: boolean) {
    setPreviewChecked((prev) => {
      const next = new Set(prev);
      const ids = filteredPreviewRows.map((v) => v.vendorId);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function addCheckedToBasket() {
    const checked = previewRows.filter((v) => previewChecked.has(v.vendorId));
    if (checked.length === 0) {
      toast({ title: "추가할 행을 선택하세요", variant: "destructive" });
      return;
    }
    setBasket((prev) => {
      const next = new Map(prev);
      let added = 0;
      for (const v of checked) {
        if (!next.has(v.vendorId)) added++;
        next.set(v.vendorId, v);
      }
      toast({ title: `${added}명 추가 (바스켓 총 ${next.size}명)` });
      return next;
    });
  }
  function removeFromBasket(vendorId: number) {
    setBasket((prev) => {
      const next = new Map(prev);
      next.delete(vendorId);
      return next;
    });
  }
  function clearBasket() {
    setBasket(new Map());
  }

  const basketArray = useMemo(() => Array.from(basket.values()), [basket]);

  // 표 검색 — 회사명/사업자번호/카테고리/지역에 부분 매칭. 빈 검색어면 전체.
  const matchesQuery = (v: CreditEventPreviewVendor, q: string): boolean => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    const haystack = [
      v.name,
      v.businessRegNumber ?? "",
      v.category ?? "",
      v.sido ?? "",
      v.sigungu ?? "",
      String(v.vendorId),
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  };
  const filteredPreviewRows = useMemo(
    () => previewRows.filter((v) => matchesQuery(v, previewSearch)),
    [previewRows, previewSearch],
  );
  const filteredBasketRows = useMemo(
    () => basketArray.filter((v) => matchesQuery(v, basketSearch)),
    [basketArray, basketSearch],
  );

  // 1단계: 입력 검증 → 확인 다이얼로그 오픈 (최종 게이트)
  function openConfirm() {
    const c = Number(credits);
    const p = Number(points);
    if (!(c >= 0 && c <= 1_000_000)) { toast({ title: "크레딧은 0~1,000,000 사이여야 합니다", variant: "destructive" }); return; }
    if (!(p >= 0 && p <= 1_000_000)) { toast({ title: "포인트는 0~1,000,000 사이여야 합니다", variant: "destructive" }); return; }
    if (c === 0 && p === 0) { toast({ title: "크레딧 또는 포인트 중 최소 하나는 1 이상이어야 합니다", variant: "destructive" }); return; }
    if (!name.trim()) { toast({ title: "이벤트 이름을 입력하세요", variant: "destructive" }); return; }
    if (!reason.trim()) { toast({ title: "사유(메모)를 입력하세요", variant: "destructive" }); return; }
    if (basketArray.length === 0) { toast({ title: "선택 바스켓이 비어있습니다", variant: "destructive" }); return; }
    setConfirmOpen(true);
  }

  // 2단계: 다이얼로그에서 한 번 더 확인 → 실제 mutate
  async function handleSubmitConfirmed() {
    const c = Math.trunc(Number(credits));
    const p = Math.trunc(Number(points));
    try {
      const requestedCount = basketArray.length;
      const resp = await create.mutateAsync({
        data: {
          name: name.trim(),
          reason: reason.trim(),
          creditsPerVendor: c,
          pointsPerVendor: p,
          vendorIds: basketArray.map((v) => v.vendorId),
        },
      });
      // 결과는 백엔드 응답을 그대로 신뢰. 백엔드가 누락 시 클라이언트가 보낸 수와 응답 recipients 길이를 폴백.
      const requested = typeof resp?.requested === "number" ? resp.requested : requestedCount;
      const succeeded = typeof resp?.succeeded === "number" ? resp.succeeded : (resp?.recipients?.length ?? 0);
      const failed = typeof resp?.failed === "number" ? resp.failed : Math.max(0, requested - succeeded);
      setLastResult({
        eventName: resp?.event?.name ?? name.trim(),
        requested,
        succeeded,
        failed,
        creditsPerVendor: resp?.event?.creditsPerVendor ?? c,
        pointsPerVendor: resp?.event?.pointsPerVendor ?? p,
      });
      toast({ title: "이벤트 크레딧 지급 완료", description: `${succeeded.toLocaleString()}명에게 지급 (요청 ${requested}, 실패 ${failed})` });
      qc.invalidateQueries({ queryKey: getListCreditEventsQueryKey() });
      setConfirmOpen(false);
      // 입력 상태만 초기화 — 결과(lastResult)는 사용자가 닫기 전까지 유지.
      setBasket(new Map());
      setPreviewRows([]); setPreviewChecked(new Set());
      setName(""); setReason("");
      setPreviewed(false);
    } catch (e: unknown) {
      // 결격 파트너 사전 검증 실패: 백엔드는 ineligibleVendorIds 를 함께 돌려준다.
      const errObj = e as { message?: string; response?: { data?: { error?: string; ineligibleVendorIds?: number[] } } } | null;
      const data = errObj?.response?.data;
      const ineligible = Array.isArray(data?.ineligibleVendorIds) ? data!.ineligibleVendorIds : [];
      const baseMsg = data?.error || errObj?.message || "지급에 실패했습니다";
      const desc = ineligible.length > 0
        ? `${baseMsg} (결격 vendorId: ${ineligible.slice(0, 10).join(", ")}${ineligible.length > 10 ? " 외" : ""})`
        : baseMsg;
      toast({ title: "지급 실패", description: desc, variant: "destructive" });
    }
  }

  // 전체선택 토글은 '검색 결과로 보이는 행' 기준으로 동작 (검색 중인 행만 적용).
  const visibleIds = filteredPreviewRows.map((v) => v.vendorId);
  const visibleCheckedCount = visibleIds.filter((id) => previewChecked.has(id)).length;
  const allChecked = visibleIds.length > 0 && visibleCheckedCount === visibleIds.length;
  const someChecked = visibleCheckedCount > 0 && visibleCheckedCount < visibleIds.length;

  const cNum = Number(credits) || 0;
  const pNum = Number(points) || 0;
  const totalC = cNum * basketArray.length;
  const totalP = pNum * basketArray.length;

  return (
    <Card data-testid="section-new-event">
      <CardHeader>
        <CardTitle className="text-base">신규 이벤트 만들기</CardTitle>
        <CardDescription>대상 결정 방식을 선택해 미리보기 → 체크 → 바스켓 추가 → 지급 실행 순서로 진행합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1 — 모드 선택 */}
        <div>
          <Label className="text-xs">1. 대상 결정 방식</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(["filter", "direct", "excel"] as Mode[]).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? "default" : "outline"}
                onClick={() => { setMode(m); setPreviewed(false); setPreviewRows([]); setPreviewChecked(new Set()); }}
                data-testid={`button-mode-${m}`}
              >
                {m === "filter" ? "필터" : m === "direct" ? "직접 선택" : "엑셀 업로드"}
              </Button>
            ))}
          </div>
        </div>

        {/* 승인 상태 다중 선택. 미리보기는 모든 상태를 보여주지만, 실행은 활성만 허용 (백엔드 사전 검증). */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Label className="text-xs">대상 승인 상태</Label>
          {(["active", "pending", "rejected"] as ApprovalStatus[]).map((s) => (
            <label key={s} className="inline-flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={approvalStatuses.has(s)}
                onCheckedChange={() => setApprovalStatuses((prev) => toggleSet(prev, s))}
                data-testid={`checkbox-approval-${s}`}
              />
              <span>{s === "active" ? "활성(승인됨)" : s === "pending" ? "대기" : "반려"}</span>
            </label>
          ))}
          <span className="text-[11px] text-muted-foreground">기본값은 ‘활성’만 — 실행 시 미승인 파트너가 포함되면 결격 ID 와 함께 거부됩니다.</span>
        </div>

        {/* Step 2 — 입력 */}
        <div>
          <Label className="text-xs">2. 대상 입력</Label>
          {mode === "filter" && (
            <div className="space-y-3 mt-1">
              <div>
                <Label className="text-[11px] text-muted-foreground">카테고리 (다중 선택)</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {COMMON_CATEGORIES.map((cat) => (
                    <Button
                      key={cat}
                      type="button"
                      size="sm"
                      variant={categories.has(cat) ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setCategories((prev) => toggleSet(prev, cat))}
                      data-testid={`chip-category-${cat}`}
                    >
                      {rfqCategoryLabel(cat)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">시도 (다중 선택)</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {COMMON_SIDOS.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={sidos.has(s) ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setSidos((prev) => toggleSet(prev, s))}
                      data-testid={`chip-sido-${s}`}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">시군구 (콤마 구분, 선택)</Label>
                  <Input
                    value={sigunguRaw}
                    onChange={(e) => setSigunguRaw(e.target.value)}
                    placeholder="예: 강남구, 서초구"
                    className="h-9"
                    data-testid="input-filter-sigungu"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">vendor.type (선택)</Label>
                  <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="예: platform" className="h-9" data-testid="input-filter-type" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">가입일 시작</Label>
                  <Input type="date" value={joinedFrom} onChange={(e) => setJoinedFrom(e.target.value)} className="h-9" data-testid="input-filter-joined-from" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">가입일 종료</Label>
                  <Input type="date" value={joinedTo} onChange={(e) => setJoinedTo(e.target.value)} className="h-9" data-testid="input-filter-joined-to" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">최근 활동 (N일 이내, 선택)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={activeWithinDays}
                    onChange={(e) => setActiveWithinDays(e.target.value)}
                    placeholder="예: 30"
                    className="h-9"
                    data-testid="input-filter-active-within"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">아무 칩/필드도 선택하지 않으면 모든 활성 파트너가 대상이 됩니다.</p>
            </div>
          )}
          {mode === "direct" && (
            <div className="mt-1 space-y-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">회사명 또는 사업자번호로 검색</Label>
                <Input
                  value={directQuery}
                  onChange={(e) => setDirectQuery(e.target.value)}
                  placeholder="예: 청솔클린  또는  123-45-67890"
                  className="h-9"
                  data-testid="input-direct-query"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  부분 일치 검색 (대소문자 구분 없음). 사업자번호는 숫자만 비교합니다 (대시 자동 제거).
                </p>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">또는 vendor id 직접 입력 (콤마/줄바꿈)</Label>
                <Textarea
                  value={vendorIdsRaw}
                  onChange={(e) => setVendorIdsRaw(e.target.value)}
                  placeholder="예: 12, 47, 102"
                  className="min-h-[60px]"
                  data-testid="textarea-vendor-ids"
                />
              </div>
            </div>
          )}
          {mode === "excel" && (
            <div className="mt-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleExcelUpload(f); }}
                  className="h-9 max-w-sm"
                  data-testid="input-excel-file"
                />
                <Button size="sm" variant="outline" onClick={downloadCsvTemplate} data-testid="button-download-template">
                  CSV 템플릿 다운로드
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                첫 번째 시트의 ‘사업자등록번호’ 컬럼(또는 첫 번째 컬럼)을 사용합니다. 대시(-) 등은 자동 제거됩니다.
              </p>
              {excelFileName && (
                <div className="text-xs text-muted-foreground">
                  업로드: <strong>{excelFileName}</strong> · 인식 {excelBizNumbers.length}건
                </div>
              )}
            </div>
          )}
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={handlePreview} disabled={preview.isPending} data-testid="button-preview">
              {preview.isPending ? "미리보기 중…" : "미리보기"}
            </Button>
          </div>
        </div>

        {/* Step 3 — 미리보기 (검색 + 체크박스로 선택) */}
        {previewed && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="secondary">검색 결과 {previewRows.length}명</Badge>
              {previewSearch.trim() && (
                <Badge variant="outline">표시 {filteredPreviewRows.length}명</Badge>
              )}
              <Badge>선택 {previewChecked.size}명</Badge>
              {notFoundBiz.length > 0 && (
                <span className="text-rose-600 text-xs" data-testid="text-not-found-biz">
                  매칭 실패 사업자번호 {notFoundBiz.length}건: {notFoundBiz.slice(0, 10).join(", ")}{notFoundBiz.length > 10 ? "…" : ""}
                </span>
              )}
              {notFoundIds.length > 0 && (
                <span className="text-rose-600 text-xs" data-testid="text-not-found-ids">
                  존재하지 않는 vendor id: {notFoundIds.slice(0, 20).join(", ")}{notFoundIds.length > 20 ? "…" : ""}
                </span>
              )}
            </div>
            {previewRows.length > 0 ? (
              <>
                <Input
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder="대상 명단 검색 (회사명/사업자번호/카테고리/지역)"
                  className="h-8 text-xs"
                  data-testid="input-preview-search"
                />
                <div className="max-h-64 overflow-y-auto rounded border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 w-10">
                          <Checkbox
                            checked={allChecked ? true : someChecked ? "indeterminate" : false}
                            onCheckedChange={(v) => toggleAllRows(v === true)}
                            data-testid="checkbox-select-all"
                          />
                        </th>
                        <th className="text-left p-2 w-16">#</th>
                        <th className="text-left p-2">파트너명</th>
                        <th className="text-left p-2">카테고리</th>
                        <th className="text-left p-2">지역</th>
                        <th className="text-left p-2">사업자번호</th>
                        <th className="text-left p-2 whitespace-nowrap">가입일</th>
                        <th className="text-right p-2 whitespace-nowrap">현재 잔액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreviewRows.slice(0, 500).map((v) => (
                        <tr key={v.vendorId} className="border-t" data-testid={`row-preview-${v.vendorId}`}>
                          <td className="p-2">
                            <Checkbox
                              checked={previewChecked.has(v.vendorId)}
                              onCheckedChange={() => toggleRow(v.vendorId)}
                              data-testid={`checkbox-row-${v.vendorId}`}
                            />
                          </td>
                          <td className="p-2 text-muted-foreground">{v.vendorId}</td>
                          <td className="p-2">{v.name}</td>
                          <td className="p-2">{v.category ? rfqCategoryLabel(v.category) : "-"}</td>
                          <td className="p-2">{[v.sido, v.sigungu].filter(Boolean).join(" ") || "-"}</td>
                          <td className="p-2">{v.businessRegNumber || "-"}</td>
                          <td className="p-2 whitespace-nowrap" data-testid={`text-joined-${v.vendorId}`}>
                            {v.joinedAt ? new Date(v.joinedAt).toLocaleDateString("ko-KR") : "-"}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap" data-testid={`text-balance-${v.vendorId}`}>
                            {v.currentBalance.toLocaleString()}C
                            {v.currentPointsBalance > 0 ? ` + ${v.currentPointsBalance.toLocaleString()}P` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredPreviewRows.length > 500 && (
                    <div className="p-2 text-center text-muted-foreground text-[11px]">… 상위 500명만 표시 (전체는 ‘전체 선택’으로 일괄 추가 가능)</div>
                  )}
                  {previewSearch.trim() && filteredPreviewRows.length === 0 && (
                    <div className="p-3 text-center text-muted-foreground text-xs">검색 결과가 없습니다.</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={addCheckedToBasket} data-testid="button-add-to-basket">
                    선택 {previewChecked.size}명 → 바스켓 추가
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">조건에 맞는 파트너가 없습니다.</p>
            )}
          </div>
        )}

        {/* 누적 바스켓 */}
        <div className="rounded-md border p-4 space-y-3 bg-muted/20" data-testid="section-basket">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">선택 바스켓</Label>
              <Badge variant="secondary" data-testid="badge-basket-count">{basket.size}명</Badge>
            </div>
            {basket.size > 0 && (
              <Button size="sm" variant="ghost" onClick={clearBasket} data-testid="button-clear-basket">
                전체 비우기
              </Button>
            )}
          </div>
          {basket.size === 0 ? (
            <p className="text-xs text-muted-foreground">미리보기 결과에서 행을 선택해 추가하세요. 모드를 바꿔가며 누적할 수 있습니다.</p>
          ) : (
            <>
              <Input
                value={basketSearch}
                onChange={(e) => setBasketSearch(e.target.value)}
                placeholder="바스켓 검색 (회사명/사업자번호/카테고리/지역)"
                className="h-8 text-xs"
                data-testid="input-basket-search"
              />
              {basketSearch.trim() && (
                <p className="text-[11px] text-muted-foreground">
                  표시 {filteredBasketRows.length} / 총 {basketArray.length}명
                </p>
              )}
            <div className="max-h-48 overflow-y-auto rounded border text-xs bg-background">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 w-16">#</th>
                    <th className="text-left p-2">파트너명</th>
                    <th className="text-left p-2">카테고리</th>
                    <th className="text-left p-2">사업자번호</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBasketRows.map((v) => (
                    <tr key={v.vendorId} className="border-t" data-testid={`row-basket-${v.vendorId}`}>
                      <td className="p-2 text-muted-foreground">{v.vendorId}</td>
                      <td className="p-2">{v.name}</td>
                      <td className="p-2">{v.category ? rfqCategoryLabel(v.category) : "-"}</td>
                      <td className="p-2">{v.businessRegNumber || "-"}</td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-rose-600"
                          onClick={() => removeFromBasket(v.vendorId)}
                          data-testid={`button-remove-${v.vendorId}`}
                        >
                          제거
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* 실행 결과 — 지급 직후 성공/실패 카운트와 이벤트 정보 표시 */}
        {lastResult && (
          <div
            className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm"
            data-testid="section-result"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-emerald-800">지급 완료 — {lastResult.eventName}</div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLastResult(null)}
                data-testid="button-dismiss-result"
              >
                닫기
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded bg-background p-2">
                <div className="text-muted-foreground">요청</div>
                <div className="text-base font-semibold" data-testid="text-result-requested">
                  {lastResult.requested.toLocaleString()}명
                </div>
              </div>
              <div className="rounded bg-background p-2">
                <div className="text-muted-foreground">성공</div>
                <div className="text-base font-semibold text-emerald-700" data-testid="text-result-succeeded">
                  {lastResult.succeeded.toLocaleString()}명
                </div>
              </div>
              <div className="rounded bg-background p-2">
                <div className="text-muted-foreground">실패</div>
                <div
                  className={`text-base font-semibold ${lastResult.failed > 0 ? "text-rose-600" : "text-muted-foreground"}`}
                  data-testid="text-result-failed"
                >
                  {lastResult.failed.toLocaleString()}명
                </div>
              </div>
              <div className="rounded bg-background p-2">
                <div className="text-muted-foreground">1인당</div>
                <div className="text-base font-semibold">
                  {lastResult.creditsPerVendor.toLocaleString()}C
                  {lastResult.pointsPerVendor > 0 ? ` + ${lastResult.pointsPerVendor.toLocaleString()}P` : ""}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              단일 트랜잭션으로 처리되어 부분 실패는 발생하지 않습니다. 이력은 아래 ‘지급 이력’ 표에서 확인하세요.
            </p>
          </div>
        )}

        {/* Step 4 — 이벤트 메타 + 실행 */}
        <div className="space-y-3 rounded-md border p-4">
          <Label className="text-xs">3. 이벤트 정보 + 지급 실행</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">이벤트 이름 * (중복 불가)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026 봄 신규 가입 캠페인" className="h-9" data-testid="input-event-name" />
            </div>
            <div>
              <Label className="text-xs">사유 (메모) *</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 4월 프로모션"
                className="h-9"
                aria-required
                data-testid="input-event-reason"
              />
            </div>
            <div>
              <Label className="text-xs">1인당 크레딧 (C)</Label>
              <Input value={credits} onChange={(e) => setCredits(e.target.value)} className="h-9" data-testid="input-event-credits" />
            </div>
            <div>
              <Label className="text-xs">1인당 포인트 (P)</Label>
              <Input value={points} onChange={(e) => setPoints(e.target.value)} className="h-9" data-testid="input-event-points" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={resetWizard} data-testid="button-reset-wizard">초기화</Button>
            <Button size="sm" onClick={openConfirm} disabled={create.isPending || basket.size === 0} data-testid="button-open-confirm">
              {`${basket.size}명에게 지급 실행`}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* 최종 확인 다이얼로그 — 사람이 한 번 더 명시적으로 승인하도록 */}
      <ResponsiveDialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <ResponsiveDialogContent className="max-w-lg" data-testid="dialog-confirm-grant">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>지급 최종 확인</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border p-3 bg-muted/20 space-y-1">
              <div><strong>이벤트 이름:</strong> {name}</div>
              {reason && <div><strong>사유:</strong> {reason}</div>}
              <div><strong>대상:</strong> {basketArray.length.toLocaleString()}명 (파트너+활성만 자동 적용)</div>
              <div><strong>1인당:</strong> {cNum.toLocaleString()}C{pNum > 0 ? ` + ${pNum.toLocaleString()}P` : ""}</div>
              <div className="pt-1 border-t text-base">
                <strong>총합:</strong>{" "}
                <span className="text-primary font-semibold">{totalC.toLocaleString()}C</span>
                {totalP > 0 ? (
                  <> + <span className="text-primary font-semibold">{totalP.toLocaleString()}P</span></>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              지급은 단일 트랜잭션으로 수행되며 부분 실패는 발생하지 않습니다. 동일 이름의 이벤트는 다시 만들 수 없습니다.
            </p>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} data-testid="button-cancel-grant">취소</Button>
            <Button
              onClick={handleSubmitConfirmed}
              disabled={create.isPending}
              data-testid="button-submit-event"
            >
              {create.isPending ? "지급 중…" : "확인하고 지급"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </Card>
  );
}

// ============================================================
// 이력 목록
// ============================================================
function EventHistoryList() {
  // 페이지네이션 — 페이지/페이지당 건수.
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const { data, isLoading } = useListCreditEvents({ page, limit });
  const events = useMemo(() => (data?.events ?? []) as CreditEventSummary[], [data]);
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <>
      <Card data-testid="section-event-history">
        <CardHeader>
          <CardTitle className="text-base">지급 이력</CardTitle>
          <CardDescription>
            전체 {total.toLocaleString()}건 — 페이지 {page} / {totalPages}. 행을 클릭하면 수령 파트너 목록과 원장 정보를 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">지급 이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded border text-sm">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">실행일</th>
                    <th className="text-left p-2">이름</th>
                    <th className="text-left p-2">사유</th>
                    <th className="text-right p-2">대상</th>
                    <th className="text-right p-2">1인당</th>
                    <th className="text-right p-2">총합</th>
                    <th className="text-left p-2">실행자</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr
                      key={e.id}
                      className="border-t cursor-pointer hover:bg-muted/40"
                      onClick={() => setOpenId(e.id)}
                      data-testid={`row-event-${e.id}`}
                    >
                      <td className="p-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString("ko-KR")}</td>
                      <td className="p-2">{e.name}</td>
                      <td className="p-2 text-muted-foreground">{e.reason ?? "-"}</td>
                      <td className="p-2 text-right">{e.recipientCount.toLocaleString()}명</td>
                      <td className="p-2 text-right whitespace-nowrap">{e.creditsPerVendor.toLocaleString()}C{e.pointsPerVendor > 0 ? ` + ${e.pointsPerVendor.toLocaleString()}P` : ""}</td>
                      <td className="p-2 text-right whitespace-nowrap">{e.totalCredits.toLocaleString()}C{e.totalPoints > 0 ? ` + ${e.totalPoints.toLocaleString()}P` : ""}</td>
                      <td className="p-2 text-xs text-muted-foreground">{e.actorName ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {openId !== null && (
        <EventDetailDialog id={openId} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

function EventDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useGetCreditEventDetail(id);
  const event = data?.event;
  const recipients = data?.recipients ?? [];
  // 원장 드릴다운: 모든 수령 행은 같은 이벤트에서 만들어져 kind/source/notes 가
  // 일관됨. 행마다 ledgerId + ledgerCreatedAt 을 노출.
  const ledgerNote = event ? `[이벤트] ${event.name}` : "";
  // 수령자 표 검색 — 회사명/사업자번호/카테고리/원장ID 부분 매칭.
  const [recipientSearch, setRecipientSearch] = useState("");
  const filteredRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) => {
      const haystack = [
        r.vendorName ?? "",
        r.businessRegNumber ?? "",
        r.category ?? "",
        String(r.vendorId),
        r.ledgerId != null ? String(r.ledgerId) : "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [recipients, recipientSearch]);
  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-4xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>이벤트 상세 — {event?.name ?? `#${id}`}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : !event ? (
            <p className="text-sm text-muted-foreground">이벤트를 찾을 수 없습니다.</p>
          ) : (
            <>
              <div className="text-sm grid grid-cols-2 gap-2">
                <div><strong>실행일:</strong> {new Date(event.createdAt).toLocaleString("ko-KR")}</div>
                <div><strong>실행자:</strong> {event.actorName ?? "-"}</div>
                <div><strong>1인당:</strong> {event.creditsPerVendor}C{event.pointsPerVendor > 0 ? ` + ${event.pointsPerVendor}P` : ""}</div>
                <div><strong>대상:</strong> {event.recipientCount}명</div>
                <div className="col-span-2"><strong>사유:</strong> {event.reason ?? "-"}</div>
                <div className="col-span-2 text-xs text-muted-foreground rounded bg-muted/40 p-2">
                  <strong>원장 메타:</strong> kind=<code>event_grant</code>, source=<code>manual</code>, notes=<code>{ledgerNote}</code>
                </div>
              </div>
              <Input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="수령자 검색 (회사명/사업자번호/카테고리/원장ID)"
                className="h-8 text-xs"
                data-testid="input-recipient-search"
              />
              <div className="max-h-[60vh] overflow-y-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 w-16">#</th>
                      <th className="text-left p-2">파트너명</th>
                      <th className="text-left p-2">카테고리</th>
                      <th className="text-left p-2">사업자번호</th>
                      <th className="text-right p-2">크레딧</th>
                      <th className="text-right p-2">포인트</th>
                      <th className="text-right p-2">원장 ID</th>
                      <th className="text-left p-2 whitespace-nowrap">기록일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipients.map((r) => (
                      <tr key={r.vendorId} className="border-t" data-testid={`row-recipient-${r.vendorId}`}>
                        <td className="p-2 text-muted-foreground">{r.vendorId}</td>
                        <td className="p-2">{r.vendorName}</td>
                        <td className="p-2">{r.category ? rfqCategoryLabel(r.category) : "-"}</td>
                        <td className="p-2">{r.businessRegNumber || "-"}</td>
                        <td className="p-2 text-right">{r.creditsGranted.toLocaleString()}</td>
                        <td className="p-2 text-right">{r.pointsGranted.toLocaleString()}</td>
                        <td className="p-2 text-right text-muted-foreground" data-testid={`text-ledger-id-${r.vendorId}`}>
                          {r.ledgerId ?? "-"}
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {r.ledgerCreatedAt ? new Date(r.ledgerCreatedAt).toLocaleString("ko-KR") : "-"}
                        </td>
                      </tr>
                    ))}
                    {recipientSearch.trim() && filteredRecipients.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-3 text-center text-muted-foreground">검색 결과가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
