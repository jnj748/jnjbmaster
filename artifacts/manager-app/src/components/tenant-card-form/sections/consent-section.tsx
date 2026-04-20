import { Shield } from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { ConsentItem } from "@/components/tenant-card-form/consent-item";
import type { FormData, CardData, ContractTemplate } from "@/components/tenant-card-form/types";

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  cardData: CardData | null;
  template?: ContractTemplate;
}

export function ConsentSection({ form, setForm, cardData, template }: Props) {
  return (
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
  );
}
