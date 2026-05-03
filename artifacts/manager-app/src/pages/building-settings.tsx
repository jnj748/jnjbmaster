// [Task #796] XpBIZ 환경설정 풀세트 — 5종(검침환경/검침사용현황/고지서출력/관리비부과/연말정산) +
// 호실별 2종(호실선수관리비/출입카드). 한 페이지 컴포넌트가 wouter location 으로 분기한다.
// 사장님 컨셉: AI 자동화 빼고 마우스/탭 위주, 직접 입력 폼.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMeteringEnvironment,
  useUpsertMeteringEnvironment,
  useGetMeteringUsageSettings,
  useUpsertMeteringUsageSettings,
  useGetNoticeOutputSettings,
  useUpsertNoticeOutputSettings,
  useGetBillingEnvironmentSettings,
  useUpsertBillingEnvironmentSettings,
  useGetYearEndTaxInfo,
  useUpsertYearEndTaxInfo,
  useListPrepaidDeposits,
  useUpsertPrepaidDeposit,
  useListAccessCards,
  useCreateAccessCard,
  useUpdateAccessCard,
  useDeleteAccessCard,
  useListUnits,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2 } from "lucide-react";

export default function BuildingSettingsPage() {
  const [location] = useLocation();
  if (location.startsWith("/settings/metering-environment")) return <MeteringEnvironmentPanel />;
  if (location.startsWith("/settings/metering-usage")) return <MeteringUsagePanel />;
  if (location.startsWith("/settings/notice-output")) return <NoticeOutputPanel />;
  if (location.startsWith("/settings/billing-environment")) return <BillingEnvPanel />;
  if (location.startsWith("/settings/year-end-tax")) return <YearEndTaxPanel />;
  if (location.startsWith("/accountant/prepaid-deposits")) return <PrepaidDepositsPanel />;
  if (location.startsWith("/settings/access-cards")) return <AccessCardsPanel />;
  return <div className="p-6 text-muted-foreground">설정 페이지를 찾을 수 없어요.</div>;
}

// ── 검침환경 ────────────────────────────────────────────────────
function MeteringEnvironmentPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetMeteringEnvironment();
  const mut = useUpsertMeteringEnvironment();
  const [notes, setNotes] = useState("");
  const [configText, setConfigText] = useState("{}");
  const [kepcoText, setKepcoText] = useState("[]");

  useEffect(() => {
    if (!data) return;
    setNotes(data.notes ?? "");
    setConfigText(JSON.stringify(data.config ?? {}, null, 2));
    setKepcoText(JSON.stringify(data.kepcoTerms ?? [], null, 2));
  }, [data]);

  const onSave = async () => {
    let config: Record<string, unknown> = {};
    let kepcoTerms: unknown[] = [];
    try { config = JSON.parse(configText); } catch { toast({ title: "검침환경 JSON 형식 오류", variant: "destructive" }); return; }
    try { kepcoTerms = JSON.parse(kepcoText); } catch { toast({ title: "한전 단가 JSON 형식 오류", variant: "destructive" }); return; }
    await mut.mutateAsync({ data: { config: config as never, kepcoTerms: kepcoTerms as never, notes: notes || null } });
    toast({ title: "검침환경 저장 완료" });
    refetch();
  };

  return (
    <PanelShell title="검침환경" loading={isLoading} onSave={onSave} saving={mut.isPending}>
      <div>
        <Label>검침 항목·산식 설정 (JSON)</Label>
        <Textarea value={configText} onChange={(e) => setConfigText(e.target.value)} rows={10} className="font-mono text-xs" data-testid="textarea-metering-config" />
        <p className="text-xs text-muted-foreground mt-1">예: 전기/수도/온수/난방/가스 항목별 단위·계산식.</p>
      </div>
      <div>
        <Label>한전 단가 약관표 (JSON 배열)</Label>
        <Textarea value={kepcoText} onChange={(e) => setKepcoText(e.target.value)} rows={6} className="font-mono text-xs" data-testid="textarea-kepco-terms" />
      </div>
      <NotesField value={notes} onChange={setNotes} />
    </PanelShell>
  );
}

// ── 검침사용현황 설정 ───────────────────────────────────────────
function MeteringUsagePanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetMeteringUsageSettings();
  const mut = useUpsertMeteringUsageSettings();
  const [notes, setNotes] = useState("");
  const [configText, setConfigText] = useState("{}");

  useEffect(() => {
    if (!data) return;
    setNotes(data.notes ?? "");
    setConfigText(JSON.stringify(data.config ?? {}, null, 2));
  }, [data]);

  const onSave = async () => {
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(configText); } catch { toast({ title: "JSON 형식 오류", variant: "destructive" }); return; }
    await mut.mutateAsync({ data: { config: config as never, notes: notes || null } });
    toast({ title: "검침사용현황설정 저장 완료" });
    refetch();
  };

  return (
    <PanelShell title="검침 사용현황 설정" loading={isLoading} onSave={onSave} saving={mut.isPending}>
      <div>
        <Label>사용현황 표시·집계 설정 (JSON)</Label>
        <Textarea value={configText} onChange={(e) => setConfigText(e.target.value)} rows={10} className="font-mono text-xs" data-testid="textarea-metering-usage-config" />
      </div>
      <NotesField value={notes} onChange={setNotes} />
    </PanelShell>
  );
}

// ── 고지서 출력환경 ─────────────────────────────────────────────
function NoticeOutputPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetNoticeOutputSettings();
  const mut = useUpsertNoticeOutputSettings();
  const [showAlias, setShowAlias] = useState(false);
  const [aliasName, setAliasName] = useState("");
  const [deliveryPostal, setDeliveryPostal] = useState(true);
  const [deliveryDirect, setDeliveryDirect] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState(false);
  const [registeredNo, setRegisteredNo] = useState("");
  const [autoTransferOrg, setAutoTransferOrg] = useState("");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!data) return;
    setShowAlias(!!data.showAlias);
    setAliasName(data.aliasName ?? "");
    setDeliveryPostal(!!data.deliveryPostal);
    setDeliveryDirect(!!data.deliveryDirect);
    setDeliveryEmail(!!data.deliveryEmail);
    setRegisteredNo(data.registeredNo ?? "");
    setAutoTransferOrg(data.autoTransferOrg ?? "");
    setVatIncluded(!!data.vatIncluded);
    setNotes(data.notes ?? "");
  }, [data]);

  const onSave = async () => {
    await mut.mutateAsync({ data: {
      showAlias, aliasName: aliasName || null,
      deliveryPostal, deliveryDirect, deliveryEmail,
      registeredNo: registeredNo || null,
      autoTransferOrg: autoTransferOrg || null,
      vatIncluded,
      positions: (data?.positions as never) ?? ({} as never),
      notes: notes || null,
    } });
    toast({ title: "고지서출력환경 저장 완료" });
    refetch();
  };

  return (
    <PanelShell title="고지서 출력환경" loading={isLoading} onSave={onSave} saving={mut.isPending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleRow label="명칭 별칭 표시" checked={showAlias} onChange={setShowAlias} />
        <div>
          <Label>별칭(노출명)</Label>
          <Input value={aliasName} onChange={(e) => setAliasName(e.target.value)} disabled={!showAlias} data-testid="input-alias-name" />
        </div>
        <ToggleRow label="우편 발송" checked={deliveryPostal} onChange={setDeliveryPostal} />
        <ToggleRow label="직접 전달" checked={deliveryDirect} onChange={setDeliveryDirect} />
        <ToggleRow label="이메일 발송" checked={deliveryEmail} onChange={setDeliveryEmail} />
        <div>
          <Label>등기/배송 번호 양식</Label>
          <Input value={registeredNo} onChange={(e) => setRegisteredNo(e.target.value)} data-testid="input-registered-no" />
        </div>
        <div>
          <Label>자동이체 기관명</Label>
          <Input value={autoTransferOrg} onChange={(e) => setAutoTransferOrg(e.target.value)} data-testid="input-auto-transfer-org" />
        </div>
        <ToggleRow label="부가세 포함 표시" checked={vatIncluded} onChange={setVatIncluded} />
      </div>
      <NotesField value={notes} onChange={setNotes} />
    </PanelShell>
  );
}

// ── 관리비 부과환경 ─────────────────────────────────────────────
function BillingEnvPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetBillingEnvironmentSettings();
  const mut = useUpsertBillingEnvironmentSettings();
  const [vatThresholdM2, setVatThresholdM2] = useState("135");
  const [categoryText, setCategoryText] = useState("{}");
  const [escoText, setEscoText] = useState("{}");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!data) return;
    setVatThresholdM2(data.vatThresholdM2 ?? "135");
    setCategoryText(JSON.stringify(data.categoryConfig ?? {}, null, 2));
    setEscoText(JSON.stringify(data.escoConfig ?? {}, null, 2));
    setNotes(data.notes ?? "");
  }, [data]);

  const onSave = async () => {
    let categoryConfig: Record<string, unknown> = {};
    let escoConfig: Record<string, unknown> = {};
    try { categoryConfig = JSON.parse(categoryText); } catch { toast({ title: "항목설정 JSON 오류", variant: "destructive" }); return; }
    try { escoConfig = JSON.parse(escoText); } catch { toast({ title: "ESCO JSON 오류", variant: "destructive" }); return; }
    await mut.mutateAsync({ data: {
      categoryConfig: categoryConfig as never,
      vatThresholdM2: vatThresholdM2 || null,
      escoConfig: escoConfig as never,
      notes: notes || null,
    } });
    toast({ title: "관리비부과환경 저장 완료" });
    refetch();
  };

  return (
    <PanelShell title="관리비 부과환경" loading={isLoading} onSave={onSave} saving={mut.isPending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>부가세 면제 전용면적 기준 (m²)</Label>
          <Input value={vatThresholdM2} onChange={(e) => setVatThresholdM2(e.target.value)} data-testid="input-vat-threshold" />
          <p className="text-xs text-muted-foreground mt-1">국민주택 기준(주거용 85m², 비주거 한도 등) 단지 정책에 맞게 입력.</p>
        </div>
      </div>
      <div>
        <Label>관리비 항목/연체율/공동분담 설정 (JSON)</Label>
        <Textarea value={categoryText} onChange={(e) => setCategoryText(e.target.value)} rows={10} className="font-mono text-xs" data-testid="textarea-billing-category" />
      </div>
      <div>
        <Label>ESCO·시설사용료 등 별도 설정 (JSON)</Label>
        <Textarea value={escoText} onChange={(e) => setEscoText(e.target.value)} rows={6} className="font-mono text-xs" data-testid="textarea-billing-esco" />
      </div>
      <NotesField value={notes} onChange={setNotes} />
    </PanelShell>
  );
}

// ── 연말정산 기본정보 ───────────────────────────────────────────
function YearEndTaxPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetYearEndTaxInfo();
  const mut = useUpsertYearEndTaxInfo();
  const [form, setForm] = useState({
    settlementYear: "",
    businessNumber: "",
    companyName: "",
    representative: "",
    businessAddress: "",
    industryType: "",
    businessItem: "",
    contactPerson: "",
    taxOfficeCode: "",
    deductionMethod: "",
    quarterlyPay: false,
    notes: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      settlementYear: data.settlementYear ? String(data.settlementYear) : "",
      businessNumber: data.businessNumber ?? "",
      companyName: data.companyName ?? "",
      representative: data.representative ?? "",
      businessAddress: data.businessAddress ?? "",
      industryType: data.industryType ?? "",
      businessItem: data.businessItem ?? "",
      contactPerson: data.contactPerson ?? "",
      taxOfficeCode: data.taxOfficeCode ?? "",
      deductionMethod: data.deductionMethod ?? "",
      quarterlyPay: !!data.quarterlyPay,
      notes: data.notes ?? "",
    });
  }, [data]);

  const setF = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    const yr = form.settlementYear ? Number(form.settlementYear) : null;
    await mut.mutateAsync({ data: {
      settlementYear: yr,
      businessNumber: form.businessNumber || null,
      companyName: form.companyName || null,
      representative: form.representative || null,
      businessAddress: form.businessAddress || null,
      industryType: form.industryType || null,
      businessItem: form.businessItem || null,
      contactPerson: form.contactPerson || null,
      taxOfficeCode: form.taxOfficeCode || null,
      deductionMethod: form.deductionMethod || null,
      quarterlyPay: form.quarterlyPay,
      invoiceStatus: (data?.invoiceStatus as never) ?? ([] as never),
      notes: form.notes || null,
    } });
    toast({ title: "연말정산기본정보 저장 완료" });
    refetch();
  };

  return (
    <PanelShell title="연말정산 기본정보" loading={isLoading} onSave={onSave} saving={mut.isPending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="정산 연도"><Input value={form.settlementYear} onChange={(e) => setF("settlementYear")(e.target.value)} placeholder="예: 2025" data-testid="input-settlement-year" /></Field>
        <Field label="사업자등록번호"><Input value={form.businessNumber} onChange={(e) => setF("businessNumber")(e.target.value)} data-testid="input-bizno" /></Field>
        <Field label="상호"><Input value={form.companyName} onChange={(e) => setF("companyName")(e.target.value)} data-testid="input-company-name" /></Field>
        <Field label="대표자"><Input value={form.representative} onChange={(e) => setF("representative")(e.target.value)} data-testid="input-representative" /></Field>
        <Field label="사업장 주소" full><Input value={form.businessAddress} onChange={(e) => setF("businessAddress")(e.target.value)} data-testid="input-biz-address" /></Field>
        <Field label="업태"><Input value={form.industryType} onChange={(e) => setF("industryType")(e.target.value)} data-testid="input-industry" /></Field>
        <Field label="종목"><Input value={form.businessItem} onChange={(e) => setF("businessItem")(e.target.value)} data-testid="input-biz-item" /></Field>
        <Field label="담당자"><Input value={form.contactPerson} onChange={(e) => setF("contactPerson")(e.target.value)} data-testid="input-contact" /></Field>
        <Field label="관할세무서 코드"><Input value={form.taxOfficeCode} onChange={(e) => setF("taxOfficeCode")(e.target.value)} data-testid="input-tax-office" /></Field>
        <Field label="공제 방법">
          <Select value={form.deductionMethod || "none"} onValueChange={(v) => setF("deductionMethod")(v === "none" ? "" : v)}>
            <SelectTrigger data-testid="select-deduction-method"><SelectValue placeholder="선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안함</SelectItem>
              <SelectItem value="standard">표준공제</SelectItem>
              <SelectItem value="itemized">항목별공제</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <ToggleRow label="분기 납부" checked={form.quarterlyPay} onChange={(v) => setF("quarterlyPay")(v)} />
      </div>
      <NotesField value={form.notes} onChange={(v) => setF("notes")(v)} />
    </PanelShell>
  );
}

// ── 호실 선수관리비 ─────────────────────────────────────────────
function PrepaidDepositsPanel() {
  const { toast } = useToast();
  const { data: deposits, isLoading, refetch } = useListPrepaidDeposits();
  const { data: units } = useListUnits();
  const mut = useUpsertPrepaidDeposit();
  const [editing, setEditing] = useState<{ unitId: number; prepaidAmount: string; receivedAmount: string; unpaidAmount: string; notes: string } | null>(null);

  const findUnit = (id: number) => (units ?? []).find((u) => u.id === id);

  const onSave = async () => {
    if (!editing) return;
    await mut.mutateAsync({ data: {
      unitId: editing.unitId,
      prepaidAmount: Number(editing.prepaidAmount) || 0,
      receivedAmount: Number(editing.receivedAmount) || 0,
      unpaidAmount: Number(editing.unpaidAmount) || 0,
      notes: editing.notes || null,
    } });
    toast({ title: "선수관리비 저장 완료" });
    setEditing(null);
    refetch();
  };

  return (
    <Card>
      <CardHeader><CardTitle>호실 선수관리비</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loading /> : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>호실</TableHead>
                  <TableHead className="text-right">선수액</TableHead>
                  <TableHead className="text-right">수령액</TableHead>
                  <TableHead className="text-right">미수액</TableHead>
                  <TableHead>비고</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deposits ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">등록된 선수관리비가 없습니다.</TableCell></TableRow>
                )}
                {(deposits ?? []).map((d) => {
                  const u = findUnit(d.unitId);
                  return (
                    <TableRow key={d.id} data-testid={`row-prepaid-${d.id}`}>
                      <TableCell className="font-mono text-xs">{u ? `${u.dong ?? ""} ${u.unitNumber}` : `#${d.unitId}`}</TableCell>
                      <TableCell className="text-right">{d.prepaidAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{d.receivedAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{d.unpaidAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[240px]">{d.notes ?? "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setEditing({
                          unitId: d.unitId,
                          prepaidAmount: String(d.prepaidAmount),
                          receivedAmount: String(d.receivedAmount),
                          unpaidAmount: String(d.unpaidAmount),
                          notes: d.notes ?? "",
                        })} data-testid={`button-edit-prepaid-${d.id}`}>수정</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="border rounded-md p-4 space-y-3">
          <div className="font-medium text-sm">{editing ? "선수관리비 수정/등록" : "신규 등록"}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="호실 선택">
              <Select value={editing?.unitId ? String(editing.unitId) : ""} onValueChange={(v) => {
                const id = Number(v);
                setEditing((e) => ({
                  unitId: id,
                  prepaidAmount: e?.prepaidAmount ?? "0",
                  receivedAmount: e?.receivedAmount ?? "0",
                  unpaidAmount: e?.unpaidAmount ?? "0",
                  notes: e?.notes ?? "",
                }));
              }}>
                <SelectTrigger data-testid="select-prepaid-unit"><SelectValue placeholder="호실을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {(units ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.dong ?? ""} {u.unitNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="선수액"><Input type="number" value={editing?.prepaidAmount ?? ""} onChange={(e) => editing && setEditing({ ...editing, prepaidAmount: e.target.value })} data-testid="input-prepaid-amount" /></Field>
            <Field label="수령액"><Input type="number" value={editing?.receivedAmount ?? ""} onChange={(e) => editing && setEditing({ ...editing, receivedAmount: e.target.value })} data-testid="input-received-amount" /></Field>
            <Field label="미수액"><Input type="number" value={editing?.unpaidAmount ?? ""} onChange={(e) => editing && setEditing({ ...editing, unpaidAmount: e.target.value })} data-testid="input-unpaid-amount" /></Field>
            <Field label="비고" full><Input value={editing?.notes ?? ""} onChange={(e) => editing && setEditing({ ...editing, notes: e.target.value })} data-testid="input-prepaid-notes" /></Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={onSave} disabled={!editing?.unitId || mut.isPending} data-testid="button-save-prepaid">
              {mut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}저장
            </Button>
            {editing && <Button variant="outline" onClick={() => setEditing(null)}>취소</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 출입카드 ────────────────────────────────────────────────────
function AccessCardsPanel() {
  const { toast } = useToast();
  const { data: cards, isLoading, refetch } = useListAccessCards();
  const { data: units } = useListUnits();
  const create = useCreateAccessCard();
  const update = useUpdateAccessCard();
  const del = useDeleteAccessCard();
  const [form, setForm] = useState({ serialNo: "", unitId: "", depositAmount: "0", issueFee: "0", recipientName: "", recipientPhone: "", bankName: "", notes: "" });

  const onCreate = async () => {
    if (!form.serialNo) { toast({ title: "카드 번호를 입력하세요", variant: "destructive" }); return; }
    await create.mutateAsync({ data: {
      serialNo: form.serialNo,
      unitId: form.unitId ? Number(form.unitId) : null,
      depositAmount: Number(form.depositAmount) || 0,
      issueFee: Number(form.issueFee) || 0,
      recipientName: form.recipientName || null,
      recipientPhone: form.recipientPhone || null,
      bankName: form.bankName || null,
      notes: form.notes || null,
    } });
    toast({ title: "출입카드 등록 완료" });
    setForm({ serialNo: "", unitId: "", depositAmount: "0", issueFee: "0", recipientName: "", recipientPhone: "", bankName: "", notes: "" });
    refetch();
  };

  const onToggleRegistered = async (id: number, next: boolean) => {
    await update.mutateAsync({ id, data: { cardRegistered: next } });
    refetch();
  };
  const onDelete = async (id: number) => {
    if (!confirm("이 출입카드를 삭제할까요?")) return;
    await del.mutateAsync({ id });
    refetch();
  };

  const findUnit = (id: number | null | undefined) => (units ?? []).find((u) => u.id === id);

  return (
    <Card>
      <CardHeader><CardTitle>출입카드 관리</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md p-4 grid gap-3 sm:grid-cols-2">
          <Field label="카드 번호"><Input value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} data-testid="input-card-serial" /></Field>
          <Field label="호실 (선택)">
            <Select value={form.unitId || "none"} onValueChange={(v) => setForm({ ...form, unitId: v === "none" ? "" : v })}>
              <SelectTrigger data-testid="select-card-unit"><SelectValue placeholder="(미지정)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">(미지정)</SelectItem>
                {(units ?? []).map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.dong ?? ""} {u.unitNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="보증금"><Input type="number" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} data-testid="input-card-deposit" /></Field>
          <Field label="발급수수료"><Input type="number" value={form.issueFee} onChange={(e) => setForm({ ...form, issueFee: e.target.value })} data-testid="input-card-fee" /></Field>
          <Field label="수령인"><Input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} data-testid="input-card-recipient" /></Field>
          <Field label="연락처"><Input value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} data-testid="input-card-phone" /></Field>
          <Field label="환불 입금 은행/계좌"><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} data-testid="input-card-bank" /></Field>
          <Field label="비고" full><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-card-notes" /></Field>
          <div className="sm:col-span-2">
            <Button onClick={onCreate} disabled={create.isPending} data-testid="button-create-card">
              {create.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}카드 등록
            </Button>
          </div>
        </div>

        {isLoading ? <Loading /> : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>카드 번호</TableHead>
                  <TableHead>호실</TableHead>
                  <TableHead className="text-right">보증금</TableHead>
                  <TableHead className="text-right">수수료</TableHead>
                  <TableHead>수령인</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead className="w-[100px]">사용중</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cards ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">등록된 출입카드가 없습니다.</TableCell></TableRow>
                )}
                {(cards ?? []).map((c) => {
                  const u = findUnit(c.unitId);
                  return (
                    <TableRow key={c.id} data-testid={`row-card-${c.id}`}>
                      <TableCell className="font-mono">{c.serialNo}</TableCell>
                      <TableCell className="text-xs">{u ? `${u.dong ?? ""} ${u.unitNumber}` : "—"}</TableCell>
                      <TableCell className="text-right">{c.depositAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{c.issueFee.toLocaleString()}</TableCell>
                      <TableCell>{c.recipientName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.recipientPhone ?? "—"}</TableCell>
                      <TableCell>
                        <Switch checked={c.cardRegistered} onCheckedChange={(v) => onToggleRegistered(c.id, v)} data-testid={`switch-card-active-${c.id}`} />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)} data-testid={`button-delete-card-${c.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 공통 ────────────────────────────────────────────────────────
function PanelShell({ title, loading, children, onSave, saving }: { title: string; loading: boolean; children: React.ReactNode; onSave: () => void; saving: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Loading /> : <>{children}</>}
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={loading || saving} data-testid="button-save-settings">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Loading() {
  return <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 mr-2 animate-spin" />불러오는 중...</div>;
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>비고</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} data-testid="textarea-settings-notes" />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border rounded-md p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={`switch-${label}`} />
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
