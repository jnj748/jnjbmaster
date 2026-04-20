import { FileText } from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { DocUpload } from "@/components/tenant-card-form/doc-upload";
import type { FormData, DocField } from "@/components/tenant-card-form/types";

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  uploadingField: DocField | null;
  uploadDocument: (field: DocField, file: File) => void;
}

export function DocumentSection({ form, setForm, uploadingField, uploadDocument }: Props) {
  return (
    <Section icon={<FileText className="w-4 h-4" />} title="서류첨부">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">제출 서류를 촬영하거나 파일로 첨부해 주세요.</p>
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
  );
}
