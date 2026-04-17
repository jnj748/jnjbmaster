import { useState } from "react";
import {
  useListContracts,
  useGetContract,
  useUpdateContract,
  useTransitionContractStatus,
  useUploadContractDocument,
  useCheckContractRenewalAlerts,
  getListContractsQueryKey,
  getGetContractQueryKey,
  type Contract,
  type ContractDocument,
  type ContractDocumentDocType,
  type ListContractsParams,
  type WorkReport,
  type Settlement,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { FileText, Building2, Calendar, AlertCircle, Upload, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

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

const PRIVILEGED_ROLES = new Set(["manager", "platform_admin", "hq_executive", "accountant"]);

export default function ContractsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const params: ListContractsParams = {};
  if (statusFilter !== "all") params.status = statusFilter as ListContractsParams["status"];
  if (expiringOnly) params.expiringWithinDays = 30;

  const { data: contracts, isLoading } = useListContracts(params);
  const transitionMutation = useTransitionContractStatus();
  const renewalCheck = useCheckContractRenewalAlerts();

  const canManage = user && PRIVILEGED_ROLES.has(user.role);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">파트너 계약 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            품의 → 계약 → 이행 → 정산 → 갱신의 전체 생애주기를 관리합니다
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={handleRenewalCheck} disabled={renewalCheck.isPending}>
            <RefreshCw className="w-4 h-4 mr-2" />
            갱신 알림 확인
          </Button>
        )}
      </div>

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
          <input type="checkbox" checked={expiringOnly} onChange={(e) => setExpiringOnly(e.target.checked)} className="w-4 h-4" />
          만료 30일 이내만
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
  const update = useUpdateContract();

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
