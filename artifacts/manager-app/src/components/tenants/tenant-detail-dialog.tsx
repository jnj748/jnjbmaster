import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ShieldAlert, Download, Loader2 } from "lucide-react";
import { DocLink } from "@/components/tenants/doc-link";
import type { Tenant } from "@workspace/api-client-react";
import { formatPhoneNumber, formatBusinessNumber } from "@/lib/format-korean";

interface Props {
  tenant: Tenant | null;
  exportingId: number | null;
  getVerificationBadge: (status: string | null | undefined) => React.ReactNode;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (tenant: Tenant) => void;
  onExport: (tenant: Tenant) => void;
}

export function TenantDetailDialog({
  tenant,
  exportingId,
  getVerificationBadge,
  onClose,
  onApprove,
  onReject,
  onExport,
}: Props) {
  return (
    <ResponsiveDialog open={!!tenant} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>입주자카드 상세</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {tenant && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">호실:</span> <span className="font-medium">{tenant.unit}</span></div>
              <div><span className="text-muted-foreground">입주자명:</span> <span className="font-medium">{tenant.tenantName}</span></div>
              <div><span className="text-muted-foreground">주민등록번호:</span> {tenant.residentId || "-"}</div>
              <div><span className="text-muted-foreground">휴대폰:</span> {tenant.phone ? formatPhoneNumber(tenant.phone) : "-"}</div>
              <div><span className="text-muted-foreground">비상연락처:</span> {tenant.emergencyContact ? formatPhoneNumber(tenant.emergencyContact) : "-"}</div>
              <div><span className="text-muted-foreground">이메일:</span> {tenant.email || "-"}</div>
              <div><span className="text-muted-foreground">인테리어 개시일:</span> {tenant.interiorStartDate || "-"}</div>
              <div><span className="text-muted-foreground">입주일:</span> {tenant.moveInDate || "-"}</div>
              <div><span className="text-muted-foreground">퇴거일:</span> {tenant.moveOutDate || "-"}</div>
              <div><span className="text-muted-foreground">관리비 부과 시작일:</span> <span className="font-medium text-primary">{tenant.billingStartDate || "-"}</span></div>
              <div><span className="text-muted-foreground">상호명:</span> {tenant.companyName || "-"}</div>
              <div><span className="text-muted-foreground">사업자등록번호:</span> {tenant.businessNumber ? formatBusinessNumber(tenant.businessNumber) : "-"}</div>
              <div><span className="text-muted-foreground">TV소유:</span> {tenant.hasTv ? "예" : "아니오"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">주민등록주소:</span> {tenant.registeredAddress || "-"}</div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">법인 연대보증인</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">보증인명:</span> {tenant.guarantorName || "-"}</div>
                <div><span className="text-muted-foreground">연락처:</span> {tenant.guarantorPhone ? formatPhoneNumber(tenant.guarantorPhone) : "-"}</div>
                <div><span className="text-muted-foreground">관계:</span> {tenant.guarantorRelation || "-"}</div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">관리계약 동의 내역</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {tenant.feeObligationConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  <span>관리비 납부 의무</span>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.penaltyConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  <span>체납 시 조치</span>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.specialFundConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  <span>특별충당금</span>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.privacyRetentionConsent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  <span>개인정보 보관</span>
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">전자서명</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">서명자:</span> <span className="font-medium">{tenant.signatureName || "-"}</span></div>
                <div><span className="text-muted-foreground">서명일시:</span> {tenant.signatureDate ? new Date(tenant.signatureDate).toLocaleString("ko-KR") : "-"}</div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">첨부 서류</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <DocLink label="임대차계약서" url={tenant.contractDocUrl} hasFlag={tenant.contractDoc} />
                <DocLink label="신분증" url={tenant.idDocUrl} hasFlag={tenant.idDoc} />
                <DocLink label="사업자등록증" url={tenant.businessRegDocUrl} hasFlag={tenant.businessRegDoc} />
                <DocLink label="자동차등록증" url={tenant.vehicleRegDocUrl} hasFlag={false} />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">서류 확인 상태</p>
              <div className="flex items-center gap-2 text-sm">
                {getVerificationBadge(tenant.verificationStatus)}
                {tenant.verifiedBy && <span className="text-muted-foreground">확인자: {tenant.verifiedBy}</span>}
                {tenant.verifiedAt && <span className="text-muted-foreground">({new Date(tenant.verifiedAt).toLocaleString("ko-KR")})</span>}
              </div>
            </div>
            {tenant.status === "moved_out" && tenant.dataDestructionDate && (
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-orange-500" />
                  <p className="text-sm font-medium">개인정보 파기 예정</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">파기 예정일:</span>{" "}
                    <span className="font-medium text-orange-600">{tenant.dataDestructionDate}</span>
                  </p>
                </div>
              </div>
            )}
            {tenant.notes && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-1">기타사항</p>
                <p className="text-sm text-muted-foreground">{tenant.notes}</p>
              </div>
            )}
            <div className="flex gap-2">
              {tenant.verificationStatus === "unverified" && tenant.signatureName && (
                <>
                  <Button className="flex-1" onClick={() => onApprove(tenant.id)}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    서류 확인 승인
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => onReject(tenant)}>
                    <XCircle className="w-4 h-4 mr-2" />
                    반려
                  </Button>
                </>
              )}
              <Button variant="outline" className={tenant.verificationStatus === "unverified" && tenant.signatureName ? "" : "w-full"} onClick={() => onExport(tenant)} disabled={exportingId === tenant.id}>
                {exportingId === tenant.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                PDF 내보내기
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
