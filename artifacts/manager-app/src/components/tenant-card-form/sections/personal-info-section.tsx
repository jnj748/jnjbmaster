import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { User } from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { Field } from "@/components/tenant-card-form/field";
import type { FormData } from "@/components/tenant-card-form/types";

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
}

export function PersonalInfoSection({ form, setForm }: Props) {
  return (
    <Section icon={<User className="w-4 h-4" />} title="개인정보">
      <div className="space-y-3">
        <Field label="성명 *" required>
          <Input value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} required />
        </Field>
        <Field label="주민등록번호 *" required>
          <Input value={form.residentId} onChange={(e) => setForm({ ...form, residentId: e.target.value })} placeholder="000000-0000000" required />
          <p className="text-[11px] text-muted-foreground mt-1">뒷자리 포함 전체를 입력해 주세요</p>
        </Field>
        <Field label="휴대폰 *" required>
          <PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" required />
        </Field>
        <Field label="비상연락처">
          <PhoneInput value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="010-0000-0000" />
        </Field>
        <Field label="이메일">
          <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="인테리어 개시일">
            <Input type="date" value={form.interiorStartDate} onChange={(e) => setForm({ ...form, interiorStartDate: e.target.value })} />
          </Field>
          <Field label="입주일">
            <Input type="date" value={form.moveInDate} onChange={(e) => setForm({ ...form, moveInDate: e.target.value })} />
          </Field>
        </div>
        <Field label="주민등록주소">
          <Input value={form.registeredAddress} onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })} />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox checked={form.hasTv} onCheckedChange={(v) => setForm({ ...form, hasTv: !!v })} />
          <Label className="text-sm">TV 보유</Label>
        </div>
      </div>
    </Section>
  );
}
