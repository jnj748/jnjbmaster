import { Input } from "@/components/ui/input";
import { PenTool } from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { Field } from "@/components/tenant-card-form/field";
import type { FormData } from "@/components/tenant-card-form/types";

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
}

export function SignatureSection({ form, setForm }: Props) {
  return (
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
          {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
    </Section>
  );
}
