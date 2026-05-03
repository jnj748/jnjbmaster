// [Task #782] 보관함에서 가져오기 — 후속 엔진(지출결의·부과·수납·회계) 화면이
//   업로드센터에서 확인된 OCR 자료를 키보드 입력 없이 폼에 그대로 채우기 위한
//   공용 진입 컴포넌트. 버튼 + 다이얼로그 + 어댑터 적용을 한 번에 처리한다.
//
// 사용 예:
//   <IngestionPicker target="expense" onPick={(adapted, ingestionId) => {...}} />
//
//   - 서버는 GET /documents/ingest 로 보관함 행을 돌려준다 (kind 필터 가능).
//   - 어댑터(ocrAdapters)는 서버 lib 와 동일 시그니처로 클라이언트에 사본 보관:
//     extraction → 도메인별 자동 채움 데이터.  순수 함수라 사본 유지가 안전하다.
//   - 폼 제출 후 호출처가 linkRef(target=>id) 를 부르면 ingestion.linkedRefs 에 저장.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { FolderOpen, Loader2 } from "lucide-react";

// 서버 ocrAdapters 와 동일한 입력 타입의 부분.
export type Extraction = {
  kind: string;
  vendor: string | null;
  amount: number | null;
  date: string | null;
  items: { name: string; amount: number | null; quantity: number | null }[];
  categoryCandidates: string[];
  rawText: string;
  kindSpecific?: Record<string, unknown>;
};

export type AdapterTarget = "expense" | "billing" | "collection" | "journal" | "vendor";

// 종류 → 후속 타깃. 서버 ocrAdapters.ts ADAPTERS_BY_KIND 와 동기 유지.
const KINDS_FOR_TARGET: Record<AdapterTarget, string[]> = {
  expense: ["receipt", "tax_invoice", "contract"],
  billing: ["bill"],
  collection: ["bank_statement"],
  journal: ["receipt", "tax_invoice", "bill", "bank_statement", "resolution"],
  vendor: ["business_reg", "contract"],
};

const KIND_LABEL: Record<string, string> = {
  receipt: "영수증", bill: "청구서", bank_statement: "통장내역",
  contract: "계약서", resolution: "의결문", tax_invoice: "세금계산서",
  business_reg: "사업자등록증", memo: "메모", meter_photo: "계량기", unknown: "분류불가",
};

// 어댑터 — 서버 ocrAdapters.ts 사본. 폼 자동 채움이 목적이라 순수 함수만 옮김.
export type ExpenseAdapted = {
  vendor: string | null; amount: number | null; spentAt: string | null;
  description: string | null; categoryCandidates: string[];
};
export type BillingAdapted = {
  billingMonth: string | null; totalAmount: number | null;
  lineItems: Record<string, number>; dueDate: string | null;
};
export type CollectionAdapted = Array<{ date: string | null; vendor: string | null; amount: number | null }>;
export type JournalAdapted = {
  vendor: string | null; amount: number | null; date: string | null;
  accountCandidates: string[]; memo: string | null;
};
export type VendorAdapted = {
  vendorName: string | null; businessRegNumber: string | null;
  representativeName: string | null; address: string | null;
};

export type AdaptedFor = {
  expense: ExpenseAdapted;
  billing: BillingAdapted;
  collection: CollectionAdapted;
  journal: JournalAdapted;
  vendor: VendorAdapted;
};

export function applyAdapter<T extends AdapterTarget>(target: T, ext: Extraction): AdaptedFor[T] {
  switch (target) {
    case "expense":
      return {
        vendor: ext.vendor,
        amount: ext.amount,
        spentAt: ext.date,
        description: ext.items.map(i => i.name).filter(Boolean).join(", ") || (ext.rawText.slice(0, 80) || null),
        categoryCandidates: ext.categoryCandidates,
      } as AdaptedFor[T];
    case "billing": {
      const ks = (ext.kindSpecific ?? {}) as { billingMonth?: string; lineItems?: Record<string, number> };
      return {
        billingMonth: ks.billingMonth ?? null,
        totalAmount: ext.amount,
        lineItems: (ks.lineItems && typeof ks.lineItems === "object") ? ks.lineItems : {},
        dueDate: ext.date,
      } as AdaptedFor[T];
    }
    case "collection":
      return ext.items.map(it => ({
        date: ext.date, vendor: it.name, amount: it.amount,
      })) as AdaptedFor[T];
    case "journal":
      return {
        vendor: ext.vendor,
        amount: ext.amount,
        date: ext.date,
        accountCandidates: ext.categoryCandidates,
        memo: ext.items.map(i => i.name).filter(Boolean).join(", ") || null,
      } as AdaptedFor[T];
    case "vendor": {
      const ks = (ext.kindSpecific ?? {}) as {
        businessRegNumber?: string | null; representativeName?: string | null; address?: string | null;
      };
      return {
        vendorName: ext.vendor,
        businessRegNumber: ks.businessRegNumber ?? null,
        representativeName: ks.representativeName ?? null,
        address: ks.address ?? null,
      } as AdaptedFor[T];
    }
  }
  // 컴파일러 만족용 — 위에서 모든 케이스 처리.
  throw new Error(`unknown target: ${target}`);
}

interface IngestionRow {
  id: number;
  kind: string;
  status: string;
  fileName: string | null;
  extraction: Extraction;
  createdAt: string;
  linkedRefs?: Record<string, number | string> | null;
}

interface Props<T extends AdapterTarget> {
  target: T;
  onPick: (adapted: AdaptedFor[T], ingestionId: number, raw: IngestionRow) => void;
  /** 트리거 버튼 라벨 (기본: "보관함에서 가져오기") */
  label?: string;
  /** 트리거 버튼 variant */
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  testId?: string;
  /** 다이얼로그 헤더 설명 */
  description?: string;
}

export function IngestionPicker<T extends AdapterTarget>({
  target, onPick, label = "보관함에서 가져오기", variant = "outline", size = "sm",
  className, testId, description,
}: Props<T>) {
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE = (import.meta.env.BASE_URL ?? "/") as string;
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<IngestionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const allowedKinds = KINDS_FOR_TARGET[target];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 보관함 전체를 한 번에 받고 클라이언트에서 kind 필터링 (요청 절약).
        const res = await fetch(`${apiBase}/documents/ingest?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("보관함 조회 실패");
        const all = (await res.json()) as IngestionRow[];
        if (!cancelled) {
          // [Task #782] 후속 엔진은 "확인된(confirmed)" 자료만 소비한다 — 추출 단계나
          //   거부된 자료는 폼 자동 채움 대상에서 제외해 흐름 정확성을 보장.
          setRows(all.filter(r => allowedKinds.includes(r.kind) && r.status === "confirmed"));
        }
      } catch (err) {
        toast({
          title: "보관함 조회 실패",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, target, token, apiBase, toast, allowedKinds]);

  function handlePick(row: IngestionRow) {
    const adapted = applyAdapter(target, row.extraction);
    onPick(adapted, row.id, row);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        data-testid={testId ?? `ingestion-picker-${target}-trigger`}
      >
        <FolderOpen className="w-4 h-4 mr-1" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>보관함에서 가져오기</DialogTitle>
            <DialogDescription>
              {description ?? "업로드센터에서 확인된 자료를 선택하면 폼이 자동으로 채워집니다."}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground" data-testid={`ingestion-picker-${target}-empty`}>
              사용 가능한 자료가 없습니다. 먼저 업로드센터에서 자료를 등록·확인하세요.
            </div>
          ) : (
            <ul className="divide-y" data-testid={`ingestion-picker-${target}-list`}>
              {rows.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(r)}
                    className="w-full text-left py-2.5 px-2 hover:bg-muted/50 rounded flex items-center gap-2"
                    data-testid={`ingestion-pick-${r.id}`}
                  >
                    <Badge variant="secondary" className="shrink-0">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.extraction.vendor || r.fileName || "(이름 없음)"}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                        {r.extraction.date && <span>{r.extraction.date}</span>}
                        {r.extraction.amount != null && (
                          <span className="tabular-nums">{r.extraction.amount.toLocaleString()}원</span>
                        )}
                        <Badge variant={r.status === "confirmed" ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 후속 객체 id 가 확정된 뒤 ingestion 에 linkedRefs 누적 저장.
 *  사용자 흐름(결재 발행/송금/출납 기록)은 이미 성공한 뒤이므로 throw 하지 않지만,
 *  비-2xx 응답이나 네트워크 오류는 콘솔에 남겨 운영 추적이 가능하게 한다. */
export async function linkIngestionRef(
  apiBase: string,
  token: string | null,
  ingestionId: number,
  linkedRefs: Record<string, number | string>,
): Promise<void> {
  try {
    const res = await fetch(`${apiBase}/documents/ingest/${ingestionId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ linkedRefs }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[ingestion-picker] linkIngestionRef ${ingestionId} 실패: ${res.status} ${body}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ingestion-picker] linkIngestionRef ${ingestionId} 네트워크 오류`, err);
  }
}
