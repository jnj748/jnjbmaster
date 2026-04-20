import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Building2,
  User,
  Briefcase,
  Car,
  FileText,
  Shield,
  PenTool,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { Field } from "@/components/tenant-card-form/field";
import { ConsentItem } from "@/components/tenant-card-form/consent-item";
import { DocUpload } from "@/components/tenant-card-form/doc-upload";

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

interface VehicleEntry {
  vehicleNumber: string;
  vehicleType: string;
  vehicleColor: string;
  tenantRelation: string;
  ownerContact: string;
  isPrimary: boolean;
}

interface FormData {
  tenantName: string;
  residentId: string;
  phone: string;
  emergencyContact: string;
  email: string;
  interiorStartDate: string;
  moveInDate: string;
  hasTv: boolean;
  registeredAddress: string;
  isBusiness: boolean;
  companyName: string;
  businessNumber: string;
  guarantorName: string;
  guarantorPhone: string;
  guarantorRelation: string;
  guarantorResidentId: string;
  vehicles: VehicleEntry[];
  contractDocUrl: string | null;
  businessRegDocUrl: string | null;
  idDocUrl: string | null;
  vehicleRegDocUrl: string | null;
  feeObligationConsent: boolean;
  penaltyConsent: boolean;
  specialFundConsent: boolean;
  privacyRetentionConsent: boolean;
  guaranteeConsent: boolean;
  signatureName: string;
}

interface CardData {
  buildingName: string;
  unitLabel: string;
  tokenStatus: string;
  specialFundEnabled: boolean;
  contractTemplate?: {
    feeObligationClause: string;
    penaltyClause: string;
    specialFundClause: string;
    privacyRetentionClause: string;
  };
}

const emptyVehicle: VehicleEntry = {
  vehicleNumber: "",
  vehicleType: "",
  vehicleColor: "",
  tenantRelation: "",
  ownerContact: "",
  isPrimary: false,
};

export default function TenantCardForm() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    tenantName: "",
    residentId: "",
    phone: "",
    emergencyContact: "",
    email: "",
    interiorStartDate: "",
    moveInDate: "",
    hasTv: false,
    registeredAddress: "",
    isBusiness: false,
    companyName: "",
    businessNumber: "",
    guarantorName: "",
    guarantorPhone: "",
    guarantorRelation: "",
    guarantorResidentId: "",
    vehicles: [],
    contractDocUrl: null,
    businessRegDocUrl: null,
    idDocUrl: null,
    vehicleRegDocUrl: null,
    feeObligationConsent: false,
    penaltyConsent: false,
    specialFundConsent: false,
    privacyRetentionConsent: false,
    guaranteeConsent: false,
    signatureName: "",
  });

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/public/tenant-card/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || "링크가 유효하지 않습니다.");
        }
        return r.json();
      })
      .then((data) => {
        setCardData(data);
        if (data.tokenStatus === "submitted" || data.tokenStatus === "approved") {
          setSubmitted(true);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function uploadDocument(field: string, file: File) {
    setUploadingField(field);
    try {
      const urlRes = await fetch(`${apiBase}/public/tenant-card/${token}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("업로드 URL 생성 실패");
      const { uploadURL, objectPath } = await urlRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const servingUrl = `${apiBase}/storage/public-objects${objectPath.replace("/objects/", "/")}`;
      setForm((prev) => ({ ...prev, [field]: servingUrl }));
      toast({ title: "파일이 업로드되었습니다" });
    } catch {
      toast({ title: "업로드 실패", description: "다시 시도해 주세요.", variant: "destructive" });
    } finally {
      setUploadingField(null);
    }
  }

  function addVehicle() {
    setForm((prev) => ({
      ...prev,
      vehicles: [...prev.vehicles, { ...emptyVehicle, isPrimary: prev.vehicles.length === 0 }],
    }));
  }

  function removeVehicle(index: number) {
    setForm((prev) => ({
      ...prev,
      vehicles: prev.vehicles.filter((_, i) => i !== index),
    }));
  }

  function updateVehicle(index: number, updates: Partial<VehicleEntry>) {
    setForm((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v, i) => (i === index ? { ...v, ...updates } : v)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.feeObligationConsent || !form.penaltyConsent || !form.privacyRetentionConsent) {
      toast({ title: "필수 동의 항목을 확인해 주세요", variant: "destructive" });
      return;
    }

    if (!form.signatureName.trim()) {
      toast({ title: "전자서명(성명)을 입력해 주세요", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        tenantName: form.tenantName,
        residentId: form.residentId,
        phone: form.phone,
        emergencyContact: form.emergencyContact || null,
        email: form.email || null,
        interiorStartDate: form.interiorStartDate || null,
        moveInDate: form.moveInDate || null,
        hasTv: form.hasTv,
        registeredAddress: form.registeredAddress || null,
        companyName: form.isBusiness ? form.companyName || null : null,
        businessNumber: form.isBusiness ? form.businessNumber || null : null,
        guarantorName: form.isBusiness ? form.guarantorName || null : null,
        guarantorPhone: form.isBusiness ? form.guarantorPhone || null : null,
        guarantorRelation: form.isBusiness ? form.guarantorRelation || null : null,
        guarantorResidentId: form.isBusiness ? form.guarantorResidentId || null : null,
        contractDocUrl: form.contractDocUrl,
        businessRegDocUrl: form.businessRegDocUrl,
        idDocUrl: form.idDocUrl,
        vehicleRegDocUrl: form.vehicleRegDocUrl,
        feeObligationConsent: form.feeObligationConsent,
        penaltyConsent: form.penaltyConsent,
        specialFundConsent: form.specialFundConsent,
        privacyRetentionConsent: form.privacyRetentionConsent,
        guaranteeConsent: form.isBusiness ? form.guaranteeConsent : false,
        signatureName: form.signatureName,
        vehicles: form.vehicles.length > 0 ? form.vehicles : undefined,
      };

      const res = await fetch(`${apiBase}/public/tenant-card/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "제출에 실패했습니다.");
      }

      setSubmitted(true);
      toast({ title: "입주자카드가 정상적으로 제출되었습니다" });
    } catch (e) {
      toast({
        title: "제출 실패",
        description: e instanceof Error ? e.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500">로딩 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-orange-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">접속 오류</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">제출 완료</h2>
            <p className="text-muted-foreground">
              입주자카드가 정상적으로 제출되었습니다.
              <br />
              관리사무소에서 서류 확인 후 승인 처리됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const template = cardData?.contractTemplate;

  return (
    <div className="min-h-screen bg-slate-50 pb-[max(env(safe-area-inset-bottom),8rem)]">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <Building2 className="w-10 h-10 mx-auto text-primary mb-2" />
          <h1 className="text-xl font-bold">{cardData?.buildingName}</h1>
          <p className="text-muted-foreground text-sm">{cardData?.unitLabel}호 입주자카드</p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-6">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              입주자카드 미작성 시 전입·주차 등 건물 서비스 이용이 제한될 수 있습니다.
              정확한 정보를 입력해 주세요.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section icon={<User className="w-4 h-4" />} title="개인정보">
            <div className="space-y-3">
              <Field label="성명 *" required>
                <Input
                  value={form.tenantName}
                  onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                  required
                />
              </Field>
              <Field label="주민등록번호 *" required>
                <Input
                  value={form.residentId}
                  onChange={(e) => setForm({ ...form, residentId: e.target.value })}
                  placeholder="000000-0000000"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  뒷자리 포함 전체를 입력해 주세요
                </p>
              </Field>
              <Field label="휴대폰 *" required>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  required
                />
              </Field>
              <Field label="비상연락처">
                <Input
                  type="tel"
                  inputMode="tel"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                />
              </Field>
              <Field label="이메일">
                <Input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="인테리어 개시일">
                  <Input
                    type="date"
                    value={form.interiorStartDate}
                    onChange={(e) => setForm({ ...form, interiorStartDate: e.target.value })}
                  />
                </Field>
                <Field label="입주일">
                  <Input
                    type="date"
                    value={form.moveInDate}
                    onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="주민등록주소">
                <Input
                  value={form.registeredAddress}
                  onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
                />
              </Field>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.hasTv}
                  onCheckedChange={(v) => setForm({ ...form, hasTv: !!v })}
                />
                <Label className="text-sm">TV 보유</Label>
              </div>
            </div>
          </Section>

          <Section icon={<Briefcase className="w-4 h-4" />} title="사업자 정보">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.isBusiness}
                  onCheckedChange={(v) => setForm({ ...form, isBusiness: !!v })}
                />
                <Label className="text-sm">사업자 (법인) 입주자입니다</Label>
              </div>
              {form.isBusiness && (
                <>
                  <Field label="상호명(법인명)">
                    <Input
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    />
                  </Field>
                  <Field label="사업자등록번호">
                    <Input
                      value={form.businessNumber}
                      onChange={(e) => setForm({ ...form, businessNumber: e.target.value })}
                    />
                  </Field>
                  <div className="border-t pt-3 mt-3">
                    <p className="text-sm font-medium mb-2">법인 대표자(연대보증인) 정보</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      법인 임차인의 경우, 대표자께서 연대보증인으로서 아래 정보를 기재해 주시기 바랍니다.
                    </p>
                    <div className="space-y-3">
                      <Field label="대표자 성명">
                        <Input
                          value={form.guarantorName}
                          onChange={(e) => setForm({ ...form, guarantorName: e.target.value })}
                        />
                      </Field>
                      <Field label="대표자 주민등록번호">
                        <Input
                          value={form.guarantorResidentId}
                          onChange={(e) => setForm({ ...form, guarantorResidentId: e.target.value })}
                          placeholder="000000-0000000"
                        />
                      </Field>
                      <Field label="대표자 연락처">
                        <Input
                          type="tel"
                          inputMode="tel"
                          value={form.guarantorPhone}
                          onChange={(e) => setForm({ ...form, guarantorPhone: e.target.value })}
                        />
                      </Field>
                      <Field label="관계">
                        <Input
                          value={form.guarantorRelation}
                          onChange={(e) => setForm({ ...form, guarantorRelation: e.target.value })}
                          placeholder="대표이사"
                        />
                      </Field>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section icon={<Car className="w-4 h-4" />} title="차량등록">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                차량이 있으시면 등록해 주세요. 미등록 차량은 주차 서비스 이용이 제한될 수 있습니다.
              </p>
              {form.vehicles.map((v, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
                  <div className="flex justify-between items-center mb-1">
                    <Badge variant={v.isPrimary ? "default" : "outline"} className="text-xs">
                      {v.isPrimary ? "기본차량" : "추가차량"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 w-11 p-0"
                      onClick={() => removeVehicle(idx)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <Field label="차량번호 *" required>
                    <Input
                      value={v.vehicleNumber}
                      onChange={(e) => updateVehicle(idx, { vehicleNumber: e.target.value })}
                      placeholder="12가 3456"
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="차종">
                      <Input
                        value={v.vehicleType}
                        onChange={(e) => updateVehicle(idx, { vehicleType: e.target.value })}
                        placeholder="소나타"
                      />
                    </Field>
                    <Field label="색상">
                      <Input
                        value={v.vehicleColor}
                        onChange={(e) => updateVehicle(idx, { vehicleColor: e.target.value })}
                        placeholder="흰색"
                      />
                    </Field>
                  </div>
                  <Field label="입주자와의 관계 *" required>
                    <Input
                      value={v.tenantRelation}
                      onChange={(e) => updateVehicle(idx, { tenantRelation: e.target.value })}
                      placeholder="본인, 배우자, 자녀 등"
                      required
                    />
                  </Field>
                  <Field label="운전자 연락처 *" required>
                    <Input
                      type="tel"
                      inputMode="tel"
                      value={v.ownerContact}
                      onChange={(e) => updateVehicle(idx, { ownerContact: e.target.value })}
                      placeholder="010-0000-0000"
                      required
                    />
                  </Field>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addVehicle}
              >
                <Plus className="w-4 h-4 mr-1" />
                차량 추가
              </Button>
            </div>
          </Section>

          <Section icon={<FileText className="w-4 h-4" />} title="서류첨부">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                제출 서류를 촬영하거나 파일로 첨부해 주세요.
              </p>
              <DocUpload
                label="임대차계약서 (또는 매매계약서)"
                value={form.contractDocUrl}
                uploading={uploadingField === "contractDocUrl"}
                onUpload={(file) => uploadDocument("contractDocUrl", file)}
                onRemove={() => setForm({ ...form, contractDocUrl: null })}
              />
              <DocUpload
                label="신분증 사본"
                value={form.idDocUrl}
                uploading={uploadingField === "idDocUrl"}
                onUpload={(file) => uploadDocument("idDocUrl", file)}
                onRemove={() => setForm({ ...form, idDocUrl: null })}
              />
              {form.isBusiness && (
                <DocUpload
                  label="사업자등록증"
                  value={form.businessRegDocUrl}
                  uploading={uploadingField === "businessRegDocUrl"}
                  onUpload={(file) => uploadDocument("businessRegDocUrl", file)}
                  onRemove={() => setForm({ ...form, businessRegDocUrl: null })}
                />
              )}
              {form.vehicles.length > 0 && (
                <DocUpload
                  label="자동차등록증"
                  value={form.vehicleRegDocUrl}
                  uploading={uploadingField === "vehicleRegDocUrl"}
                  onUpload={(file) => uploadDocument("vehicleRegDocUrl", file)}
                  onRemove={() => setForm({ ...form, vehicleRegDocUrl: null })}
                />
              )}
            </div>
          </Section>

          <Section icon={<Shield className="w-4 h-4" />} title="관리계약 동의">
            <div className="space-y-4">
              <ConsentItem
                title="1. 관리비 납부 의무"
                text={template?.feeObligationClause || ""}
                checked={form.feeObligationConsent}
                onCheck={(v) => setForm({ ...form, feeObligationConsent: v })}
                required
              />
              <ConsentItem
                title="2. 체납 시 조치 동의"
                text={template?.penaltyClause || ""}
                checked={form.penaltyConsent}
                onCheck={(v) => setForm({ ...form, penaltyConsent: v })}
                required
              />
              {cardData?.specialFundEnabled && (
                <ConsentItem
                  title="3. 특별충당금 동의"
                  text={template?.specialFundClause || ""}
                  checked={form.specialFundConsent}
                  onCheck={(v) => setForm({ ...form, specialFundConsent: v })}
                />
              )}
              <ConsentItem
                title={cardData?.specialFundEnabled ? "4. 개인정보 수집·보관 동의" : "3. 개인정보 수집·보관 동의"}
                text={template?.privacyRetentionClause || ""}
                checked={form.privacyRetentionConsent}
                onCheck={(v) => setForm({ ...form, privacyRetentionConsent: v })}
                required
              />
              {form.isBusiness && (
                <ConsentItem
                  title="연대보증 동의"
                  text="본인은 상기 법인의 대표자로서, 해당 법인이 관리비 및 제반 비용을 납부하지 않을 경우 연대하여 이를 부담할 것을 확인하고 동의합니다."
                  checked={form.guaranteeConsent}
                  onCheck={(v) => setForm({ ...form, guaranteeConsent: v })}
                />
              )}
            </div>
          </Section>

          <Section icon={<PenTool className="w-4 h-4" />} title="전자서명">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                위 내용을 확인하였으며 사실과 다름없음을 확인합니다.
                성명을 입력하여 전자서명을 완료해 주세요.
              </p>
              <Field label="성명 (전자서명) *" required>
                <Input
                  value={form.signatureName}
                  onChange={(e) => setForm({ ...form, signatureName: e.target.value })}
                  placeholder="홍길동"
                  className="text-center text-lg font-semibold"
                  required
                />
              </Field>
              <p className="text-[11px] text-muted-foreground text-center">
                {new Date().toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </Section>

          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <PenTool className="w-5 h-5 mr-2" />
            )}
            {submitting ? "제출 중..." : "입주자카드 제출"}
          </Button>
        </form>
      </div>
    </div>
  );
}
