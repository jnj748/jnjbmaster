import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Trash2, Upload, Loader2 } from "lucide-react";

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
  const fileRef = useRef<HTMLInputElement>(null);
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-10 border-dashed"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? "업로드 중..." : "촬영 또는 파일 선택"}
          </Button>
        </>
      )}
    </div>
  );
}
