// [Task #774] OCR/문서엔진 v01 — 공용 업로드+확인 카드 (배치 지원).
//   드래그앤드롭/파일 선택 — 여러 파일 동시 가능 — 업로드 → /documents/ingest
//   호출 → 각 파일별 추출 결과 카드를 누적 표시. 사용자는 vendor/amount/date/
//   카테고리만 칩으로 확인/수정하고, "전체 확인" 또는 카드별 "확인" 으로
//   보관함에 일괄 저장. 호출처는 onConfirmed(ingestion) 콜백만 처리한다 — 카드
//   안에서 dedup·확인 상태 추적·후속 엔진(지출결의·부과·수납·회계) 연결을 위한
//   완성된 ingestion 객체를 돌려준다.
import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { OcrProgressBar } from "@/components/ocr-progress-bar";
import { Loader2, UploadCloud, X, Check } from "lucide-react";

type ExtractionItem = { name: string; amount: number | null; quantity: number | null };
export interface IngestionResult {
  id: number | null;
  kind: string;
  contentHash: string;
  duplicateOf: number | null;
  extraction: {
    kind: string;
    vendor: string | null;
    amount: number | null;
    date: string | null;
    items: ExtractionItem[];
    categoryCandidates: string[];
    confidence: number;
    rawText: string;
    pages?: unknown[];
    kindSpecific?: Record<string, unknown>;
  };
}

const KIND_LABEL: Record<string, string> = {
  receipt: "영수증", bill: "관리비/공과금 청구서", bank_statement: "통장 거래내역",
  contract: "용역 계약서", resolution: "의결문", tax_invoice: "세금계산서",
  business_reg: "사업자등록증", memo: "메모", meter_photo: "계량기 사진", unknown: "분류 불가",
};

interface QueueItem {
  key: string;
  fileName: string;
  status: "uploading" | "ocr" | "ready" | "confirmed" | "duplicate" | "error";
  uploadProgress: number;
  result: IngestionResult | null;
  error: string | null;
  // 사용자가 칩에서 편집한 값. ready 진입 시 result 로 초기화.
  vendor: string;
  amount: string;
  date: string;
  category: string | null;
}

interface Props {
  /** 종류 힌트(있으면 분류 LLM 콜 생략). 호출처가 종류를 이미 알 때 사용. */
  kindHint?: string;
  accept?: string;
  /** 카드별/전체 확인 버튼 클릭 후 후속 처리(ex. 지출결의 라우팅) 콜백. */
  onConfirmed?: (ingestion: IngestionResult) => void;
  hint?: string;
}

// [Task #868] 한국 사무실에서 들어오는 엑셀(.xlsx/.xls), 워드(.docx),
// 한글(.hwpx/.hwp) 까지 받는다. .doc(워드 구버전) 은 서버에서 친절 거절.
const DEFAULT_ACCEPT =
  "image/*,application/pdf,text/csv,.xlsx,.xls,.docx,.hwpx,.hwp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.hancom.hwpx,application/vnd.hancom.hwp";

export function UploadConfirmCard({ kindHint, accept = DEFAULT_ACCEPT, onConfirmed, hint }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE = (import.meta.env.BASE_URL ?? "/") as string;
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const { uploadFile } = useUpload({ basePath: `${apiBase}/storage`, authToken: token });

  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  function patch(key: string, p: Partial<QueueItem>) {
    setItems(prev => prev.map(it => it.key === key ? { ...it, ...p } : it));
  }

  async function processOne(file: File) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initial: QueueItem = {
      key, fileName: file.name, status: "uploading", uploadProgress: 10,
      result: null, error: null, vendor: "", amount: "", date: "", category: null,
    };
    setItems(prev => [initial, ...prev]);
    try {
      const up = await uploadFile(file);
      patch(key, { uploadProgress: 100, status: "ocr" });
      if (!up?.objectPath) throw new Error("업로드 응답에 objectPath 가 없습니다");
      const res = await fetch(`${apiBase}/documents/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath: up.objectPath, fileName: file.name, kindHint }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "OCR 실패");
      const result = json as IngestionResult;
      patch(key, {
        result,
        status: result.duplicateOf ? "duplicate" : "ready",
        vendor: result.extraction.vendor ?? "",
        amount: result.extraction.amount != null ? String(result.extraction.amount) : "",
        date: result.extraction.date ?? "",
        category: result.extraction.categoryCandidates[0] ?? null,
      });
      // [Task #868] .hwp(구버전 한글)·.xls(엑셀 BIFF) 는 안정 Node 파서가 없어
      // 본문 추출이 실패할 수 있다. 보관함에는 보존되지만 사용자에게 신버전 변환
      // 안내를 가볍게 띄워 정확도를 높이도록 유도한다.
      const lower = file.name.toLowerCase();
      const looksEmpty = !result.extraction.rawText || result.extraction.rawText.length < 8;
      if (lower.endsWith(".hwp") && (result.kind === "unknown" || looksEmpty)) {
        toast({
          title: `"${file.name}" 본문 추출 정확도 안내`,
          description:
            "한글 신버전(.hwpx) 또는 PDF 로 저장해서 다시 올리시면 정확도가 좋아집니다. 파일은 보관함에 저장되었습니다.",
        });
      } else if (lower.endsWith(".xls") && (result.kind === "unknown" || looksEmpty)) {
        toast({
          title: `"${file.name}" 본문 추출 정확도 안내`,
          description:
            "엑셀 신버전(.xlsx) 으로 저장해서 다시 올리시면 정확도가 좋아집니다. 파일은 보관함에 저장되었습니다.",
        });
      }
    } catch (err) {
      patch(key, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    // 병렬 — 사용자 체감 속도 우선. 서버 측은 무거운 LLM 호출이라 동시성 제한이
    // 필요하면 라우터/모델 라우터에서 처리한다.
    await Promise.all(arr.map(f => processOne(f)));
  }

  async function confirmItem(key: string): Promise<boolean> {
    const it = items.find(x => x.key === key);
    if (!it || !it.result?.id || it.status !== "ready") return false;
    const updated = {
      ...it.result.extraction,
      vendor: it.vendor.trim() || null,
      amount: it.amount ? Number(it.amount.replace(/[^0-9.\-]/g, "")) : null,
      date: it.date || null,
      categoryCandidates: it.category
        ? [it.category, ...it.result.extraction.categoryCandidates.filter(c => c !== it.category)]
        : it.result.extraction.categoryCandidates,
    };
    try {
      const res = await fetch(`${apiBase}/documents/ingest/${it.result.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ extraction: updated, status: "confirmed" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "확인 실패");
      }
      patch(key, { status: "confirmed" });
      onConfirmed?.({ ...it.result, extraction: updated });
      return true;
    } catch (err) {
      toast({
        title: `"${it.fileName}" 확인 실패`,
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return false;
    }
  }

  async function confirmAll() {
    setBulkConfirming(true);
    try {
      const ready = items.filter(x => x.status === "ready");
      let ok = 0;
      for (const it of ready) {
        if (await confirmItem(it.key)) ok += 1;
      }
      if (ok > 0) toast({ title: `${ok}건을 보관함에 저장했습니다` });
    } finally {
      setBulkConfirming(false);
    }
  }

  function dismiss(key: string) {
    setItems(prev => prev.filter(x => x.key !== key));
  }

  function clearFinished() {
    setItems(prev => prev.filter(x => x.status === "ready" || x.status === "uploading" || x.status === "ocr"));
  }

  const anyBusy = items.some(x => x.status === "uploading" || x.status === "ocr");
  const readyCount = items.filter(x => x.status === "ready").length;

  return (
    <Card className="p-4 space-y-4" data-testid="upload-confirm-card">
      <div
        className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        data-testid="upload-confirm-dropzone"
      >
        <UploadCloud className="w-10 h-10 text-muted-foreground mb-2" />
        <div className="text-sm font-medium">파일을 드래그하거나 클릭해 업로드 (여러 개 동시 가능)</div>
        <div className="text-xs text-muted-foreground mt-1">{hint ?? "영수증·청구서·통장내역·계약서·의결문·세금계산서 (PDF, JPG, PNG, 엑셀, 한글, 워드, CSV)"}</div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            대기 {items.filter(x => x.status === "ocr" || x.status === "uploading").length} ·
            확인 대기 {readyCount} ·
            저장됨 {items.filter(x => x.status === "confirmed").length} ·
            중복 {items.filter(x => x.status === "duplicate").length} ·
            실패 {items.filter(x => x.status === "error").length}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearFinished} disabled={anyBusy || bulkConfirming}>완료 항목 지우기</Button>
            <Button size="sm" onClick={() => void confirmAll()} disabled={readyCount === 0 || bulkConfirming || anyBusy} data-testid="ingest-confirm-all">
              {bulkConfirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              전체 확인 ({readyCount})
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map(it => (
          <ItemCard
            key={it.key}
            item={it}
            onChange={(p) => patch(it.key, p)}
            onConfirm={() => void confirmItem(it.key)}
            onDismiss={() => dismiss(it.key)}
          />
        ))}
      </div>
    </Card>
  );
}

function ItemCard({
  item, onChange, onConfirm, onDismiss,
}: {
  item: QueueItem;
  onChange: (p: Partial<QueueItem>) => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (item.status === "uploading" || item.status === "ocr") {
    return (
      <div className="border rounded p-3 space-y-2" data-testid={`ingest-item-${item.key}`}>
        <div className="text-sm font-medium truncate">{item.fileName}</div>
        <OcrProgressBar
          isUploading={item.status === "uploading"}
          uploadProgress={item.uploadProgress}
          isOcrPending={item.status === "ocr"}
        />
      </div>
    );
  }
  if (item.status === "error") {
    return (
      <div className="border border-destructive/40 bg-destructive/5 rounded p-3 flex items-start gap-2" data-testid={`ingest-item-${item.key}`}>
        <div className="flex-1 text-sm">
          <div className="font-medium truncate">{item.fileName}</div>
          <div className="text-xs text-destructive">{item.error}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={onDismiss}><X className="w-4 h-4" /></Button>
      </div>
    );
  }
  if (item.status === "duplicate") {
    return (
      <div className="border rounded p-3 flex items-start gap-2 bg-muted/30" data-testid={`ingest-item-${item.key}`}>
        <div className="flex-1 text-sm">
          <div className="font-medium truncate">{item.fileName}</div>
          <div className="text-xs text-muted-foreground">
            이미 보관함(#{item.result?.duplicateOf})에 동일 파일이 등록되어 있어 새로 저장하지 않았습니다.
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onDismiss}><X className="w-4 h-4" /></Button>
      </div>
    );
  }
  if (item.status === "confirmed") {
    return (
      <div className="border rounded p-3 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30" data-testid={`ingest-item-${item.key}`}>
        <Check className="w-4 h-4 text-emerald-600" />
        <div className="flex-1 text-sm font-medium truncate">{item.fileName}</div>
        <span className="text-xs text-muted-foreground">보관함에 저장됨</span>
        <Button variant="ghost" size="icon" onClick={onDismiss}><X className="w-4 h-4" /></Button>
      </div>
    );
  }
  // ready
  const r = item.result!;
  return (
    <div className="border rounded p-3 space-y-3" data-testid={`ingest-item-${item.key}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
        <span className="text-xs text-muted-foreground">신뢰도 {Math.round((r.extraction.confidence ?? 0) * 100)}%</span>
        <span className="text-xs text-muted-foreground truncate flex-1">{item.fileName}</span>
      </div>

      {/*
        칩 교체 기반 필드 수정:
          - 추출된 값(있으면) + "기타" 칩만 노출.
          - 추출값 칩을 누르면 그대로 채택, "기타" 칩을 누르면 그때만 직접 입력.
          - 직접 입력은 명시적 옵트인이므로 오타/실수로 자동 채움 값을 덮어쓰는 사고를 줄인다.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ChipField
          label="거래처/발급기관"
          suggested={r.extraction.vendor}
          value={item.vendor}
          onChange={(v) => onChange({ vendor: v })}
          inputMode="text"
        />
        <ChipField
          label="금액(원)"
          suggested={r.extraction.amount != null ? String(r.extraction.amount) : null}
          formatSuggested={(v) => Number(v).toLocaleString()}
          value={item.amount}
          onChange={(v) => onChange({ amount: v })}
          inputMode="numeric"
        />
        <ChipField
          label="일자"
          suggested={r.extraction.date}
          value={item.date}
          onChange={(v) => onChange({ date: v })}
          inputType="date"
        />
      </div>

      {r.extraction.categoryCandidates.length > 0 && (
        <ChipPickField
          label="계정/카테고리 후보"
          options={r.extraction.categoryCandidates}
          value={item.category}
          onChange={(v) => onChange({ category: v })}
        />
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <X className="w-4 h-4 mr-1" />취소
        </Button>
        <Button size="sm" onClick={onConfirm} data-testid={`ingest-confirm-${item.key}`}>
          <Check className="w-4 h-4 mr-1" />확인하고 저장
        </Button>
      </div>
    </div>
  );
}

function ChipField({
  label, suggested, value, onChange, inputMode = "text", inputType, formatSuggested,
}: {
  label: string;
  suggested: string | null;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "text" | "numeric";
  inputType?: "date";
  formatSuggested?: (v: string) => string;
}) {
  // 모드: 추출값 그대로 채택 / 직접 입력("기타"). 추출값이 없으면 처음부터 직접 입력만.
  const hasSuggested = !!suggested;
  const usingSuggested = hasSuggested && value === suggested;
  const [editing, setEditing] = useState(!hasSuggested);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5 items-center">
        {hasSuggested && (
          <button
            type="button"
            onClick={() => { onChange(suggested!); setEditing(false); }}
            className={`px-2.5 py-1 rounded-full text-xs border ${usingSuggested && !editing ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
          >
            {formatSuggested ? formatSuggested(suggested!) : suggested}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setEditing(true); if (value === suggested) onChange(""); }}
          className={`px-2.5 py-1 rounded-full text-xs border ${editing ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
        >
          기타
        </button>
        {editing && (
          inputType === "date" ? (
            <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-auto flex-1 min-w-[140px]" />
          ) : (
            <Input value={value === suggested ? "" : value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode} className="h-8 flex-1 min-w-[120px]" />
          )
        )}
      </div>
    </div>
  );
}

function ChipPickField({
  label, options, value, onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [otherText, setOtherText] = useState("");
  const isOther = value !== null && !options.includes(value);
  const [editing, setEditing] = useState(isOther);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5 items-center">
        {options.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setEditing(false); }}
            className={`px-2.5 py-1 rounded-full text-xs border ${value === c && !editing ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setEditing(true); onChange(otherText || null); }}
          className={`px-2.5 py-1 rounded-full text-xs border ${editing ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
        >
          기타
        </button>
        {editing && (
          <Input
            value={otherText}
            onChange={(e) => { setOtherText(e.target.value); onChange(e.target.value || null); }}
            placeholder="직접 입력"
            className="h-8 w-40"
          />
        )}
      </div>
    </div>
  );
}

export default UploadConfirmCard;
