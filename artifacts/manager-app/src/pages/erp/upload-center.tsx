// [Task #774] 부과자료 업로드센터.
//   관리소장이 한 화면에서 모든 자료(영수증·청구서·통장내역·계약서·의결문·세금계산서)
//   를 일괄 업로드하고 OCR 결과를 즉석 확인 → 보관함에 저장하는 진입 페이지.
//   저장된 항목은 후속 엔진(지출결의·부과·수납·회계)이 동일한 ingestion 행을
//   재사용하여 키보드 입력 없이 자동 채운다.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UploadConfirmCard, type IngestionResult } from "@/components/documents/upload-confirm-card";
import { Trash2 } from "lucide-react";

const KIND_TABS = [
  { key: "all", label: "전체" },
  { key: "receipt", label: "영수증" },
  { key: "bill", label: "청구서" },
  { key: "bank_statement", label: "통장내역" },
  { key: "contract", label: "계약서" },
  { key: "resolution", label: "의결문" },
  { key: "tax_invoice", label: "세금계산서" },
] as const;

const KIND_LABEL: Record<string, string> = {
  receipt: "영수증", bill: "청구서", bank_statement: "통장내역",
  contract: "계약서", resolution: "의결문", tax_invoice: "세금계산서",
  business_reg: "사업자등록증", memo: "메모", meter_photo: "계량기", unknown: "분류불가",
};

interface IngestionRow {
  id: number;
  kind: string;
  status: string;
  fileName: string | null;
  extraction: IngestionResult["extraction"];
  createdAt: string;
}

export default function UploadCenterPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE = (import.meta.env.BASE_URL ?? "/") as string;
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const [tab, setTab] = useState<typeof KIND_TABS[number]["key"]>("all");
  const [rows, setRows] = useState<IngestionRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = tab === "all" ? "" : `?kind=${tab}`;
      const res = await fetch(`${apiBase}/documents/ingest${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("보관함 조회 실패");
      setRows(await res.json());
    } catch (err) {
      toast({ title: "보관함 조회 실패", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  async function remove(id: number) {
    if (!confirm("이 항목을 보관함에서 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${apiBase}/documents/ingest/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("삭제 실패");
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      toast({ title: "삭제 실패", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  return (
    <div className="container max-w-5xl py-6 space-y-6" data-testid="upload-center-page">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">부과자료 업로드센터</h1>
        <p className="text-sm text-muted-foreground">
          영수증·청구서·통장내역·계약서·의결문·세금계산서를 한 곳에서 업로드하면 자동으로 종류를 분류하고 핵심 정보를 추출합니다.
          확인 버튼을 누르면 보관함에 저장되고, 지출결의·부과·수납·회계 화면에서 다시 입력하지 않고 그대로 사용할 수 있습니다.
        </p>
      </div>

      <UploadConfirmCard onConfirmed={() => void load()} />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">보관함</h2>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>새로고침</Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex flex-wrap h-auto">
            {KIND_TABS.map(t => <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>{t.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">아직 보관된 자료가 없습니다.</div>
            ) : (
              <ul className="divide-y" data-testid="ingestion-list">
                {rows.map(r => (
                  <li key={r.id} className="py-2.5 flex items-center gap-3" data-testid={`ingestion-${r.id}`}>
                    <Badge variant="secondary" className="shrink-0">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.extraction.vendor || r.fileName || "(이름 없음)"}</div>
                      <div className="text-xs text-muted-foreground flex gap-3">
                        {r.extraction.date && <span>{r.extraction.date}</span>}
                        {r.extraction.amount != null && <span className="tabular-nums">{r.extraction.amount.toLocaleString()}원</span>}
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        <Badge variant={r.status === "confirmed" ? "default" : "outline"} className="text-[10px] px-1.5 py-0">{r.status}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => void remove(r.id)} data-testid={`delete-${r.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
