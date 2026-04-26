import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { BusinessNumberInput } from "@/components/ui/business-number-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase } from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { Field } from "@/components/tenant-card-form/field";
import type { FormData } from "@/components/tenant-card-form/types";

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
}

export function BusinessInfoSection({ form, setForm }: Props) {
  return (
    <Section icon={<Briefcase className="w-4 h-4" />} title="사업자 정보">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox checked={form.isBusiness} onCheckedChange={(v) => setForm({ ...form, isBusiness: !!v })} />
          <Label className="text-sm">사업자 (법인) 입주자입니다</Label>
        </div>
        {form.isBusiness && (
          <>
            <Field label="상호명(법인명)">
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </Field>
            <Field label="사업자등록번호">
              <BusinessNumberInput value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />
            </Field>
            <div className="border-t pt-3 mt-3">
              <p className="text-sm font-medium mb-2">법인 대표자(연대보증인) 정보</p>
              <p className="text-xs text-muted-foreground mb-3">
                법인 임차인의 경우, 대표자께서 연대보증인으로서 아래 정보를 기재해 주시기 바랍니다.
              </p>
              <div className="space-y-3">
                <Field label="대표자 성명">
                  <Input value={form.guarantorName} onChange={(e) => setForm({ ...form, guarantorName: e.target.value })} />
                </Field>
                <Field label="대표자 주민등록번호">
                  <Input value={form.guarantorResidentId} onChange={(e) => setForm({ ...form, guarantorResidentId: e.target.value })} placeholder="000000-0000000" />
                </Field>
                <Field label="대표자 연락처">
                  <PhoneInput value={form.guarantorPhone} onChange={(e) => setForm({ ...form, guarantorPhone: e.target.value })} placeholder="010-0000-0000" />
                </Field>
                <Field label="관계">
                  <Input value={form.guarantorRelation} onChange={(e) => setForm({ ...form, guarantorRelation: e.target.value })} placeholder="대표이사" />
                </Field>
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
