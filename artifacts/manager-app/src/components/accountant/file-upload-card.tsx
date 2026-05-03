import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * [Task #772 — 키보드 사절 7규칙] 영수증·세금계산서 등 첨부 업로드용 큰 카드.
 * 드래그 앤 드롭 + 카메라 촬영(향후 OCR 진입점) 지원.
 */
export interface FileUploadCardProps {
  label?: string;
  description?: string;
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export function FileUploadCard({
  label = "첨부 파일",
  description = "영수증·세금계산서를 끌어 놓거나 클릭해서 추가하세요.",
  files,
  onChange,
  accept,
  multiple = true,
  disabled,
}: FileUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const list = Array.from(incoming);
    onChange(multiple ? [...files, ...list] : list);
  };

  const remove = (idx: number) =>
    onChange(files.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2" data-testid="accountant-file-upload-card">
      {label ? <div className="text-sm font-medium">{label}</div> : null}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors",
          "hover:border-primary/60 hover:bg-muted/30",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          handleAdd(e.dataTransfer.files);
        }}
      >
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <Upload className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{description}</p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            파일 선택
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={multiple}
            onChange={(e) => handleAdd(e.target.files)}
          />
        </CardContent>
      </Card>
      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                type="button"
                className="ml-2 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => remove(i)}
                aria-label={`${f.name} 제거`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
