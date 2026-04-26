import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { BusinessNumberInput } from "@/components/ui/business-number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";

export interface TenantFormState {
  unit: string;
  tenantName: string;
  residentId: string;
  phone: string;
  emergencyContact: string;
  interiorStartDate: string;
  moveInDate: string;
  moveOutDate: string;
  email: string;
  companyName: string;
  businessNumber: string;
  hasTv: boolean;
  registeredAddress: string;
  notes: string;
  guarantorName: string;
  guarantorPhone: string;
  guarantorRelation: string;
  contractDoc: boolean;
  businessRegDoc: boolean;
  idDoc: boolean;
  privacyConsentDate: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  onSubmit: (e: React.FormEvent) => void;
}

export function TenantFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  onSubmit,
}: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          입주자 등록
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{editing ? "입주자 수정" : "새 입주자 등록"}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>호실 *</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            </div>
            <div>
              <Label>입주자명 *</Label>
              <Input value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>주민등록번호</Label>
              <Input value={form.residentId} onChange={(e) => setForm({ ...form, residentId: e.target.value })} placeholder="000000-0000000" />
            </div>
            <div>
              <Label>휴대폰</Label>
              <PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>비상연락처</Label>
              <PhoneInput value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="010-0000-0000" />
            </div>
            <div>
              <Label>이메일</Label>
              <Input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>인테리어 개시일</Label>
              <Input type="date" value={form.interiorStartDate} onChange={(e) => setForm({ ...form, interiorStartDate: e.target.value })} />
            </div>
            <div>
              <Label>입주일</Label>
              <Input type="date" value={form.moveInDate} onChange={(e) => setForm({ ...form, moveInDate: e.target.value })} />
            </div>
            <div>
              <Label>퇴거일</Label>
              <Input type="date" value={form.moveOutDate} onChange={(e) => setForm({ ...form, moveOutDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>상호명 (법인)</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div>
              <Label>사업자등록번호</Label>
              <BusinessNumberInput value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>주민등록주소</Label>
            <Input value={form.registeredAddress} onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={form.hasTv} onCheckedChange={(v) => setForm({ ...form, hasTv: !!v })} />
            <Label>TV 소유</Label>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">법인 연대보증인 정보</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>보증인명</Label>
                <Input value={form.guarantorName} onChange={(e) => setForm({ ...form, guarantorName: e.target.value })} />
              </div>
              <div>
                <Label>연락처</Label>
                <PhoneInput value={form.guarantorPhone} onChange={(e) => setForm({ ...form, guarantorPhone: e.target.value })} placeholder="010-0000-0000" />
              </div>
              <div>
                <Label>관계</Label>
                <Input value={form.guarantorRelation} onChange={(e) => setForm({ ...form, guarantorRelation: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">제출서류 체크리스트</p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={form.contractDoc} onCheckedChange={(v) => setForm({ ...form, contractDoc: !!v })} />
                <Label>매매/임대차계약서</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.businessRegDoc} onCheckedChange={(v) => setForm({ ...form, businessRegDoc: !!v })} />
                <Label>사업자등록증</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.idDoc} onCheckedChange={(v) => setForm({ ...form, idDoc: !!v })} />
                <Label>신분증 사본</Label>
              </div>
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">개인정보 수집·이용 동의</p>
            <div>
              <Label>동의일시</Label>
              <Input type="datetime-local" value={form.privacyConsentDate} onChange={(e) => setForm({ ...form, privacyConsentDate: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>기타사항</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
