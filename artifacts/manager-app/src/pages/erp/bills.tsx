import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Upload, FileText, RefreshCw, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { OcrProgressBar } from "@/components/ocr-progress-bar";
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const LINE_ITEM_LABELS: Record<string, string> = {
  general: "일반관리비",
  cleaning: "청소비",
  security: "경비비",
  disinfection: "소독비",
  elevator: "승강기유지비",
  electricity: "공동전기료",
  water: "공동수도료",
  heating: "난방비",
  gas: "가스료",
  longTermRepairFund: "장기수선충당금",
  insurance: "화재보험료",
  other: "기타",
};

type BillSummary = {
  id: number;
  buildingId: number;
  billingMonth: string;
  totalAmount: number;
  unitCount: number | null;
  dueDate: string | null;
  lineItems: Record<string, number>;
  fieldConfidence: Record<string, number>;
  sourceFileUrl: string | null;
  sourceFileName: string | null;
  confirmed: boolean;
  createdAt: string;
};

export default function BillsPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  // [Task #507] 촬영/갤러리 분리 버튼을 단일 트리거 + 공용 시트로 통일.
  // PDF 업로드 경로는 시트의 "파일에서 선택"(application/pdf)로 그대로 보존한다.
  const [pickerOpen, setPickerOpen] = useState(false);

  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocrPending, setOcrPending] = useState(false);
  // [Task #472] 가로 진행바를 실패 시 즉시 숨기기 위한 신호.
  const [ocrFailed, setOcrFailed] = useState(false);
  const [editing, setEditing] = useState<BillSummary | null>(null);
  const pendingFileNameRef = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/fees/bill-summaries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("목록을 불러오지 못했습니다");
      setBills(await res.json());
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : "오류", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: async (response) => {
      setOcrPending(true);
      setOcrFailed(false);
      try {
        const res = await fetch(`${apiBase}/fees/bill-ocr`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ objectPath: response.objectPath, fileName: pendingFileNameRef.current }),
        });
        if (!res.ok && res.status !== 202) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || "OCR 실패");
        }
        if (res.status === 202) {
          // 원본은 보관됐지만 OCR 자체는 실패 — 가로바를 100% 깜빡임 없이
          // 즉시 숨기고 토스트로만 안내한다.
          setOcrFailed(true);
          const body = await res.json().catch(() => ({}));
          toast({
            title: "OCR 인식 실패 — 다시 시도해 주세요",
            description: (body && body.error) || "고지서 목록에서 ‘다시 인식’을 눌러 재시도할 수 있습니다.",
            variant: "destructive",
          });
          await load();
          return;
        }
        const saved = await res.json();
        toast({ title: "OCR 완료", description: `${saved.billingMonth} 청구서가 등록되었습니다. 값을 확인해 주세요.` });
        await load();
        setEditing(saved);
      } catch (e) {
        setOcrFailed(true);
        toast({ title: "OCR 실패", description: e instanceof Error ? e.message : "오류", variant: "destructive" });
        await load();
      } finally {
        setOcrPending(false);
      }
    },
    onError: (err) => {
      setOcrFailed(true);
      toast({ title: "업로드 실패", description: err instanceof Error ? err.message : "오류", variant: "destructive" });
    },
  });

  function handlePick(f: File) {
    if (f.size > MAX_FILE_SIZE_BYTES) {
      toast({ title: "파일이 너무 큽니다", description: `최대 ${MAX_FILE_SIZE_MB}MB까지 가능합니다.`, variant: "destructive" });
      return;
    }
    pendingFileNameRef.current = f.name;
    setOcrFailed(false);
    uploadFile(f);
  }

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">관리비 고지서</h1>
        <p className="text-sm text-muted-foreground">사진 또는 PDF로 고지서를 올리면 항목·금액이 자동 인식되어 누적됩니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">고지서 업로드</CardTitle>
          <CardDescription>JPG · PNG · HEIC · PDF, 최대 {MAX_FILE_SIZE_MB}MB</CardDescription>
        </CardHeader>
        <CardContent>
          {/* [Task #507] 단일 트리거 + 공용 시트(촬영/앨범에서 선택/파일에서 선택)로 통일. */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setPickerOpen(true)}
              disabled={isUploading || ocrPending}
              className="gap-2"
              data-testid="bills-upload-trigger"
            >
              {(isUploading || ocrPending) ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 인식 중...</>
              ) : (
                <><Upload className="w-4 h-4" /> 고지서 첨부</>
              )}
            </Button>
          </div>
          <AttachmentPickerSheet
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            title="고지서 첨부"
            description="JPG · PNG · HEIC · PDF, 최대 10MB"
            onPick={handlePick}
            fileOption={{
              accept: "application/pdf",
              label: "파일에서 선택",
              description: "PDF 고지서",
            }}
            testId="bills-picker"
          />
          <OcrProgressBar
            isUploading={isUploading}
            uploadProgress={progress}
            isOcrPending={ocrPending}
            isError={ocrFailed}
            className="mt-3"
            testId="bills-ocr-progress"
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">월별 고지서 ({bills.length})</h2>
          <Button variant="ghost" size="sm" onClick={load}>새로고침</Button>
        </div>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : bills.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />아직 등록된 고지서가 없습니다.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {bills.map((b) => {
              const failed = b.billingMonth.startsWith("failed-");
              return (
                <Card key={b.id} className={`cursor-pointer hover:border-primary/50 ${failed ? "border-red-300 bg-red-50/50" : ""}`} onClick={() => setEditing(b)}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {failed
                          ? <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />OCR 실패 — 다시 인식 필요</Badge>
                          : <Badge variant="outline" className="font-mono">{b.billingMonth}</Badge>}
                        {!failed && (b.confirmed
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />확정</Badge>
                          : <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />검토 필요</Badge>)}
                      </div>
                      <div className="mt-1 text-lg font-bold">{failed ? "—" : `₩${Math.round(b.totalAmount).toLocaleString()}`}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {failed
                          ? "원본 파일이 보관되어 있습니다. 카드를 눌러 다시 인식하세요."
                          : (Object.keys(b.lineItems || {}).slice(0, 4).map(k => LINE_ITEM_LABELS[k] || k).join(" · ") || "항목 없음")
                            + (b.unitCount ? ` · ${b.unitCount}세대` : "")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <BillEditDialog
          bill={editing}
          token={token}
          apiBase={apiBase}
          onClose={() => setEditing(null)}
          onChanged={async () => { await load(); }}
        />
      )}
    </div>
  );
}

function BillEditDialog({ bill, token, apiBase, onClose, onChanged }: {
  bill: BillSummary;
  token: string | null;
  apiBase: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(bill);
  const [saving, setSaving] = useState(false);
  const [reocring, setReocring] = useState(false);

  function setLine(key: string, val: string) {
    const num = Number(val.replace(/[^0-9-]/g, ""));
    setDraft(d => ({ ...d, lineItems: { ...d.lineItems, [key]: Number.isFinite(num) ? num : 0 } }));
  }

  async function save(confirmFlag: boolean) {
    setSaving(true);
    try {
      const totalFromItems = Object.values(draft.lineItems || {}).reduce((s, v) => s + (Number(v) || 0), 0);
      const res = await fetch(`${apiBase}/fees/bill-summaries/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          billingMonth: draft.billingMonth,
          totalAmount: draft.totalAmount || totalFromItems,
          unitCount: draft.unitCount,
          dueDate: draft.dueDate,
          lineItems: draft.lineItems,
          confirmed: confirmFlag,
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast({ title: confirmFlag ? "확정 완료" : "저장 완료" });
      await onChanged();
      onClose();
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : "오류", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function reocr() {
    setReocring(true);
    try {
      const res = await fetch(`${apiBase}/fees/bill-summaries/${bill.id}/reocr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "재인식 실패");
      }
      const updated = await res.json();
      setDraft(updated);
      toast({ title: "재인식 완료" });
      await onChanged();
    } catch (e) {
      toast({ title: "재인식 실패", description: e instanceof Error ? e.message : "오류", variant: "destructive" });
    } finally {
      setReocring(false);
    }
  }

  async function remove() {
    if (!confirm("이 고지서 요약을 삭제하시겠습니까? 원본 파일은 보관됩니다.")) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/fees/bill-summaries/${bill.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("삭제 실패");
      await onChanged();
      onClose();
    } catch (e) {
      toast({ title: "오류", description: e instanceof Error ? e.message : "오류", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function lowConf(key: string): boolean {
    const c = draft.fieldConfidence?.[key];
    return typeof c === "number" && c < 0.7;
  }

  const allKeys = Array.from(new Set([...Object.keys(LINE_ITEM_LABELS), ...Object.keys(draft.lineItems || {})]));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>고지서 상세 · {draft.billingMonth}</DialogTitle>
          <DialogDescription>인식된 값을 검토하고 확정하세요. 노란색은 신뢰도가 낮은 필드입니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">청구월</Label>
              <Input value={draft.billingMonth} onChange={e => setDraft({ ...draft, billingMonth: e.target.value })}
                className={lowConf("billingMonth") ? "bg-yellow-50 border-yellow-300" : ""} />
            </div>
            <div>
              <Label className="text-xs">납기일</Label>
              <Input value={draft.dueDate ?? ""} onChange={e => setDraft({ ...draft, dueDate: e.target.value || null })}
                className={lowConf("dueDate") ? "bg-yellow-50 border-yellow-300" : ""} />
            </div>
            <div>
              <Label className="text-xs">총액 (원)</Label>
              <Input type="number" value={draft.totalAmount} onChange={e => setDraft({ ...draft, totalAmount: Number(e.target.value) || 0 })}
                className={lowConf("totalAmount") ? "bg-yellow-50 border-yellow-300" : ""} />
            </div>
            <div>
              <Label className="text-xs">세대수</Label>
              <Input type="number" value={draft.unitCount ?? ""} onChange={e => setDraft({ ...draft, unitCount: e.target.value ? Number(e.target.value) : null })}
                className={lowConf("unitCount") ? "bg-yellow-50 border-yellow-300" : ""} />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="text-xs font-semibold mb-2 text-muted-foreground">항목별 금액 (원)</div>
            <div className="space-y-2">
              {allKeys.map(k => (
                <div key={k} className="flex items-center gap-2">
                  <Label className="w-32 text-xs">{LINE_ITEM_LABELS[k] || k}</Label>
                  <Input type="number" value={draft.lineItems?.[k] ?? ""} onChange={e => setLine(k, e.target.value)}
                    className={lowConf(k) ? "bg-yellow-50 border-yellow-300" : ""} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={remove} disabled={saving} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" />삭제
          </Button>
          <Button variant="outline" onClick={reocr} disabled={reocring || saving}>
            {reocring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}다시 인식
          </Button>
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>저장</Button>
          <Button onClick={() => save(true)} disabled={saving}>
            <CheckCircle2 className="w-4 h-4 mr-1" />확정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
