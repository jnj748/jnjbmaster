import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Trash2, Upload, Loader2 } from "lucide-react";
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";

// [Task #507] 단일 트리거 + 공용 시트(촬영/앨범에서 선택/파일에서 선택)로 통일.
// 입주자 서류는 임대차계약서·신분증·사업자등록증·자동차등록증으로 사진/PDF 혼용
// 자리이므로 시트의 fileOption(application/pdf)을 활성화한다.
export function DocUpload({
  label,
  value,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  value: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      {value ? (
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-green-50">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-800 flex-1 truncate">첨부 완료</span>
          <Button type="button" variant="ghost" size="sm" className="h-11 px-3" onClick={onRemove}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-10 border-dashed"
            onClick={() => setPickerOpen(true)}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? "업로드 중..." : "촬영 또는 선택"}
          </Button>
          <AttachmentPickerSheet
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            title={label}
            onPick={onUpload}
            fileOption={{
              accept: "application/pdf",
              label: "파일에서 선택",
              description: "PDF 문서",
            }}
            testId="tenant-doc"
          />
        </>
      )}
    </div>
  );
}
