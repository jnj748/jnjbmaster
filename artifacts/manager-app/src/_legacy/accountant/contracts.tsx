import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useListContracts,
  useGetContract,
  useUpdateContract,
  useTransitionContractStatus,
  useUploadContractDocument,
  useCheckContractRenewalAlerts,
  useCreateContract,
  usePreviewContractOcr,
  useListVendors,
  getListContractsQueryKey,
  getGetContractQueryKey,
  type Contract,
  type ContractDocument,
  type ContractDocumentDocType,
  type ListContractsParams,
  type WorkReport,
  type Settlement,
  type ContractOcrPreview,
  type Vendor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import {
  RENEWAL_REVIEW_WINDOW_START_DAYS,
  RENEWAL_REVIEW_WINDOW_END_DAYS,
  RENEWAL_REVIEW_WINDOW_LABEL,
  isContractInRenewalReviewWindow,
  daysUntilDate,
  formatContractRenewalReviewMessage,
} from "@workspace/shared/contract-renewal";
import { useUpload } from "@workspace/object-storage-web";
import { OcrProgressBar } from "@/components/ocr-progress-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BusinessNumberInput } from "@/components/ui/business-number-input";
import { formatBusinessNumber } from "@/lib/format-korean";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Building2,
  Calendar,
  AlertCircle,
  Upload,
  RefreshCw,
  Plus,
  CalendarClock,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  in_approval: "품의중",
  active: "체결",
  in_progress: "이행중",
  completed: "완료",
  terminated: "해지",
  renewal_due: "갱신대상",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground",
  in_approval: "bg-yellow-100 text-yellow-900",
  active: "bg-blue-100 text-blue-900",
  in_progress: "bg-indigo-100 text-indigo-900",
  completed: "bg-green-100 text-green-900",
  terminated: "bg-gray-200 text-gray-700",
  renewal_due: "bg-orange-100 text-orange-900",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "계약서 사본",
  business_registration: "사업자등록증",
  id_card: "신분증",
  insurance: "보험증서",
  tax_invoice: "세금계산서",
  other: "기타",
};

// [Task #369] 계약서 OCR 카테고리 옵션. contractOcr.ts ALLOWED_CATEGORIES 와 1:1 매핑.
const OCR_CATEGORY_LABELS: Record<string, string> = {
  elevator: "승강기",
  cleaning: "청소",
  security: "경비",
  disinfection: "소독",
  electric: "전기",
  fire_safety: "소방",
  hvac: "공조/냉난방",
  landscaping: "조경",
  facility: "시설관리/종합관리",
  other: "기타",
};

const PRIVILEGED_ROLES = new Set(["manager", "platform_admin", "hq_executive", "accountant"]);
// [Task #369] OCR 미리보기 / 신규 계약 등록 권한 (파트너·시설기사·본사 제외).
const NEW_CONTRACT_ROLES = new Set(["manager", "platform_admin", "accountant"]);

// [Task #416] 만료 임박 계약 판정 — 단일 공유 헬퍼.
//   서버 알림 잡(/contracts/check-renewal-alerts) 과 같은 기준:
//     상태 ∈ {active, in_progress, renewal_due} AND endDate ∈ (60, 90] 일 윈도우.
//   draft/in_approval 은 체결 전이라 검토 대상 아님. completed/terminated 는 종결.
//   서버 잡이 status="renewal_due" 로 한 번 전이시킨 계약도 60일 이하로 진입하면
//   윈도우에서 자동으로 빠진다(별도 결재 트랙으로 이동).
const daysUntil = daysUntilDate;

const isExpiringContract = isContractInRenewalReviewWindow;

export default function ContractsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [location, setLocation] = useLocation();

  // [Task #335] /contracts?openContract={id} 딥링크 → 자동으로 상세 다이얼로그 오픈.
  // [Task #369] /contracts?expiring=1 딥링크(대시보드 "갱신 검토 필요 N건" 위젯에서 진입)
  //   를 받으면 만료 임박 필터를 자동으로 켜고 페이지 상단 배너가 펼쳐진 상태로 보여준다.
  useEffect(() => {
    const search = window.location.search;
    if (!search) return;
    const sp = new URLSearchParams(search);
    let mutated = false;
    const target = sp.get("openContract");
    if (target) {
      const id = Number(target);
      if (!Number.isNaN(id)) setOpenId(id);
      sp.delete("openContract");
      mutated = true;
    }
    if (sp.get("expiring") === "1") {
      setExpiringOnly(true);
      sp.delete("expiring");
      mutated = true;
    }
    if (mutated) {
      const remaining = sp.toString();
      const next = remaining ? `${location}?${remaining}` : location;
      setLocation(next, { replace: true });
    }
  }, [location, setLocation]);

  const params: ListContractsParams = {};
  if (statusFilter !== "all") params.status = statusFilter as ListContractsParams["status"];
  // [Task #369] 만료 임박 기본 윈도우를 30일 → 75일(2개월 15일) 로 확대.
  //   값은 @workspace/shared/contract-renewal 단일 소스에서 import.
  // [Task #416] 만료 임박 필터의 검색 범위는 윈도우 시작(만료 90일 전) 기준으로 한 번 받아서
  //   클라이언트에서 isRenewalReviewActive(60일 초과) 로 한 번 더 좁힌다.
  if (expiringOnly) params.expiringWithinDays = RENEWAL_REVIEW_WINDOW_START_DAYS;

  const { data: contractsRaw, isLoading } = useListContracts(params);
  // [Task #416] expiringOnly 가 켜지면 서버에서 90일 이내(=윈도우 시작일)로 한 번 자르고,
  //   여기서 다시 isContractInRenewalReviewWindow 로 (60, 90] 구간 + 후보 status 만 남긴다.
  //   서버는 60일 미만도 후보로 포함해 응답하므로 클라이언트 가시성을 단일 SoT 헬퍼로 좁힌다.
  const contracts = useMemo(() => {
    if (!contractsRaw) return contractsRaw;
    if (!expiringOnly) return contractsRaw;
    return contractsRaw.filter(isContractInRenewalReviewWindow);
  }, [contractsRaw, expiringOnly]);
  const transitionMutation = useTransitionContractStatus();
  const renewalCheck = useCheckContractRenewalAlerts();

  const canManage = !!user && PRIVILEGED_ROLES.has(user.role);
  const canCreate = !!user && NEW_CONTRACT_ROLES.has(user.role);

  // [Task #369] 페이지 상단 배너용으로 "만료 임박" 계약을 따로 추출.
  //   필터(`expiringOnly`) 와 무관하게 항상 전체 목록 기준으로 계산하기 위해
  //   별도 쿼리로 만료 임박만 한 번 더 받아온다(작은 N).
  const { data: expiringList } = useListContracts(
    { expiringWithinDays: RENEWAL_REVIEW_WINDOW_START_DAYS },
  );
  const expiringActive = useMemo(
    () => (expiringList ?? []).filter(isExpiringContract),
    [expiringList],
  );

  async function handleRenewalCheck() {
    const r = await renewalCheck.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
    toast({ title: `${r.alertsGenerated}건의 갱신 알림이 생성되었습니다` });
  }

  async function handleTransition(id: number, status: string) {
    try {
      await transitionMutation.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(id) });
      toast({ title: `상태를 '${STATUS_LABELS[status]}'(으)로 변경했습니다` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "전이 불가";
      toast({ title: "상태 변경 실패", description: msg, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">계약 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            품의 → 계약 → 이행 → 정산 → 갱신의 전체 생애주기를 관리합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button variant="outline" onClick={handleRenewalCheck} disabled={renewalCheck.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" />
              갱신 알림 확인
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setNewOpen(true)} data-testid="button-new-contract">
              <Plus className="w-4 h-4 mr-2" />
              신규 계약
            </Button>
          )}
        </div>
      </div>

      {/* [Task #369] 만료 임박 배너 — 75일 이내 만료 예정 계약을 카드 리스트로 보여준다.
          본문 포맷은 단일 소스(formatContractRenewalReviewMessage) 사용. */}
      {expiringActive.length > 0 && (
        <section data-testid="expiring-banner-section" className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-amber-900">
              {RENEWAL_REVIEW_WINDOW_LABEL} 검토 필요 — {expiringActive.length}건
            </h2>
          </div>
          <div className="grid gap-2">
            {expiringActive.map((c) => {
              const d = daysUntil(c.endDate);
              return (
                <Card
                  key={c.id}
                  className="border-amber-300 bg-amber-50/40 cursor-pointer hover-elevate"
                  onClick={() => setOpenId(c.id)}
                  data-testid={`expiring-banner-card-${c.id}`}
                >
                  <CardContent className="p-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        {formatContractRenewalReviewMessage({
                          title: c.title,
                          endDate: c.endDate ?? "-",
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.vendorName}
                        {c.buildingName ? ` · ${c.buildingName}` : ""}
                        {d != null ? ` · D-${d}` : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={expiringOnly}
            onChange={(e) => setExpiringOnly(e.target.checked)}
            className="w-4 h-4"
            data-testid="checkbox-expiring-only"
          />
          {RENEWAL_REVIEW_WINDOW_LABEL}만 (검토 윈도우)
        </label>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : contracts && contracts.length > 0 ? (
        <div className="grid gap-3">
          {contracts.map((c: Contract) => (
            <Card key={c.id} className="cursor-pointer hover-elevate" onClick={() => setOpenId(c.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{c.title}</p>
                        <Badge className={STATUS_COLORS[c.status] ?? ""}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {c.vendorName} · {c.category}
                        {c.buildingName && (
                          <> · <Building2 className="w-3 h-3 inline" /> {c.buildingName}</>
                        )}
                      </p>
                      {(c.startDate || c.endDate) && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {c.startDate ?? "-"} ~ {c.endDate ?? "-"}
                        </p>
                      )}
                    </div>
                  </div>
                  {c.contractAmount != null && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{Math.round(c.contractAmount).toLocaleString()}원</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">계약이 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ContractDetailDialog
        contractId={openId}
        onClose={() => setOpenId(null)}
        onTransition={handleTransition}
        canManage={!!canManage}
      />

      {canCreate && (
        <NewContractDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={(id) => {
            queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
            setNewOpen(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function ContractDetailDialog({
  contractId,
  onClose,
  onTransition,
  canManage,
}: {
  contractId: number | null;
  onClose: () => void;
  onTransition: (id: number, status: string) => void;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [docType, setDocType] = useState("contract");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  const { data, isLoading } = useGetContract(contractId ?? 0, {
    query: { enabled: !!contractId, queryKey: getGetContractQueryKey(contractId ?? 0) },
  });
  const upload = useUploadContractDocument();

  if (!contractId) return null;

  async function handleUpload() {
    if (!contractId || !fileName || !fileUrl) {
      toast({ title: "파일명과 URL을 입력해주세요", variant: "destructive" });
      return;
    }
    await upload.mutateAsync({ id: contractId, data: { docType: docType as ContractDocumentDocType, fileName, fileUrl } });
    queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contractId) });
    setFileName("");
    setFileUrl("");
    toast({ title: "증빙 문서가 등록되었습니다" });
  }

  const c = data?.contract;
  const docs = data?.documents ?? [];
  const reports = data?.workReports ?? [];
  const settlements = data?.settlements ?? [];

  return (
    <ResponsiveDialog open={!!contractId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>계약 상세</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {isLoading || !c ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold">{c.title}</h3>
                <Badge className={STATUS_COLORS[c.status] ?? ""}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {c.vendorName} · {c.category}
                {c.buildingName && ` · ${c.buildingName}`}
              </p>
              {(c.startDate || c.endDate) && (
                <p className="text-xs text-muted-foreground mt-1">
                  계약기간: {c.startDate ?? "-"} ~ {c.endDate ?? "-"}
                </p>
              )}
              {c.contractAmount != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  계약금액: {Math.round(c.contractAmount).toLocaleString()}원
                </p>
              )}
              {c.notes && <p className="text-xs mt-2">{c.notes}</p>}
            </div>

            {/* [Task #335] 계약 진행 단계 추적기 — 견적 도착부터 계약 활성화까지 5단계.
                견적도착·견적수락 단계는 계약이 존재한다는 사실 자체가 완료의 증거이며,
                파트너동의는 partnerAgreedAt 컬럼, 본사결재는 status 가 in_approval/draft 를
                벗어났는지, 계약활성화는 status === "active" 로 판정한다. */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">진행 단계</p>
              <ol className="flex flex-wrap items-center gap-2 text-xs">
                {(() => {
                  const partnerAgreed = !!c.partnerAgreedAt;
                  const hqApproved = c.status === "active" || c.status === "terminated";
                  const activated = c.status === "active";
                  const stages: Array<{ key: string; label: string; done: boolean }> = [
                    { key: "quote_received", label: "견적 도착", done: true },
                    { key: "quote_accepted", label: "견적 수락", done: true },
                    { key: "partner_agreed", label: "파트너 동의", done: partnerAgreed },
                    { key: "hq_approved", label: `${ROLE_LABELS.hq_executive} 결재`, done: hqApproved },
                    { key: "activated", label: "계약 활성화", done: activated },
                  ];
                  return stages.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                          s.done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className={s.done ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
                      {i < 4 && <span className="text-muted-foreground">→</span>}
                    </li>
                  ));
                })()}
              </ol>
            </div>

            {canManage && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">상태 전이</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(STATUS_LABELS).filter((s) => s !== c.status).map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => onTransition(c.id, s)}>
                      → {STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                증빙 문서 {canManage ? `(${docs.length})` : "(소장 이상 권한 필요)"}
              </h4>
              {canManage ? (
                <>
                  {docs.length > 0 ? (
                    <div className="space-y-1.5">
                      {docs.map((d: ContractDocument) => (
                        <div key={d.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                          <div>
                            <Badge variant="outline" className="text-xs mr-2">{DOC_TYPE_LABELS[d.docType] ?? d.docType}</Badge>
                            <span>{d.fileName}</span>
                            <span className="text-muted-foreground ml-2">v{d.version}</span>
                          </div>
                          <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-xs underline">열기</a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">등록된 문서가 없습니다</p>
                  )}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Select value={docType} onValueChange={setDocType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="파일명" value={fileName} onChange={(e) => setFileName(e.target.value)} />
                    <Input placeholder="파일 URL" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
                  </div>
                  <Button onClick={handleUpload} disabled={upload.isPending} size="sm" className="mt-2">
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> 등록
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  계약 증빙 문서는 소장(관리책임자) 이상 권한만 열람 가능합니다.
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">이행 보고서 ({reports.length})</h4>
              {reports.length > 0 ? (
                <div className="space-y-1.5">
                  {reports.map((r: WorkReport) => (
                    <div key={r.id} className="text-sm border rounded px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span>{r.title}</span>
                        <Badge variant="outline" className="text-xs">{r.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.completionDate}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">이 계약에 귀속된 이행 보고서가 없습니다</p>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">정산 내역 ({settlements.length})</h4>
              {settlements.length > 0 ? (
                <div className="space-y-1.5">
                  {settlements.map((s: Settlement) => (
                    <div key={s.id} className="text-sm border rounded px-3 py-2 flex items-center justify-between">
                      <span>{Math.round(s.paymentAmount).toLocaleString()}원</span>
                      <Badge variant="outline" className="text-xs">{s.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>정산 내역이 없습니다.</p>
                  <p className="text-xs flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" />
                    검수 결재가 완료된 보고서만 지출결의서 작성이 가능합니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// [Task #369] 신규 계약 등록 다이얼로그.
//   - "계약서 업로드로 시작하기" 진입점에서 PDF/이미지를 올리면 OCR 미리보기를 호출하고
//     vendor·사업자번호·기간·금액·카테고리·자동갱신·제목 후보를 폼에 자동 채운다.
//   - 사용자가 모든 필드를 자유롭게 수정한 뒤 저장하면, 같은 흐름에서 계약 본문 +
//     contract_documents(docType=contract, v1) 가 함께 만들어진다.
//   - vendor 선택은 useListVendors 결과로 콤보박스를 제공하되, OCR 추출된 vendorName 이
//     vendor 목록에 없으면 사용자가 직접 골라야 한다(자동매칭 시도, 실패 시 비워둠).
//   - 신뢰도가 0.6 미만인 필드는 라벨 옆에 "확인 필요" 칩을 표시한다.
type NewContractFormState = {
  vendorId: number | null;
  vendorName: string;
  businessRegNumber: string;
  representativeName: string;
  category: string;
  title: string;
  startDate: string;
  endDate: string;
  contractAmount: string;
  isRecurring: boolean;
  ocrObjectPath: string | null;
  ocrFileName: string | null;
};

const EMPTY_FORM: NewContractFormState = {
  vendorId: null,
  vendorName: "",
  businessRegNumber: "",
  representativeName: "",
  category: "",
  title: "",
  startDate: "",
  endDate: "",
  contractAmount: "",
  isRecurring: false,
  ocrObjectPath: null,
  ocrFileName: null,
};

const LOW_CONFIDENCE_THRESHOLD = 0.6;

function ConfidenceMark({ confidence }: { confidence: number | undefined }) {
  if (confidence == null || confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
  return (
    <Badge variant="outline" className="ml-2 text-[10px] border-amber-400 text-amber-700">
      확인 필요
    </Badge>
  );
}

function NewContractDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (newContractId: number) => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  // [Task #507] 단일 트리거 + 공용 시트(촬영/앨범에서 선택/파일에서 선택)로 통일.
  const [pickerOpen, setPickerOpen] = useState(false);
  const pendingFileNameRef = useRef<string | null>(null);
  const [form, setForm] = useState<NewContractFormState>(EMPTY_FORM);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [ocrPending, setOcrPending] = useState(false);
  // [Task #472] 가로 진행바를 실패 시 즉시 숨기기 위한 신호.
  const [ocrFailed, setOcrFailed] = useState(false);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  // 다이얼로그 닫힘 시 폼 초기화 — 다시 열었을 때 이전 OCR 결과가 남지 않도록.
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setConfidence({});
      setOcrPending(false);
      pendingFileNameRef.current = null;
    }
  }, [open]);

  const { data: vendors } = useListVendors(undefined, {
    query: { enabled: open, staleTime: 5 * 60 * 1000 },
  });

  const ocrPreview = usePreviewContractOcr();
  const createContract = useCreateContract();
  const uploadDoc = useUploadContractDocument();

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: async (response) => {
      setOcrPending(true);
      setOcrFailed(false);
      try {
        const result = await ocrPreview.mutateAsync({
          data: { objectPath: response.objectPath, fileName: pendingFileNameRef.current ?? undefined },
        });
        applyOcr(result, response.objectPath, pendingFileNameRef.current);
        toast({
          title: "OCR 완료",
          description: "추출된 값을 검토하고 저장해주세요.",
        });
      } catch (e) {
        setOcrFailed(true);
        toast({
          title: "OCR 실패",
          description: e instanceof Error ? e.message : "OCR 처리 실패",
          variant: "destructive",
        });
      } finally {
        setOcrPending(false);
      }
    },
    onError: (err) => {
      setOcrFailed(true);
      toast({
        title: "업로드 실패",
        description: err instanceof Error ? err.message : "오류",
        variant: "destructive",
      });
    },
  });

  function applyOcr(result: ContractOcrPreview, objectPath: string, fileName: string | null) {
    // OCR vendorName 으로 기존 vendor 매칭 시도(부분일치). 실패 시 vendorId 는 비워두고
    // vendorName 만 채워서 사용자가 콤보박스에서 직접 선택하도록 한다.
    const list = (vendors ?? []) as Vendor[];
    const matched = result.vendorName
      ? list.find(
          (v) =>
            v.name === result.vendorName ||
            (result.vendorName && v.name.includes(result.vendorName)) ||
            (result.vendorName && result.vendorName.includes(v.name)),
        )
      : undefined;

    setForm({
      vendorId: matched?.id ?? null,
      vendorName: matched?.name ?? result.vendorName ?? "",
      businessRegNumber: formatBusinessNumber(
        result.businessRegNumber ?? matched?.businessRegNumber ?? "",
      ),
      representativeName:
        result.representativeName ?? matched?.representativeName ?? "",
      category: result.category ?? "",
      title: result.title ?? "",
      startDate: result.startDate ?? "",
      endDate: result.endDate ?? "",
      contractAmount:
        result.contractAmount != null ? String(result.contractAmount) : "",
      isRecurring: result.isRecurring === true,
      ocrObjectPath: objectPath,
      ocrFileName: fileName,
    });
    setConfidence(result.fieldConfidence ?? {});
  }

  function handlePick(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: "파일이 너무 큽니다",
        description: "최대 10MB까지 가능합니다.",
        variant: "destructive",
      });
      return;
    }
    pendingFileNameRef.current = f.name;
    setOcrFailed(false);
    uploadFile(f);
  }

  function setField<K extends keyof NewContractFormState>(
    key: K,
    value: NewContractFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.vendorId || !form.vendorName) {
      toast({ title: "협력업체를 선택해주세요", variant: "destructive" });
      return;
    }
    if (!form.category) {
      toast({ title: "카테고리를 선택해주세요", variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "계약 제목을 입력해주세요", variant: "destructive" });
      return;
    }

    const amount = form.contractAmount ? Number(form.contractAmount) : null;
    if (form.contractAmount && !Number.isFinite(amount)) {
      toast({ title: "계약금액은 숫자여야 합니다", variant: "destructive" });
      return;
    }

    const notesParts: string[] = [];
    if (form.businessRegNumber)
      notesParts.push(`사업자번호: ${form.businessRegNumber}`);
    if (form.representativeName)
      notesParts.push(`대표자: ${form.representativeName}`);

    // 직전 실패로 isError 가 켜져 있을 수 있으므로 새 시도 전에 리셋.
    setOcrFailed(false);
    try {
      const contract = await createContract.mutateAsync({
        data: {
          vendorId: form.vendorId,
          vendorName: form.vendorName,
          category: form.category,
          title: form.title.trim(),
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          contractAmount: amount,
          isRecurring: form.isRecurring,
          notes: notesParts.length > 0 ? notesParts.join(" / ") : null,
        },
      });

      // OCR 로 업로드된 원본 계약서가 있으면 contract_documents(v1) 로 함께 등록.
      if (form.ocrObjectPath) {
        try {
          await uploadDoc.mutateAsync({
            id: contract.id,
            data: {
              docType: "contract",
              fileName: form.ocrFileName ?? "contract",
              fileUrl: form.ocrObjectPath,
              notes: "OCR 업로드 자동 등록",
            },
          });
        } catch (e) {
          // 본 계약은 생성됐지만 문서 첨부만 실패 — 사용자에게 안내하고 계속.
          toast({
            title: "계약은 등록됐으나 문서 첨부 실패",
            description: e instanceof Error ? e.message : "문서 첨부 실패",
            variant: "destructive",
          });
        }
      }

      toast({ title: "계약이 등록되었습니다" });
      onCreated(contract.id);
    } catch (e) {
      // 저장 단계 실패 — 가로바를 100% 깜빡임 없이 즉시 숨긴다.
      setOcrFailed(true);
      toast({
        title: "계약 등록 실패",
        description: e instanceof Error ? e.message : "오류",
        variant: "destructive",
      });
    }
  }

  const busy = isUploading || ocrPending || createContract.isPending || uploadDoc.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>신규 계약 등록</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-5">
          {/* OCR 업로드 진입점 */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium">계약서 업로드로 시작하기</p>
              </div>
              <p className="text-xs text-muted-foreground">
                계약서 PDF · JPG · PNG · HEIC (최대 10MB)를 올리면 업체명·사업자번호·기간·금액·카테고리·자동갱신
                여부·제목 후보가 자동으로 채워집니다.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPickerOpen(true)}
                disabled={busy}
                className="gap-2"
                data-testid="button-ocr-upload"
              >
                {(isUploading || ocrPending) ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 인식 중...</>
                ) : (
                  <><Upload className="w-4 h-4" /> 계약서 업로드</>
                )}
              </Button>
              <AttachmentPickerSheet
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                title="계약서 첨부"
                description="JPG · PNG · HEIC · PDF, 최대 10MB"
                onPick={handlePick}
                fileOption={{
                  accept: "application/pdf",
                  label: "파일에서 선택",
                  description: "PDF 계약서",
                }}
                testId="contract-picker"
              />
              <OcrProgressBar
                isUploading={isUploading}
                uploadProgress={progress}
                isOcrPending={ocrPending}
                isSaving={createContract.isPending || uploadDoc.isPending}
                savingLabel="계약 저장 중"
                isError={ocrFailed}
                className="pt-1"
                testId="contract-ocr-progress"
              />
              {form.ocrObjectPath && (
                <p className="text-xs text-emerald-700 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {form.ocrFileName ?? "계약서"} 첨부 예정
                </p>
              )}
            </CardContent>
          </Card>

          {/* 폼 (수동 입력 + OCR 자동입력 결과 검토/수정) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>
                협력업체<span className="text-destructive ml-0.5">*</span>
                <ConfidenceMark confidence={confidence.vendorName} />
              </Label>
              <Select
                value={form.vendorId != null ? String(form.vendorId) : ""}
                onValueChange={(v) => {
                  const id = Number(v);
                  const picked = (vendors ?? []).find((x) => x.id === id);
                  setForm((prev) => ({
                    ...prev,
                    vendorId: id,
                    vendorName: picked?.name ?? prev.vendorName,
                    businessRegNumber:
                      picked?.businessRegNumber ?? prev.businessRegNumber,
                    representativeName:
                      picked?.representativeName ?? prev.representativeName,
                  }));
                }}
              >
                <SelectTrigger data-testid="select-vendor"><SelectValue placeholder="협력업체 선택" /></SelectTrigger>
                <SelectContent>
                  {(vendors ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                      {v.businessRegNumber ? ` (${v.businessRegNumber})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.vendorName && form.vendorId == null && (
                <p className="text-xs text-amber-700 mt-1">
                  OCR 추출 업체명: <span className="font-medium">{form.vendorName}</span> — 위 목록에서 매칭되는 협력업체를 선택해주세요.
                </p>
              )}
            </div>

            <div>
              <Label>
                사업자번호
                <ConfidenceMark confidence={confidence.businessRegNumber} />
              </Label>
              <BusinessNumberInput
                value={form.businessRegNumber}
                onChange={(e) => setField("businessRegNumber", e.target.value)}
                placeholder="123-45-67890"
              />
            </div>

            <div>
              <Label>
                대표자명
                <ConfidenceMark confidence={confidence.representativeName} />
              </Label>
              <Input
                value={form.representativeName}
                onChange={(e) => setField("representativeName", e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <Label>
                계약 제목<span className="text-destructive ml-0.5">*</span>
                <ConfidenceMark confidence={confidence.title} />
              </Label>
              <Input
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="○○빌딩 청소용역 계약서"
                data-testid="input-title"
              />
            </div>

            <div>
              <Label>
                카테고리<span className="text-destructive ml-0.5">*</span>
                <ConfidenceMark confidence={confidence.category} />
              </Label>
              <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger data-testid="select-category"><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OCR_CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                계약금액(원)
                <ConfidenceMark confidence={confidence.contractAmount} />
              </Label>
              <Input
                type="number"
                value={form.contractAmount}
                onChange={(e) => setField("contractAmount", e.target.value)}
                placeholder="예: 12000000"
              />
            </div>

            <div>
              <Label>
                계약 시작일
                <ConfidenceMark confidence={confidence.startDate} />
              </Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
              />
            </div>

            <div>
              <Label>
                계약 종료일
                <ConfidenceMark confidence={confidence.endDate} />
              </Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setField("isRecurring", e.target.checked)}
                  className="w-4 h-4"
                />
                자동(자동연장) 갱신 조항이 있는 계약입니다
                <ConfidenceMark confidence={confidence.isRecurring} />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={busy} data-testid="button-save-contract">
              {createContract.isPending || uploadDoc.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 저장 중</>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
