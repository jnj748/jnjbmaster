import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Building2,
  PenTool,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

import type { FormData, VehicleEntry, CardData, DocField } from "@/components/tenant-card-form/types";
import { PersonalInfoSection } from "@/components/tenant-card-form/sections/personal-info-section";
import { BusinessInfoSection } from "@/components/tenant-card-form/sections/business-info-section";
import { VehicleSection } from "@/components/tenant-card-form/sections/vehicle-section";
import { DocumentSection } from "@/components/tenant-card-form/sections/document-section";
import { ConsentSection } from "@/components/tenant-card-form/sections/consent-section";
import { SignatureSection } from "@/components/tenant-card-form/sections/signature-section";

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
  const [uploadingField, setUploadingField] = useState<DocField | null>(null);

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

  async function uploadDocument(field: DocField, file: File) {
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
          <PersonalInfoSection form={form} setForm={setForm} />

            <BusinessInfoSection form={form} setForm={setForm} />

            <VehicleSection
              form={form}
              addVehicle={addVehicle}
              removeVehicle={removeVehicle}
              updateVehicle={updateVehicle}
            />

            <DocumentSection
              form={form}
              setForm={setForm}
              uploadingField={uploadingField}
              uploadDocument={uploadDocument}
            />

            <ConsentSection
              form={form}
              setForm={setForm}
              cardData={cardData}
              template={template}
            />

            <SignatureSection form={form} setForm={setForm} />

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
