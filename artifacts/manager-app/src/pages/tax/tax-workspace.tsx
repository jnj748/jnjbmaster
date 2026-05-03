// [Task #803] 세금계산서 통합 워크스페이스 — 18개 화면을 단일 좌-우 분할 작업대로 통합.
//   왼쪽: 발행 목록(필터·신규 작성 버튼).
//   오른쪽: 선택한 세금계산서 상세 + 작성 폼 + 발행/거래처 전송/국세청 전송 액션.
//   거래처·품목 마스터는 하단 드로어 탭으로 같은 페이지에서 관리.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

type TaxVendor = { id: number; role: string; bizNo: string; companyName: string; representative?: string | null; address?: string | null; bizType?: string | null; bizItem?: string | null; email?: string | null };
type TaxItem = { id: number; code: string; name: string; spec?: string | null; unitPrice: number };
type Line = { sortOrder: number; lineDate?: string | null; itemCode?: string | null; itemName: string; spec?: string | null; quantity: number; unitPrice: number; supplyAmount?: number; taxAmount?: number; note?: string | null };
type Invoice = {
  id: number; invoiceType: "sales" | "purchase"; taxType: "taxable" | "zero_rated" | "exempt"; billType: "billed" | "received"; status: string;
  issueDate: string; approvalNumber?: string | null;
  supplierBizNo: string; supplierName: string; supplierEmail?: string | null;
  buyerBizNo: string; buyerName: string; buyerEmail?: string | null;
  supplyAmount: number; taxAmount: number; totalAmount: number;
  cashAmount: number; checkAmount: number; noteAmount: number; creditAmount: number;
  note?: string | null; lines?: Line[]; transmissions?: Array<{ id: number; kind: string; status: string; target: string; sentAt?: string | null }>;
};

function nf(n: number | null | undefined): string { return new Intl.NumberFormat("ko-KR").format(Math.round(Number(n ?? 0))); }
function today(): string { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }

function emptyDraft(): Partial<Invoice> & { lines: Line[] } {
  return {
    invoiceType: "sales", taxType: "taxable", billType: "billed", status: "draft", issueDate: today(),
    supplierBizNo: "", supplierName: "", supplierEmail: "",
    buyerBizNo: "", buyerName: "", buyerEmail: "",
    cashAmount: 0, checkAmount: 0, noteAmount: 0, creditAmount: 0,
    note: "",
    lines: [{ sortOrder: 0, itemName: "", quantity: 1, unitPrice: 0 }],
  };
}

export default function TaxWorkspacePage() {
  const { token } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const buildingId = building?.id ?? null;
  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const [tab, setTab] = useState<string>("invoices");
  const [list, setList] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<(Partial<Invoice> & { lines: Line[] }) | null>(null);
  const [vendors, setVendors] = useState<TaxVendor[]>([]);
  const [items, setItems] = useState<TaxItem[]>([]);
  const [vendorDraft, setVendorDraft] = useState<Partial<TaxVendor>>({ role: "both" });
  const [itemDraft, setItemDraft] = useState<Partial<TaxItem>>({});
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState("");
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctReason, setCorrectReason] = useState("");
  const [correctType, setCorrectType] = useState<string>("");
  const [correctDraft, setCorrectDraft] = useState<(Partial<Invoice> & { lines: Line[] }) | null>(null);

  async function reloadList() {
    if (!buildingId) return;
    const q = new URLSearchParams({ buildingId: String(buildingId) });
    if (statusFilter !== "all") q.set("status", statusFilter);
    if (typeFilter !== "all") q.set("invoiceType", typeFilter);
    const r = await fetch(`${apiBase}/tax/invoices?${q.toString()}`, { headers });
    if (r.ok) { const j = await r.json(); setList(j.invoices ?? []); }
  }
  async function reloadDetail(id: number) {
    const r = await fetch(`${apiBase}/tax/invoices/${id}?buildingId=${buildingId}`, { headers });
    if (r.ok) setDetail(await r.json());
  }
  async function reloadVendors() {
    if (!buildingId) return;
    const r = await fetch(`${apiBase}/tax/vendors?buildingId=${buildingId}`, { headers });
    if (r.ok) { const j = await r.json(); setVendors(j.vendors ?? []); }
  }
  async function reloadItems() {
    if (!buildingId) return;
    const r = await fetch(`${apiBase}/tax/items?buildingId=${buildingId}`, { headers });
    if (r.ok) { const j = await r.json(); setItems(j.items ?? []); }
  }

  useEffect(() => { void reloadList(); void reloadVendors(); void reloadItems(); setSelectedIds(new Set()); /* eslint-disable-next-line */ }, [buildingId]);
  useEffect(() => { void reloadList(); setSelectedIds(new Set()); /* eslint-disable-next-line */ }, [statusFilter, typeFilter]);
  useEffect(() => { if (selectedId) void reloadDetail(selectedId); else setDetail(null); /* eslint-disable-next-line */ }, [selectedId]);

  function toggleId(id: number) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    setSelectedIds((prev) => prev.size === list.length && list.length > 0 ? new Set() : new Set(list.map((i) => i.id)));
  }

  async function bulkIssue() {
    if (!buildingId || selectedIds.size === 0) return;
    const targets = list.filter((i) => selectedIds.has(i.id) && i.status === "draft");
    if (targets.length === 0) { toast({ title: "발행 가능한 임시저장 건이 없습니다", variant: "destructive" }); return; }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const inv of targets) {
      const r = await fetch(`${apiBase}/tax/invoices/${inv.id}/issue?buildingId=${buildingId}`, { method: "POST", headers });
      if (r.ok) ok++; else fail++;
    }
    setBusy(false);
    toast({ title: `일괄 발행 완료`, description: `성공 ${ok}건${fail ? ` · 실패 ${fail}건` : ""}` });
    setSelectedIds(new Set());
    await reloadList();
  }

  async function bulkCancel() {
    if (!buildingId || selectedIds.size === 0 || !bulkCancelReason.trim()) return;
    const targets = list.filter((i) => selectedIds.has(i.id) && i.status !== "cancelled");
    if (targets.length === 0) { toast({ title: "취소 가능한 건이 없습니다", variant: "destructive" }); setBulkCancelOpen(false); return; }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const inv of targets) {
      const r = await fetch(`${apiBase}/tax/invoices/${inv.id}/cancel?buildingId=${buildingId}`, {
        method: "POST", headers, body: JSON.stringify({ reason: bulkCancelReason.trim() }),
      });
      if (r.ok) ok++; else fail++;
    }
    setBusy(false);
    toast({ title: `일괄 취소 완료`, description: `성공 ${ok}건${fail ? ` · 실패 ${fail}건` : ""}` });
    setSelectedIds(new Set());
    setBulkCancelOpen(false);
    setBulkCancelReason("");
    await reloadList();
    if (selectedId) await reloadDetail(selectedId);
  }

  function openCorrect() {
    if (!detail) return;
    setCorrectDraft({ ...detail, lines: detail.lines ?? [] });
    setCorrectReason("");
    setCorrectType("");
    setCorrectOpen(true);
  }

  async function submitCorrect() {
    if (!detail || !buildingId || !correctDraft || !correctReason.trim() || !correctType) return;
    setBusy(true);
    try {
      const lines = (correctDraft.lines ?? []).map((l) => recalcLine(l, correctDraft.taxType ?? "taxable"));
      // 서버 InvoiceBody는 status: "draft" | "issued" 만 허용 — 수정 발행은 항상 issued 로 보낸다.
      const body = {
        reason: correctReason.trim(),
        correctionType: correctType,
        invoice: { ...correctDraft, status: "issued", lines },
      };
      const r = await fetch(`${apiBase}/tax/invoices/${detail.id}/correct?buildingId=${buildingId}`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "수정 발행 실패"); }
      const j = await r.json();
      const newId: number | undefined = j.newId ?? j.id;
      toast({ title: "수정 발행 완료", description: newId ? `신규 ID ${newId}` : undefined });
      setCorrectOpen(false);
      setCorrectDraft(null);
      setCorrectReason("");
      await reloadList();
      if (newId) setSelectedId(newId);
    } catch (e) {
      toast({ title: "오류", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  function startNew() { setSelectedId(null); setDetail(null); setDraft(emptyDraft()); }

  function recalcLine(line: Line, taxType: string): Line {
    const supply = Math.round(Number(line.quantity) * Number(line.unitPrice));
    const tax = taxType === "taxable" ? Math.round(supply * 0.1) : 0;
    return { ...line, supplyAmount: supply, taxAmount: tax };
  }

  async function saveDraft(andIssue = false) {
    if (!draft || !buildingId) return;
    setBusy(true);
    try {
      const lines = (draft.lines ?? []).map((l) => recalcLine(l, draft.taxType ?? "taxable"));
      const body = { ...draft, buildingId, lines };
      const url = `${apiBase}/tax/invoices${selectedId ? `/${selectedId}` : ""}?buildingId=${buildingId}`;
      const method = selectedId ? "PUT" : "POST";
      const r = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "저장 실패"); }
      const saved = await r.json();
      const id = (selectedId ?? saved.id) as number;
      if (andIssue) {
        const r2 = await fetch(`${apiBase}/tax/invoices/${id}/issue?buildingId=${buildingId}`, { method: "POST", headers });
        if (!r2.ok) { const j = await r2.json().catch(() => ({})); throw new Error(j.error ?? "발행 실패"); }
      }
      toast({ title: andIssue ? "발행 완료" : "임시저장 완료" });
      setDraft(null);
      setSelectedId(id);
      await reloadList();
      await reloadDetail(id);
    } catch (e) {
      toast({ title: "오류", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function transmit(kind: string) {
    if (!detail || !buildingId) return;
    setBusy(true);
    try {
      const target = kind === "email" ? detail.buyerEmail : null;
      const r = await fetch(`${apiBase}/tax/invoices/${detail.id}/transmit?buildingId=${buildingId}`, {
        method: "POST", headers, body: JSON.stringify({ kind, target }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "전송 실패"); }
      toast({ title: "거래처 전송 완료" });
      await reloadDetail(detail.id);
      await reloadList();
    } catch (e) {
      toast({ title: "오류", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function ntsTransmit() {
    if (!detail || !buildingId) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/tax/invoices/${detail.id}/nts-transmit?buildingId=${buildingId}`, { method: "POST", headers });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "전송 실패"); }
      const j = await r.json();
      toast({ title: "국세청 전송 완료", description: `승인번호 ${j.approvalNumber}` });
      await reloadDetail(detail.id);
      await reloadList();
    } catch (e) {
      toast({ title: "오류", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function saveVendor() {
    if (!buildingId || !vendorDraft.bizNo || !vendorDraft.companyName) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/tax/vendors?buildingId=${buildingId}`, {
        method: "POST", headers, body: JSON.stringify({ ...vendorDraft, buildingId }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "저장 실패"); }
      toast({ title: "거래처 저장" });
      setVendorDraft({ role: "both" });
      await reloadVendors();
    } catch (e) { toast({ title: "오류", description: (e as Error).message, variant: "destructive" }); } finally { setBusy(false); }
  }
  async function saveItem() {
    if (!buildingId || !itemDraft.code || !itemDraft.name) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/tax/items?buildingId=${buildingId}`, {
        method: "POST", headers, body: JSON.stringify({ ...itemDraft, unitPrice: Number(itemDraft.unitPrice ?? 0), buildingId }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "저장 실패"); }
      toast({ title: "품목 저장" });
      setItemDraft({});
      await reloadItems();
    } catch (e) { toast({ title: "오류", description: (e as Error).message, variant: "destructive" }); } finally { setBusy(false); }
  }

  function applyVendor(vid: number, role: "supplier" | "buyer") {
    const v = vendors.find((x) => x.id === vid);
    if (!v || !draft) return;
    if (role === "supplier") {
      setDraft({
        ...draft, supplierVendorId: v.id, supplierBizNo: v.bizNo, supplierName: v.companyName,
        supplierRepresentative: v.representative ?? null, supplierAddress: v.address ?? null,
        supplierBizType: v.bizType ?? null, supplierBizItem: v.bizItem ?? null, supplierEmail: v.email ?? null,
      } as typeof draft);
    } else {
      setDraft({
        ...draft, buyerVendorId: v.id, buyerBizNo: v.bizNo, buyerName: v.companyName,
        buyerRepresentative: v.representative ?? null, buyerAddress: v.address ?? null,
        buyerBizType: v.bizType ?? null, buyerBizItem: v.bizItem ?? null, buyerEmail: v.email ?? null,
      } as typeof draft);
    }
  }

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto" data-testid="page-tax-workspace">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>세금계산서 워크스페이스</CardTitle>
            <Button onClick={startNew} data-testid="button-new-invoice">+ 새 세금계산서</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="invoices">세금계산서</TabsTrigger>
              <TabsTrigger value="vendors">거래처 ({vendors.length})</TabsTrigger>
              <TabsTrigger value="items">품목 ({items.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* 목록 */}
                <div className="md:col-span-5 space-y-2">
                  <div className="flex gap-2">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="구분" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="sales">매출</SelectItem>
                        <SelectItem value="purchase">매입</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="상태" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="draft">임시저장</SelectItem>
                        <SelectItem value="issued">발행</SelectItem>
                        <SelectItem value="transmitted">전송</SelectItem>
                        <SelectItem value="nts_approved">국세청 승인</SelectItem>
                        <SelectItem value="cancelled">취소</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {list.length > 0 && (
                    <div className="flex items-center gap-2 px-1 py-1 text-xs">
                      <Checkbox
                        checked={selectedIds.size === list.length && list.length > 0}
                        onCheckedChange={() => toggleAll()}
                        data-testid="checkbox-select-all"
                      />
                      <span className="text-muted-foreground">전체 선택 ({selectedIds.size}/{list.length})</span>
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => void bulkIssue()} disabled={busy || selectedIds.size === 0} data-testid="button-bulk-issue">일괄 발행</Button>
                        <Button size="sm" variant="outline" onClick={() => setBulkCancelOpen(true)} disabled={busy || selectedIds.size === 0} data-testid="button-bulk-cancel">일괄 취소</Button>
                      </div>
                    </div>
                  )}
                  <div className="border rounded max-h-[60vh] overflow-auto" data-testid="list-invoices">
                    {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">세금계산서가 없습니다.</p>}
                    {list.map((inv) => (
                      <div
                        key={inv.id}
                        className={`flex items-start gap-2 p-3 border-b hover:bg-muted/30 ${selectedId === inv.id ? "bg-muted" : ""}`}
                        data-testid={`row-invoice-${inv.id}`}
                      >
                        <Checkbox
                          className="mt-1"
                          checked={selectedIds.has(inv.id)}
                          onCheckedChange={() => toggleId(inv.id)}
                          data-testid={`checkbox-invoice-${inv.id}`}
                        />
                        <button
                          onClick={() => { setDraft(null); setSelectedId(inv.id); }}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{inv.buyerName} ← {inv.supplierName}</div>
                            <Badge variant="outline">{inv.status}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{inv.issueDate} · {inv.invoiceType === "sales" ? "매출" : "매입"} · 합계 {nf(inv.totalAmount)}</div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 상세/작성 */}
                <div className="md:col-span-7">
                  {!draft && !detail && <p className="text-sm text-muted-foreground">왼쪽에서 세금계산서를 선택하거나 + 새 세금계산서 버튼을 눌러주세요.</p>}
                  {draft && (
                    <DraftEditor
                      draft={draft}
                      setDraft={setDraft}
                      vendors={vendors}
                      items={items}
                      onApplyVendor={applyVendor}
                      onSave={() => void saveDraft(false)}
                      onIssue={() => void saveDraft(true)}
                      onCancel={() => setDraft(null)}
                      busy={busy}
                    />
                  )}
                  {!draft && detail && (
                    <DetailView
                      detail={detail}
                      onEdit={() => setDraft({ ...detail, lines: detail.lines ?? [] })}
                      onTransmit={transmit}
                      onNtsTransmit={ntsTransmit}
                      onCorrect={openCorrect}
                      busy={busy}
                    />
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="vendors">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">거래처 추가</h3>
                  <div className="space-y-2">
                    <Input placeholder="사업자등록번호" value={vendorDraft.bizNo ?? ""} onChange={(e) => setVendorDraft({ ...vendorDraft, bizNo: e.target.value })} data-testid="input-vendor-bizno" />
                    <Input placeholder="상호" value={vendorDraft.companyName ?? ""} onChange={(e) => setVendorDraft({ ...vendorDraft, companyName: e.target.value })} data-testid="input-vendor-name" />
                    <Input placeholder="대표자" value={vendorDraft.representative ?? ""} onChange={(e) => setVendorDraft({ ...vendorDraft, representative: e.target.value })} />
                    <Input placeholder="이메일" value={vendorDraft.email ?? ""} onChange={(e) => setVendorDraft({ ...vendorDraft, email: e.target.value })} />
                    <Button onClick={() => void saveVendor()} disabled={busy} data-testid="button-vendor-save">저장</Button>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">거래처 목록</h3>
                  <div className="border rounded max-h-[50vh] overflow-auto">
                    {vendors.map((v) => (
                      <div key={v.id} className="p-2 border-b text-sm">
                        <div className="font-medium">{v.companyName}</div>
                        <div className="text-xs text-muted-foreground">{v.bizNo} · {v.email ?? "이메일 없음"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="items">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">품목 추가</h3>
                  <div className="space-y-2">
                    <Input placeholder="코드" value={itemDraft.code ?? ""} onChange={(e) => setItemDraft({ ...itemDraft, code: e.target.value })} />
                    <Input placeholder="품목명" value={itemDraft.name ?? ""} onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })} />
                    <Input placeholder="규격" value={itemDraft.spec ?? ""} onChange={(e) => setItemDraft({ ...itemDraft, spec: e.target.value })} />
                    <Input type="number" placeholder="기본 단가" value={String(itemDraft.unitPrice ?? "")} onChange={(e) => setItemDraft({ ...itemDraft, unitPrice: Number(e.target.value) })} />
                    <Button onClick={() => void saveItem()} disabled={busy}>저장</Button>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">품목 목록</h3>
                  <div className="border rounded max-h-[50vh] overflow-auto">
                    {items.map((it) => (
                      <div key={it.id} className="p-2 border-b text-sm">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{it.code} · 단가 {nf(it.unitPrice)}{it.spec ? ` · ${it.spec}` : ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <DialogContent data-testid="dialog-bulk-cancel">
          <DialogHeader>
            <DialogTitle>일괄 취소</DialogTitle>
            <DialogDescription>선택한 {selectedIds.size}건의 세금계산서를 취소합니다. 취소 사유를 입력하세요.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="취소 사유"
            value={bulkCancelReason}
            onChange={(e) => setBulkCancelReason(e.target.value)}
            data-testid="input-bulk-cancel-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkCancelOpen(false)} disabled={busy}>닫기</Button>
            <Button onClick={() => void bulkCancel()} disabled={busy || !bulkCancelReason.trim()} data-testid="button-bulk-cancel-confirm">취소 실행</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={(v) => { setCorrectOpen(v); if (!v) setCorrectDraft(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-correct">
          <DialogHeader>
            <DialogTitle>수정 발행</DialogTitle>
            <DialogDescription>원본은 취소되고 새로운 수정 세금계산서가 발행됩니다. 국세청 수정 사유 코드와 변경 내용을 확인하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Select value={correctType} onValueChange={setCorrectType}>
                <SelectTrigger data-testid="select-correct-type"><SelectValue placeholder="수정 사유 코드 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supply_change">공급가액 변동</SelectItem>
                  <SelectItem value="return">환입(반품)</SelectItem>
                  <SelectItem value="contract_termination">계약 해지</SelectItem>
                  <SelectItem value="misentry">기재사항 착오·정정</SelectItem>
                  <SelectItem value="duplicate">착오에 의한 이중발급</SelectItem>
                  <SelectItem value="local_lc">내국신용장 사후 개설</SelectItem>
                  <SelectItem value="other">기타</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="md:col-span-2"
                placeholder="수정 사유(상세)"
                value={correctReason}
                onChange={(e) => setCorrectReason(e.target.value)}
                data-testid="input-correct-reason"
              />
            </div>
            {correctType && (
              <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/20" data-testid="text-correct-guide">
                {correctType === "supply_change" && "공급가액 변동: 원본을 취소하고 변동 후 금액으로 신규 발행됩니다. 품목·수량·단가를 변경하세요."}
                {correctType === "return" && "환입(반품): 환입 수량/금액을 음수로 입력하거나 해당 라인을 삭제하세요. 작성일자는 환입일로 변경하세요."}
                {correctType === "contract_termination" && "계약 해지: 공급가액·세액을 0 으로 처리하거나 해지일 기준 잔여분만 남기세요. 작성일자를 해지일로 변경하세요."}
                {correctType === "misentry" && "기재사항 착오·정정: 거래처(공급자/공급받는자), 품목명, 세액유형 등 잘못 기재된 항목을 모두 수정할 수 있습니다."}
                {correctType === "duplicate" && "착오에 의한 이중발급: 동일 거래의 중복 발행 취소 — 라인을 비우거나 음수로 처리해 합계가 0 이 되도록 입력하세요."}
                {correctType === "local_lc" && "내국신용장 사후 개설: 과세 → 영세율로 변경하세요. 세액유형을 '영세'로 바꾸면 세액이 0 으로 재계산됩니다."}
                {correctType === "other" && "기타 사유: 변경 내용을 사유 상세란에 기록하세요."}
              </div>
            )}
            {correctDraft && (
              <DraftEditor
                draft={correctDraft}
                setDraft={setCorrectDraft}
                vendors={vendors}
                items={items}
                onApplyVendor={(vid, role) => {
                  const v = vendors.find((x) => x.id === vid);
                  if (!v) return;
                  if (role === "supplier") {
                    setCorrectDraft({
                      ...correctDraft, supplierVendorId: v.id, supplierBizNo: v.bizNo, supplierName: v.companyName,
                      supplierRepresentative: v.representative ?? null, supplierAddress: v.address ?? null,
                      supplierBizType: v.bizType ?? null, supplierBizItem: v.bizItem ?? null, supplierEmail: v.email ?? null,
                    } as typeof correctDraft);
                  } else {
                    setCorrectDraft({
                      ...correctDraft, buyerVendorId: v.id, buyerBizNo: v.bizNo, buyerName: v.companyName,
                      buyerRepresentative: v.representative ?? null, buyerAddress: v.address ?? null,
                      buyerBizType: v.bizType ?? null, buyerBizItem: v.bizItem ?? null, buyerEmail: v.email ?? null,
                    } as typeof correctDraft);
                  }
                }}
                busy={busy}
                hideFooter
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCorrectOpen(false)} disabled={busy}>닫기</Button>
            <Button onClick={() => void submitCorrect()} disabled={busy || !correctReason.trim() || !correctType} data-testid="button-correct-confirm">수정 발행</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DraftEditor({
  draft, setDraft, vendors, onApplyVendor, onSave, onIssue, onCancel, busy, hideFooter,
}: {
  draft: Partial<Invoice> & { lines: Line[] };
  setDraft: (d: Partial<Invoice> & { lines: Line[] }) => void;
  vendors: TaxVendor[]; items: TaxItem[];
  onApplyVendor: (vid: number, role: "supplier" | "buyer") => void;
  onSave?: () => void; onIssue?: () => void; onCancel?: () => void; busy: boolean;
  hideFooter?: boolean;
}) {
  const totalSupply = draft.lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unitPrice)), 0);
  const totalTax = draft.taxType === "taxable" ? Math.round(totalSupply * 0.1) : 0;
  return (
    <div className="space-y-3" data-testid="form-tax-invoice">
      <div className="grid grid-cols-3 gap-2">
        <Select value={draft.invoiceType ?? "sales"} onValueChange={(v) => setDraft({ ...draft, invoiceType: v as Invoice["invoiceType"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">매출</SelectItem>
            <SelectItem value="purchase">매입</SelectItem>
          </SelectContent>
        </Select>
        <Select value={draft.taxType ?? "taxable"} onValueChange={(v) => setDraft({ ...draft, taxType: v as Invoice["taxType"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="taxable">과세</SelectItem>
            <SelectItem value="zero_rated">영세</SelectItem>
            <SelectItem value="exempt">면세</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={draft.issueDate ?? ""} onChange={(e) => setDraft({ ...draft, issueDate: e.target.value })} data-testid="input-issue-date" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <fieldset className="border rounded p-2">
          <legend className="text-xs px-1">공급자</legend>
          {vendors.length > 0 && (
            <Select onValueChange={(v) => onApplyVendor(Number(v), "supplier")}>
              <SelectTrigger><SelectValue placeholder="거래처에서 선택" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.companyName}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Input className="mt-2" placeholder="사업자등록번호" value={draft.supplierBizNo ?? ""} onChange={(e) => setDraft({ ...draft, supplierBizNo: e.target.value })} data-testid="input-supplier-bizno" />
          <Input className="mt-2" placeholder="상호" value={draft.supplierName ?? ""} onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })} data-testid="input-supplier-name" />
          <Input className="mt-2" placeholder="이메일" value={draft.supplierEmail ?? ""} onChange={(e) => setDraft({ ...draft, supplierEmail: e.target.value })} />
        </fieldset>
        <fieldset className="border rounded p-2">
          <legend className="text-xs px-1">공급받는자</legend>
          {vendors.length > 0 && (
            <Select onValueChange={(v) => onApplyVendor(Number(v), "buyer")}>
              <SelectTrigger><SelectValue placeholder="거래처에서 선택" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.companyName}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Input className="mt-2" placeholder="사업자등록번호" value={draft.buyerBizNo ?? ""} onChange={(e) => setDraft({ ...draft, buyerBizNo: e.target.value })} data-testid="input-buyer-bizno" />
          <Input className="mt-2" placeholder="상호" value={draft.buyerName ?? ""} onChange={(e) => setDraft({ ...draft, buyerName: e.target.value })} data-testid="input-buyer-name" />
          <Input className="mt-2" placeholder="이메일" value={draft.buyerEmail ?? ""} onChange={(e) => setDraft({ ...draft, buyerEmail: e.target.value })} data-testid="input-buyer-email" />
        </fieldset>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold">품목</h4>
          <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { sortOrder: draft.lines.length, itemName: "", quantity: 1, unitPrice: 0 }] })}>+ 행 추가</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr><th className="text-left p-1">품목</th><th className="p-1">수량</th><th className="p-1">단가</th><th className="text-right p-1">공급가</th><th className="text-right p-1">세액</th><th></th></tr>
          </thead>
          <tbody>
            {draft.lines.map((l, idx) => {
              const supply = Number(l.quantity) * Number(l.unitPrice);
              const tax = (draft.taxType ?? "taxable") === "taxable" ? Math.round(supply * 0.1) : 0;
              return (
                <tr key={idx} className="border-t">
                  <td className="p-1"><Input value={l.itemName} onChange={(e) => { const lines = [...draft.lines]; lines[idx] = { ...l, itemName: e.target.value }; setDraft({ ...draft, lines }); }} data-testid={`input-line-name-${idx}`} /></td>
                  <td className="p-1 w-24"><Input type="number" value={String(l.quantity)} onChange={(e) => { const lines = [...draft.lines]; lines[idx] = { ...l, quantity: Number(e.target.value) }; setDraft({ ...draft, lines }); }} data-testid={`input-line-qty-${idx}`} /></td>
                  <td className="p-1 w-32"><Input type="number" value={String(l.unitPrice)} onChange={(e) => { const lines = [...draft.lines]; lines[idx] = { ...l, unitPrice: Number(e.target.value) }; setDraft({ ...draft, lines }); }} data-testid={`input-line-price-${idx}`} /></td>
                  <td className="text-right p-1 tabular-nums">{nf(supply)}</td>
                  <td className="text-right p-1 tabular-nums">{nf(tax)}</td>
                  <td className="p-1"><Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== idx) })}>×</Button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td colSpan={3} className="p-1 text-right">합계</td>
              <td className="text-right p-1 tabular-nums" data-testid="text-total-supply">{nf(totalSupply)}</td>
              <td className="text-right p-1 tabular-nums" data-testid="text-total-tax">{nf(totalTax)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Textarea placeholder="비고" value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />

      {!hideFooter && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>취소</Button>
          <Button variant="outline" onClick={onSave} disabled={busy} data-testid="button-save-draft">임시저장</Button>
          <Button onClick={onIssue} disabled={busy} data-testid="button-issue">발행</Button>
        </div>
      )}
    </div>
  );
}

function DetailView({ detail, onEdit, onTransmit, onNtsTransmit, onCorrect, busy }: {
  detail: Invoice; onEdit: () => void; onTransmit: (kind: string) => void; onNtsTransmit: () => void; onCorrect: () => void; busy: boolean;
}) {
  const canCorrect = ["issued", "transmitted", "nts_approved"].includes(detail.status);
  return (
    <div className="space-y-3" data-testid="view-tax-invoice-detail">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{detail.buyerName} ← {detail.supplierName}</div>
          <div className="text-xs text-muted-foreground">{detail.issueDate} · {detail.invoiceType === "sales" ? "매출" : "매입"} · {detail.taxType}</div>
        </div>
        <Badge variant="outline" data-testid="text-status">{detail.status}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="border rounded p-2"><div className="text-xs text-muted-foreground">공급가액</div><div className="tabular-nums" data-testid="text-supply">{nf(detail.supplyAmount)}</div></div>
        <div className="border rounded p-2"><div className="text-xs text-muted-foreground">세액</div><div className="tabular-nums" data-testid="text-tax">{nf(detail.taxAmount)}</div></div>
        <div className="border rounded p-2"><div className="text-xs text-muted-foreground">합계</div><div className="font-semibold tabular-nums" data-testid="text-total">{nf(detail.totalAmount)}</div></div>
      </div>
      {detail.approvalNumber && <div className="text-xs">국세청 승인번호: <span className="font-mono" data-testid="text-approval">{detail.approvalNumber}</span></div>}
      <div>
        <h4 className="text-sm font-semibold mb-1">품목</h4>
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="text-left p-1">품목</th><th className="p-1">수량</th><th className="p-1">단가</th><th className="text-right p-1">공급가</th><th className="text-right p-1">세액</th></tr></thead>
          <tbody>
            {(detail.lines ?? []).map((l, idx) => (
              <tr key={idx} className="border-t"><td className="p-1">{l.itemName}</td><td className="text-center p-1 tabular-nums">{l.quantity}</td><td className="text-right p-1 tabular-nums">{nf(l.unitPrice)}</td><td className="text-right p-1 tabular-nums">{nf(l.supplyAmount)}</td><td className="text-right p-1 tabular-nums">{nf(l.taxAmount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-1">전송 이력</h4>
        {(detail.transmissions ?? []).length === 0 && <p className="text-xs text-muted-foreground">전송 이력이 없습니다.</p>}
        <ul className="text-sm space-y-1" data-testid="list-transmissions">
          {(detail.transmissions ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-2"><Badge variant="outline">{t.kind}</Badge><span className="font-mono text-xs">{t.target}</span><Badge>{t.status}</Badge>{t.sentAt && <span className="text-xs text-muted-foreground">{new Date(t.sentAt).toLocaleString()}</span>}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {detail.status === "draft" && <Button variant="outline" onClick={onEdit} disabled={busy} data-testid="button-edit">수정</Button>}
        {detail.status !== "draft" && (
          <>
            {canCorrect && <Button variant="outline" onClick={onCorrect} disabled={busy} data-testid="button-correct">수정 발행</Button>}
            <Button variant="outline" onClick={() => onTransmit("email")} disabled={busy || !detail.buyerEmail} data-testid="button-transmit-email">거래처 이메일 전송</Button>
            <Button onClick={onNtsTransmit} disabled={busy} data-testid="button-nts-transmit">국세청 전송</Button>
          </>
        )}
      </div>
    </div>
  );
}
