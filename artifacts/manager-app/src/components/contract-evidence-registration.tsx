// [Task #707] 결재 라인 최종 승인 후 "계약·증빙 등록" 단계 폼.
//   - 입력: 업체명, 계약서 파일, 세금계산서 파일(또는 미발행 사유), 계약 기간,
//     선택적 분리부과 스케줄(총액·개월수·시작/종료일).
//   - POST /approvals/:id/register-contract-evidence 가 voucher/request 발행
//     (또는 긴급집행 라인의 경우 메타 갱신) 트리거를 담당한다.
//
// 부속명세서 placeholder: 분리부과 스케줄 입력은 향후 월말 관리비 부과 시
//   "부속명세서" 자동 생성을 위한 자리표시. 본 태스크에서는 컬럼 + 표시만 추가.
//   (분리부과 ≠ 분납. replit.md 의 "부속명세서" 섹션 참조)
import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, FileText, Loader2 } from "lucide-react";

interface Props {
  approvalId: number;
  defaultVendorName?: string | null;
  /** 긴급집행 라인 — 발행은 이미 완료, 메타 갱신만. */
  urgentExecution?: boolean;
  onRegistered: () => void;
}

export default function ContractEvidenceRegistration({
  approvalId,
  defaultVendorName,
  urgentExecution,
  onRegistered,
}: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE = (import.meta.env.BASE_URL ?? "/") as string;
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const { uploadFile } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
  });

  const [vendorName, setVendorName] = useState(defaultVendorName ?? "");
  // [Task #707 review fix] 계약서·세금계산서는 다중 파일/페이지 첨부 가능.
  const [contractFiles, setContractFiles] = useState<{ url: string; name: string }[]>([]);
  const [taxInvoiceFiles, setTaxInvoiceFiles] = useState<{ url: string; name: string }[]>([]);
  const [taxInvoicePending, setTaxInvoicePending] = useState(false);
  const [taxInvoicePendingReason, setTaxInvoicePendingReason] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [installmentTotalAmount, setInstallmentTotalAmount] = useState("");
  const [installmentMonths, setInstallmentMonths] = useState("");
  const [installmentStartDate, setInstallmentStartDate] = useState("");
  const [installmentEndDate, setInstallmentEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<"contract" | "tax" | null>(null);

  const contractRef = useRef<HTMLInputElement>(null);
  const taxRef = useRef<HTMLInputElement>(null);

  async function handleFiles(target: "contract" | "tax", files: FileList) {
    setUploading(target);
    try {
      const uploaded: { url: string; name: string }[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile(file);
        if (!result?.objectPath) throw new Error("업로드 응답에 objectPath 가 없습니다");
        uploaded.push({ url: `${apiBase}/storage${result.objectPath}`, name: file.name });
      }
      if (target === "contract") setContractFiles((prev) => [...prev, ...uploaded]);
      else setTaxInvoiceFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      toast({
        title: "업로드 실패",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  }

  function removeFile(target: "contract" | "tax", index: number) {
    if (target === "contract") {
      setContractFiles((prev) => prev.filter((_, i) => i !== index));
    } else {
      setTaxInvoiceFiles((prev) => prev.filter((_, i) => i !== index));
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const monthsNum = installmentMonths ? Number(installmentMonths) : null;
      const totalNum = installmentTotalAmount ? Number(installmentTotalAmount) : null;
      const monthlyNum = monthsNum && totalNum ? Math.round(totalNum / monthsNum) : null;

      const res = await fetch(`${apiBase}/approvals/${approvalId}/register-contract-evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          vendorName: vendorName.trim(),
          contractFiles: contractFiles.map((f) => ({ fileUrl: f.url, fileName: f.name })),
          taxInvoiceFiles: taxInvoiceFiles.map((f) => ({ fileUrl: f.url, fileName: f.name })),
          taxInvoicePending,
          taxInvoicePendingReason: taxInvoicePending ? taxInvoicePendingReason.trim() : null,
          contractStartDate,
          contractEndDate,
          installmentTotalAmount: totalNum,
          installmentMonths: monthsNum,
          installmentMonthlyAmount: monthlyNum,
          installmentStartDate: installmentStartDate || null,
          installmentEndDate: installmentEndDate || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: err?.error ?? "등록에 실패했습니다",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: urgentExecution
          ? "계약·증빙 사후등록 완료 — 발행 메타가 갱신되었습니다"
          : "계약·증빙 등록 완료 — 지출결의서·입금요청서가 발행되었습니다",
      });
      onRegistered();
    } catch (err) {
      toast({
        title: "등록에 실패했습니다",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/50 p-4 space-y-3" data-testid="contract-evidence-section">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-amber-700" />
        <p className="text-sm font-semibold text-amber-900">
          {urgentExecution ? "긴급지출 — 계약·증빙 사후등록" : "계약·증빙 등록"}
        </p>
      </div>
      <p className="text-xs text-amber-800">
        {urgentExecution
          ? "긴급집행으로 이미 발행된 지출결의서·입금요청서의 업체·계약·세금계산서·기간·분리부과 메타를 입력합니다."
          : "업체·계약서·세금계산서·기간·분리부과를 입력하면 지출결의서·입금요청서가 발행됩니다."}
      </p>

      <div className="space-y-2">
        <Label className="text-xs">업체명 *</Label>
        <Input
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          placeholder="예) (주)한빛엘리베이터"
          data-testid="contract-evidence-vendor"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">계약서 파일 * (1개 이상, 추가 페이지 첨부 가능)</Label>
        <input
          ref={contractRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) handleFiles("contract", files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => contractRef.current?.click()}
          disabled={uploading === "contract"}
          data-testid="contract-evidence-contract-pick"
        >
          {uploading === "contract" ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Paperclip className="w-3 h-3 mr-1" />
          )}
          {contractFiles.length === 0
            ? "계약서 선택"
            : `계약서 ${contractFiles.length}개 첨부 — 더 추가`}
        </Button>
        {contractFiles.length > 0 && (
          <ul className="text-xs space-y-1" data-testid="contract-evidence-contract-list">
            {contractFiles.map((f, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <Paperclip className="w-3 h-3 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => removeFile("contract", idx)}
                >
                  제거
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="taxInvoicePending"
            checked={taxInvoicePending}
            onCheckedChange={(v) => setTaxInvoicePending(!!v)}
            data-testid="contract-evidence-tax-pending"
          />
          <Label htmlFor="taxInvoicePending" className="text-xs">
            세금계산서 미발행 (사유 기재)
          </Label>
        </div>
        {taxInvoicePending ? (
          <Textarea
            value={taxInvoicePendingReason}
            onChange={(e) => setTaxInvoicePendingReason(e.target.value)}
            placeholder="예) 익월 발행 예정 / 간이과세자 등"
            rows={2}
            data-testid="contract-evidence-tax-reason"
          />
        ) : (
          <>
            <Label className="text-xs">세금계산서 (1개 이상, 추가 페이지 첨부 가능)</Label>
            <input
              ref={taxRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) handleFiles("tax", files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => taxRef.current?.click()}
              disabled={uploading === "tax"}
              data-testid="contract-evidence-tax-pick"
            >
              {uploading === "tax" ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Paperclip className="w-3 h-3 mr-1" />
              )}
              {taxInvoiceFiles.length === 0
                ? "세금계산서 선택"
                : `세금계산서 ${taxInvoiceFiles.length}개 첨부 — 더 추가`}
            </Button>
            {taxInvoiceFiles.length > 0 && (
              <ul className="text-xs space-y-1" data-testid="contract-evidence-tax-list">
                {taxInvoiceFiles.map((f, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <Paperclip className="w-3 h-3 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => removeFile("tax", idx)}
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">계약 시작일 *</Label>
          <Input
            type="date"
            value={contractStartDate}
            onChange={(e) => setContractStartDate(e.target.value)}
            data-testid="contract-evidence-start"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">계약 종료일 *</Label>
          <Input
            type="date"
            value={contractEndDate}
            onChange={(e) => setContractEndDate(e.target.value)}
            data-testid="contract-evidence-end"
          />
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-white/60 p-3 space-y-2">
        <p className="text-xs font-medium text-amber-900">분리부과 (선택) — 부속명세서 자리표시</p>
        <p className="text-[11px] text-muted-foreground">
          입력 시 월말 관리비 부과의 부속명세서 근거로 사용됩니다 (자동 생성은 후속 태스크).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">총 분리부과 금액</Label>
            <Input
              type="number"
              value={installmentTotalAmount}
              onChange={(e) => setInstallmentTotalAmount(e.target.value)}
              placeholder="원"
              data-testid="contract-evidence-installment-total"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">개월수</Label>
            <Input
              type="number"
              value={installmentMonths}
              onChange={(e) => setInstallmentMonths(e.target.value)}
              placeholder="개월"
              data-testid="contract-evidence-installment-months"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">분리부과 시작</Label>
            <Input
              type="date"
              value={installmentStartDate}
              onChange={(e) => setInstallmentStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">분리부과 종료</Label>
            <Input
              type="date"
              value={installmentEndDate}
              onChange={(e) => setInstallmentEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Button
        size="sm"
        className="bg-amber-700 hover:bg-amber-800 text-white w-full"
        onClick={handleSubmit}
        disabled={submitting}
        data-testid="contract-evidence-submit"
      >
        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
        {urgentExecution ? "사후등록 저장" : "등록하고 발행"}
      </Button>
    </div>
  );
}
